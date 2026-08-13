import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { ResolvedTenant, TenancyService } from './tenancy.service';

// Étend le type Request d'Express pour porter le tenant résolu
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: ResolvedTenant | null;
    }
  }
}

/**
 * Résolution du tenant par requête, en deux temps :
 *
 *  1. **Domaine (web)** — chemin historique, autoritaire et INCHANGÉ. Le front
 *     Next.js proxifie `/api/*` et transmet le domaine public via
 *     `x-forwarded-host`. Si le domaine résout, c'est lui, point (les routes
 *     publiques d'une école ne doivent jamais être bloquées par un cookie
 *     résiduel d'une autre école — la vérification jeton↔tenant reste au
 *     JwtAuthGuard pour les routes authentifiées).
 *
 *  2. **Repli clients API-directs (app mobile)** — activé SEULEMENT si le
 *     domaine ne résout pas (l'app tape l'API sans domaine d'école). On accepte
 *     l'en-tête `X-Tenant`, puis, à défaut, le claim `tenant` du JWT vérifié.
 *     INVARIANT : si `X-Tenant` ET le claim sont tous deux présents et
 *     DIFFÈRENT, on rejette (401) — on ne devine pas lequel est le bon.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly jwt: JwtService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const forwardedHost = req.headers['x-forwarded-host'];
    const rawHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    const host = rawHost?.split(',')[0]?.trim() || req.headers.host;

    let tenant = await this.tenancy.resolveByHost(host);

    if (!tenant) {
      const xTenant = this.readXTenant(req);
      const claimTenant = this.readVerifiedTenantClaim(req);

      // Invariant : deux signaux explicites qui se contredisent = rejet.
      if (xTenant && claimTenant && xTenant !== claimTenant) {
        throw new UnauthorizedException('Incohérence de tenant : X-Tenant ≠ jeton.');
      }

      const slug = xTenant ?? claimTenant;
      if (slug) tenant = await this.tenancy.resolveBySlug(slug);
    }

    req.tenant = tenant ?? null;
    next();
  }

  /** En-tête `X-Tenant` (slug d'école), première valeur, trim. */
  private readXTenant(req: Request): string | null {
    const raw = req.headers['x-tenant'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const slug = value?.trim();
    return slug ? slug : null;
  }

  /**
   * Claim `tenant` du JWT, UNIQUEMENT si le jeton est valide (signature +
   * expiration vérifiées). Un jeton absent/expiré/forgé → null (aucune
   * résolution de schéma depuis une source non vérifiée). Le JwtAuthGuard
   * refait la vérification pour les routes authentifiées.
   */
  private readVerifiedTenantClaim(req: Request): string | null {
    const token = this.extractToken(req);
    if (!token) return null;
    try {
      const payload = this.jwt.verify<{ tenant?: string }>(token);
      const slug = payload.tenant?.trim();
      return slug ? slug : null;
    } catch {
      return null;
    }
  }

  /** Jeton depuis le cookie de session (bc_token) ou l'en-tête Bearer. */
  private extractToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null;

    const cookie = req.headers.cookie;
    if (cookie) {
      for (const part of cookie.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('=')) || null;
      }
    }
    return null;
  }
}
