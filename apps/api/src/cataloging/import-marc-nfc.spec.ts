import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { extractBiblio, MarcFields } from './marc-mapper';

/**
 * ⚠ L'IMPORT MARC NORMALISE EN NFC — le même défaut que le SRU, par une autre
 * porte.
 *
 * *Posé le 14 septembre 2026.* La veille, la traversée du client SRU contre la
 * Library of Congress a montré qu'elle émet ses diacritiques en forme
 * DÉCOMPOSÉE. Le SRU a été corrigé à sa frontière — mais un fichier ISO 2709
 * exporté de la même LoC porte les mêmes formes, et `importMarc` en fait des
 * fiches d'autorité.
 *
 * ⚠ **Et c'est le premier geste d'une bibliothèque qui adopte Gafeso** : arriver
 * avec son lot de notices. Pas un cas rare — une reprise.
 *
 * ## Le jeu d'essai ne vient pas de moi
 *
 * ⚠ C'était la condition, et elle est fondée : **nos doublures ont menti une
 * fois parce qu'elles étaient toutes écrites en NFC**. Une chaîne que je compose
 * pour éprouver la décomposition serait décomposée parce que je l'ai voulu, et
 * ne dirait rien de ce que le monde envoie.
 *
 * `__fixtures__/loc-notice-nfd.xml` est une notice RÉELLE, récupérée du point
 * SRU public de la LoC, avec son URL et sa date en en-tête. Le champ 245 y
 * porte `L'E&#x301;tranger a&#x300; la mer` — des caractères COMBINANTS émis
 * par elle.
 */

const FIXTURE = readFileSync(
  join(__dirname, '__fixtures__', 'loc-notice-nfd.xml'),
  'utf-8',
);

/**
 * Lit la notice réelle en champs MARC — **sans normaliser**, pour reproduire
 * exactement ce qu'un fichier importé apporte.
 *
 * ⚠ `htmlEntities: true` décode les références (`&#x301;` → le caractère
 * combinant) ; il ne les COMPOSE pas. C'est le point : après décodage, le texte
 * est du NFD authentique, celui de la LoC.
 */
function champsReels(): MarcFields {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    htmlEntities: true,
  });
  const doc = parser.parse(FIXTURE) as Record<string, never>;
  const record = doc.record as Record<string, unknown>;
  const fields: MarcFields = [];
  const tableau = <T,>(v: T | T[] | undefined): T[] =>
    v == null ? [] : Array.isArray(v) ? v : [v];

  for (const df of tableau<Record<string, unknown>>(record.datafield as never)) {
    const entree: string[] = [
      String(df['@_tag']),
      `${String(df['@_ind1'] ?? ' ')}${String(df['@_ind2'] ?? ' ')}`,
    ];
    for (const sf of tableau<Record<string, unknown>>(df.subfield as never)) {
      entree.push(String(sf['@_code']), String(sf['#text'] ?? ''));
    }
    fields.push(entree as never);
  }
  return fields;
}

describe('⚠ Le jeu d’essai porte du NFD RÉEL — vérifié avant de s’en servir', () => {
  it('la notice de la LoC est bien en forme DÉCOMPOSÉE', () => {
    // ⚠ TÉMOIN SUR LE JEU D'ESSAI LUI-MÊME. Sans lui, le jour où la LoC
    // changerait sa sortie, ce fichier passerait au vert en n'éprouvant plus
    // rien — et personne ne saurait que la mesure a cessé.
    const champs = champsReels();
    const titre = champs.find((f) => f[0] === '245')?.[3] as string;
    expect(titre, 'aucun champ 245 dans la notice réelle').toBeTruthy();
    expect(
      titre === titre.normalize('NFC'),
      'la notice de référence n’est plus décomposée : ce test ne mesure plus rien',
    ).toBe(false);
    expect(titre.normalize('NFC')).toContain('Étranger');
  });
});

describe('⚠ L’extraction rend du NFC, quelle que soit la porte', () => {
  it('le TITRE importé est composé', () => {
    const extrait = extractBiblio(champsReels(), 'MARC21');
    expect(extrait.title, 'aucun titre extrait').toBeTruthy();
    expect(extrait.title!).toBe(extrait.title!.normalize('NFC'));
    expect(extrait.title!).toContain('Étranger');
  });

  it('⚠ et les CONTRIBUTEURS aussi — ce sont eux qui entrent au fichier d’autorités', () => {
    // C'est là qu'est le coût : deux formes d'un même nom créent deux fiches,
    // et la déduplication à la source est perdue en silence.
    const extrait = extractBiblio(champsReels(), 'MARC21');
    for (const c of extrait.contributors) {
      expect(c.name, `contributeur non composé : ${JSON.stringify(c.name)}`).toBe(
        c.name.normalize('NFC'),
      );
    }
    expect(extrait.contributors.length).toBeGreaterThan(0);
  });

  it('⚠ un texte IMPORTÉ en NFD devient ÉGAL au même texte saisi', () => {
    // ⚠ LE NFD VIENT DE LA NOTICE RÉELLE, PAS DE MOI. Écrire la chaîne
    // décomposée à la main serait retomber dans le piège du lot précédent : une
    // doublure qui porte ce qu'on a voulu y mettre. On prend donc la valeur
    // telle que la LoC l'envoie, et on la compare à sa forme composée.
    const brut = champsReels().find((f) => f[0] === '245')?.[3] as string;
    expect(brut === brut.normalize('NFC'), 'la valeur prise n’est pas décomposée').toBe(false);

    const champs: MarcFields = [['245', '10', 'a', brut]] as never;
    const extrait = extractBiblio(champs, 'MARC21');
    // ⚠ On ne compare PAS à `brut.normalize('NFC')` tel quel : l'extraction
    // retire la ponctuation terminale du MARC (« … mer, » → « … mer »), et
    // c'est son office. La propriété porte sur la FORME, pas sur l'égalité
    // littérale.
    const titre = extrait.title as string;
    expect(titre, 'le titre extrait est resté décomposé').toBe(titre.normalize('NFC'));
    expect(titre).toContain('Étranger à la mer');
    // Et la valeur d'origine, elle, ne contenait PAS cette forme composée —
    // sans quoi l'assertion ci-dessus serait vraie sans rien devoir au correctif.
    expect(brut.includes('Étranger à la mer')).toBe(false);
  });

  it('⚠ TÉMOIN : un texte DÉJÀ composé traverse inchangé', () => {
    // Normaliser deux fois ne doit rien faire — le chemin SRU, déjà normalisé à
    // sa propre frontière, passe ici sans être abîmé.
    const champs: MarcFields = [
      ['245', '10', 'a', 'Le foncier rural'],
      ['100', '1 ', 'a', 'Ouédraogo, Aïcha'],
    ] as never;
    const extrait = extractBiblio(champs, 'MARC21');
    expect(extrait.contributors[0].name).toBe('Ouédraogo, Aïcha');
    expect(extrait.title).toBe('Le foncier rural');
  });

  it('UNIMARC aussi — les deux formats passent par le même entonnoir', () => {
    const champs: MarcFields = [
      ['200', '1 ', 'a', 'Le foncier rural'],
      ['700', ' 1', 'a', 'Ouédraogo', 'b', 'Aïcha'],
    ] as never;
    const extrait = extractBiblio(champs, 'UNIMARC');
    expect(JSON.stringify(extrait.contributors)).toContain('Ouédraogo');
  });
});
