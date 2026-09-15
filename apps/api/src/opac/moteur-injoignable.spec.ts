import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { OpacService } from './opac.service';
import { SearchService } from '../search/search.service';

/**
 * MOTEUR INJOIGNABLE : « JE NE SAIS PAS » N'EST PAS « AUCUN RÉSULTAT ».
 * Backlog n°18, corrigé le 12 septembre 2026.
 *
 * ## Le défaut
 *
 * `SearchService.search` rattrapait toute panne du moteur et rendait un
 * résultat VIDE — `totalHits: 0`, facettes à zéro. L'intention était juste :
 * l'OPAC ne devait pas rendre une 500. La forme écrivait une non-réponse comme
 * un fait, et la conséquence était publique : **un Meilisearch tombé rendait
 * une bibliothèque publiquement vide**, avec un avertissement dans un journal
 * que personne ne lit en production.
 *
 * ⚠ ET CE CHEMIN N'ÉTAIT COUVERT PAR AUCUN TEST — vérifié avant d'écrire
 * celui-ci. C'est ce qui explique sa longévité : le code du cas dégradé était
 * là, lisible, plausible, et jamais exercé. Une relecture ne pouvait pas le
 * voir, parce que la ligne fautive est correcte en elle-même ; elle n'est
 * fausse que rapportée à ce qu'elle affirme.
 *
 * ## Ce que ce fichier éprouve
 *
 * Les TROIS états, et surtout la frontière entre les deux premiers : zéro
 * résultat avec un moteur qui répond doit rester indiscernable de… rien
 * d'autre. C'est une réponse, et elle doit continuer de s'écrire 200.
 */

const QUERY = { page: 1, limit: 20 } as never;

/**
 * `SearchService` résout son moteur lui-même depuis la configuration : on le
 * construit avec une configuration minimale, puis on lui substitue le moteur.
 * C'est bien la VRAIE façade qu'on éprouve — c'est elle qui porte le `try`.
 */
function facade(engine: { name: string; search: unknown }): SearchService {
  const service = new SearchService({ get: () => undefined } as never);
  (service as unknown as { engine: unknown }).engine = engine;
  return service;
}

/** Moteur dont la recherche ÉCHOUE, comme un Meilisearch arrêté. */
function moteurTombe(motif = 'connect ECONNREFUSED 127.0.0.1:7700') {
  return facade({ name: 'Meilisearch', search: vi.fn().mockRejectedValue(new Error(motif)) });
}

/** Moteur qui répond, avec le nombre de résultats demandé. */
function moteurServant(totalHits: number, facettes: Record<string, Record<string, number>> = {}) {
  return facade({
    name: 'Meilisearch',
    search: vi.fn(async (_s: string, p: { page: number; hitsPerPage: number }) => ({
      hits: [],
      totalHits,
      page: p.page,
      totalPages: p.hitsPerPage > 0 ? Math.ceil(totalHits / p.hitsPerPage) : 0,
      facetDistribution: facettes,
      totalPlafonne: false,
    })),
  });
}

function opac(search: SearchService, notices = 352) {
  return new OpacService(
    search,
    {} as never,
    {} as never,
    { forTenant: () => ({ biblioRecord: { count: async () => notices } }) } as never,
    { provenance: async () => null } as never,
      { enregistrer: async () => true } as never
    );
}

describe('SearchService — il RAPPORTE l’indisponibilité, il ne la traduit pas', () => {
  it('moteur tombé → état « indisponible », avec le motif technique', async () => {
    const r = await moteurTombe().search('zinda', { page: 1, hitsPerPage: 20 });

    expect(r.etat).toBe('indisponible');
    // Le motif sert au journal de l'exploitant, pas au visiteur.
    if (r.etat === 'indisponible') expect(r.motif).toContain('ECONNREFUSED');
    // ⚠ ET SURTOUT : aucun total. C'est le défaut d'origine — l'union rend
    // `totalHits` inaccessible sans avoir traité l'état, donc un appelant ne
    // PEUT plus lire 0 par distraction.
    expect(r).not.toHaveProperty('totalHits');
  });

  it('moteur qui répond, même sans résultat → état « servi »', async () => {
    const r = await moteurServant(0).search('zinda', { page: 1, hitsPerPage: 20 });

    expect(r.etat).toBe('servi');
    if (r.etat === 'servi') expect(r.totalHits).toBe(0);
  });
});

describe('⚠ La recherche publique DIT la panne — elle ne montre pas un catalogue vide', () => {
  it('moteur tombé → 503, et le message rassure sur le catalogue', async () => {
    const service = opac(moteurTombe());

    await expect(service.searchCatalog('zinda', QUERY)).rejects.toThrow(
      ServiceUnavailableException,
    );
    // Le message compte autant que le code : quelqu'un le lira à l'écran.
    await expect(service.searchCatalog('zinda', QUERY)).rejects.toThrow(
      /catalogue n’est pas vide/,
    );
  });

  it('⚠ zéro résultat avec un moteur qui répond reste un 200 — la frontière tient', async () => {
    // LE test de non-régression du lot. Si celui-ci tombait, on aurait échangé
    // un faux contre un autre : une recherche légitimement sans résultat
    // annoncée comme une panne.
    const res = await opac(moteurServant(0)).searchCatalog('zinda', QUERY);

    expect(res.totalHits).toBe(0);
    expect(res.totalPages).toBe(0);
  });

  it('la recherche par CATÉGORIE ne rend pas « aucune catégorie » quand elle n’a pas pu regarder', async () => {
    // Ce chemin passe par `matchingCategories`. Rendre `[]` y ferait conclure
    // « aucune catégorie ne porte ce nom », donc une réponse à zéro résultat
    // présentée comme un fait — le défaut déplacé d'un cran, pas corrigé.
    const service = opac(moteurTombe());

    await expect(
      service.searchCatalog('zinda', { dans: 'categorie', q: 'droit', page: 1, limit: 20 } as never),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('⚠ panne APRÈS une recherche aboutie : on se TAIT, on n’affirme pas', async () => {
    // `valeursHorsCatalogue` n'est appelée qu'après un zéro résultat, pour
    // dire « ce type de document n'existe nulle part ici ». Si le moteur tombe
    // entre les deux appels, ne rien dire est honnête ; affirmer qu'une valeur
    // est inconnue du catalogue sans avoir pu regarder ne l'est pas.
    const engine = {
      name: 'Meilisearch',
      search: vi
        .fn()
        .mockResolvedValueOnce({
          hits: [], totalHits: 0, page: 1, totalPages: 0,
          facetDistribution: {}, totalPlafonne: false,
        })
        .mockRejectedValueOnce(new Error('ECONNRESET')),
    };
    const service = opac(facade(engine));

    const res = await service.searchCatalog('zinda', {
      page: 1, limit: 20, recordType: 'these',
    } as never);

    expect(res.totalHits).toBe(0);
    expect(res).not.toHaveProperty('filtresInconnus');
  });
});

describe('⚠ La constellation aussi — c’est la page d’accueil publique', () => {
  it('moteur tombé → 503, et non une bibliothèque sans domaines', async () => {
    // C'est le pire endroit du produit pour ce défaut : l'écran que voient un
    // étudiant, une DSI, un bailleur. Le front a déjà eu à corriger le même
    // faux dans `fetchConstellation`, qui retombait sur
    // `{ totalRecords: 0, domains: [] }`.
    await expect(opac(moteurTombe()).constellation('zinda')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('⚠ la panne n’est PAS mise en cache — l’incident ne dure pas une minute', async () => {
    // Le cache mémorise la promesse ; sans le `catch` qui purge l'entrée, une
    // panne d'une seconde serait rejouée pendant tout le TTL. Vérifié ici sur
    // le vrai chemin, pas seulement sur le cache isolé.
    const engine = {
      name: 'Meilisearch',
      search: vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue({
          hits: [], totalHits: 1, page: 1, totalPages: 1,
          facetDistribution: { category: { droit: 352 } }, totalPlafonne: false,
        }),
    };
    const service = opac(facade(engine));

    await expect(service.constellation('zinda')).rejects.toThrow(ServiceUnavailableException);
    // Deuxième visite, moteur revenu : elle DOIT réussir tout de suite.
    const ok = await service.constellation('zinda');
    expect(ok.totalRecords).toBe(352);
    expect(ok.domains).toEqual([{ category: 'droit', count: 352 }]);
  });

  it('le total vient toujours de la base, et la répartition du moteur', async () => {
    const res = await opac(moteurServant(1, { category: { droit: 300, arts: 52 } })).constellation('zinda');
    expect(res.totalRecords).toBe(352);
    expect(res.domains.reduce((t, d) => t + d.count, 0)).toBe(352);
  });
});
