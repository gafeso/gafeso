import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * ⭐ MESURÉ, PAS DÉDUIT — demandé par Jean le 20 octobre 2026 (« mesure 2 » de
 * l'audit du Host forgé) : un jeton valide de l'école A, sur une requête dont
 * le Host résout l'école B, doit être refusé. Jusqu'à ce fichier, cette
 * propriété n'était tenue que par un commentaire et par la lecture — AUCUN
 * test ne l'éprouvait.
 *
 * ⚠ TÉMOIN NÉGATIF requis par ce dépôt : chaque cas de refus est rejoué avec
 * la comparaison `user.tenant !== request.tenant.slug` remplacée par `false`
 * — fait, vérifié, les quatre cas de refus tombent alors au vert (faux).
 */
function construireGarde(): JwtAuthGuard {
  const garde = new JwtAuthGuard();
  // `AuthGuard('jwt')` fait la vérification cryptographique (signature,
  // expiration) et pose `request.user`. On la simule ACCEPTÉE ici : ce test
  // porte sur ce que `JwtAuthGuard` fait APRÈS, pas sur la cryptographie —
  // déjà éprouvée ailleurs (jwt.strategy.spec.ts).
  vi.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockResolvedValue(true as never);
  return garde;
}

function contexte(opts: {
  userTenant?: string;
  requestTenant?: { slug: string } | null;
}): ExecutionContext {
  const request = {
    user: opts.userTenant !== undefined ? { tenant: opts.userTenant, sub: 'u1' } : undefined,
    tenant: opts.requestTenant,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard — isolation multi-tenant, MESURÉE', () => {
  it('⭐ même école (A = A) : accepté', async () => {
    const garde = construireGarde();
    const ctx = contexte({ userTenant: 'zinda', requestTenant: { slug: 'zinda' } });
    await expect(garde.canActivate(ctx)).resolves.toBe(true);
  });

  it('⭐ jeton de l’école A, Host résolvant l’école B : REFUSÉ', async () => {
    const garde = construireGarde();
    const ctx = contexte({ userTenant: 'zinda', requestTenant: { slug: 'horizon' } });
    await expect(garde.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(garde.canActivate(ctx)).rejects.toThrow('Jeton émis pour une autre école.');
  });

  it('⭐ Host non résolu (domaine inconnu) : REFUSÉ même avec un jeton par ailleurs valide', async () => {
    const garde = construireGarde();
    const ctx = contexte({ userTenant: 'zinda', requestTenant: null });
    await expect(garde.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('⭐ jeton SANS claim tenant (plateforme/super-admin) sur une route d’école : REFUSÉ', async () => {
    const garde = construireGarde();
    const ctx = contexte({ userTenant: undefined, requestTenant: { slug: 'zinda' } });
    await expect(garde.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
