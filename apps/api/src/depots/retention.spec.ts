import { describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { PurgeDepotsService } from './purge-depots.service';
import {
  RETENTION_DEPOT_REFUSE_MOIS,
  dateDeButoir,
  fichierAPurger,
  fichierPurge,
} from './retention';

/**
 * LA RÉTENTION DES FICHIERS DE DÉPÔTS REFUSÉS — backlog n°25.
 *
 * ⚠ `maintenant` EST FIXE DANS TOUS CES TESTS. Une borne de suppression qui se
 * mesure contre l'horloge réelle n'est pas éprouvable : le test dirait la même
 * chose aujourd'hui et dans treize mois, sans qu'on sache lequel il mesure.
 */
const MAINTENANT = new Date('2027-09-12T10:00:00Z');
const BUTOIR = dateDeButoir(MAINTENANT);

const REFUSE = {
  status: 'refuse',
  fileKey: 'd1/doc.pdf',
  encObjectKey: 'd1/doc.enc',
};

describe('⚠ La borne des douze mois', () => {
  it('la politique est bien de douze mois, et le butoir la suit', () => {
    expect(RETENTION_DEPOT_REFUSE_MOIS).toBe(12);
    expect(BUTOIR.toISOString()).toBe('2026-09-12T10:00:00.000Z');
  });

  it('un refus de treize mois : son fichier part', () => {
    expect(
      fichierAPurger({ ...REFUSE, decidedAt: new Date('2026-08-12T10:00:00Z') }, MAINTENANT),
    ).toBe(true);
  });

  it('un refus de onze mois : il reste — l’étudiant peut encore redéposer', () => {
    expect(
      fichierAPurger({ ...REFUSE, decidedAt: new Date('2026-10-12T10:00:00Z') }, MAINTENANT),
    ).toBe(false);
  });

  it('⚠ EXACTEMENT douze mois : il RESTE — la borne est stricte, dans le sens qui protège', () => {
    // Entre garder un jour de trop et supprimer un jour trop tôt, une
    // suppression ne se reprend pas.
    expect(fichierAPurger({ ...REFUSE, decidedAt: BUTOIR }, MAINTENANT)).toBe(false);
  });

  it('⚠ un dépôt VALIDÉ de trois ans n’est jamais purgé, si vieux soit-il', () => {
    // La rétention porte sur les refus. Un travail accepté est un document du
    // fonds : il vit avec sa notice.
    expect(
      fichierAPurger(
        { ...REFUSE, status: 'valide', decidedAt: new Date('2024-01-01T00:00:00Z') },
        MAINTENANT,
      ),
    ).toBe(false);
  });

  it('un refus sans fichier n’a rien à purger', () => {
    expect(
      fichierAPurger(
        { status: 'refuse', decidedAt: new Date('2020-01-01'), fileKey: null, encObjectKey: null },
        MAINTENANT,
      ),
    ).toBe(false);
  });
});

describe('⚠ « Fichier purgé » se distingue de « jamais de fichier »', () => {
  it('un dépôt purgé garde le NOM de son document', () => {
    expect(fichierPurge({ fileKey: null, fileName: 'memoire.pdf' })).toBe(true);
  });

  it('un dépôt qui n’a jamais rien reçu n’est pas un dépôt purgé', () => {
    // Sans cette distinction, l'écran dirait d'un travail rendu qu'il n'a rien
    // rendu — et c'est précisément l'étudiant refusé qui le lirait.
    expect(fichierPurge({ fileKey: null, fileName: null })).toBe(false);
  });

  it('un dépôt qui porte encore son fichier n’est pas purgé', () => {
    expect(fichierPurge({ fileKey: 'd1/doc.pdf', fileName: 'memoire.pdf' })).toBe(false);
  });
});

describe('⚠ LA PURGE : elle trace ce qu’elle a MESURÉ, et le dépôt survit', () => {
  /** L'argument d'un `create`/`update` Prisma, tel que les assertions le lisent. */
  interface AppelPrisma {
    data: Record<string, unknown> & { metadata?: Record<string, unknown> };
  }

  function service(depots: Record<string, unknown>[], storageLeve = false) {
    const auditCreate = vi.fn(async (a: AppelPrisma) => a);
    const depositUpdate = vi.fn(async (a: AppelPrisma) => a);
    const prisma = {
      auditLog: { create: auditCreate },
      tenant: { findMany: vi.fn(async () => [{ id: 't1', slug: 'zinda' }]) },
      forTenant: vi.fn(() => db),
    } as never as { auditLog: unknown };
    const db = {
      deposit: { findMany: vi.fn(async () => depots), update: depositUpdate },
    } as never;
    const storage = {
      deleteObject: vi.fn(async (_cle: string) => {
        if (storageLeve) throw new Error('objet introuvable');
      }),
    };
    return {
      // ⚠ Le module `depot` est ACTIF dans cette doublure : ces cas éprouvent la
      // purge, pas la garde. Celle-ci a son propre fichier — et une doublure qui
      // rendrait `false` ici ferait passer tous les cas ci-dessous pour des
      // « rien à purger », ce qui est exactement la confusion qu'on corrige.
      svc: new PurgeDepotsService(prisma as never, storage as never, {
        estActif: async () => true,
      } as never),
      db,
      storage,
      auditCreate,
      depositUpdate,
    };
  }

  const VIEUX = {
    id: 'd1',
    title: 'Le droit foncier rural',
    status: 'refuse',
    decidedAt: new Date('2026-01-01T00:00:00Z'),
    fileKey: 'd1/doc.pdf',
    fileName: 'memoire.pdf',
    encObjectKey: 'd1/doc.enc',
  };

  it('les DEUX objets partent — le clair et le chiffré', async () => {
    const { svc, db, storage } = service([VIEUX]);
    const r = await svc.purgerUneEcole(db, 't1', MAINTENANT);
    if (!r.purge) throw new Error('la garde a sauté : ce cas éprouve la purge');

    expect(storage.deleteObject.mock.calls.map((c) => c[0])).toEqual([
      'd1/doc.pdf',
      'd1/doc.enc',
    ]);
    expect(r).toEqual({ purge: true, depots: 1, objets: 2, echecs: 0 });
  });

  it('⚠ le journal est écrit, et il NOMME ce qui a été supprimé', async () => {
    const { svc, db, auditCreate } = service([VIEUX]);
    await svc.purgerUneEcole(db, 't1', MAINTENANT);

    const ligne = auditCreate.mock.calls[0][0].data;
    const meta = ligne.metadata as Record<string, unknown>;
    expect(ligne.action).toBe(AUDIT_ACTIONS.DEPOSIT_FILE_PURGE);
    expect(ligne.targetId).toBe('d1');
    expect(meta.objetsSupprimes).toEqual(['d1/doc.pdf', 'd1/doc.enc']);
    expect(meta.nomDuFichier).toBe('memoire.pdf');
    expect(meta.retentionMois).toBe(12);
  });

  it('⚠ un objet que le stockage REFUSE est dit NON SUPPRIMÉ, pas supprimé', async () => {
    // La trace vient après la mesure. Écrite avant, elle dirait « supprimé »
    // d'un fichier toujours là — la famille « la trace de succès qui précède
    // l'acte », et sur une suppression elle se paie cher.
    const { svc, db, auditCreate } = service([VIEUX], true);
    const r = await svc.purgerUneEcole(db, 't1', MAINTENANT);
    if (!r.purge) throw new Error('la garde a sauté : ce cas éprouve la purge');

    const meta = auditCreate.mock.calls[0][0].data.metadata as Record<string, unknown>;
    expect(meta.objetsSupprimes).toEqual([]);
    expect(meta.objetsNonSupprimes).toHaveLength(2);
    expect(r.echecs).toBe(2);
  });

  it('⚠ le dépôt SURVIT : ni son motif, ni son nom de fichier ne sont touchés', async () => {
    const { svc, db, depositUpdate } = service([VIEUX]);
    await svc.purgerUneEcole(db, 't1', MAINTENANT);

    const data = depositUpdate.mock.calls[0][0].data;
    expect(data).toEqual({
      fileKey: null,
      encObjectKey: null,
      encWrappedCek: null,
      encSegSize: null,
      encStatus: null,
    });
    expect(data).not.toHaveProperty('refusalReason');
    expect(data).not.toHaveProperty('fileName');
  });

  it('⚠ SI LE JOURNAL NE S’ÉCRIT PAS, rien n’est oublié et le balayage s’arrête', async () => {
    // « Un fichier qui disparaît sans trace est indistinguable d'un fichier
    // perdu. » Continuer à supprimer sans pouvoir le dire est le seul cas où
    // poursuivre est pire que renoncer.
    const { svc, db, depositUpdate, auditCreate } = service([VIEUX]);
    auditCreate.mockRejectedValueOnce(new Error('base indisponible'));

    await expect(svc.purgerUneEcole(db, 't1', MAINTENANT)).rejects.toThrow(
      /journal de purge non écrit/i,
    );
    expect(depositUpdate).not.toHaveBeenCalled();
  });

  it('⚠ LA DÉCISION REPASSE SUR LE PRÉ-FILTRE : un dépôt trop récent ne part pas', async () => {
    // Si le `where` s'élargissait un jour, la décision pure écarterait quand
    // même. Une erreur de requête ne peut alors que faire travailler pour rien.
    const { svc, db, storage } = service([
      { ...VIEUX, decidedAt: new Date('2027-06-01T00:00:00Z') },
    ]);
    const r = await svc.purgerUneEcole(db, 't1', MAINTENANT);
    if (!r.purge) throw new Error('la garde a sauté : ce cas éprouve la purge');

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(r.depots).toBe(0);
  });

  it('⚠ AUJOURD’HUI, elle ne supprime RIEN : aucun refus n’a douze mois', async () => {
    // Le circuit de dépôt date du 12 septembre 2026. Ce test dit ce que la
    // règle fait tant qu'elle n'a rien à faire — et il tombera le jour où
    // quelqu'un antidatera un jeu d'essai sans y penser.
    const { svc, db, storage } = service([
      { ...VIEUX, decidedAt: new Date('2026-09-12T12:00:00Z') },
    ]);
    const r = await svc.purgerUneEcole(db, 't1', new Date('2026-09-12T13:00:00Z'));
    if (!r.purge) throw new Error('la garde a sauté : ce cas éprouve la purge');

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(r.depots).toBe(0);
  });
});
