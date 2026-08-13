import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('csvCell échappe les valeurs contenant ; " ou retour-ligne', () => {
    expect(csvCell('simple')).toBe('simple');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "bonjour"')).toBe('"dit ""bonjour"""');
    expect(csvCell('ligne1\nligne2')).toBe('"ligne1\nligne2"');
    expect(csvCell(' bord ')).toBe('" bord "');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
  });

  it('toCsv assemble en-têtes + lignes avec séparateur ;', () => {
    const csv = toCsv(['Document', 'Prêts'], [['Titre A', 3], ['Titre; B', 1]]);
    expect(csv).toBe('Document;Prêts\r\nTitre A;3\r\n"Titre; B";1');
  });
});
