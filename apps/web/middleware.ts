import { NextRequest, NextResponse } from 'next/server';
import { landingPathForRole } from '@/lib/roles';

/**
 * Garde de routes + propagation du domaine réel vers l'API interne + CSP.
 *
 * Garde : l'OPAC est PUBLIC (consultation sans compte) ; le reste exige une
 * session. Le contrôle d'accès réel est fait par l'API — ceci n'est que l'UX.
 *
 * Propagation : /api/* est proxifié en interne vers http://api:4000 (voir
 * next.config.mjs, rewrites()) — ce hop remplace le Host par celui de la
 * destination ("api"), ce qui casse la résolution multi-tenant côté API
 * (TenantMiddleware lit le Host pour retrouver l'école). On transmet donc le
 * VRAI domaine public dans x-forwarded-host, lu en priorité par l'API.
 *
 * CSP (audit 2026-07-14) : la page d'accueil est publique et SSR — on pose une
 * Content-Security-Policy à NONCE. Aucun `unsafe-inline` pour les scripts : les
 * <script> de Next reçoivent le nonce (Next le lit dans l'en-tête de requête).
 * Les allocations `blob:`/`wasm-unsafe-eval` couvrent les lecteurs EPUB (iframe
 * epub.js) et PDF (pdf.js) — sans elles, la lecture en ligne casserait. En
 * développement, `unsafe-eval`/`unsafe-inline` sont ajoutés (HMR de Next).
 */
const PUBLIC_EXACT = ['/', '/login', '/inscription', '/definir-mot-de-passe'];
// `/e/<slug>` : page d'atterrissage du QR d'établissement. Elle s'adresse par
// définition à quelqu'un qui n'a PAS encore de compte, debout devant une
// affiche. La protéger la rendrait inutile — le lecteur serait renvoyé sur une
// connexion sans savoir de quoi il s'agit, et le QR ne servirait à rien.
// `/.well-known/` : descripteurs lus par des machines, jamais authentifiés.
// `/marque/` : le logo de l'en-tête. ATTENTION, ce n'est pas une évidence — le
// matcher ci-dessous n'exempte que `_next/static`, donc TOUT fichier de
// `public/` traverse cette garde. Sans cette ligne, le logo servi à un visiteur
// non connecté part en 307 vers /login et l'en-tête affiche une image cassée,
// précisément sur l'OPAC, qui est public. Le symptôme ne se voit jamais en
// développement quand on reste connecté.
const PUBLIC_PREFIXES = ['/opac', '/e/', '/.well-known/', '/marque/'];

const IS_DEV = process.env.NODE_ENV !== 'production';

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function buildCsp(nonce: string): string {
  const scriptExtra = IS_DEV ? " 'unsafe-eval' 'unsafe-inline'" : '';
  const imgExtra = IS_DEV ? ' http:' : '';
  const connectExtra = IS_DEV ? ' http: ws:' : '';
  return [
    `default-src 'self'`,
    // Nonce pour les scripts Next ; wasm-unsafe-eval pour le worker pdf.js.
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${scriptExtra}`,
    // Styles inline (variables de thème, CSS critique Next) tolérés.
    `style-src 'self' 'unsafe-inline'`,
    // Couvertures MinIO (STORAGE_DOMAIN, https), data:/blob: pour les lecteurs.
    `img-src 'self' data: blob: https:${imgExtra}`,
    `font-src 'self' data:`,
    // Lecture en ligne : fetch des fichiers signés depuis STORAGE_DOMAIN (https).
    `connect-src 'self' https:${connectExtra}`,
    // epub.js rend l'EPUB dans une iframe blob:.
    `frame-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  const originalHost = request.headers.get('host');
  if (originalHost) requestHeaders.set('x-forwarded-host', originalHost);

  // Propage l'IP cliente vers l'API interne (chaîne X-Forwarded-For posée par
  // Caddy en prod, sinon l'IP de connexion) : sans quoi l'API attribuerait tout
  // le trafic à l'IP du conteneur web et son rate limiting anti-force-brute
  // s'appliquerait globalement au lieu de par attaquant (audit 2026-07-14).
  // Next 15 a RETIRÉ `NextRequest.ip` : il n'était renseigné que par certaines
  // plateformes d'hébergement, jamais en auto-hébergement. Le repli ne servait
  // donc déjà à rien ici — en production, Caddy pose toujours X-Forwarded-For.
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) requestHeaders.set('x-forwarded-for', forwardedFor);

  // Les appels /api/* n'ont pas de garde de session (contrôle réel fait par
  // l'API via le cookie httpOnly) — seule la propagation du domaine s'applique.
  // L'API pose ses propres en-têtes de sécurité (helmet), pas de CSP ici.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // CSP à nonce pour les pages. Le nonce est transmis à Next via l'en-tête de
  // requête (il l'applique à ses <script>) ET renvoyé au navigateur.
  const nonce = generateNonce();
  const csp = buildCsp(nonce);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  const withCsp = (res: NextResponse) => {
    res.headers.set('content-security-policy', csp);
    return res;
  };

  const token = request.cookies.get('bc_token')?.value;

  if (!token && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return withCsp(NextResponse.redirect(url));
  }
  if (token && (pathname === '/login' || pathname === '/inscription')) {
    // Déjà connecté : vers la page utile du rôle, pas la vitrine (bug prod 2026-07-16).
    const url = request.nextUrl.clone();
    url.pathname = landingPathForRole(roleFromCookie(request));
    return withCsp(NextResponse.redirect(url));
  }
  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

/** Rôle porté par le cookie de profil `bc_user` (non sensible, lisible ici). */
function roleFromCookie(request: NextRequest): string | undefined {
  const raw = request.cookies.get('bc_user')?.value;
  if (!raw) return undefined;
  try {
    return (JSON.parse(decodeURIComponent(raw)) as { role?: string }).role;
  } catch {
    return undefined;
  }
}

export const config = {
  // `icon.png` / `apple-icon.png` : les icônes que Next sert depuis app/, de la
  // même nature que favicon.ico déjà exempté ici. Sans cette exemption, la
  // garde de session les renvoie en 307 vers /login pour un visiteur anonyme —
  // soit un favicon absent sur la page de connexion et la vitrine, c'est-à-dire
  // exactement là où un nouveau venu le regarde.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)'],
};
