import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantMiddleware } from './tenant.middleware';
import { ResolvedTenant, TenancyService } from './tenancy.service';

const ZINDA: ResolvedTenant = { id: 't1', slug: 'zinda', name: 'Lycée Zinda' };
const AUTRE: ResolvedTenant = { id: 't2', slug: 'autre', name: 'Autre École' };

describe('TenantMiddleware — résolution host + repli X-Tenant / claim JWT', () => {
  let tenancy: { resolveByHost: ReturnType<typeof vi.fn>; resolveBySlug: ReturnType<typeof vi.fn> };
  let jwt: { verify: ReturnType<typeof vi.fn> };
  let mw: TenantMiddleware;
  let next: NextFunction & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tenancy = { resolveByHost: vi.fn().mockResolvedValue(null), resolveBySlug: vi.fn() };
    jwt = { verify: vi.fn() };
    mw = new TenantMiddleware(
      tenancy as unknown as TenancyService,
      jwt as unknown as JwtService,
    );
    next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  });

  const run = (headers: Record<string, string>) => {
    const req = { headers } as unknown as Request;
    return mw.use(req, {} as Response, next).then(() => req);
  };

  it('domaine résolu : utilise le host, IGNORE X-Tenant et le claim (web inchangé)', async () => {
    tenancy.resolveByHost.mockResolvedValue(ZINDA);
    jwt.verify.mockReturnValue({ tenant: 'autre' });
    const req = await run({ host: 'zinda.gafeso.bf', 'x-tenant': 'autre', authorization: 'Bearer x' });
    expect(req.tenant).toEqual(ZINDA);
    expect(tenancy.resolveBySlug).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('host inconnu + X-Tenant seul : résout par slug', async () => {
    tenancy.resolveBySlug.mockResolvedValue(ZINDA);
    const req = await run({ 'x-tenant': 'zinda' });
    expect(tenancy.resolveBySlug).toHaveBeenCalledWith('zinda');
    expect(req.tenant).toEqual(ZINDA);
  });

  it('host inconnu + claim JWT seul (jeton valide) : résout par slug du claim', async () => {
    jwt.verify.mockReturnValue({ tenant: 'zinda' });
    tenancy.resolveBySlug.mockResolvedValue(ZINDA);
    const req = await run({ authorization: 'Bearer valide' });
    expect(jwt.verify).toHaveBeenCalledWith('valide');
    expect(tenancy.resolveBySlug).toHaveBeenCalledWith('zinda');
    expect(req.tenant).toEqual(ZINDA);
  });

  // ── L'INVARIANT ──────────────────────────────────────────────────────────
  it('INVARIANT : X-Tenant ≠ claim du jeton → rejet (401), aucune résolution', async () => {
    jwt.verify.mockReturnValue({ tenant: 'zinda' }); // jeton pour "zinda"
    await expect(run({ 'x-tenant': 'autre', authorization: 'Bearer jeton-zinda' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tenancy.resolveBySlug).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('X-Tenant == claim (concordent) : résout, pas de rejet', async () => {
    jwt.verify.mockReturnValue({ tenant: 'zinda' });
    tenancy.resolveBySlug.mockResolvedValue(ZINDA);
    const req = await run({ 'x-tenant': 'zinda', authorization: 'Bearer jeton-zinda' });
    expect(req.tenant).toEqual(ZINDA);
    expect(next).toHaveBeenCalledOnce();
  });

  it('jeton invalide/forgé (verify jette) : claim ignoré, repli sur X-Tenant, pas de conflit', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    tenancy.resolveBySlug.mockResolvedValue(AUTRE);
    const req = await run({ 'x-tenant': 'autre', authorization: 'Bearer forge' });
    expect(tenancy.resolveBySlug).toHaveBeenCalledWith('autre');
    expect(req.tenant).toEqual(AUTRE);
  });

  it('cookie bc_token : le claim est lu depuis le cookie de session', async () => {
    jwt.verify.mockReturnValue({ tenant: 'zinda' });
    tenancy.resolveBySlug.mockResolvedValue(ZINDA);
    await run({ cookie: 'foo=bar; bc_token=jeton-zinda; baz=qux' });
    expect(jwt.verify).toHaveBeenCalledWith('jeton-zinda');
  });

  it('ni domaine ni X-Tenant ni jeton : tenant null (route publique décidera)', async () => {
    const req = await run({ host: 'inconnu.example' });
    expect(req.tenant).toBeNull();
    expect(next).toHaveBeenCalledOnce();
  });
});
