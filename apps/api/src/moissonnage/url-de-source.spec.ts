import { describe, expect, it } from 'vitest';
import { verifierUrlDeSource } from './url-de-source';

/**
 * ⚠ DÉCLARER UNE SOURCE, C'EST FAIRE APPELER UNE ADRESSE PAR LE SERVEUR.
 *
 * C'est la différence avec l'import MARC, qui lit un fichier qu'on téléverse.
 * Ici Gafeso ÉMET, depuis l'intérieur du réseau où il est installé — et aucune
 * de nos gardes de droits ne peut s'en apercevoir, puisque la personne a bien
 * le droit de moissonner.
 */

describe('⚠ Les adresses INTERNES sont refusées, et le refus dit pourquoi', () => {
  const internes = [
    'http://localhost:9200',
    'http://127.0.0.1:7700/oai',
    'http://10.0.0.5/oai',
    'http://192.168.1.20/oai',
    'http://172.16.4.1/oai',
    // La cible classique d'une adresse détournée : les métadonnées d'hébergeur.
    'http://169.254.169.254/latest/meta-data/',
    'http://meilisearch.internal/oai',
    'http://db.local/oai',
  ];

  it.each(internes)('refuse %s', (url) => {
    const v = verifierUrlDeSource(url);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    // ⚠ Le motif NOMME l'hôte : « adresse invalide » enverrait la personne
    // chercher ce qu'elle a mal fait alors que la règle n'est écrite nulle part.
    expect(v.motif).toMatch(/interne au serveur/);
  });

  it('⚠ LES TROIS ENTREPÔTS PUBLICS DE LA RECETTE PASSENT', () => {
    // ⚠ TÉMOIN D'ABSENCE LE PLUS UTILE QUI SOIT : des adresses RÉELLES, celles
    // avec lesquelles le circuit sera éprouvé. Un vérificateur qui refuserait
    // l'un des trois pour une raison de forme rendrait la recette impossible —
    // et on chercherait le défaut dans le client OAI.
    for (const url of [
      'https://demo.dspace.org/server/oai/request',
      'https://export.arxiv.org/oai2',
      'https://dspace.mit.edu/oai/request',
    ]) {
      const v = verifierUrlDeSource(url);
      expect(v.ok, `${url} → ${v.ok ? '' : v.motif}`).toBe(true);
    }
  });

  it('⚠ TÉMOIN D’ABSENCE — une adresse publique passe', () => {
    // Sans lui, un vérificateur qui refuse TOUT serait indiscernable d'un
    // vérificateur juste, et plus rassurant : il ne laisserait jamais rien.
    expect(verifierUrlDeSource('https://depot.exemple.bf/oai').ok).toBe(true);
    // ⚠ La confusion PLAUSIBLE : une adresse publique dont le nom commence
    // comme une adresse privée.
    expect(verifierUrlDeSource('https://172.200.1.1/oai').ok).toBe(true);
    expect(verifierUrlDeSource('https://localhost.exemple.bf/oai').ok).toBe(true);
  });
});

describe('Les schémas, et la normalisation', () => {
  it('refuse ce qui n’est ni http ni https', () => {
    for (const url of ['file:///etc/passwd', 'ftp://exemple.bf/oai', 'gopher://x']) {
      const v = verifierUrlDeSource(url);
      expect(v.ok, url).toBe(false);
      if (!v.ok) expect(v.motif).toMatch(/http:\/\/ et https:\/\//);
    }
  });

  it('refuse ce qui n’est pas une URL, et dit à quoi ça ressemble', () => {
    const v = verifierUrlDeSource('depot.exemple.bf/oai');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toMatch(/URL complète/);
  });

  it('⚠ NORMALISE, parce que c’est cette valeur qui entre dans la contrainte d’unicité', () => {
    // Deux écritures de la même adresse donneraient sinon deux sources pour un
    // seul entrepôt, et la contrainte n'y verrait que du feu.
    const formes = [
      'https://depot.exemple.bf/oai',
      'https://depot.exemple.bf/oai/',
      'https://depot.exemple.bf/oai?',
      'https://depot.exemple.bf/oai#section',
      '  https://depot.exemple.bf/oai  ',
    ];
    const normalisees = new Set(
      formes.map((f) => {
        const v = verifierUrlDeSource(f);
        return v.ok ? v.url : `ÉCHEC ${f}`;
      }),
    );
    expect([...normalisees]).toEqual(['https://depot.exemple.bf/oai']);
  });
});
