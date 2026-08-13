import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtPayload } from '../auth/jwt.strategy';

const TENANT: ResolvedTenant = { id: 't1', slug: 'zinda', name: 'Zinda' };
const USER: JwtPayload = { sub: 'user-1', email: 'x@exemple.bf', role: 'LIBRARIAN', tenant: 'zinda' };

function makeRolesService(functions: string[] = []) {
  return {
    findOne: vi.fn().mockResolvedValue({ id: 'role-1', functions, isSystem: false }),
    update: vi.fn().mockResolvedValue({ id: 'role-1' }),
  };
}

function makeAuthz(canManageAccounts: boolean) {
  return { hasFunction: vi.fn().mockResolvedValue(canManageAccounts) };
}

function makePrisma() {
  return { forTenant: vi.fn().mockReturnValue({ marker: 'tenant-db' }) };
}

const makeAudit = () => ({ log: vi.fn().mockResolvedValue(undefined) });

function makeController(roles: ReturnType<typeof makeRolesService>, authz: ReturnType<typeof makeAuthz>) {
  return new RolesController(roles as any, authz as any, makePrisma() as any, makeAudit() as any);
}

describe('RolesController — anti-escalade à l’édition (PATCH /roles/:id)', () => {
  it('retirer une fonction ne nécessite PAS comptes.gerer', async () => {
    const roles = makeRolesService(['document.lire', 'catalogue.gerer']);
    const authz = makeAuthz(false);
    const controller = makeController(roles, authz);

    await controller.update(TENANT, USER, 'role-1', { functions: ['document.lire'] });

    expect(authz.hasFunction).not.toHaveBeenCalled();
    expect(roles.update).toHaveBeenCalledWith(expect.anything(), 'role-1', {
      functions: ['document.lire'],
    });
  });

  it('scénario exact du rapport : roles.gerer seul ne peut pas s’auto-élever en ajoutant comptes.gerer', async () => {
    const roles = makeRolesService(['roles.gerer']);
    const authz = makeAuthz(false); // l'utilisateur n'a PAS comptes.gerer
    const controller = makeController(roles, authz);

    await expect(
      controller.update(TENANT, USER, 'role-1', { functions: ['roles.gerer', 'comptes.gerer'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(roles.update).not.toHaveBeenCalled();
  });

  it('ajouter une fonction quelconque (pas seulement comptes.gerer/roles.gerer) est aussi bloqué sans comptes.gerer', async () => {
    const roles = makeRolesService(['document.lire']);
    const authz = makeAuthz(false);
    const controller = makeController(roles, authz);

    await expect(
      controller.update(TENANT, USER, 'role-1', { functions: ['document.lire', 'circulation.gerer'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ajouter une fonction est autorisé si l’appelant a comptes.gerer', async () => {
    const roles = makeRolesService(['roles.gerer']);
    const authz = makeAuthz(true);
    const controller = makeController(roles, authz);

    await controller.update(TENANT, USER, 'role-1', {
      functions: ['roles.gerer', 'comptes.gerer'],
    });

    expect(roles.update).toHaveBeenCalled();
  });

  it('sans champ functions dans le DTO (renommage), aucune vérification déclenchée', async () => {
    const roles = makeRolesService(['document.lire']);
    const authz = makeAuthz(false);
    const controller = makeController(roles, authz);

    await controller.update(TENANT, USER, 'role-1', { name: 'Nouveau nom' });

    expect(roles.findOne).not.toHaveBeenCalled();
    expect(authz.hasFunction).not.toHaveBeenCalled();
    expect(roles.update).toHaveBeenCalled();
  });

  it('fonctions identiques (aucun ajout réel) ne déclenche pas la vérification', async () => {
    const roles = makeRolesService(['document.lire', 'catalogue.gerer']);
    const authz = makeAuthz(false);
    const controller = makeController(roles, authz);

    await controller.update(TENANT, USER, 'role-1', {
      functions: ['catalogue.gerer', 'document.lire'],
    });

    expect(authz.hasFunction).not.toHaveBeenCalled();
    expect(roles.update).toHaveBeenCalled();
  });
});
