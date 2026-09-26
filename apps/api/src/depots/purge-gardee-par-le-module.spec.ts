/**
 * LA PURGE NE TOUCHE RIEN DANS UNE ÉCOLE QUI A ÉTEINT LE MODULE — backlog n° 49.
 *
 * `purgerUneEcole` SUPPRIME des objets MinIO. Elle tournait chaque nuit sur
 * TOUTES les écoles actives, sans regarder si `depot` — un module activable —
 * était allumé. Une école qui l'éteignait perdait ses fichiers de dépôts
 * refusés, et `deleteObject` ne se reprend pas.
 *
 * ⚠ RIEN N'AVAIT ÉTÉ PERDU, et pour TROIS raisons indépendantes, mesurées le
 * 26/09/2026 : zéro purge au journal d'audit, `depot` actif sur les deux écoles
 * de développement, et une rétention de douze mois quand le seul dépôt refusé
 * avait 137 jours. C'est cette latence qui rend le défaut dangereux : la
 * première fois qu'il tirerait, ce serait sur une VRAIE école, douze mois après
 * un refus.
 *
 * ⚠ LA GARDE EST DANS `purgerUneEcole`, PAS DANS LE PLANIFICATEUR, et ce
 * fichier le vérifie. Le planificateur n'a qu'un appelant aujourd'hui ; la
 * méthode est publique et un script d'exploitation l'appellera. Fermer une seule
 * porte n'en ferme aucune.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PurgeDepotsService } from './purge-depots.service';

/** Un dépôt refusé, largement au-delà de la rétention. */
const REFUSE_ANCIEN = {
  id: 'd1',
  title: 'Mémoire refusé',
  status: 'refuse',
  decidedAt: new Date('2020-01-01T00:00:00Z'),
  fileKey: 'depots/d1.pdf',
  fileName: 'memoire.pdf',
  encObjectKey: 'depots/d1.enc',
};

function service(moduleActif: boolean) {
  const deleteObject = vi.fn(async () => {});
  const auditCreate = vi.fn(async () => ({}));
  const depositUpdate = vi.fn(async () => ({}));
  const db = {
    deposit: { findMany: vi.fn(async () => [REFUSE_ANCIEN]), update: depositUpdate },
  };
  const prisma = { auditLog: { create: auditCreate } };
  const estActif = vi.fn(async () => moduleActif);
  const svc = new PurgeDepotsService(
    prisma as never,
    { deleteObject } as never,
    { estActif } as never,
  );
  return { svc, db, deleteObject, auditCreate, depositUpdate, estActif };
}

describe('⚠ module `depot` ÉTEINT — rien n’est touché, et le saut se DIT', () => {
  it('🔴 AUCUN objet n’est supprimé', async () => {
    const { svc, db, deleteObject } = service(false);
    await svc.purgerUneEcole(db as never, 't1');
    // C'est l'assertion qui compte : `deleteObject` est irréversible.
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('⚠ et la base n’est même pas LUE — on ne regarde pas', async () => {
    // La garde passe AVANT le `findMany`. Ce n'est pas une optimisation : lire
    // les candidats puis ne rien faire laisserait croire, au prochain lecteur,
    // que la décision se prend par dépôt — alors qu'elle se prend par école.
    const { svc, db } = service(false);
    await svc.purgerUneEcole(db as never, 't1');
    expect(db.deposit.findMany).not.toHaveBeenCalled();
  });

  it('⚠ rien n’est écrit : ni journal, ni dépôt', async () => {
    const { svc, db, auditCreate, depositUpdate } = service(false);
    await svc.purgerUneEcole(db as never, 't1');
    expect(auditCreate).not.toHaveBeenCalled();
    expect(depositUpdate).not.toHaveBeenCalled();
  });

  it('⭐ le rapport DIT qu’il a sauté — il ne rend pas zéro', async () => {
    const { svc, db } = service(false);
    const r = await svc.purgerUneEcole(db as never, 't1');
    // Un zéro serait indiscernable d'une école sans candidat, et « 0 purge » se
    // lirait comme « rien à faire » là où il veut dire « je n'ai pas regardé ».
    expect(r).toEqual({ purge: false, motif: 'module-eteint' });
  });

  it('la garde interroge bien le module `depot`, pour CETTE école', async () => {
    const { svc, db, estActif } = service(false);
    await svc.purgerUneEcole(db as never, 't1');
    expect(estActif).toHaveBeenCalledWith('t1', 'depot');
  });
});

describe('témoin POSITIF : module ALLUMÉ, la purge fait son office', () => {
  it('⚠ sinon les cinq cas ci-dessus seraient satisfaits par une purge MORTE', async () => {
    const { svc, db, deleteObject } = service(true);
    const r = await svc.purgerUneEcole(db as never, 't1');
    expect(r.purge).toBe(true);
    expect(db.deposit.findMany).toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalled();
  });
});

describe('⚠ LA GARDE EST AU BON ENDROIT — pas dans le planificateur', () => {
  const ICI = __dirname;
  const service_ts = readFileSync(join(ICI, 'purge-depots.service.ts'), 'utf-8');
  const scheduler = readFileSync(join(ICI, 'purge-depots.scheduler.ts'), 'utf-8');

  it('le SERVICE consulte le module', () => {
    expect(service_ts).toMatch(/estActif\([^)]*'depot'/);
  });

  it('⭐ et le planificateur ne le fait PAS à sa place', () => {
    // Si la garde vivait là, `purgerUneEcole` resterait nue pour le premier
    // script qui l'appellera. Ce test refuse le déplacement, pas la duplication :
    // il dit où la propriété DOIT vivre.
    expect(
      scheduler,
      'La garde de module a été déplacée dans le planificateur. Elle doit vivre ' +
        'là où la suppression se DÉCIDE — `purgerUneEcole` est publique, et un ' +
        'script d’exploitation l’appellera sans passer par le @Cron.',
    ).not.toMatch(/estActif/);
  });

  it('la garde précède la lecture des candidats, dans l’ordre du fichier', () => {
    const iGarde = service_ts.search(/estActif\([^)]*'depot'/);
    const iLecture = service_ts.indexOf('db.deposit.findMany');
    expect(iGarde).toBeGreaterThan(-1);
    expect(iLecture).toBeGreaterThan(-1);
    expect(iGarde, 'la garde doit venir AVANT la lecture').toBeLessThan(iLecture);
  });
});
