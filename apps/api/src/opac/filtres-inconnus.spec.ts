import { describe, expect, it, vi } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { OpacService } from './opac.service';
import { NouveautesDto } from './dto/nouveautes.dto';

/**
 * ZÉRO RÉSULTAT A DEUX CAUSES, et elles ne doivent pas s'écrire pareil.
 *
 * « aucune notice pour cette combinaison » est légitime. « la valeur demandée
 * n'existe nulle part » ne l'est pas : une URL partagée portant un type périmé
 * affichait un catalogue vide sans un mot — un fonds vide et un filtre invalide
 * indiscernables.
 */
function fauxMoteur(parAppel: { totalHits: number; facettes?: Record<string, Record<string, number>> }[]) {
  let n = 0;
  const search = vi.fn(async () => {
    const r = parAppel[Math.min(n, parAppel.length - 1)];
    n += 1;
    return {
      hits: [],
      totalHits: r.totalHits,
      page: 1,
      totalPages: 0,
      facetDistribution: r.facettes ?? {},
      // Le moteur dit toujours s'il a plafonné — ici jamais (petits totaux).
      totalPlafonne: false,
    };
  });
  return {
    search,
    service: new OpacService(
      { search } as never,
      {} as never,
      {} as never,
      { forTenant: () => ({ biblioRecord: { count: async () => 0 } }) } as never,
    ),
  };
}

const CATALOGUE = {
  recordType: { ouvrage: 5, memoire: 3, publication: 2, these: 2 },
  category: { droit: 2, arts: 1 },
  language: { fr: 12 },
  publishYear: { '2017': 1 },
};

describe('filtres inconnus — le défaut corrigé', () => {
  it('une valeur qui n’existe NULLE PART est nommée', async () => {
    const { service } = fauxMoteur([
      { totalHits: 0 },
      { totalHits: 12, facettes: CATALOGUE },
    ]);
    const r = await service.searchCatalog('buc', { recordType: 'nimportequoi' } as never);
    expect(r).toHaveProperty('filtresInconnus', { recordType: ['nimportequoi'] });
  });

  it('⚠ un vide LÉGITIME ne porte AUCUN signalement', async () => {
    // Deux valeurs connues qui ne se croisent pas : « aucune thèse d'arts » est
    // une vraie réponse. La refuser, ou la signaler comme une erreur, serait
    // faux — c'est la moitié du défaut qu'on ne doit pas créer en le corrigeant.
    const { service } = fauxMoteur([
      { totalHits: 0 },
      { totalHits: 12, facettes: CATALOGUE },
    ]);
    const r = await service.searchCatalog('buc', {
      recordType: 'these',
      category: 'arts',
    } as never);
    expect(r).not.toHaveProperty('filtresInconnus');
  });

  it('vaut pour toutes les facettes, pas seulement le type', async () => {
    const { service } = fauxMoteur([
      { totalHits: 0 },
      { totalHits: 12, facettes: CATALOGUE },
    ]);
    const r = await service.searchCatalog('buc', {
      language: 'xx',
      year: 1234,
    } as never);
    expect(r).toHaveProperty('filtresInconnus', {
      language: ['xx'],
      publishYear: ['1234'],
    });
  });
});

describe('filtres inconnus — la garantie de coût', () => {
  it('⚠ le chemin NOMINAL ne paie aucune requête de plus', async () => {
    // La garantie chiffrée du lot : une requête, pas deux, quand il y a des
    // résultats. Exercée dans le cas nominal ET dans le cas vide ci-dessous.
    const { search, service } = fauxMoteur([{ totalHits: 12, facettes: CATALOGUE }]);
    const r = await service.searchCatalog('buc', { recordType: 'ouvrage' } as never);
    expect(search).toHaveBeenCalledTimes(1);
    expect(r).not.toHaveProperty('filtresInconnus');
  });

  it('le surcoût n’est payé QUE dans le cas vide, et seulement si un filtre est demandé', async () => {
    const sansFiltre = fauxMoteur([{ totalHits: 0, facettes: {} }]);
    await sansFiltre.service.searchCatalog('buc', {} as never);
    expect(sansFiltre.search).toHaveBeenCalledTimes(1);

    const avecFiltre = fauxMoteur([{ totalHits: 0 }, { totalHits: 12, facettes: CATALOGUE }]);
    await avecFiltre.service.searchCatalog('buc', { recordType: 'inconnu' } as never);
    expect(avecFiltre.search).toHaveBeenCalledTimes(2);
  });

  it('les clés du chemin nominal restent celles du contrat', async () => {
    const { service } = fauxMoteur([{ totalHits: 12, facettes: CATALOGUE }]);
    const r = await service.searchCatalog('buc', {} as never);
    // ⚠ `totalPlafonne` A ÉTÉ AJOUTÉ LE 11 SEPTEMBRE 2026, DÉLIBÉRÉMENT.
    //
    // Ce test a fait son travail : il a refusé le champ tant que personne ne
    // l'avait inscrit ici. Le champ est INCONDITIONNEL, contrairement à
    // `filtresInconnus` — absent, il vaudrait `undefined` chez le client, donc
    // « total exact » à la lecture, ce qui est précisément l'affirmation fausse
    // qu'il existe pour empêcher. Voir `plafond-du-moteur.spec.ts`.
    expect(Object.keys(r).sort()).toEqual([
      'facets',
      'hits',
      'page',
      'totalHits',
      'totalPages',
      'totalPlafonne',
    ]);
  });
});

describe('avecFichier — une faute de frappe ne vaut plus « non »', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const valide = (v: unknown) => pipe.transform(v, { type: 'query', metatype: NouveautesDto as never });

  it('refuse une valeur qui n’est pas un booléen reconnu', async () => {
    // ⚠ Avant : tout ce qui n'était ni « 1 » ni « true » valait FAUX. La page
    // « Documents numériques » aurait montré des notices SANS fichier, sous un
    // titre affirmant le contraire — le silence, encore.
    await expect(valide({ avecFichier: 'lol' })).rejects.toThrow();
  });

  it('reconnaît les deux formes de chaque côté', async () => {
    await expect(valide({ avecFichier: '1' })).resolves.toEqual({ avecFichier: true });
    await expect(valide({ avecFichier: 'true' })).resolves.toEqual({ avecFichier: true });
    await expect(valide({ avecFichier: '0' })).resolves.toEqual({ avecFichier: false });
    await expect(valide({ avecFichier: 'false' })).resolves.toEqual({ avecFichier: false });
  });

  it('absent reste absent — le filtre est optionnel', async () => {
    await expect(valide({ limit: '6' })).resolves.toEqual({ limit: 6 });
  });
});
