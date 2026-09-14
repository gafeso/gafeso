import { describe, expect, it } from 'vitest';
import { parseSruMarcxml } from './sru-marcxml';

/**
 * ⚠ LE TEXTE D'UN TIERS ENTRE DÉCODÉ **ET** NORMALISÉ.
 *
 * *Trouvé le 13 septembre 2026, en traversant le client SRU contre la Library
 * of Congress — pas par une relecture, et aucun test ne pouvait le voir :
 * toutes les doublures du dépôt étaient écrites avec des accents déjà
 * composés.*
 *
 * La LoC emploie les références numériques pour les diacritiques. Une recherche
 * rendait :
 *
 *     « L'E&#x301;tranger a&#x300; la mer : roman »
 *
 * affiché tel quel à la bibliothécaire, et **pré-rempli tel quel dans sa
 * notice** — donc dans le catalogue, dans l'index de recherche, dans l'export
 * MARC et dans l'entrepôt OAI.
 *
 * ⚠ **Le défaut est silencieux par construction** : il produit un titre. Rien
 * ne lève, rien ne manque, et la seule chose qui cloche est illisible à
 * l'œil — jusqu'à ce qu'on le lise.
 *
 * `fast-xml-parser` décode `&amp;` par défaut mais pas `&#x301;` : il faut
 * `htmlEntities: true`. Les trois parseurs du dépôt le portent désormais —
 * SRU, client OAI, et extraction de métadonnées d'EPUB.
 */

const REPONSE_LOC = `<?xml version="1.0"?>
<zs:searchRetrieveResponse xmlns:zs="http://www.loc.gov/zing/srw/">
  <zs:numberOfRecords>1</zs:numberOfRecords>
  <zs:records><zs:record><zs:recordData>
    <record xmlns="http://www.loc.gov/MARC21/slim">
      <leader>00000nam a2200000 a 4500</leader>
      <datafield tag="245" ind1="1" ind2="0">
        <subfield code="a">L'E&#x301;tranger a&#x300; la mer :</subfield>
        <subfield code="b">roman</subfield>
      </datafield>
      <datafield tag="100" ind1="1" ind2=" ">
        <subfield code="a">Oue&#x301;draogo, Ai&#x308;cha,</subfield>
      </datafield>
      <datafield tag="260" ind1=" " ind2=" ">
        <subfield code="b">Presses de l'Universite&#x301;,</subfield>
      </datafield>
    </record>
  </zs:recordData></zs:record></zs:records>
</zs:searchRetrieveResponse>`;

describe('⚠ Une réponse SRU qui emploie des références numériques', () => {
  /** `parseSruMarcxml` rend des MarcFields : [tag, indicateurs, code, valeur, …]. */
  const champ = (xml: string, tag: string) =>
    JSON.stringify(parseSruMarcxml(xml)[0]?.find((f) => f[0] === tag) ?? null);

  it('le titre sort LISIBLE, pas avec ses entités', () => {
    const titre = champ(REPONSE_LOC, '245');
    expect(titre, 'aucun champ 245').not.toBe('null');
    expect(titre, 'les entités numériques traversent jusqu’à la notice').not.toContain('&#x');
    expect(titre).toContain('Étranger');
  });

  it('⚠ et les AUTEURS aussi — c’est eux qui entrent au fichier d’autorités', () => {
    // Un nom mal décodé crée une fiche d'autorité distincte : « Oue&#x301;draogo »
    // et « Ouédraogo » deviennent deux personnes, et la déduplication à la
    // source — tout l'intérêt du fichier d'autorités — est perdue en silence.
    expect(champ(REPONSE_LOC, '100')).toContain('Ouédraogo');
    expect(champ(REPONSE_LOC, '100')).toContain('Aïcha');
  });

  it('l’éditeur aussi, pour que rien ne reste', () => {
    expect(champ(REPONSE_LOC, '260')).toContain('Université');
  });

  it('⚠ TÉMOIN : `&amp;` reste correctement décodé — on n’a rien cassé', () => {
    // `processEntities` gérait déjà les entités nommées ; le témoin vérifie que
    // l'ajout ne les a pas doublement décodées.
    const avecEt = REPONSE_LOC.replace('roman', 'Droit &amp; société');
    expect(champ(avecEt, '245')).toContain('Droit & société');
  });
});

describe('⚠ ET NORMALISÉ EN NFC — sinon deux « Ouédraogo » sont deux personnes', () => {
  const champ = (xml: string, tag: string) =>
    parseSruMarcxml(xml)[0]?.find((f) => f[0] === tag) ?? [];

  it('⚠ le nom moissonné est ÉGAL au même nom tapé à la main', () => {
    // C'est l'assertion qui compte, et elle échouait : la LoC émet ses
    // diacritiques en forme DÉCOMPOSÉE. « Ouédraogo » y fait dix-huit
    // caractères là où la saisie en fait seize — les deux s'affichent à
    // l'identique, et le fichier d'autorités, qui déduplique par nom EXACT,
    // créait deux personnes.
    const valeur = champ(REPONSE_LOC, '100')[3];
    expect(valeur).toBe('Ouédraogo, Aïcha,');
    expect(valeur.length, 'forme décomposée : la normalisation n’a pas eu lieu').toBe(17);
  });

  it('le titre et l’éditeur le sont aussi', () => {
    expect(champ(REPONSE_LOC, '245')[3]).toBe('L’Étranger à la mer :'.replace('’', "'"));
    expect(champ(REPONSE_LOC, '260')[3]).toBe("Presses de l'Université,");
  });

  it('⚠ TÉMOIN : un texte DÉJÀ en NFC traverse inchangé', () => {
    // Normaliser deux fois ne doit rien faire — sinon on aurait remplacé un
    // défaut par un autre, invisible de la même façon.
    const deja = REPONSE_LOC.replace('Oue&#x301;draogo, Ai&#x308;cha,', 'Ouédraogo, Aïcha,');
    expect(champ(deja, '100')[3]).toBe('Ouédraogo, Aïcha,');
  });
});
