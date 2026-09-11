import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { OpacService, CHIFFRES_TTL_SECONDS, PERSONNEL_BIBLIOTHEQUE } from './opac.service';
import { OpacController } from './opac.controller';
import { CacheMemoireTTL } from './cache-memoire';

/**
 * Fausse base, par établissement. Les compteurs enregistrent leurs appels : la
 * recette doit pouvoir prouver qu'un chiffre vient bien d'un COMPTAGE, et non
 * d'une constante — c'est le contrôle négatif n° 6.
 */
function fauxPrisma(fonds: Record<string, { notices: number; lecteurs: number; numeriques: number; licences: number }>) {
  const appels: string[] = [];
  return {
    appels,
    forTenant(slug: string) {
      const f = fonds[slug];
      if (!f) throw new Error(`école inconnue : ${slug}`);
      return {
        biblioRecord: {
          count: vi.fn(async (args?: { where?: unknown }) => {
            appels.push(`${slug}:notices`);
            return args?.where ? f.numeriques : f.notices;
          }),
        },
        user: { count: vi.fn(async () => { appels.push(`${slug}:lecteurs`); return f.lecteurs; }) },
        offlineLicense: { count: vi.fn(async () => { appels.push(`${slug}:licences`); return f.licences; }) },
      };
    },
  };
}

function service(prisma: unknown) {
  return new OpacService({} as never, {} as never, {} as never, prisma as never);
}

const BUC = { notices: 1240, lecteurs: 312, numeriques: 87, licences: 45 };

describe('chiffres publics — cas 1 : un établissement avec du fonds', () => {
  it('rend les quatre nombres, conformes à la base', async () => {
    const chiffres = await service(fauxPrisma({ buc: BUC })).chiffresDuFonds('buc');
    expect(chiffres).toEqual({
      documents: 1240,
      lecteurs: 312,
      documentsNumeriques: 87,
      lecturesHorsLigne: 45,
    });
  });

  it('rend QUATRE clés, pas une de plus — c’est le contrat du front', async () => {
    const chiffres = await service(fauxPrisma({ buc: BUC })).chiffresDuFonds('buc');
    expect(Object.keys(chiffres).sort()).toEqual([
      'documents',
      'documentsNumeriques',
      'lecteurs',
      'lecturesHorsLigne',
    ]);
  });

  it('les lecteurs excluent le personnel de la bibliothèque, sans se restreindre aux étudiants', async () => {
    const prisma = fauxPrisma({ buc: BUC });
    const db = prisma.forTenant('buc');
    const s = new OpacService({} as never, {} as never, {} as never,
      { forTenant: () => db } as never);
    await s.chiffresDuFonds('buc');
    const where = (db.user.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    // Exclusion, jamais inclusion : un enseignant ou un chercheur est un
    // lecteur. `role = STUDENT` donnerait un chiffre étroit, faux en public.
    expect(where.role).toEqual({ notIn: PERSONNEL_BIBLIOTHEQUE });
    expect(where.status).toBe('ACTIVE');
  });
});

describe('chiffres publics — cas 2 : un établissement vide', () => {
  it('rend quatre zéros — pas une erreur, pas un objet vide', async () => {
    const vide = { notices: 0, lecteurs: 0, numeriques: 0, licences: 0 };
    const chiffres = await service(fauxPrisma({ neuve: vide })).chiffresDuFonds('neuve');
    // Un fonds vide et un fonds absent ne doivent PAS se ressembler : ici on
    // affirme zéro, ce qui est vrai, au lieu de ne rien dire.
    expect(chiffres).toEqual({
      documents: 0,
      lecteurs: 0,
      documentsNumeriques: 0,
      lecturesHorsLigne: 0,
    });
  });
});

describe('chiffres publics — cas 5 : deux établissements ne se voient pas', () => {
  it('chacun ses chiffres, y compris à travers le cache', async () => {
    const prisma = fauxPrisma({
      buc: BUC,
      ujkz: { notices: 7, lecteurs: 3, numeriques: 1, licences: 0 },
    });
    const s = service(prisma);
    const a = await s.chiffresDuFonds('buc');
    const b = await s.chiffresDuFonds('ujkz');
    expect(a.documents).toBe(1240);
    expect(b.documents).toBe(7);
    // Et le cache ne rend pas la première école à la seconde au second passage.
    expect((await s.chiffresDuFonds('ujkz')).documents).toBe(7);
    expect((await s.chiffresDuFonds('buc')).documents).toBe(1240);
  });
});

describe('chiffres publics — cas 6 : CONTRÔLE NÉGATIF', () => {
  it('chaque nombre vient d’un COMPTAGE, pas d’une constante', async () => {
    // Si un comptage était remplacé par une constante, l'appel correspondant
    // disparaîtrait de cette liste — et le même fonds rendrait le même chiffre
    // quel que soit son contenu, ce que le second volet vérifie.
    const prisma = fauxPrisma({ buc: BUC });
    await service(prisma).chiffresDuFonds('buc');
    expect(prisma.appels.filter((a) => a === 'buc:notices')).toHaveLength(2);
    expect(prisma.appels).toContain('buc:lecteurs');
    expect(prisma.appels).toContain('buc:licences');
  });

  it('deux fonds différents ne peuvent pas rendre les mêmes chiffres', async () => {
    const petit = await service(fauxPrisma({ a: { notices: 3, lecteurs: 2, numeriques: 1, licences: 0 } })).chiffresDuFonds('a');
    const grand = await service(fauxPrisma({ a: BUC })).chiffresDuFonds('a');
    expect(petit).not.toEqual(grand);
  });
});

describe('chiffres publics — la route est publique et dit sa fraîcheur', () => {
  function controleur(prisma: unknown) {
    // ⚠ SIX dépendances — le compte est celui du constructeur, pas une
    // approximation. Un argument manquant compilait tant que `tsc` ne voyait
    // pas les tests (backlog n° 4) : la doublure taisait donc l'ajout d'une
    // dépendance, jusqu'à ce qu'un test échoue pour une raison sans rapport.
    return new OpacController(
      service(prisma),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('cas 4 : répond sans authentification', async () => {
    // Aucun utilisateur, aucun jeton : le tenant seul suffit.
    const c = controleur(fauxPrisma({ buc: BUC }));
    await expect(c.chiffres({ slug: 'buc' } as never)).resolves.toMatchObject({ documents: 1240 });
  });

  it('cas 3 : domaine inconnu → refus explicite, comme les autres routes publiques', async () => {
    const c = controleur(fauxPrisma({ buc: BUC }));
    await expect(c.chiffres(null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('l’en-tête annonce EXACTEMENT la durée de vie du cache serveur', () => {
    // Deux durées écrites séparément divergent : la page annoncerait une
    // fraîcheur que le serveur ne tient pas.
    const entetes = Reflect.getMetadata('__headers__', OpacController.prototype.chiffres) as
      | { name: string; value: string }[]
      | undefined;
    expect(entetes?.[0]?.name).toBe('Cache-Control');
    expect(entetes?.[0]?.value).toBe(`public, max-age=${CHIFFRES_TTL_SECONDS}`);
  });
});

describe('cache mémoire — ce qu’il garantit', () => {
  it('ne recompte pas pendant la durée de vie, recompte après', async () => {
    let t = 1_000;
    const cache = new CacheMemoireTTL<number>(60_000, () => t);
    const calcul = vi.fn(async () => 42);
    await cache.valeur('buc', calcul);
    await cache.valeur('buc', calcul);
    expect(calcul).toHaveBeenCalledTimes(1);
    t += 60_001;
    await cache.valeur('buc', calcul);
    expect(calcul).toHaveBeenCalledTimes(2);
  });

  it('dix visites simultanées sur un cache froid ne déclenchent QU’UN comptage', async () => {
    const cache = new CacheMemoireTTL<number>(60_000, () => 0);
    const calcul = vi.fn(async () => 7);
    const resultats = await Promise.all(Array.from({ length: 10 }, () => cache.valeur('buc', calcul)));
    expect(calcul).toHaveBeenCalledTimes(1);
    expect(resultats).toEqual(Array(10).fill(7));
  });

  it('⚠ un ÉCHEC ne se met pas en cache', async () => {
    // Sinon une panne d'une seconde serait rejouée pendant toute la durée de
    // vie : l'incident durerait une minute au lieu d'un instant.
    const cache = new CacheMemoireTTL<number>(60_000, () => 0);
    const calcul = vi
      .fn()
      .mockRejectedValueOnce(new Error('base indisponible'))
      .mockResolvedValueOnce(99);
    await expect(cache.valeur('buc', calcul)).rejects.toThrow('base indisponible');
    await expect(cache.valeur('buc', calcul)).resolves.toBe(99);
    expect(calcul).toHaveBeenCalledTimes(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Lot 2 — « À découvrir dans le catalogue » : les notices récemment AJOUTÉES.
//
// Le nom de la section n'est pas décoratif : `created_at` est posé par le
// défaut Prisma au moment où la ligne est écrite, jamais renseigné à la saisie
// ni à l'import. Un fonds repris par import porte la date de l'import sur
// toutes ses notices — d'où le départage obligatoire, et d'où le libellé qui
// n'affirme aucune acquisition.
// ════════════════════════════════════════════════════════════════════════════
function fauxCatalogue(notices: unknown[]) {
  // La forme RÉELLE de l'appel : `take` seul cachait `orderBy` et `select`,
  // que des assertions plus bas inspectent.
  interface AppelNotices {
    take?: number;
    orderBy?: unknown;
    select?: Record<string, unknown>;
    where?: unknown;
  }
  const findMany = vi.fn(async (args: AppelNotices) => notices.slice(0, args.take));
  return { prisma: { forTenant: () => ({ biblioRecord: { findMany } }) }, findMany };
}

function serviceCatalogue(prisma: unknown) {
  return new OpacService({} as never, {} as never, {} as never, prisma as never);
}

const notice = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `r${n}`,
  title: `Titre ${n}`,
  author: `Auteur ${n}`,
  publishYear: 2000 + n,
  recordType: 'book',
  coverUrl: `https://couvertures/${n}.jpg`,
  ...extra,
});

describe('nouveautés — cas 1 : le tri par récence', () => {
  it('demande created_at décroissant, DÉPARTAGÉ par id', async () => {
    const { prisma, findMany } = fauxCatalogue([notice(1)]);
    await serviceCatalogue(prisma).nouveautes('buc', 6);
    // ⚠ Sans le second critère, des notices à la même seconde sortent dans un
    // ordre INDÉFINI : les six changent d'un appel à l'autre sans qu'aucune
    // donnée n'ait bougé. C'est le cas de tout fonds repris par import.
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('rend les notices dans l’ordre servi par la base, sans les retrier', async () => {
    const { prisma } = fauxCatalogue([notice(3), notice(2), notice(1)]);
    const { hits } = await serviceCatalogue(prisma).nouveautes('buc', 6);
    expect(hits.map((h: { id: string }) => h.id)).toEqual(['r3', 'r2', 'r1']);
  });

  it('sert les six champs du contrat, et seulement eux', async () => {
    const { prisma, findMany } = fauxCatalogue([notice(1)]);
    await serviceCatalogue(prisma).nouveautes('buc', 6);
    const appel = findMany.mock.calls[0][0];
    expect(appel.select, 'la route doit projeter explicitement').toBeDefined();
    expect(Object.keys(appel.select ?? {}).sort()).toEqual([
      'author',
      'coverUrl',
      'id',
      'publishYear',
      'recordType',
      'title',
    ]);
  });
});

describe('nouveautés — cas 2 et 3 : moins que demandé, ou rien', () => {
  it('rend ce qu’il y a — pas d’erreur, pas de remplissage', async () => {
    const { prisma } = fauxCatalogue([notice(1), notice(2)]);
    const { hits } = await serviceCatalogue(prisma).nouveautes('buc', 6);
    expect(hits).toHaveLength(2);
  });

  it('aucune notice → liste VIDE, pas une erreur', async () => {
    const { prisma } = fauxCatalogue([]);
    await expect(serviceCatalogue(prisma).nouveautes('neuve', 6)).resolves.toEqual({
      hits: [],
    });
  });
});

describe('nouveautés — cas 4 : une notice sans couverture', () => {
  it('est rendue quand même, coverUrl à null — c’est au front d’afficher un repli', async () => {
    const { prisma } = fauxCatalogue([notice(1, { coverUrl: null, author: null, publishYear: null })]);
    const { hits } = await serviceCatalogue(prisma).nouveautes('buc', 6);
    expect(hits).toHaveLength(1);
    // `null`, PAS un champ absent : le front type `string | null`, et un champ
    // omis l'obligerait à distinguer « pas de couverture » de « jamais servi ».
    expect(hits[0]).toHaveProperty('coverUrl', null);
    expect(hits[0]).toHaveProperty('author', null);
  });
});

describe('nouveautés — la limite et l’isolement', () => {
  it('la limite demandée est celle passée à la base', async () => {
    const { prisma, findMany } = fauxCatalogue([notice(1)]);
    await serviceCatalogue(prisma).nouveautes('buc', 3);
    expect(findMany.mock.calls[0][0].take).toBe(3);
  });

  it('deux limites différentes ne se confondent pas dans le cache', async () => {
    const { prisma, findMany } = fauxCatalogue([notice(1), notice(2), notice(3)]);
    const s = serviceCatalogue(prisma);
    expect((await s.nouveautes('buc', 1)).hits).toHaveLength(1);
    expect((await s.nouveautes('buc', 3)).hits).toHaveLength(3);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('deux établissements ne partagent pas leurs nouveautés', async () => {
    const findMany = vi.fn(async () => []);
    const vus: string[] = [];
    const prisma = {
      forTenant: (slug: string) => {
        vus.push(slug);
        return { biblioRecord: { findMany } };
      },
    };
    const s = serviceCatalogue(prisma);
    await s.nouveautes('buc', 6);
    await s.nouveautes('ujkz', 6);
    expect(vus).toEqual(['buc', 'ujkz']);
  });
});

describe('nouveautés — cas 5 : CONTRÔLE NÉGATIF', () => {
  it('la recette échoue si le tri est retiré', async () => {
    // Ce que le cas 1 vérifie vraiment : que `orderBy` porte les DEUX critères.
    // Retirer le tri, ou son départage, fait tomber ce test — et lui seul.
    const { prisma, findMany } = fauxCatalogue([notice(1)]);
    await serviceCatalogue(prisma).nouveautes('buc', 6);
    const orderBy = findMany.mock.calls[0][0].orderBy;
    expect(orderBy, 'un tri absent rendrait un ordre arbitraire').toBeDefined();
    expect(Array.isArray(orderBy) && orderBy.length, 'le départage manque').toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Deux filtres ajoutés après coup, et volontairement dans DEUX endroits
// différents : le type de document vit dans l'INDEX (il y est déjà filtrable),
// « a un fichier » vit dans la BASE (l'index n'en sait rien, et l'y mettre
// coûterait une réindexation de chaque école plus une synchronisation à la
// suppression qui n'existe pas).
// ════════════════════════════════════════════════════════════════════════════
describe('recherche — plusieurs types de document (recordType=a,b)', () => {
  function serviceRecherche() {
    const search = {
      search: vi.fn().mockResolvedValue({
        hits: [], totalHits: 0, page: 1, totalPages: 0, facetDistribution: {},
      }),
    };
    return {
      search,
      service: new OpacService(search as never, {} as never, {} as never, {} as never),
    };
  }
  const filtres = (search: { search: ReturnType<typeof vi.fn> }) =>
    search.search.mock.calls[0][1].filter as string[];

  it('une seule valeur reste une égalité simple', async () => {
    const { search, service } = serviceRecherche();
    await service.searchCatalog('buc', { recordType: 'book' } as never);
    expect(filtres(search)).toContain('recordType = "book"');
  });

  it('plusieurs valeurs deviennent un groupe OU — la forme que les DEUX moteurs savent déjà lire', async () => {
    const { search, service } = serviceRecherche();
    await service.searchCatalog('buc', { recordType: 'book,these' } as never);
    // Exactement la forme produite par le filtre catégories, donc celle que
    // meili-filter.ts traduit déjà pour Elasticsearch. Aucune réindexation.
    expect(filtres(search)).toContain('(recordType = "book" OR recordType = "these")');
  });

  it('tolère les espaces et les vides sans fabriquer de filtre impossible', async () => {
    const { search, service } = serviceRecherche();
    await service.searchCatalog('buc', { recordType: 'book, ,these' } as never);
    expect(filtres(search)).toContain('(recordType = "book" OR recordType = "these")');
  });

  it('⚠ une chaîne sans aucune valeur ne produit AUCUN filtre', async () => {
    // Un filtre vide rendrait zéro résultat en silence — « rien ne correspond »
    // là où l'utilisateur n'a rien demandé.
    const { search, service } = serviceRecherche();
    await service.searchCatalog('buc', { recordType: ' , ' } as never);
    expect(filtres(search).some((f) => f.includes('recordType'))).toBe(false);
  });

  it('les valeurs sont échappées, comme les autres filtres', async () => {
    const { search, service } = serviceRecherche();
    await service.searchCatalog('buc', { recordType: 'a"b,c' } as never);
    expect(filtres(search)).toContain('(recordType = "a\\"b" OR recordType = "c")');
  });
});

describe('nouveautés — filtre « a un fichier », lu dans la base', () => {
  it('sans le filtre, aucune clause where n’est posée', async () => {
    const { prisma, findMany } = fauxCatalogue([notice(1)]);
    await serviceCatalogue(prisma).nouveautes('buc', 6, false);
    expect(findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it('avec le filtre, c’est le prédicat qui compte déjà les documents numériques', async () => {
    const { prisma, findMany } = fauxCatalogue([notice(1)]);
    await serviceCatalogue(prisma).nouveautes('buc', 6, true);
    expect(findMany.mock.calls[0][0].where).toEqual({ digitalCopy: { isNot: null } });
  });

  it('⚠ la liste filtrée et la liste complète ne se confondent PAS dans le cache', async () => {
    // Sans le filtre dans la clé, le premier appelant fixerait la réponse de
    // l'autre pendant une minute — une page « documents numériques » montrant
    // des notices sans fichier, ou l'inverse.
    const { prisma, findMany } = fauxCatalogue([notice(1), notice(2)]);
    const s = serviceCatalogue(prisma);
    await s.nouveautes('buc', 6, false);
    await s.nouveautes('buc', 6, true);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0].where).toBeUndefined();
    expect(findMany.mock.calls[1][0].where).toEqual({ digitalCopy: { isNot: null } });
  });

  it('le tri et son départage survivent au filtre', async () => {
    const { prisma, findMany } = fauxCatalogue([notice(1)]);
    await serviceCatalogue(prisma).nouveautes('buc', 6, true);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

describe('cache mémoire — il est BORNÉ, et il doit l’être', () => {
  it('⚠ ne dépasse jamais son plafond, même sur mille clés différentes', async () => {
    // Sans plafond, un cache dont la clé porte des paramètres d'URL grandit
    // indéfiniment sur une route publique : il suffit d'itérer ?page=1..100000.
    // Défaut trouvé en voulant réutiliser cette brique sur une route paginée.
    const cache = new CacheMemoireTTL<number>(60_000, () => 0, 50);
    for (let i = 0; i < 1000; i++) {
      await cache.valeur(`page:${i}`, async () => i);
    }
    expect(cache.taille).toBeLessThanOrEqual(50);
  });

  it('purge le périmé AVANT d’évincer du vivant', async () => {
    let t = 0;
    const cache = new CacheMemoireTTL<number>(1_000, () => t, 3);
    await cache.valeur('a', async () => 1);
    await cache.valeur('b', async () => 2);
    t += 2_000; // a et b sont périmées
    await cache.valeur('c', async () => 3);
    await cache.valeur('d', async () => 4);
    // Les périmées ont fait la place : les vivantes sont toutes là.
    expect(await cache.valeur('c', async () => 99)).toBe(3);
    expect(await cache.valeur('d', async () => 99)).toBe(4);
  });

  it('le plafond n’abîme pas le cas courant : une clé redemandée reste servie', async () => {
    const cache = new CacheMemoireTTL<number>(60_000, () => 0, 50);
    const calcul = vi.fn(async () => 7);
    await cache.valeur('buc', calcul);
    await cache.valeur('buc', calcul);
    expect(calcul).toHaveBeenCalledTimes(1);
  });
});
