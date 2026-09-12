import { describe, expect, it, vi } from 'vitest';
import { CatalogingService } from './cataloging.service';
import { SearchService } from '../search/search.service';

/**
 * LA DÉRIVE D'INDEX — backlog n°19, livré le 12 septembre 2026.
 *
 * ## Ce qu'on mesure, et pourquoi ça n'existait pas avant
 *
 * Depuis le lot du plafond Meilisearch, `/opac/constellation` tire son TOTAL de
 * la base et sa RÉPARTITION de l'index. Les deux s'accordent quand l'index est à
 * jour, et divergent quand il a dérivé.
 *
 * C'est un progrès sur l'état antérieur — où les deux venaient de l'index, donc
 * étaient faux ENSEMBLE, donc cohérents, donc indétectables. Mais un écart que
 * personne ne voit ne sert à rien.
 *
 * ## Réservé au professionnel (décision de Jean, 12 septembre)
 *
 * Un lecteur ne peut rien faire d'une dérive ; un bibliothécaire relance la
 * réindexation. La route est derrière `catalogue.gerer`, comme
 * `POST /cataloging/reindex` qu'elle recommande — donc le signalement désigne
 * une action qui EXISTE, et pas un bouton inerte.
 *
 * ## Le cas qui compte est le troisième
 *
 * Un moteur injoignable NE DOIT PAS se lire comme un index vide. C'est tout
 * l'objet de la moitié des cas ci-dessous.
 */

function service(comptage: () => Promise<number>) {
  const search = new SearchService({ get: () => undefined } as never);
  (search as unknown as { engine: unknown }).engine = {
    name: 'Meilisearch',
    countDocuments: vi.fn(comptage),
  };
  return new CatalogingService(search, {} as never, {} as never);
}

const base = (notices: number) =>
  ({ biblioRecord: { count: vi.fn(async () => notices) } }) as never;

describe('Index aligné, index dérivé', () => {
  it('mêmes comptes → « aligne », écart 0', async () => {
    const r = await service(async () => 352).indexSante(base(352), 'zinda');
    expect(r).toEqual({ etat: 'aligne', enBase: 352, dansIndex: 352, ecart: 0 });
  });

  it('des notices MANQUENT à l’index → écart positif', async () => {
    // Le cas de la réindexation échouée : 12 notices existent et sont
    // introuvables à la recherche.
    const r = await service(async () => 340).indexSante(base(352), 'zinda');
    expect(r.etat).toBe('derive');
    expect(r.ecart).toBe(12);
  });

  it('⚠ l’index porte des documents que la base n’a PLUS → écart négatif', async () => {
    // L'autre sens, et il est pire pour le lecteur : la recherche mène à des
    // notices supprimées. C'est exactement le backlog n°9 le jour où un champ
    // dépendra du fichier — et c'est pourquoi le signe est conservé plutôt
    // qu'une valeur absolue.
    const r = await service(async () => 352).indexSante(base(340), 'zinda');
    expect(r.etat).toBe('derive');
    expect(r.ecart).toBe(-12);
  });
});

describe('⚠ Moteur injoignable : ce n’est PAS une dérive, et surtout pas un index vide', () => {
  it('état « indisponible », `dansIndex` à null — JAMAIS zéro', async () => {
    const r = await service(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:7700');
    }).indexSante(base(8000), 'zinda');

    expect(r.etat).toBe('indisponible');
    // ⚠ LE CŒUR DU CAS. « 0 document indexé sur 8 000 » se lirait comme la pire
    // dérive possible et enverrait quelqu'un lancer une réindexation complète —
    // coûteuse sur un gros catalogue — pour réparer un problème qui n'existe
    // pas. C'est la « non-réponse qui INVITE À AGIR », et le geste qu'elle
    // provoque est une écriture.
    expect(r.dansIndex).toBeNull();
    expect(r.dansIndex).not.toBe(0);
    expect(r.ecart).toBeNull();
  });

  it('le nombre en base reste servi — il est exact, lui', async () => {
    // On ne jette pas ce qu'on sait sous prétexte qu'on ignore le reste : la
    // base a répondu, son chiffre est juste, il s'affiche.
    const r = await service(async () => {
      throw new Error('ECONNRESET');
    }).indexSante(base(8000), 'zinda');
    expect(r.enBase).toBe(8000);
  });

  it('⚠ un index RÉELLEMENT vide reste une dérive, lui — la frontière tient', async () => {
    // Le contrôle qui distingue les deux : si le moteur RÉPOND zéro, c'est un
    // fait, et la réindexation est la bonne réponse. Sans ce cas, on aurait pu
    // « corriger » en traitant tout zéro comme une indisponibilité, et perdu le
    // seul signalement qui compte vraiment — un index vidé par accident.
    const r = await service(async () => 0).indexSante(base(352), 'zinda');
    expect(r.etat).toBe('derive');
    expect(r.dansIndex).toBe(0);
    expect(r.ecart).toBe(352);
  });
});

describe('La façade de comptage suit le même idiome que la recherche', () => {
  it('moteur tombé → union, avec le motif pour le journal', async () => {
    const search = new SearchService({ get: () => undefined } as never);
    (search as unknown as { engine: unknown }).engine = {
      name: 'Meilisearch',
      countDocuments: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };

    const r = await search.countDocuments('zinda');
    expect(r.etat).toBe('indisponible');
    if (r.etat === 'indisponible') expect(r.motif).toContain('ECONNREFUSED');
    // Le même refus que pour la recherche : pas de champ à lire par distraction.
    expect(r).not.toHaveProperty('documents');
  });
});
