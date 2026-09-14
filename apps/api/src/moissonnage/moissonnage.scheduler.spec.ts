import { describe, expect, it, vi } from 'vitest';
import { MoissonnageScheduler } from './moissonnage.scheduler';

/**
 * ⚠ LE PLANIFICATEUR, ET LES TROIS CHOSES QU'IL NE DOIT PAS FAIRE :
 *  · émettre quoi que ce soit quand aucune source n'est déclarée ;
 *  · sauter une semaine parce qu'un passage est tombé ;
 *  · laisser une école en panne priver les autres de leur moissonnage.
 */

function contexte(
  parEcole: Record<string, { sources: Record<string, unknown>[]; derniere?: Date | null }>,
  ecoles = Object.keys(parEcole),
) {
  const prisma = {
    tenant: { findMany: vi.fn(async () => ecoles.map((slug) => ({ slug }))) },
    forTenant: vi.fn((slug: string) => {
      const e = parEcole[slug];
      if (!e) throw new Error(`schéma absent : ${slug}`);
      return {
        harvestSource: {
          findMany: vi.fn(async ({ where }: never) => {
            const w = where as { active: boolean; periodicity: { in: string[] } };
            return e.sources.filter(
              (s) => s.active === w.active && w.periodicity.in.includes(s.periodicity as string),
            );
          }),
        },
        harvestRun: {
          findFirst: vi.fn(async () =>
            e.derniere === undefined ? null : e.derniere && { startedAt: e.derniere },
          ),
        },
      };
    }),
  } as never;
  const executer = vi.fn(async () => ({ outcome: 'moisson', created: 2, collided: 0, deletions: 0 }));
  const sched = new MoissonnageScheduler(prisma, { executer } as never);
  // Le journal ne doit pas polluer la sortie des tests.
  const logger = (sched as unknown as { logger: Record<string, unknown> }).logger;
  logger.log = () => {};
  logger.warn = () => {};
  logger.error = () => {};
  return { sched, executer };
}

const SOURCE = { id: 's1', name: 'Dépôt', periodicity: 'quotidienne', active: true };

describe('⚠ Il n’émet RIEN tant que personne n’a déclaré de source', () => {
  it('une école sans source ne produit aucun appel sortant', async () => {
    // C'est ce qui rend ce planificateur sans danger à l'installation : la
    // règle « un défaut d'activation ne se pose jamais sur un comportement qui
    // ÉMET vers l'extérieur » est tenue par l'absence de source, pas par un
    // interrupteur.
    const { sched, executer } = contexte({ zinda: { sources: [] } });
    await sched.quotidien(new Date('2026-09-13T04:00:00Z'));
    expect(executer).not.toHaveBeenCalled();
  });

  it('une source ÉTEINTE n’est pas moissonnée', async () => {
    const { sched, executer } = contexte({
      zinda: { sources: [{ ...SOURCE, active: false }] },
    });
    await sched.quotidien(new Date('2026-09-13T04:00:00Z'));
    expect(executer).not.toHaveBeenCalled();
  });

  it('une source « manuelle » n’est jamais lancée toute seule', async () => {
    const { sched, executer } = contexte({
      zinda: { sources: [{ ...SOURCE, periodicity: 'manuelle' }] },
    });
    await sched.quotidien(new Date('2026-09-13T04:00:00Z'));
    expect(executer).not.toHaveBeenCalled();
  });
});

describe('⚠ L’échéance se calcule sur la DERNIÈRE EXÉCUTION, pas sur un calendrier', () => {
  it('jamais moissonnée : c’est l’heure', async () => {
    const { sched, executer } = contexte({ zinda: { sources: [SOURCE], derniere: null } });
    await sched.quotidien(new Date('2026-09-13T04:00:00Z'));
    expect(executer).toHaveBeenCalledTimes(1);
  });

  it('⚠ un passage MANQUÉ est rattrapé — pas reporté d’une semaine', async () => {
    // Un planificateur qui se contente de « c'est lundi » saute une semaine
    // entière dès qu'un passage tombe : redémarrage, panne, conteneur recréé.
    const { sched, executer } = contexte({
      zinda: {
        sources: [{ ...SOURCE, periodicity: 'hebdomadaire' }],
        derniere: new Date('2026-08-20T04:00:00Z'),
      },
    });
    await sched.quotidien(new Date('2026-09-13T04:00:00Z'));
    expect(executer).toHaveBeenCalledTimes(1);
  });

  it('⚠ LA MARGE DE DOUZE HEURES : une exécution d’hier à 04:00:05 ne saute pas ce soir', async () => {
    // Sans elle, « 23 h 59 écoulées » suffirait à reporter d'un jour — et la
    // source sauterait un jour sur deux, indéfiniment, parce que le passage a
    // lieu à heure fixe.
    const { sched, executer } = contexte({
      zinda: { sources: [SOURCE], derniere: new Date('2026-09-12T04:00:05Z') },
    });
    await sched.quotidien(new Date('2026-09-13T04:00:00Z'));
    expect(executer).toHaveBeenCalledTimes(1);
  });

  it('une source moissonnée il y a une heure n’est PAS relancée', async () => {
    // Témoin d'absence : sans lui, un planificateur qui lance tout serait
    // indiscernable d'un planificateur juste.
    const { sched, executer } = contexte({
      zinda: { sources: [SOURCE], derniere: new Date('2026-09-13T03:00:00Z') },
    });
    await sched.quotidien(new Date('2026-09-13T04:00:00Z'));
    expect(executer).not.toHaveBeenCalled();
  });
});

describe('⚠ Une école en panne ne prive pas les autres', () => {
  it('le parcours continue après un schéma absent', async () => {
    const { sched, executer } = contexte(
      { zinda: { sources: [SOURCE], derniere: null } },
      ['fantome', 'zinda'],
    );
    await expect(sched.quotidien(new Date('2026-09-13T04:00:00Z'))).resolves.toBeUndefined();
    expect(executer).toHaveBeenCalledTimes(1);
  });

  it('⚠ un moissonnage qui LÈVE ne fait pas tomber le passage', async () => {
    const prisma = {
      tenant: { findMany: vi.fn(async () => [{ slug: 'zinda' }]) },
      forTenant: vi.fn(() => ({
        harvestSource: { findMany: vi.fn(async () => [SOURCE]) },
        harvestRun: { findFirst: vi.fn(async () => null) },
      })),
    } as never;
    const sched = new MoissonnageScheduler(prisma, {
      executer: vi.fn(async () => {
        throw new Error('entrepôt inatteignable');
      }),
    } as never);
    const logger = (sched as unknown as { logger: Record<string, unknown> }).logger;
    logger.log = () => {};
    logger.error = () => {};
    await expect(sched.quotidien(new Date('2026-09-13T04:00:00Z'))).resolves.toBeUndefined();
  });
});

describe('⚠ Un passage à la fois', () => {
  it('un déclenchement qui arrive pendant le précédent est SAUTÉ, pas mis en file', async () => {
    // Un moissonnage de huit mille notices peut dépasser vingt-quatre heures
    // sur une liaison lente ; deux passages en parallèle écriraient la même
    // identité.
    const { sched, executer } = contexte({ zinda: { sources: [SOURCE], derniere: null } });
    const premier = sched.quotidien(new Date('2026-09-13T04:00:00Z'));
    await sched.quotidien(new Date('2026-09-13T04:00:01Z'));
    await premier;
    expect(executer).toHaveBeenCalledTimes(1);
  });
});
