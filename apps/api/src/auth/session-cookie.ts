import { Response } from 'express';

/**
 * Cookie de session : porte le JWT côté navigateur.
 *
 * SÉCURITÉ (audit 2026-07-14) : posé UNIQUEMENT par le serveur, en `httpOnly`
 * — le JavaScript de la page ne peut plus le lire, donc une éventuelle faille
 * XSS ne peut plus exfiltrer le jeton (contrairement à l'ancien
 * `document.cookie`). `sameSite=lax` bloque l'envoi du cookie sur les requêtes
 * POST/PATCH/DELETE cross-site → protection CSRF suffisante ici (aucune
 * mutation via GET). `secure` en production (HTTPS obligatoire).
 *
 * Le front (Next.js) appelle l'API en same-origin sous /api/* (rewrite proxifié)
 * : le cookie est donc renvoyé automatiquement, et `JwtStrategy` l'extrait
 * (voir jwt.strategy.ts). Les clients hors navigateur (appli mobile, intégrations)
 * continuent d'utiliser l'en-tête `Authorization: Bearer`.
 */
export const SESSION_COOKIE = 'bc_token';

// Durée de vie alignée sur JWT_EXPIRES_IN=1d (voir auth.module.ts).
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Extrait le JWT de session du header `Cookie` brut (bc_token). Utilisé partout
 * où l'auth du navigateur (cookie httpOnly) doit être lue sans passer par
 * l'en-tête Authorization : la garde JWT (jwt.strategy) ET les routes à auth
 * OPTIONNELLE (ex. fiche OPAC, opac.controller). Depuis le passage au cookie
 * httpOnly, le front n'envoie plus de Bearer — ne lire que l'en-tête laisserait
 * ces routes en vue anonyme pour un utilisateur pourtant connecté.
 */
export function tokenFromCookieHeader(cookieHeader?: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}
