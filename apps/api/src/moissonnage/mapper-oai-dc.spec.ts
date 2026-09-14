import { describe, expect, it } from 'vitest';
import { anneeDepuisDate, extraireDc, mapperOaiDc } from './mapper-oai-dc';
import { DEFAULT_RECORD_TYPE } from '../cataloging/description-profiles';

/**
 * ⚠ LE MAPPER EST PUR : aucune base, aucun réseau. C'est ce qui permet de
 * l'éprouver sur les formes réelles que rendent les entrepôts — et elles ne
 * sont pas une.
 */

const dc = (champs: Record<string, unknown>) => ({ 'oai_dc:dc': champs });

describe('⚠ Les entrepôts n’écrivent pas tous le même préfixe', () => {
  it('trouve le `dc` sous `oai_dc:dc`, sous `dc`, et à la racine', () => {
    // Chercher UNE forme ferait rendre zéro champ à un entrepôt parfaitement
    // conforme — et un mapper qui rend des notices vides SANS ERREUR est pire
    // qu'un mapper qui refuse.
    const attendu = { title: 'T' };
    expect(extraireDc({ 'oai_dc:dc': attendu })).toEqual(attendu);
    expect(extraireDc({ dc: attendu })).toEqual(attendu);
    expect(extraireDc(attendu)).toEqual(attendu);
  });

  it('rend `null` sur des métadonnées absentes', () => {
    expect(extraireDc(null)).toBeNull();
  });
});

describe('⚠ L’année : quatre chiffres, ou RIEN', () => {
  it('lit l’année d’une date complète comme d’une année seule', () => {
    expect(anneeDepuisDate('2019')).toBe(2019);
    expect(anneeDepuisDate('2019-04-12')).toBe(2019);
    expect(anneeDepuisDate('circa 2019')).toBe(2019);
  });

  it('⚠ ne FABRIQUE pas une année là où il n’y en a pas', () => {
    // Un `parseInt` optimiste ferait d'une date inconnue l'an 0 ou l'an 20, et
    // un catalogue trié par année deviendrait faux sans que personne le voie.
    expect(anneeDepuisDate('s.d.')).toBeNull();
    expect(anneeDepuisDate('sans date')).toBeNull();
    expect(anneeDepuisDate(null)).toBeNull();
    expect(anneeDepuisDate('42')).toBeNull();
  });
});

describe('Dublin Core → notice Gafeso', () => {
  it('traduit les champs usuels, et range les créateurs en auteurs principaux', () => {
    const n = mapperOaiDc(
      dc({
        title: ['Le foncier rural', 'principes et jurisprudence'],
        creator: ['Traoré, Awa'],
        contributor: ['Ouédraogo, Issa'],
        subject: ['foncier', 'droit rural'],
        description: 'Un résumé.',
        publisher: 'Presses de l’Université',
        date: '2019-04-12',
        language: 'fr',
        type: 'these',
      }),
    )!;

    expect(n.title).toBe('Le foncier rural');
    // Un second `dc:title` est un COMPLÉMENT, pas un doublon à jeter.
    expect(n.titleComplement).toBe('principes et jurisprudence');
    expect(n.contributors).toEqual([
      { name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL' },
      { name: 'Ouédraogo, Issa', role: 'AUTEUR_SECONDAIRE' },
    ]);
    expect(n.publishYear).toBe(2019);
    expect(n.keywords).toEqual(['foncier', 'droit rural']);
    expect(n.recordType).toBe('these');
    expect(n.typeNonReconnu).toBeNull();
  });

  it('⚠ un `dc:type` inconnu est COMPTÉ, jamais avalé', () => {
    // Un repli silencieux ferait d'une thèse un ouvrage, donc une notice
    // absente d'ETD-MS que personne n'irait chercher.
    const n = mapperOaiDc(dc({ title: 'T', type: 'Conference Paper' }))!;
    expect(n.recordType).toBe(DEFAULT_RECORD_TYPE);
    expect(n.typeNonReconnu).toBe('conference paper');
  });

  it('⚠ `dc:identifier` ne range pas une URL dans la colonne ISBN', () => {
    const n = mapperOaiDc(
      dc({ title: 'T', identifier: ['http://hdl.handle.net/123/456', '978-2-1234-5678-9'] }),
    )!;
    expect(n.isbn).toBe('978-2-1234-5678-9');
  });

  it('une notice SANS TITRE n’est pas une notice', () => {
    expect(mapperOaiDc(dc({ creator: 'Traoré, Awa' }))).toBeNull();
  });

  it('⚠ il ne REFUSE rien d’autre — ni auteur, ni mot-clé, ni université', () => {
    // Ce sont des règles de SAISIE. Les imposer à un entrepôt distant ferait
    // rejeter la moitié d'un fonds pour n'avoir pas rempli des cases que nous
    // avons inventées. C'est déjà le choix d'`importMarc`.
    const n = mapperOaiDc(dc({ title: 'Un titre nu', type: 'these' }))!;
    expect(n.contributors).toEqual([]);
    expect(n.keywords).toEqual([]);
    expect(n.recordType).toBe('these');
  });

  it('lit aussi les valeurs que le parseur XML rend comme objets (`#text`)', () => {
    // Un `dc:title` porteur d'attributs (xml:lang) arrive sous cette forme :
    // le lire avec `String(v)` donnerait « [object Object] » en titre.
    const n = mapperOaiDc(dc({ title: { '#text': 'Titre avec langue', '@_xml:lang': 'fr' } }))!;
    expect(n.title).toBe('Titre avec langue');
  });
});
