import { Record as MarcRecord } from 'marcjs';
import { MARCXCHANGE_NAMESPACE, versMarcxchange } from './unimarc-xml';

/**
 * Export MARC (UNIMARC) — MIROIR EXACT de l'import (voir marc-mapper.ts et
 * docs/marc-mapping.md). Tout ce que Gafeso possède est écrit dans des
 * zones stables, réimportables sans perte.
 *
 * Relator UNIMARC $4 = 727 → « Directeur de thèse » (distingue le directeur de
 * mémoire des co-auteurs). Zones 900/995 = usage LOCAL (type de document,
 * catégorie, exemplaires) — hors du bloc bibliographique standard.
 */

export interface MarcExportItem {
  barcode: string;
  callNumber: string | null;
  location: string | null;
  status: string;
}
export interface MarcExportRecord {
  id: string;
  title: string;
  titleComplement: string | null;
  isbn: string | null;
  publishYear: number | null;
  language: string;
  publisher: string | null;
  publicationCity: string | null;
  defenseUniversity: string | null;
  defensePlace: string | null;
  category: string | null;
  recordType: string;
  contributors: { name: string; role: string; position: number }[];
  keywords: string[];
  items: MarcExportItem[];
}

/** Rôle du directeur de mémoire/thèse — encodé via le relator $4 727. */
export const DIRECTOR_RELATOR = '727';
const LEADER = '00000nam a2200000 a 4500';

/** Construit un champ de données marcjs : [tag, indicateurs, code, val, ...]. */
function df(tag: string, indicators: string, subs: [string, string | null | undefined][]): string[] | null {
  const flat: string[] = [];
  for (const [code, value] of subs) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      flat.push(code, String(value));
    }
  }
  return flat.length ? [tag, indicators, ...flat] : null;
}

/** Champs UNIMARC d'une notice (ordre libre : marcjs trie par tag). */
export function buildUnimarcFields(record: MarcExportRecord): string[][] {
  const fields: (string[] | null)[] = [];

  fields.push(df('010', '  ', [['a', record.isbn]]));
  fields.push(df('101', '0 ', [['a', record.language]]));
  fields.push(df('200', '1 ', [['a', record.title], ['e', record.titleComplement]]));
  fields.push(
    df('210', '  ', [
      ['a', record.publicationCity],
      ['c', record.publisher],
      ['d', record.publishYear != null ? String(record.publishYear) : null],
    ]),
  );
  fields.push(df('328', '  ', [['c', record.defenseUniversity], ['e', record.defensePlace]]));

  // Mots-clés (610 = terme non contrôlé), un champ par mot-clé.
  for (const kw of record.keywords) {
    const f = df('610', '0 ', [['a', kw]]);
    if (f) fields.push(f);
  }

  // Contributeurs, dans l'ordre, selon le rôle.
  const ordered = [...record.contributors].sort((a, b) => a.position - b.position);
  for (const c of ordered) {
    if (c.role === 'AUTEUR_PRINCIPAL') fields.push(df('700', ' 1', [['a', c.name]]));
    else if (c.role === 'DIRECTEUR_MEMOIRE') fields.push(df('702', ' 1', [['a', c.name], ['4', DIRECTOR_RELATOR]]));
    else fields.push(df('701', ' 1', [['a', c.name]]));
  }

  // Zones locales : type de document + catégorie.
  fields.push(df('900', '  ', [['a', record.recordType], ['b', record.category]]));

  // Exemplaires (holdings locaux) — un 995 par exemplaire.
  for (const it of record.items) {
    const f = df('995', '  ', [
      ['f', it.barcode],
      ['k', it.callNumber],
      ['e', it.location],
      ['o', it.status],
    ]);
    if (f) fields.push(f);
  }

  return fields.filter((f): f is string[] => f !== null);
}

/** Notice marcjs prête à sérialiser. */
function toMarcjsRecord(record: MarcExportRecord): MarcRecord {
  const r = new MarcRecord();
  r.leader = LEADER;
  for (const f of buildUnimarcFields(record)) r.append(f);
  return r;
}

export function recordToIso2709(record: MarcExportRecord): string {
  return toMarcjsRecord(record).as('iso2709');
}

/** MARCXML d'une notice (élément <record> seul, sans en-tête). */
export function recordToMarcxmlElement(record: MarcExportRecord): string {
  return toMarcjsRecord(record).as('marcxml');
}

/** Fichier ISO 2709 pour un lot (les notices se concatènent). */
export function catalogToIso2709(records: MarcExportRecord[]): string {
  return records.map(recordToIso2709).join('');
}

/**
 * Fichier MarcXchange (ISO 25577) pour un lot. Les zones sont de l'UNIMARC et
 * chaque notice le DÉCLARE (`format="UNIMARC"`) ; l'annoncer en MARC21 était
 * faux — le bibliothécaire téléchargeait un fichier qui mentait sur son propre
 * contenu, exactement comme l'entrepôt OAI.
 */
export function catalogToMarcxchange(records: MarcExportRecord[]): string {
  // L'espace de noms est porté par <collection> ; chaque notice déclare son
  // dialecte (format="UNIMARC") — c'est tout l'intérêt de MarcXchange.
  const body = records.map((r) => versMarcxchange(recordToMarcxmlElement(r), false)).join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<collection xmlns="${MARCXCHANGE_NAMESPACE}">\n` +
    body +
    '\n</collection>\n'
  );
}
