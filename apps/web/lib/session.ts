// Session côté client.
//
// SÉCURITÉ (audit 2026-07-14) : le JWT n'est PLUS dans un cookie lisible par le
// JavaScript. Il est posé par le serveur dans un cookie httpOnly `bc_token`
// (voir apps/api/src/auth/session-cookie.ts) — inaccessible depuis
// `document.cookie`, donc non exfiltrable par XSS. Le navigateur le renvoie
// automatiquement aux appels same-origin /api/* (rewrite proxifié vers l'API).
//
// Ne reste ici qu'un cookie `bc_user` NON sensible (profil d'affichage : nom,
// rôle, classe) pour piloter l'UI côté client — jamais un secret.

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  className: string | null;
}

const USER_COOKIE = 'bc_user';
const MAX_AGE = 24 * 3600; // aligné sur JWT_EXPIRES_IN=1d

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function saveSession(user: SessionUser): void {
  // secure dès que le site est servi en HTTPS (prod) ; samesite=lax.
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  const opts = `path=/; max-age=${MAX_AGE}; samesite=lax${secure}`;
  document.cookie = `${USER_COOKIE}=${encodeURIComponent(JSON.stringify(user))}; ${opts}`;
}

// N'efface que le profil d'affichage : le cookie httpOnly `bc_token` est
// effacé par le serveur (POST /api/auth/logout), le JS ne peut pas y toucher.
export function clearSession(): void {
  document.cookie = `${USER_COOKIE}=; path=/; max-age=0`;
}

/**
 * Compat : le JWT est désormais un cookie httpOnly, illisible en JS — il est
 * renvoyé automatiquement aux appels same-origin /api/*, plus besoin de le
 * passer en en-tête. Cette fonction renvoie donc toujours `null` ; elle reste
 * pour ne pas réécrire les ~40 appels `api(path, opts, getToken())` (le client
 * `api` ignore un token nul et s'appuie sur le cookie). Pour savoir si un
 * utilisateur est connecté côté client, utiliser `getUser()`.
 */
export function getToken(): null {
  return null;
}

export function getUser(): SessionUser | null {
  const raw = readCookie(USER_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
