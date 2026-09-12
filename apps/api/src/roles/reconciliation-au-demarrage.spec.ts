import { describe, expect, it, vi } from 'vitest';
import { ROLES_SYSTEME } from '../auth/functions';
import { RolesService } from './roles.service';
import { ReconciliationAuDemarrageService } from './reconciliation-au-demarrage.service';

/**
 * ⚠ LES TROIS EXIGENCES DE L'ÉCRITURE AU DÉMARRAGE, chacune tenue par un test
 * qui tombe quand on la casse.
 *
 *  1. elle DIT ce qu'elle a changé ;
 *  2. elle n'empêche JAMAIS l'API de démarrer ;
 *  3. elle est IDEMPOTENTE — rien à écrire si rien ne diverge.
 *
 * La troisième est celle qu'on croit acquise : l'ancienne forme réécrivait les
 * cinq rôles à chaque passage, ce qui est invisible tant que personne n'appelle
 * au démarrage, et devient une écriture par redémarrage le jour où quelqu'un le
 * fait.
 */

/** Une doublure de schéma d'école qui retient ce qu'on lui écrit. */
function ecole(roles: { name: string; description: string; functions: string[]; isSystem?: boolean }[]) {
  const lignes = roles.map((r) => ({ isSystem: true, ...r }));
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    lignes.push(data as never);
    return data;
  });
  const update = vi.fn(async ({ where, data }: { where: { name: string }; data: Record<string, unknown> }) => {
    const l = lignes.find((x) => x.name === where.name)!;
    Object.assign(l, data);
    return l;
  });
  return {
    db: {
      role: {
        findMany: vi.fn(async () => lignes.map((l) => ({ ...l }))),
        create,
        update,
      },
    } as never,
    create,
    update,
    lignes,
  };
}

/** L'état conforme : exactement ce que le code définit. */
const CONFORME = ROLES_SYSTEME.map((d) => ({
  name: d.name,
  description: d.description,
  functions: [...d.functions],
}));

describe('⚠ 3 · IDEMPOTENCE — rien ne s’écrit si rien ne diverge', () => {
  it('une école conforme ne reçoit AUCUNE écriture', async () => {
    const { db, create, update } = ecole(CONFORME);
    const rapport = await new RolesService().reconcilierRolesSysteme(db);

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    // ⚠ Et le rapport le DIT : une liste vide veut dire « rien ne divergeait ».
    expect(rapport.roles).toEqual([]);
    expect(rapport.ajoutees).toBe(0);
  });

  it('⚠ deux passages de suite : le second n’écrit rien — c’est le cas du redémarrage', async () => {
    const derive = CONFORME.map((r) =>
      r.name === 'Étudiant' ? { ...r, functions: [] } : r,
    );
    const { db, update } = ecole(derive);
    const svc = new RolesService();

    await svc.reconcilierRolesSysteme(db);
    expect(update).toHaveBeenCalledTimes(1);

    const second = await svc.reconcilierRolesSysteme(db);
    expect(update, 'le second passage a réécrit').toHaveBeenCalledTimes(1);
    expect(second.roles).toEqual([]);
  });
});

describe('⚠ 1 · ELLE DIT CE QU’ELLE A CHANGÉ', () => {
  it('nomme le rôle et les fonctions ajoutées — le défaut réel du 12 septembre', async () => {
    const derive = CONFORME.map((r) =>
      r.name === 'Étudiant' ? { ...r, functions: [] } : r,
    );
    const { db } = ecole(derive);
    const rapport = await new RolesService().reconcilierRolesSysteme(db);

    expect(rapport.roles).toHaveLength(1);
    expect(rapport.roles[0].name).toBe('Étudiant');
    expect(rapport.roles[0].ajoutees).toEqual(['depot.deposer']);
    expect(rapport.roles[0].retirees).toEqual([]);
    expect(rapport.ajoutees).toBe(1);
  });

  it('distingue ce qui est RETIRÉ de ce qui est ajouté', async () => {
    const derive = CONFORME.map((r) =>
      r.name === 'Acquisitions' ? { ...r, functions: [...r.functions, 'catalogue.gerer'] } : r,
    );
    const { db } = ecole(derive);
    const rapport = await new RolesService().reconcilierRolesSysteme(db);

    expect(rapport.roles[0].retirees).toEqual(['catalogue.gerer']);
    expect(rapport.retirees).toBe(1);
    expect(rapport.ajoutees).toBe(0);
  });

  it('un rôle ABSENT est créé, et le rapport le dit', async () => {
    const { db, create } = ecole(CONFORME.filter((r) => r.name !== 'Étudiant'));
    const rapport = await new RolesService().reconcilierRolesSysteme(db);

    expect(create).toHaveBeenCalledTimes(1);
    expect(rapport.roles[0]).toMatchObject({ name: 'Étudiant', cree: true });
  });

  it('⚠ un libellé seul qui diverge n’est PAS compté comme une fonction', async () => {
    // Sinon le résumé annoncerait « 1 école réconciliée, 0 fonction » et
    // laisserait croire à une écriture sans objet.
    const derive = CONFORME.map((r) =>
      r.name === 'Gestionnaire' ? { ...r, description: 'autre chose' } : r,
    );
    const { db, update } = ecole(derive);
    const rapport = await new RolesService().reconcilierRolesSysteme(db);

    expect(update).toHaveBeenCalledTimes(1);
    expect(rapport.roles[0]).toMatchObject({ descriptionMaj: true, ajoutees: [], retirees: [] });
  });
});

describe('⚠ 2 · ELLE N’EMPÊCHE JAMAIS L’API DE DÉMARRER', () => {
  function service(tenants: { slug: string }[], parEcole: (slug: string) => never) {
    const prisma = {
      tenant: { findMany: vi.fn(async () => tenants) },
      forTenant: vi.fn((slug: string) => parEcole(slug)),
    } as never;
    const roles = new RolesService();
    return new ReconciliationAuDemarrageService(prisma, roles);
  }

  it('⚠ une école injoignable ne fait pas échouer le démarrage', async () => {
    const svc = service([{ slug: 'horizon' }, { slug: 'zinda' }], (slug) => {
      if (slug === 'zinda') throw new Error('schéma absent');
      return ecole(CONFORME).db;
    });
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('⚠ la base entièrement indisponible ne fait pas échouer le démarrage non plus', async () => {
    // Le filet le plus extérieur : si même la LISTE des écoles est hors
    // d'atteinte, l'API doit servir. Elle sait vivre avec des rôles périmés ;
    // elle ne sait pas vivre sans démarrer.
    const prisma = {
      tenant: {
        findMany: vi.fn(async () => {
          throw new Error('connexion refusée');
        }),
      },
      forTenant: vi.fn(),
    } as never;
    const svc = new ReconciliationAuDemarrageService(prisma, new RolesService());
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('⚠ une école injoignable n’est PAS comptée comme conforme', async () => {
    // Le troisième état, et il vaut autant ici qu'ailleurs : « 2 déjà
    // conformes » sur une école dont on ne sait rien serait une garantie
    // fabriquée. On lit le résumé plutôt que de le supposer.
    const lignes: string[] = [];
    const svc = service([{ slug: 'horizon' }, { slug: 'zinda' }], (slug) => {
      if (slug === 'zinda') throw new Error('schéma absent');
      return ecole(CONFORME).db;
    });
    const logger = (svc as unknown as { logger: { log: unknown; warn: unknown; error: unknown } })
      .logger;
    (logger as { log: unknown }).log = (m: string) => lignes.push(m);
    (logger as { error: unknown }).error = () => {};
    (logger as { warn: unknown }).warn = () => {};

    await svc.onApplicationBootstrap();

    const resume = lignes.join('\n');
    expect(resume).toContain('1 déjà conforme');
    expect(resume).toContain('injoignable');
    expect(resume).toContain('zinda');
  });

  it('⚠ et le résumé ne mentionne PAS ce qui n’existe pas', async () => {
    // « 0 injoignable » à chaque démarrage est du bruit, et le bruit use ce qui
    // doit être lu le jour où il compte.
    const lignes: string[] = [];
    const svc = service([{ slug: 'horizon' }], () => ecole(CONFORME).db);
    const logger = (svc as unknown as { logger: { log: unknown } }).logger;
    (logger as { log: unknown }).log = (m: string) => lignes.push(m);

    await svc.onApplicationBootstrap();

    expect(lignes.join('\n')).not.toMatch(/injoignable|réconcilié/);
    expect(lignes.join('\n')).toContain('1 déjà conforme');
  });
});
