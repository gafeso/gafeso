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
    // ⚠ L'`id` EST DANS LA DOUBLURE parce que le produit le LIT : le garde de
    // module interroge `estActif(id, …)`. Une doublure qui ne rend que le slug
    // ferait passer le test sur une donnée que la production n'envoie jamais.
    tenant: { findMany: vi.fn(async () => ecoles.map((slug) => ({ id: `id-${slug}`, slug }))) },
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
  // ⚠ LA DOUBLURE DIT OUI PAR DÉFAUT, et c'est un choix : ces cas éprouvent le
  // RYTHME, pas le garde de module. Le garde a son propre cas plus bas, avec sa
  // doublure qui dit non — sans quoi on aurait un garde qu'aucun test ne
  // traverse dans les deux états.
  const sched = new MoissonnageScheduler(prisma, { executer } as never, {
    estActif: vi.fn(async () => true),
  } as never);
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
      tenant: { findMany: vi.fn(async () => [{ id: 'id-zinda', slug: 'zinda' }]) },
      forTenant: vi.fn(() => ({
        harvestSource: { findMany: vi.fn(async () => [SOURCE]) },
        harvestRun: { findFirst: vi.fn(async () => null) },
      })),
    } as never;
    const sched = new MoissonnageScheduler(prisma, {
      executer: vi.fn(async () => {
        throw new Error('entrepôt inatteignable');
      }),
    } as never, { estActif: vi.fn(async () => true) } as never);
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

describe('⚠ L’extinction du module arrête le PLANIFICATEUR, pas seulement la route', () => {
  /**
   * Le contrôleur portait `@ModuleRequis('moissonnage')` et cela suffisait tant
   * que la route était le seul chemin. Ce planificateur est un SECOND appelant :
   * une école ayant éteint Moissonnage voyait quand même partir des requêtes en
   * son nom vers des serveurs OAI tiers, chaque jour à 4 h.
   *
   * ⚠ LES DEUX ÉTATS DU GARDE SONT ÉPROUVÉS ICI. Un garde qu'on ne traverse que
   * dans l'état « passant » est indiscernable d'un garde absent — et c'est
   * précisément ce qui l'a laissé manquer deux jours.
   */
  const monter = (actif: boolean) => {
    const executer = vi.fn(async () => ({ outcome: 'moisson', created: 2, collided: 0, deletions: 0 }));
    const estActif = vi.fn(async () => actif);
    const prisma = {
      tenant: { findMany: vi.fn(async () => [{ id: 'id-zinda', slug: 'zinda' }]) },
      forTenant: vi.fn(() => ({
        harvestSource: { findMany: vi.fn(async () => [SOURCE]) },
        harvestRun: { findFirst: vi.fn(async () => null) },
      })),
    } as never;
    const sched = new MoissonnageScheduler(prisma, { executer } as never, { estActif } as never);
    const logger = (sched as unknown as { logger: Record<string, unknown> }).logger;
    logger.log = () => {};
    logger.warn = () => {};
    return { sched, executer, estActif, prisma };
  };

  it('module ÉTEINT : rien ne part, et la base de l’école n’est même pas ouverte', async () => {
    const { sched, executer, estActif, prisma } = monter(false);
    await sched.quotidien(new Date('2026-09-16T04:00:00Z'));
    expect(estActif).toHaveBeenCalledWith('id-zinda', 'moissonnage');
    expect(executer, 'une école qui a éteint le module ne doit émettre AUCUNE requête').not.toHaveBeenCalled();
    // ⚠ On éprouve l'EFFET, pas la présence du garde : le client de l'école
    // n'est pas même construit, donc aucune lecture ne part non plus.
    expect((prisma as unknown as { forTenant: ReturnType<typeof vi.fn> }).forTenant).not.toHaveBeenCalled();
  });

  it('module ALLUMÉ : le moissonnage part — sinon ce garde fermerait tout', async () => {
    const { sched, executer } = monter(true);
    await sched.quotidien(new Date('2026-09-16T04:00:00Z'));
    expect(executer).toHaveBeenCalledTimes(1);
  });
});
