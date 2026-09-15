/**
 * Extraction bibliographique depuis les champs marcjs — logique pure, testée à part.
 * MIROIR de l'export (marc-export.ts, docs/marc-mapping.md) : l'export écrit ce
 * que l'import sait relire, pour un aller-retour sans perte en UNIMARC.
 *
 * Format des champs (marcjs) :
 *  - champ de données : [tag, indicateurs, code, valeur, code, valeur, ...]
 *  - champ de contrôle : [tag, valeur]
 */

export type MarcFields = string[][];

export interface ExtractedContributor {
  name: string;
  role: string; // AUTEUR_PRINCIPAL | AUTEUR_SECONDAIRE | DIRECTEUR_MEMOIRE
}

export interface ExtractedBiblio {
  title: string | null;
  titleComplement: string | null;
  isbn: string | null;
  publishYear: number | null;
  language: string | null;
  publisher: string | null;
  publicationCity: string | null;
  defenseUniversity: string | null;
  defensePlace: string | null;
  category: string | null;
  recordType: string | null;
  contributors: ExtractedContributor[];
  keywords: string[];
  /** Auteur principal en texte (compat champ dénormalisé `author`). */
  author: string | null;
}

export type MarcFormatName = 'MARC21' | 'UNIMARC';

const DIRECTOR_RELATOR = '727';

/** Premier champ portant ce tag. */
function field(fields: MarcFields, tag: string): string[] | undefined {
  return fields.find((f) => f[0] === tag);
}

/** Tous les champs portant ce tag (zones répétables : 701, 610, 995…). */
function allFields(fields: MarcFields, tag: string): string[][] {
  return fields.filter((f) => f[0] === tag);
}

/** Valeur du premier sous-champ `code` d'un champ de données. */
function sub(f: string[] | undefined, code: string): string | null {
  if (!f || f.length < 4) return null;
  for (let i = 2; i < f.length - 1; i += 2) {
    if (f[i] === code) return f[i + 1] ?? null;
  }
  return null;
}

/** Valeur du premier sous-champ `code` du premier champ `tag`. */
function subfield(fields: MarcFields, tag: string, code: string): string | null {
  return sub(field(fields, tag), code);
}

/** Valeur d'un champ de contrôle ([tag, valeur]). */
function controlValue(fields: MarcFields, tag: string): string | null {
  const f = field(fields, tag);
  return f && f.length === 2 ? f[1] : null;
}

function yearFrom(value: string | null): number | null {
  const match = value?.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

function clean(value: string | null): string | null {
  const trimmed = value?.trim().replace(/[/:;,.]+$/, '').trim();
  return trimmed || null;
}

/**
 * Logiciels de numérisation de bureau dont le nom atterrit parfois, à tort,
 * dans la zone éditeur (210$c / 260$b / 264$b) d'une notice produite à partir
 * d'un scanner grand public — « Scanned by CamScanner », « NAPS2 »… Ce ne sont
 * PAS des éditeurs : on les ignore à l'import (éditeur laissé vide) plutôt que
 * de polluer le catalogue. Comparaison insensible à la casse, en sous-chaîne
 * (couvre « Numérisé avec Adobe Scan »). Liste volontairement extensible.
 */
const SCANNER_SOFTWARE = [
  'paperport',
  'naps2',
  'scansnap',
  'adobe scan',
  'camscanner',
  'genius scan',
  'office lens',
  'tiny scanner',
  'clearscanner',
  'abbyy finereader',
  'readiris',
  'vuescan',
];

/** Éditeur nettoyé, ou null s'il correspond à un logiciel de numérisation. */
export function dropScannerPublisher(publisher: string | null): string | null {
  if (!publisher) return null;
  const norm = publisher.toLowerCase();
  return SCANNER_SOFTWARE.some((s) => norm.includes(s)) ? null : publisher;
}

/** Nom complet depuis $a (+ $b éventuel des fichiers externes). */
function personName(f: string[]): string | null {
  const a = clean(sub(f, 'a'));
  const b = clean(sub(f, 'b'));
  if (!a) return null;
  return b ? `${a}, ${b}` : a;
}

/** UNIMARC enrichi — miroir de marc-export.ts. */
function extractUnimarc(fields: MarcFields): ExtractedBiblio {
  const contributors: ExtractedContributor[] = [];
  const principal = field(fields, '700');
  if (principal) {
    const name = personName(principal);
    if (name) contributors.push({ name, role: 'AUTEUR_PRINCIPAL' });
  }
  for (const f of allFields(fields, '701')) {
    const name = personName(f);
    if (name) contributors.push({ name, role: 'AUTEUR_SECONDAIRE' });
  }
  for (const f of allFields(fields, '702')) {
    const name = personName(f);
    if (!name) continue;
    // $4 727 = directeur de thèse ; sinon on retombe sur co-auteur.
    const role = sub(f, '4') === DIRECTOR_RELATOR ? 'DIRECTEUR_MEMOIRE' : 'AUTEUR_SECONDAIRE';
    contributors.push({ name, role });
  }

  const keywords = allFields(fields, '610')
    .map((f) => clean(sub(f, 'a')))
    .filter((k): k is string => !!k);

  const general = subfield(fields, '100', 'a');
  const yearFromGeneral = general && general.length >= 13 ? yearFrom(general.substring(9, 13)) : null;
  const author =
    contributors.find((c) => c.role === 'AUTEUR_PRINCIPAL')?.name ??
    clean(subfield(fields, '200', 'f')) ??
    null;

  return {
    title: clean(subfield(fields, '200', 'a')),
    titleComplement: clean(subfield(fields, '200', 'e')),
    isbn: clean(subfield(fields, '010', 'a')),
    publishYear: yearFrom(subfield(fields, '210', 'd')) ?? yearFromGeneral,
    language: clean(subfield(fields, '101', 'a')),
    publisher: dropScannerPublisher(clean(subfield(fields, '210', 'c'))),
    publicationCity: clean(subfield(fields, '210', 'a')),
    defenseUniversity: clean(subfield(fields, '328', 'c')),
    defensePlace: clean(subfield(fields, '328', 'e')),
    category: clean(subfield(fields, '900', 'b')),
    recordType: clean(subfield(fields, '900', 'a')),
    contributors,
    keywords,
    author,
  };
}

/** MARC21 : 245 titre, 100/700 auteurs, 020 ISBN, 264/260 date, 041/008 langue, 650 sujets. */
function extractMarc21(fields: MarcFields): ExtractedBiblio {
  const title = clean(subfield(fields, '245', 'a'));
  const subtitle = clean(subfield(fields, '245', 'b'));

  let language = clean(subfield(fields, '041', 'a'));
  if (!language) {
    const f008 = controlValue(fields, '008');
    language = f008 && f008.length >= 38 ? clean(f008.substring(35, 38)) : null;
  }

  const contributors: ExtractedContributor[] = [];
  const main = field(fields, '100') ?? field(fields, '110');
  if (main) {
    const name = personName(main);
    if (name) contributors.push({ name, role: 'AUTEUR_PRINCIPAL' });
  }
  for (const f of allFields(fields, '700')) {
    const name = personName(f);
    if (name) {
      const role = sub(f, '4') === 'ths' ? 'DIRECTEUR_MEMOIRE' : 'AUTEUR_SECONDAIRE';
      contributors.push({ name, role });
    }
  }
  const keywords = allFields(fields, '650')
    .map((f) => clean(sub(f, 'a')))
    .filter((k): k is string => !!k);

  return {
    title: title ? (subtitle ? `${title} : ${subtitle}` : title) : null,
    titleComplement: subtitle,
    isbn: clean(subfield(fields, '020', 'a')),
    publishYear: yearFrom(subfield(fields, '264', 'c')) ?? yearFrom(subfield(fields, '260', 'c')),
    language,
    publisher: dropScannerPublisher(
      clean(subfield(fields, '264', 'b')) ?? clean(subfield(fields, '260', 'b')),
    ),
    publicationCity: clean(subfield(fields, '264', 'a')) ?? clean(subfield(fields, '260', 'a')),
    defenseUniversity: clean(subfield(fields, '502', 'c')),
    defensePlace: null,
    category: null,
    recordType: null,
    contributors,
    keywords,
    author: contributors[0]?.name ?? null,
  };
}

/**
 * ⚠ NORMALISATION UNICODE — NFC, à l'entrée de l'entonnoir.
 *
 * *Posée le 14 septembre 2026, après le même défaut trouvé par une autre porte.*
 *
 * Le 13, la traversée du client SRU contre la Library of Congress a montré
 * qu'elle émet ses diacritiques en forme DÉCOMPOSÉE : « Ouédraogo » y est
 * `O u e ◌́ d r a o g o`, dix-huit caractères là où la saisie en fait seize.
 * Les deux s'affichent au pixel près, et le fichier d'autorités déduplique par
 * nom EXACT — une fiche saisie et une fiche importée devenaient deux personnes.
 *
 * ⚠ CE N'EST PAS UN DÉFAUT VOISIN, C'EST LE MÊME PAR UNE AUTRE PORTE. Un
 * fichier ISO 2709 exporté de la LoC porte les mêmes formes décomposées, et
 * `importMarc` en fait des fiches d'autorité. Et c'est le PREMIER geste d'une
 * bibliothèque qui adopte Gafeso : arriver avec son lot de notices.
 *
 * ⚠ ICI ET PAS AILLEURS, parce que c'est l'ENTONNOIR : `extractBiblio` est le
 * seul point par lequel des champs MARC deviennent des champs de notice, quel
 * que soit le chemin — import ISO 2709 (dialecte MARC21 ou UNIMARC), SRU, moissonnage OAI. Normaliser
 * dans les extracteurs demanderait d'y penser à chaque champ ajouté ; une règle
 * de PLACE ne se contourne pas par distraction, une règle de vigilance si.
 *
 * L'opération est idempotente : le chemin SRU, déjà normalisé à sa propre
 * frontière, traverse sans changer.
 */
function normaliserChamps(fields: MarcFields): MarcFields {
  return fields.map((champ) =>
    champ.map((valeur) => (typeof valeur === 'string' ? valeur.normalize('NFC') : valeur)),
  ) as MarcFields;
}

export function extractBiblio(fields: MarcFields, format: MarcFormatName): ExtractedBiblio {
  const normalises = normaliserChamps(fields);
  return format === 'MARC21' ? extractMarc21(normalises) : extractUnimarc(normalises);
}
