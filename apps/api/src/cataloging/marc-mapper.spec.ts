import { describe, expect, it } from 'vitest';
import { dropScannerPublisher, extractBiblio, MarcFields } from './marc-mapper';

describe('marc-mapper — UNIMARC', () => {
  const fields: MarcFields = [
    ['010', '  ', 'a', '978-2-1234-5678-9'],
    ['101', '  ', 'a', 'fre'],
    ['200', '1 ', 'a', 'Droit constitutionnel burkinabè', 'f', 'Awa Traoré'],
    ['210', '  ', 'd', 'cop. 2023'],
    ['700', ' 1', 'a', 'Traoré', 'b', 'Awa'],
  ];

  it('extrait titre, auteur (700 a+b), isbn, année, langue', () => {
    expect(extractBiblio(fields, 'UNIMARC')).toMatchObject({
      title: 'Droit constitutionnel burkinabè',
      author: 'Traoré, Awa',
      isbn: '978-2-1234-5678-9',
      publishYear: 2023,
      language: 'fre',
    });
  });

  it("retombe sur 200$f si pas d'auteur 700/701", () => {
    const noAuthor = fields.filter((f) => f[0] !== '700');
    expect(extractBiblio(noAuthor, 'UNIMARC').author).toBe('Awa Traoré');
  });

  it('année depuis le champ 100 (positions 9-12) si 210$d absent', () => {
    const alt: MarcFields = [
      ['100', '  ', 'a', '20240115d2021    m  y0frey0103    ba'],
      ['200', '1 ', 'a', 'Titre'],
    ];
    expect(extractBiblio(alt, 'UNIMARC').publishYear).toBe(2021);
  });

  it('champs manquants → null (jamais d’exception)', () => {
    expect(extractBiblio([], 'UNIMARC')).toMatchObject({
      title: null,
      author: null,
      isbn: null,
      publishYear: null,
      language: null,
      contributors: [],
      keywords: [],
    });
  });
});

describe('marc-mapper — garde-fou éditeur = logiciel de numérisation', () => {
  it('un vrai éditeur est conservé', () => {
    expect(dropScannerPublisher('Presses universitaires de Ouagadougou')).toBe(
      'Presses universitaires de Ouagadougou',
    );
  });

  it('un logiciel de scan est ignoré (nom seul ou en sous-chaîne, casse libre)', () => {
    expect(dropScannerPublisher('CamScanner')).toBeNull();
    expect(dropScannerPublisher('Scanned by CamScanner')).toBeNull();
    expect(dropScannerPublisher('NAPS2')).toBeNull();
    expect(dropScannerPublisher('Numérisé avec Adobe Scan')).toBeNull();
    expect(dropScannerPublisher('PAPERPORT')).toBeNull();
    expect(dropScannerPublisher(null)).toBeNull();
  });

  it("à l'extraction UNIMARC, l'éditeur PaperPort est laissé vide (210$c)", () => {
    const fields: MarcFields = [
      ['200', '1 ', 'a', 'Recueil de jurisprudence'],
      ['210', '  ', 'a', 'Ouagadougou', 'c', 'PaperPort', 'd', '2021'],
    ];
    const r = extractBiblio(fields, 'UNIMARC');
    expect(r.publisher).toBeNull();
    expect(r.publicationCity).toBe('Ouagadougou'); // la ville, elle, reste
    expect(r.publishYear).toBe(2021);
  });

  it("à l'extraction MARC21, un scanner en 264$b est laissé vide", () => {
    const fields: MarcFields = [
      ['245', '10', 'a', 'A report'],
      ['264', ' 1', 'a', 'Accra', 'b', 'ScanSnap', 'c', '2020'],
    ];
    expect(extractBiblio(fields, 'MARC21').publisher).toBeNull();
  });
});

describe('marc-mapper — MARC21', () => {
  const fields: MarcFields = [
    ['020', '  ', 'a', '9782123456789'],
    ['100', '1 ', 'a', 'Traoré, Awa,'],
    ['245', '10', 'a', 'Constitutional law', 'b', 'a West African primer /'],
    ['264', ' 1', 'c', '[2022]'],
  ];

  it('extrait titre (245 a+b), auteur 100, isbn 020, année 264$c', () => {
    expect(extractBiblio(fields, 'MARC21')).toMatchObject({
      title: 'Constitutional law : a West African primer',
      author: 'Traoré, Awa',
      isbn: '9782123456789',
      publishYear: 2022,
      language: null,
    });
  });

  it('année 260$c en secours, auteur 700 en secours', () => {
    const alt: MarcFields = [
      ['245', '10', 'a', 'Titre'],
      ['260', '  ', 'c', '1998.'],
      ['700', '1 ', 'a', 'Ouédraogo, Salif'],
    ];
    const result = extractBiblio(alt, 'MARC21');
    expect(result.publishYear).toBe(1998);
    expect(result.author).toBe('Ouédraogo, Salif');
  });

  it('langue depuis 041$a, sinon positions 35-37 du 008', () => {
    const with041: MarcFields = [...fields, ['041', '  ', 'a', 'fre']];
    expect(extractBiblio(with041, 'MARC21').language).toBe('fre');

    const with008: MarcFields = [
      ['008', '240115s2022    fr            000 0 fre d'],
      ['245', '10', 'a', 'Titre'],
    ];
    expect(extractBiblio(with008, 'MARC21').language).toBe('fre');
  });
});
