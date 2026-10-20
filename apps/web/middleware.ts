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
// `/demo/` : illustrations de la page d'accueil (bandeau, couvertures du
// catalogue de démonstration). CONSTATÉ le 10 septembre 2026 — elles partaient
// en 307 vers /login pour tout visiteur non connecté, c'est-à-dire pour le seul
// public de cette page. Le défaut a vécu plusieurs jours sans se voir : la
// vérification se faisait EN ÉTANT CONNECTÉ, où les images se chargent, et le
// HTML les mentionne de toute façon — la balise <img> est présente dans les
// deux cas, seule la REQUÊTE diffère. Lire le DOM ne pouvait donc pas le
// montrer ; seul un appel sans cookie le montre.
/*
 * ⚠ `/installation` EST PUBLIC PAR NÉCESSITÉ, 8 octobre 2026. Sur une instance
 * NEUVE il n'existe aucun compte : rediriger l'assistant vers /login le rendrait
 * inatteignable, et l'instance ne pourrait jamais être installée.
 *
 * Ce qui protège l'assistant n'est donc pas le middleware : c'est le JETON
 * D'AMORÇAGE, engendré au premier démarrage et lisible seulement par qui a accès
 * au serveur. Et l'API refuse toutes ses routes — sauf `etat` — sans la session
 * que ce jeton ouvre. « Cacher sans refuser laisserait une porte ouverte » ; ici
 * on ne cache rien, et c'est l'API qui refuse.
 */
/*
 * ⚠ LES DEUX PAGES LÉGALES, AJOUTÉES LE 9 OCTOBRE 2026 — et c'est une RECETTE
 * qui l'a trouvé, pas un test.
 *
 * Elles rendaient **307** : redirigées vers /login. Or le pied de page affiche
 * leur lien dès qu'elles sont publiées — un visiteur qui cliquait « Mentions
 * légales » tombait sur un écran de connexion. Des mentions légales derrière un
 * mur d'authentification ne sont pas des mentions légales.
 *
 * ⚠ AUCUN TEST NE POUVAIT LE VOIR, et pas par négligence : mes douze cas
 * montaient le COMPOSANT, et le middleware n'est pas dans ce qu'on monte. C'est
 * « il existe des défauts qu'aucun test unitaire ne peut atteindre », et
 * « vérifier connecté ne dit rien de ce que voit le public » — les deux à la
 * fois, sur la seule classe d'écrans dont le public EST le dehors.
 *
 * Le garde qui le rejoue : `pages-publiques-sans-cookie.spec.ts`.
 */
const PUBLIC_PREFIXES = [
  '/opac',
  '/e/',
  '/.well-known/',
  '/marque/',
  '/demo/',
  '/installation',
  '/mentions-legales',
  '/confidentialite',
  /**
   * ⚠ L'AFFICHE IMPRIMABLE D'UNE NOTICE EST PUBLIQUE, comme la notice.
   *
   * Elle vit à la RACINE et non sous `/opac/` parce qu'un layout imbriqué ne
   * peut pas retirer son parent, et que le lot exige « sans menu ni pied ».
   * Elle sort donc du préfixe `/opac` et doit être déclarée ici — sans quoi
   * elle rend **307 vers /login**, exactement comme les pages légales le
   * 9 octobre 2026. Mesuré sans cookie, pas supposé.
   */
  '/affiche/',
];

/**
 * Exposé pour le test. Cette liste est la seule chose qui sépare un fichier
 * public d'une redirection vers /login, et rien dans `public/` ne signale
 * qu'il faut l'y inscrire.
 */
export const PREFIXES_PUBLICS_POUR_TEST = PUBLIC_PREFIXES;
export const CHEMINS_PUBLICS_POUR_TEST = PUBLIC_EXACT;

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

/**
 * ⚠ REFUSÉ le 19 octobre 2026 : ce fichier recopiait AVEUGLÉMENT le Host reçu
 * dans `x-forwarded-host`, sans jamais vérifier qu'il correspond à CE que
 * cette instance sert. Mesuré par l'effet (`web` lancé seul, pointé sur un
 * serveur témoin) : un `Host: ecole-victime.exemple.test` forgé ressortait
 * identique dans l'appel à l'API — exactement la valeur que
 * `TenantMiddleware.resolveByHost` (apps/api/src/tenancy/tenant.middleware.ts)
 * utilise ensuite pour choisir l'école.
 *
 * ⚠ ET CE N'ÉTAIT PAS EXPLOITABLE POUR FUITER DES DONNÉES, mesuré aussi : à
 * travers Caddy (`docker/Caddyfile`), un Host inconnu ne sort jamais de Caddy
 * — aucun bloc de site ne correspond, donc RIEN n'est transmis à `web`. Le
 * chemin qui restait ouvert est un accès DIRECT à `web:3000` — à l'intérieur
 * du réseau Docker, ou par un port publié par erreur — qui ne passe PAS par
 * Caddy. Pour une requête AUTHENTIFIÉE, `JwtAuthGuard` (apps/api/src/auth/
 * jwt-auth.guard.ts:29) refuse déjà un jeton dont le tenant ne correspond pas
 * à celui résolu — vérifié par un jeton réel d'une école, Host forgé vers une
 * autre : 401 « Jeton émis pour une autre école. » Ce contrôle-ci protège les
 * routes PUBLIQUES (catalogue), qui n'ont pas cette seconde garde.
 *
 * ⚠ CE QUI ÉTAIT FAUX, mesuré le 20 octobre 2026 sur la démonstration réelle
 * par Jean : « un Host inconnu ne sort jamais de Caddy » décrivait un **200
 * vide**, pas une absence de réponse — exactement le faux silencieux que
 * `docker/Caddyfile` nommait déjà pour le port 80 seul, et qui existait AUSSI
 * sur 443 dès qu'un client garde un SNI valide (celui de `PUBLIC_DOMAIN`) et
 * ne forge que l'en-tête Host — ce qui réussit la poignée de main TLS avant
 * que Caddy ne refuse au niveau HTTP. Corrigé côté Caddy (bloc `:443` ajouté
 * ce jour) : un Host qui ne correspond à aucun site déclaré reçoit désormais
 * un 404 explicite, sur 80 comme sur 443 — jamais un 200 vide.
 */
function hoteAttendu(): string | null {
  try {
    return new URL(process.env.APP_URL ?? '').hostname || null;
  } catch {
    return null;
  }
}

/**
 * ⚠ CORRIGÉ le 20 octobre 2026 : la comparaison contre le seul `APP_URL` est
 * plus étroite que la réalité du produit. `domains` (schéma `public`) porte
 * PLUSIEURS domaines — mesuré en base de développement : `localhost` ET
 * `zinda.localhost` pour la même école, `horizon.localhost` pour une autre,
 * sur UNE installation. Un établissement qui déclare son propre domaine (la
 * raison d'être de cette table) se serait vu refuser par une comparaison à
 * une seule chaîne.
 *
 * Chemin rapide : égal à `APP_URL` → aucun appel réseau, c'est le cas de
 * CHAQUE requête légitime normale. Repli, uniquement pour un Host qui diffère
 * (donc déjà suspect ou déjà rare) : on interroge l'API, seule détentrice de
 * la table `domains` — ne pas la réinterroger ici en dupliquant son accès
 * base, qui romprait la frontière entre `web` et `api` de ce monolithe
 * modulaire.
 */
async function hoteValide(hoteSansPort: string): Promise<boolean> {
  const attendu = hoteAttendu();
  if (!attendu) return true; // APP_URL absent : voir le commentaire plus bas.
  if (hoteSansPort === attendu) return true;
  try {
    const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
    const res = await fetch(`${apiUrl}/tenancy/current`, {
      headers: { 'x-forwarded-host': hoteSansPort },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    // ⚠ L'API est peut-être simplement injoignable (panne, démarrage) : un
    // Host par ailleurs légitime ne doit pas être refusé pour une raison qui
    // n'a rien à voir avec lui. On REFUSE quand même ici, et pas « laisse
    // passer » : un Host qui N'ÉTAIT PAS `APP_URL` reste la seule population
    // visée par ce contrôle, et la panne ne doit pas devenir un contournement.
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const originalHost = request.headers.get('host');
  const hoteSansPort = originalHost?.split(':')[0] ?? null;
  // ⚠ `hoteSansPort` absent laisse passer plutôt que de tout refuser : ce cas
  // ne devrait pas arriver (Host est un en-tête HTTP/1.1 obligatoire), et un
  // refus large masquerait une erreur de configuration derrière un message
  // qui parle de Host.
  if (hoteSansPort && !(await hoteValide(hoteSansPort))) {
    return new NextResponse('Hôte non reconnu.', { status: 400 });
  }

  const requestHeaders = new Headers(request.headers);
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
