import { describe, expect, it } from 'vitest';
import { catalogToIso2709, recordToIso2709, MarcExportRecord } from './marc-export';
import { lireIso2709 } from './lecteur-iso2709-independant';

/**
 * ⚠ NOTRE EXPORT MARC, RELU PAR UN LECTEUR QUI NE PARTAGE RIEN AVEC LUI.
 *
 * ⚠ ET LA PREMIÈRE CHOSE QUE CE LECTEUR A TROUVÉE, C'EST MOI. Ma première
 * écriture convertissait la sortie en `latin1` : elle annonçait « longueur 294
 * dépasse le flux » sur une notice accentuée, et j'ai failli rapporter un
 * défaut critique de l'export MARC.
 *
 * Mesuré avant de conclure — les trois longueurs, sur la même notice :
 *
 *     annoncée 156 · chaîne 154 · UTF-8 156 · latin1 154
 *
 * marcjs annonce donc la longueur en OCTETS UTF-8, ce qui est exactement ce que
 * la norme demande ; c'est ma conversion qui perdait deux octets. Et la route
 * d'export écrit la chaîne avec `res.write(...)`, dont l'encodage par défaut
 * est utf8 : les octets servis correspondent à la longueur annoncée.
 *
 * ⚠ La leçon est celle qu'on répète : avant de croire une mesure, demander ce
 * que l'instrument AJOUTE à ce qu'il observe. Ici il retirait deux octets.
 *
 * L'export est produit par `marcjs`. Le relire avec `marcjs` ne prouve rien :
 * une hypothèse fausse partagée par l'écrivain et le lecteur fait un
 * aller-retour parfait et un fichier que personne d'autre ne sait ouvrir.
 *
 * Aucun validateur tiers n'est installé (`yaz-marcdump`, `xmllint`, `pymarc` :
 * absents) et ajouter une dépendance se demande. `lecteur-iso2709-independant`
 * est donc un SECOND AVIS, écrit d'après la norme — pas un validateur tiers, et
 * le fichier le dit.
 *
 * ⚠ CE QU'ON CHERCHE D'ABORD : les longueurs du répertoire sont-elles comptées
 * en OCTETS ou en CARACTÈRES ? « Ouédraogo » fait dix caractères et onze octets
 * en UTF-8. Un producteur qui compte en caractères écrit un répertoire dont les
 * décalages glissent à la première lettre accentuée — c'est-à-dire sur presque
 * toutes nos notices, à Ouagadougou.
 */

const NOTICE = (titre: string, auteur: string): MarcExportRecord =>
  ({
    id: 'r1',
    title: titre,
    titleComplement: null,
    author: auteur,
    isbn: '978-2-1234-5678-9',
    publishYear: 2019,
    language: 'fr',
    publisher: 'Presses de l’Université',
    summary: null,
    category: 'droit',
    recordType: 'these',
    contributors: [{ name: auteur, role: 'AUTEUR_PRINCIPAL', position: 0 }],
    keywords: [{ keyword: { name: 'foncier' } }],
    items: [],
  }) as unknown as MarcExportRecord;

describe('⚠ L’export ISO 2709, relu depuis la NORME', () => {
  it('une notice SANS accent est structurellement valide', () => {
    // Témoin de présence : si celui-ci échoue, c'est le lecteur qu'il faut
    // corriger, pas l'export — et l'ordre compte.
    const flux = Buffer.from(recordToIso2709(NOTICE('Le droit rural', 'Traore, Awa')), 'utf8');
    const { notices, anomalies } = lireIso2709(flux);
    expect(notices).toHaveLength(1);
    expect(anomalies, JSON.stringify(anomalies)).toEqual([]);
  });

  it('⚠ ET UNE NOTICE ACCENTUÉE AUSSI — c’est la question qui vaut le lot', () => {
    // « Ouédraogo », « Traoré », « Université » : le fonds réel d'une
    // bibliothèque burkinabè. Si les longueurs étaient comptées en caractères,
    // le répertoire glisserait ici et pas dans le cas précédent.
    const flux = Buffer.from(
      recordToIso2709(
        NOTICE('Le foncier rural et les procédures d’expropriation', 'Ouédraogo, Aïcha'),
      ),
      'utf8',
    );
    const { notices, anomalies } = lireIso2709(flux);
    expect(
      anomalies,
      'le répertoire ne tombe pas juste sur des accents : ' + JSON.stringify(anomalies),
    ).toEqual([]);
    expect(notices).toHaveLength(1);
    // Et le contenu est relisible : un fichier structurellement valide mais
    // illisible ne vaut pas mieux.
    const champs = notices[0].champs.map((c) => c.valeur).join(' ');
    expect(champs).toContain('Ouédraogo');
  });

  it('un catalogue ENTIER : chaque enregistrement se termine sur 0x1D', () => {
    const flux = Buffer.from(
      catalogToIso2709([
        NOTICE('Premier titre', 'Ouédraogo, Aïcha'),
        NOTICE('Deuxième titre, avec une virgule', 'Traoré, Awa'),
        NOTICE('Troisième — avec un tiret cadratin', 'Sanou, Béatrice'),
      ]),
      'utf8',
    );
    const { notices, anomalies } = lireIso2709(flux);
    expect(anomalies, JSON.stringify(anomalies)).toEqual([]);
    expect(notices).toHaveLength(3);
  });

  it('⚠ TÉMOIN D’ABSENCE : le lecteur REFUSE un flux qu’on abîme exprès', () => {
    // Sans lui, un lecteur qui ne trouve jamais rien serait indiscernable d'un
    // export juste — et beaucoup plus rassurant.
    const brut = Buffer.from(recordToIso2709(NOTICE('Un titre', 'Traore, Awa')), 'utf8');
    // On décale UN octet dans le répertoire : exactement ce que produirait un
    // décompte en caractères sur une lettre accentuée.
    const abime = Buffer.from(brut);
    abime[30] = abime[30] === 0x30 ? 0x31 : 0x30;
    const { anomalies } = lireIso2709(abime);
    expect(anomalies.length, 'le lecteur n’a rien vu sur un flux abîmé').toBeGreaterThan(0);
  });
});
