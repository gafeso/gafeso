import { describe, expect, it, vi } from 'vitest';
import { OpacService } from './opac.service';

/**
 * LE PLAFOND DU MOTEUR DE RECHERCHE — et pourquoi ce test existe.
 *
 * Meilisearch borne le nombre total de résultats qu'il accepte de COMPTER :
 * `maxTotalHits`, 1 000 par défaut. Au-delà, `totalHits` cesse d'être un total
 * et devient un plancher — sans que rien dans la réponse ne le dise.
 *
 * ⚠ CE DÉFAUT A VÉCU TROIS SEMAINES PARCE QU'IL EST INVISIBLE EN DESSOUS DU
 * PLAFOND. Sur les 352 notices du fonds de démonstration, `totalHits` est juste,
 * tous les tests passent, et l'écran dit vrai. Il ne devient faux qu'à partir de
 * la 1 001ᵉ notice — c'est-à-dire chez le premier vrai client, et sur ses
 * surfaces PUBLIQUES : la page d'accueil, la recherche, la constellation.
 * Mesuré le 11 septembre 2026 sur un fonds de 8 000 notices :
 * `totalHits` annonçait 1 000 pendant que la somme des facettes faisait 8 000.
 *
 * D'où un jeu d'essai qui DÉPASSE le plafond. Un test à 352 notices ne peut
 * rien dire d'un plafond à 1 000 : il ne l'atteint jamais.
 */

/** Le plafond du faux moteur. Petit pour rester lisible ; le principe est le même. */
const PLAFOND = 1000;
/** Le fonds simulé — au-delà du plafond, exprès. */
const FONDS = 8000;

/**
 * Faux moteur qui PLAFONNE COMME MEILISEARCH, et pas autrement.
 *
 * ⚠ C'est tout l'intérêt du test. Une doublure qui rend le vrai total est plus
 * permissive que le moteur réel, donc aveugle exactement là où le moteur
 * décide — la leçon déjà payée ce soir sur le `select` de l'entrepôt OAI.
 *
 * Les deux comportements reproduits sont MESURÉS sur l'index de développement,
 * pas supposés :
 *  · `totalHits` est écrêté au plafond ;
 *  · la distribution de facettes, elle, N'EST PAS écrêtée — elle reste exacte.
 *    C'est ce qui rend la contradiction visible à l'œil nu : 1 000 d'un côté,
 *    8 000 quand on additionne les domaines de la même réponse.
 */
function faussMoteurPlafonne(total = FONDS) {
  return {
    search: vi.fn(async (_slug: string, params: { hitsPerPage: number; page: number }) => ({
      hits: [],
      totalHits: Math.min(total, PLAFOND),
      page: params.page,
      totalPages: params.hitsPerPage > 0
        ? Math.ceil(Math.min(total, PLAFOND) / params.hitsPerPage)
        : 0,
      facetDistribution: {
        // Somme = le VRAI total : les facettes échappent au plafond.
        category: { droit: total / 2, medecine: total / 4, economie: total / 4 },
      },
      totalPlafonne: total >= PLAFOND,
    })),
  };
}

/** Base qui connaît, elle, le vrai nombre de lignes. */
function fausseBase(total = FONDS) {
  return {
    forTenant: vi.fn(() => ({
      biblioRecord: { count: vi.fn(async () => total) },
    })),
  };
}

function service(total = FONDS) {
  return new OpacService(
    faussMoteurPlafonne(total) as never,
    {} as never,
    {} as never,
    fausseBase(total) as never,
    { provenance: async () => null } as never,
  );
}

describe('La constellation ne peut pas se contredire elle-même', () => {
  it('⚠ le total annoncé est le VRAI total, pas le plafond du moteur', async () => {
    const { totalRecords } = await service().constellation('horizon');

    // Le défaut mesuré : `totalRecords: result.totalHits` rendait 1 000.
    expect(totalRecords).toBe(FONDS);
    expect(totalRecords).not.toBe(PLAFOND);
  });

  it('⚠ et il est ÉGAL à la somme de ses propres domaines', async () => {
    // C'est l'invariant qui compte, pas le chiffre : une page qui affirme
    // « 1 000 ressources » au-dessus d'une liste de domaines totalisant 8 000
    // se contredit dans le même écran, et les deux chiffres sont lus.
    const { totalRecords, domains } = await service().constellation('horizon');
    const somme = domains.reduce((t, d) => t + d.count, 0);

    expect(totalRecords).toBe(somme);
  });

  it('sous le plafond, rien ne change — le cas nominal reste le cas nominal', async () => {
    const { totalRecords, domains } = await service(352).constellation('zinda');
    expect(totalRecords).toBe(352);
    expect(domains.reduce((t, d) => t + d.count, 0)).toBe(352);
  });
});

describe('La recherche publique DIT que son total est un plancher', () => {
  it('⚠ au-delà du plafond, la réponse porte la marque — un chiffre faux ne s’affiche pas comme un fait', async () => {
    const res = await service().searchCatalog('horizon', { page: 1, limit: 20 } as never);

    // Le total d'une recherche plein texte ne peut PAS venir de SQL : seul le
    // moteur sait combien de notices répondent à « droit foncier ». On ne peut
    // donc pas le rendre exact — mais on peut refuser de le présenter comme
    // exact. C'est la seule sortie honnête, et elle suffit : l'écran écrit
    // « plus de 1 000 résultats » au lieu de « 1 000 résultats ».
    expect(res.totalPlafonne).toBe(true);
    expect(res.totalHits).toBe(PLAFOND);
  });

  it('sous le plafond, le total est exact et la marque est absente', async () => {
    const res = await service(686).searchCatalog('zinda', { page: 1, limit: 20 } as never);

    expect(res.totalHits).toBe(686);
    expect(res.totalPlafonne).toBe(false);
  });
});
