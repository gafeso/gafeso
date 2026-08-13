import { describe, expect, it } from 'vitest';
import { Readable } from 'stream';
import { Marc, Record as MarcRecord } from 'marcjs';
import {
  buildUnimarcFields,
  catalogToMarcxml,
  MarcExportRecord,
  recordToIso2709,
} from './marc-export';
import { extractBiblio, MarcFields } from './marc-mapper';

const rich: MarcExportRecord = {
  id: 'rec-1',
  title: 'Gouvernance foncière au Plateau central',
  titleComplement: 'enjeux et perspectives',
  isbn: '978-2-9999-0001-2',
  publishYear: 2024,
  language: 'fre',
  publisher: 'Presses de l’EXEMPLE',
  publicationCity: 'Ouagadougou',
  defenseUniversity: 'Université d’Exemple',
  defensePlace: 'Ouagadougou',
  category: 'droit',
  recordType: 'these',
  contributors: [
    { name: 'Nikiema, Rasmata', role: 'AUTEUR_PRINCIPAL', position: 0 },
    { name: 'Kaboré, Issa', role: 'AUTEUR_SECONDAIRE', position: 1 },
    { name: 'Pr Ouédraogo, Albert', role: 'DIRECTEUR_MEMOIRE', position: 2 },
  ],
  keywords: ['foncier', 'gouvernance', 'plateau central'],
  items: [{ barcode: 'ZK-1000', callNumber: '346 NIK', location: 'Salle 1', status: 'AVAILABLE' }],
};

/** Vérifie l'équivalence champ à champ après réextraction. */
function expectEquivalent(fields: MarcFields) {
  const back = extractBiblio(fields, 'UNIMARC');
  expect(back.title).toBe(rich.title);
  expect(back.titleComplement).toBe(rich.titleComplement);
  expect(back.isbn).toBe(rich.isbn);
  expect(back.publishYear).toBe(rich.publishYear);
  expect(back.language).toBe(rich.language);
  expect(back.publisher).toBe(rich.publisher);
  expect(back.publicationCity).toBe(rich.publicationCity);
  expect(back.defenseUniversity).toBe(rich.defenseUniversity);
  expect(back.defensePlace).toBe(rich.defensePlace);
  expect(back.category).toBe(rich.category);
  expect(back.recordType).toBe(rich.recordType);
  expect(back.keywords).toEqual(rich.keywords);
  expect(back.contributors).toEqual([
    { name: 'Nikiema, Rasmata', role: 'AUTEUR_PRINCIPAL' },
    { name: 'Kaboré, Issa', role: 'AUTEUR_SECONDAIRE' },
    { name: 'Pr Ouédraogo, Albert', role: 'DIRECTEUR_MEMOIRE' },
  ]);
}

function parseIso(buffer: Buffer): Promise<MarcRecord[]> {
  return new Promise((resolve, reject) => {
    const parser = Marc.createStream('iso2709', 'parser');
    const records: MarcRecord[] = [];
    parser.on('data', (r: MarcRecord) => records.push(r));
    parser.on('end', () => resolve(records));
    parser.on('error', reject);
    Readable.from(buffer).pipe(parser);
  });
}

describe('marc-export — aller-retour UNIMARC', () => {
  it('symétrie directe : réextraire les champs construits redonne la notice', () => {
    expectEquivalent(buildUnimarcFields(rich));
  });

  it('ALLER-RETOUR RÉEL : export ISO 2709 → parse marcjs → extraction équivalente', async () => {
    const iso = recordToIso2709(rich);
    const [parsed] = await parseIso(Buffer.from(iso, 'utf8'));
    expectEquivalent(parsed.fields as MarcFields);
  });

  it('directeur de mémoire encodé en 702 $4 727', () => {
    const fields = buildUnimarcFields(rich);
    const f702 = fields.find((f) => f[0] === '702');
    expect(f702).toBeDefined();
    expect(f702).toContain('727');
  });

  it('exemplaires exportés en zone locale 995 ($f code-barres, $k cote)', () => {
    const fields = buildUnimarcFields(rich);
    const f995 = fields.find((f) => f[0] === '995');
    expect(f995).toContain('ZK-1000');
    expect(f995).toContain('346 NIK');
  });

  it('MARCXML : collection dans l’espace de noms MARC slim', () => {
    const xml = catalogToMarcxml([rich]);
    expect(xml).toContain('<collection xmlns="http://www.loc.gov/MARC21/slim">');
    // marcjs échappe le non-ASCII en références numériques (XML valide) : on
    // vérifie une sous-chaîne ASCII du titre + les zones clés.
    expect(xml).toContain('Plateau central');
    expect(xml).toContain('<datafield tag="700"');
    expect(xml).toContain('</collection>');
  });
});
