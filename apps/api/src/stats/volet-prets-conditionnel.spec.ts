/**
 * 🔴 LE VOLET DE PRÊTS EST ABSENT ET NOMMÉ, JAMAIS À ZÉRO.
 *
 * *Décision de Jean du 8 octobre 2026 (Q2) : « statistiques ne dépend plus que
 * de catalogue. Volet prêts présent seulement si circulation est actif ; sinon
 * refus explicite nommé côté API, jamais des zéros. »*
 *
 * ⭐ POURQUOI DES ZÉROS SERAIENT LE PIRE DES FAUX ICI. Une bibliothèque sans
 * rayon qui lit « 0 prêt, 0 retard, 0 réservation » ne lit pas une absence de
 * module : elle lit un ÉCHEC. Et contrairement à un faux d'écran, celui-ci se
 * RECOPIE — dans un rapport annuel remis à une université, qui en tirera que la
 * bibliothèque ne sert à personne.
 *
 * C'est « une non-réponse écrite comme un fait », appliqué à une MESURE.
 */
import { describe, expect, it, vi } from 'vitest';
import { RapportAnnuelService } from './rapport-annuel.service';
import { StatsService } from './stats.service';
import { annee } from './rapport-annuel';

/**
 * Un client Prisma qui rend du vide partout : on n'éprouve QUE la forme.
 *
 * ⚠ UN MANDATAIRE SUR LES MODÈLES, ET PAS SUR LES MÉTHODES — et la distinction
 * est la règle de ce dépôt. Énumérer trente modèles Prisma à la main n'éprouve
 * rien et casse au premier qu'on oublie ; mais une MÉTHODE non prévue doit
 * échouer BRUYAMMENT, parce qu'un repli silencieux transforme un oubli de
 * doublure en défaut apparent du produit.
 *
 * Donc : tout modèle rend le même objet creux, et toute méthode absente de cet
 * objet lève. Les modèles TOUCHÉS sont enregistrés, pour qu'un test puisse
 * affirmer sur quoi la mesure a porté.
 */
function fauxPrisma() {
  const touches = new Set<string>();
  const creux = {
    count: vi.fn(async () => 0),
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    groupBy: vi.fn(async () => []),
    aggregate: vi.fn(async () => ({ _sum: {}, _count: 0 })),
  };
  const db = new Proxy(
    {
      $queryRaw: vi.fn(async () => []),
      $queryRawUnsafe: vi.fn(async () => []),
      $transaction: vi.fn(async (f: (tx: unknown) => unknown) => f(db)),
    } as Record<string, unknown>,
    {
      get(cible, prop: string) {
        if (prop in cible) return cible[prop];
        touches.add(prop);
        return creux;
      },
    },
  );
  // ⚠ LE CLIENT RACINE AUSSI. `systemActivity` lit `this.prisma.reminderLog`
  // — `ReminderLog` vit dans le schéma `public`, pas dans l'école. Une doublure
  // qui ne couvrirait que `forTenant` échouerait sur `undefined.groupBy`, et le
  // message accuserait le produit. Mesuré, pas supposé.
  const racine = new Proxy(
    {
      forTenant: () => db,
      // ⚠ `timeseries` appelle `$queryRawUnsafe` sur le client RACINE : la
      // granularité vient d'une liste blanche du DTO, donc l'interpolation SQL
      // y est sûre, et l'appel passe par la racine et non par l'école.
      $queryRawUnsafe: vi.fn(async () => []),
      $queryRaw: vi.fn(async () => []),
    } as Record<string, unknown>,
    {
    get(cible, prop: string) {
      if (prop in cible) return cible[prop];
        touches.add(`public.${prop}`);
        return creux;
      },
    },
  );
  return { prisma: racine as never, touches };
}

const PERIODE = {
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2027-01-01T00:00:00Z'),
  granularity: 'month' as const,
};

describe('le tableau de bord, circulation ÉTEINTE', () => {
  const service = () =>
    new StatsService(fauxPrisma().prisma, { estActif: async () => false } as never);

  it('🔴 le volet de prêts est ABSENT, et il se NOMME', async () => {
    const d = (await service().dashboard('zinda', 't-1', PERIODE)) as unknown as Record<string, unknown>;
    const volet = d.voletPrets as unknown as {
      actif: boolean;
      module: string;
      libelleModule: string;
      message: string;
    };
    expect(volet.actif).toBe(false);
    expect(volet.module, 'le module est NOMMÉ : le front ne doit pas deviner').toBe('circulation');
    expect(volet.libelleModule).toBe('Circulation physique');
    // ⚠ Le refus DIT QUOI FAIRE — propriété que `couverture-des-roles` a rendue
    // obligatoire dans ce dépôt.
    expect(volet.message).toMatch(/Administration/);
    expect(volet.message, 'il dit que ce n’est pas un zéro').toMatch(/pas un résultat nul/);
  });

  it('⚠ AUCUN chiffre de prêt ne sort — ni à zéro, ni autrement', async () => {
    const d = await service().dashboard('zinda', 't-1', PERIODE);
    const json = JSON.stringify(d);
    // ⚠ Témoins d'ABSENCE sur les clés que l'ancien tableau de bord portait
    // TOUJOURS. Chacune, servie à zéro, serait lue comme une mesure.
    for (const cle of ['activity', 'timeseries', 'mostBorrowed', 'neverBorrowed', 'topClasses']) {
      expect(json, `${cle} ne doit pas sortir quand la circulation est éteinte`).not.toContain(
        `"${cle}"`,
      );
    }
  });

  it('⭐ mais le versant CATALOGUE sort, lui — c’est tout l’objet du découpage', async () => {
    const d = (await service().dashboard('zinda', 't-1', PERIODE)) as unknown as Record<string, unknown>;
    expect(d.fundByCategory, 'la répartition du fonds').toBeDefined();
    expect(d.system, 'l’activité système').toBeDefined();
    const kpis = d.kpis as unknown as Record<string, number>;
    expect(Object.keys(kpis).sort(), 'les KPI du FONDS seuls').toEqual(['notices', 'numeriques']);
  });
});

describe('le tableau de bord, circulation ACTIVE', () => {
  it('⭐ le volet est là, et il porte ses sections — sinon le découpage aurait tout cassé', async () => {
    const service = new StatsService(fauxPrisma().prisma, { estActif: async () => true } as never);
    const d = (await service.dashboard('zinda', 't-1', PERIODE)) as unknown as Record<string, unknown>;
    const volet = d.voletPrets as unknown as { actif: boolean };
    expect(volet.actif).toBe(true);
    // ⚠ À LA RACINE, et c'est le contrat du front — leur écran lit
    // `data.rankings` et `data.activity` directement. Les imbriquer aurait cassé
    // un écran déjà livré, pour un gain d'arborescence.
    expect(d.rankings).toBeDefined();
    expect(d.activity).toBeDefined();
    expect(d.timeseries).toBeDefined();
    expect(d.fundByCategory, 'et le versant catalogue reste').toBeDefined();
  });
});

describe('le rapport annuel, circulation ÉTEINTE', () => {
  it('🔴 le bloc circulation est `non_calculable` AVEC SON MOTIF', async () => {
    const r = await new RapportAnnuelService(fauxPrisma().prisma).produire(
      'zinda',
      'Université Virtuelle',
      annee(2026),
      false,
    );
    expect(r.circulation.etat).toBe('non_calculable');
    if (r.circulation.etat === 'non_calculable') {
      expect(r.circulation.motif).toMatch(/Circulation physique/);
      expect(r.circulation.motif).toMatch(/pas un résultat nul/);
    }
  });

  it('⭐ et une RÉSERVE le dit EN TÊTE, pas en note de bas', async () => {
    const r = await new RapportAnnuelService(fauxPrisma().prisma).produire(
      'zinda',
      'Université Virtuelle',
      annee(2026),
      false,
    );
    // ⚠ EN TÊTE : une directrice qui lit un rapport sans volet de prêts doit
    // savoir pourquoi AVANT d'arriver au bloc vide. Ce fichier garde la POSITION,
    // pas seulement la présence.
    expect(r.reserves[0], 'la première réserve nomme l’absence du volet').toMatch(
      /NE COUVRE PAS les prêts/,
    );
    expect(r.reserves[0]).toMatch(/n’est pas un zéro/);
  });

  it('⚠ circulation ACTIVE : la réserve DISPARAÎT — sinon elle serait un faux permanent', async () => {
    const r = await new RapportAnnuelService(fauxPrisma().prisma).produire(
      'zinda',
      'Université Virtuelle',
      annee(2026),
      true,
    );
    // Témoin d'ABSENCE : une réserve qui resterait affichée sur une école qui
    // PRÊTE serait « un avertissement exact devenu un mensonge ».
    expect(r.reserves.join(' ')).not.toMatch(/NE COUVRE PAS les prêts/);
    expect(r.circulation.etat).toBe('calcule');
  });
});
