import { describe, expect, it, vi } from 'vitest';
import { OpacService } from './opac.service';

/**
 * Parcours du catalogue servi par la BASE.
 *
 * La raison d'être de cette route : le filtre « a un fichier » se lit en base,
 * et le moteur de recherche n'en sait rien. Le post-filtrer après une recherche
 * rendrait `totalHits` et la pagination faux — la page annoncerait douze
 * résultats et en montrerait trois. Ici, total et notices viennent du MÊME
 * ensemble : ils ne peuvent pas se contredire, et c'est ce que ces tests
 * verrouillent.
 */
function fauxCatalogue(notices: { id: string; avecFichier: boolean }[]) {
  const count = vi.fn(async (args?: { where?: unknown }) =>
    (args?.where ? notices.filter((n) => n.avecFichier) : notices).length,
  );
  // La forme RÉELLE de l'appel : `orderBy` en fait partie, et une assertion
  // plus bas l'inspecte. L'omettre du type rendait cette assertion
  // incompilable — invisible tant que `tsc` ne voyait pas les tests.
  const findMany = vi.fn(async (args: {
    where?: unknown;
    skip?: number;
    take?: number;
    orderBy?: unknown;
  }) => {
    const base = args.where ? notices.filter((n) => n.avecFichier) : notices;
    return base.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? 20)).map((n) => ({
      id: n.id,
      title: `Titre ${n.id}`,
      author: null,
      publishYear: null,
      recordType: 'ouvrage',
      coverUrl: null,
    }));
  });
  return {
    count,
    findMany,
    service: new OpacService(
      {} as never,
      {} as never,
      {} as never,
      { forTenant: () => ({ biblioRecord: { count, findMany } }) } as never,
      { provenance: async () => null } as never,
      { enregistrer: async () => true } as never
    ),
  };
}

const fonds = Array.from({ length: 25 }, (_, i) => ({
  id: `r${i}`,
  avecFichier: i < 4,
}));

describe('parcourir — pagination et total ne peuvent pas se contredire', () => {
  it('⚠ le filtre s’applique au TOTAL comme aux notices', async () => {
    // LE test de la route. Si `where` n'était posé que sur findMany, la page
    // annoncerait 25 résultats et en montrerait 4 — exactement le mensonge que
    // cette route existe pour éviter.
    const { count, findMany, service } = fauxCatalogue(fonds);
    const r = await service.parcourir('amani', 1, 20, true);
    // ⚠ Pas de `!` : si le comptage n'avait pas lieu, on veut un échec qui le
    // DIT, pas un accès sur `undefined`.
    expect(count.mock.calls[0][0], 'le comptage doit recevoir un filtre').toBeDefined();
    expect(count.mock.calls[0][0]?.where).toEqual({ digitalCopy: { isNot: null } });
    expect(findMany.mock.calls[0][0].where).toEqual({ digitalCopy: { isNot: null } });
    expect(r.totalHits).toBe(4);
    expect(r.hits).toHaveLength(4);
  });

  it('sans filtre, le total est celui du fonds entier', async () => {
    const { service } = fauxCatalogue(fonds);
    const r = await service.parcourir('amani', 1, 20, false);
    expect(r.totalHits).toBe(25);
    expect(r.hits).toHaveLength(20);
    expect(r.totalPages).toBe(2);
  });

  it('la deuxième page reprend là où la première s’arrête', async () => {
    const { findMany, service } = fauxCatalogue(fonds);
    const r = await service.parcourir('amani', 2, 20, false);
    expect(findMany.mock.calls[0][0].skip).toBe(20);
    expect(r.hits).toHaveLength(5);
    expect(r.page).toBe(2);
  });

  it('une page au-delà de la fin rend une liste vide AVEC le vrai total', async () => {
    // « il n'y a rien ici » et « il n'y a rien du tout » restent distincts.
    const { service } = fauxCatalogue(fonds);
    const r = await service.parcourir('amani', 99, 20, false);
    expect(r.hits).toEqual([]);
    expect(r.totalHits).toBe(25);
  });

  it('un catalogue vide rend zéro, pas une erreur', async () => {
    const { service } = fauxCatalogue([]);
    await expect(service.parcourir('neuve', 1, 20, false)).resolves.toEqual({
      hits: [],
      totalHits: 0,
      page: 1,
      totalPages: 0,
    });
  });

  it('l’ordre stable est le même que celui des nouveautés', async () => {
    const { findMany, service } = fauxCatalogue(fonds);
    await service.parcourir('amani', 1, 20, false);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

describe('parcourir — le cache ne confond pas deux pages', () => {
  it('page, limite et filtre entrent tous dans la clé', async () => {
    const { findMany, service } = fauxCatalogue(fonds);
    await service.parcourir('amani', 1, 20, false);
    await service.parcourir('amani', 2, 20, false);
    await service.parcourir('amani', 1, 10, false);
    await service.parcourir('amani', 1, 20, true);
    expect(findMany).toHaveBeenCalledTimes(4);
    // …et une répétition à l'identique ne recalcule pas.
    await service.parcourir('amani', 1, 20, false);
    expect(findMany).toHaveBeenCalledTimes(4);
  });
});

describe('constellation — elle n’interroge plus le moteur à chaque visite', () => {
  function fauxMoteur() {
    const search = vi.fn().mockResolvedValue({
      hits: [],
      // ⚠ 12 ET 3 DIVERGENT EXPRÈS. Depuis le 11 septembre 2026 le total vient
      // de la BASE (`count`), et la répartition du MOTEUR : deux sources, donc
      // deux nombres, et un test qui les prendrait égaux ne saurait pas dire
      // laquelle il lit. Ici `totalRecords` doit valoir 3, jamais 12.
      totalHits: 12,
      page: 1,
      totalPages: 1,
      facetDistribution: { category: { droit: 2, arts: 1 } },
      totalPlafonne: false,
    });
    // Le comptage en base est mesuré comme la recherche : la garantie de coût
    // de cet écran porte désormais sur DEUX appels, pas un.
    const count = vi.fn().mockResolvedValue(3);
    return {
      search,
      count,
      service: new OpacService(
        { search } as never,
        {} as never,
        {} as never,
        { forTenant: () => ({ biblioRecord: { count } }) } as never,
      { provenance: async () => null } as never,
      { enregistrer: async () => true } as never
    ),
    };
  }

  it('⚠ deux visites, UN appel de CHAQUE sorte — la garantie couvre les deux sources', async () => {
    const { search, count, service } = fauxMoteur();
    const a = await service.constellation('amani');
    const b = await service.constellation('amani');

    expect(search).toHaveBeenCalledTimes(1);
    // ⚠ SANS CETTE LIGNE, LA GARANTIE AURAIT ÉTÉ VIDÉE EN SILENCE. Le total
    // vient de la base depuis le 11 septembre ; un `count()` hors du cache
    // rendrait l'écran à nouveau non borné, et le test serait resté vert en
    // ne surveillant que l'appel qu'on venait de cesser de faire seul.
    expect(count).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    // Le total est celui de la BASE (3), pas celui du moteur (12).
    expect(a.totalRecords).toBe(3);
  });

  it('deux écoles ne partagent pas leur répartition', async () => {
    const { search, count, service } = fauxMoteur();
    await service.constellation('amani');
    await service.constellation('tamaro');
    expect(search).toHaveBeenCalledTimes(2);
    expect(count).toHaveBeenCalledTimes(2);
  });

  it('la forme de la réponse est inchangée', async () => {
    const { service } = fauxMoteur();
    const r = await service.constellation('amani');
    expect(Object.keys(r).sort()).toEqual(['domains', 'totalRecords']);
    expect(r.domains[0]).toEqual({ category: 'droit', count: 2 });
    // Forme inchangée, SOURCE changée : c'est exactement ce que ce lot promet.
    expect(r.totalRecords).toBe(3);
  });
});
