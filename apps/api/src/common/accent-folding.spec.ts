import { describe, expect, it } from 'vitest';
import { ACCENTED, UNACCENTED, foldAccents, sqlFoldExpression } from './accent-folding';

describe('accent-folding', () => {
  it('CONTRAT translate() : les deux tables ont la même longueur', () => {
    // Si elles se désalignent, translate() décale les correspondances et la
    // recherche devient silencieusement fausse — d'où cette assertion.
    expect([...ACCENTED].length).toBe([...UNACCENTED].length);
  });

  it('aucun caractère accentué en double dans la table', () => {
    expect(new Set([...ACCENTED]).size).toBe([...ACCENTED].length);
  });

  it('replie les patronymes qui posaient problème', () => {
    expect(foldAccents('Ouédraogo')).toBe('ouedraogo');
    expect(foldAccents('Traoré')).toBe('traore');
    expect(foldAccents('Kaboré')).toBe('kabore');
    expect(foldAccents('Compaoré')).toBe('compaore');
  });

  it('replie les mots métier accentués', () => {
    expect(foldAccents('Médecine')).toBe('medecine');
    expect(foldAccents('Économie')).toBe('economie');
    expect(foldAccents('Théâtre')).toBe('theatre');
    expect(foldAccents('Aïcha')).toBe('aicha');
    expect(foldAccents('Noël')).toBe('noel');
    expect(foldAccents('Çà')).toBe('ca');
  });

  it('laisse intact ce qui n’a pas d’accent', () => {
    expect(foldAccents('Konate')).toBe('konate');
    expect(foldAccents('ETU-2026-0142')).toBe('etu-2026-0142');
    expect(foldAccents('')).toBe('');
  });

  it('construit une expression SQL translate() cohérente', () => {
    const sql = sqlFoldExpression('"last_name"');
    expect(sql).toBe(`translate(lower("last_name"), '${ACCENTED}', '${UNACCENTED}')`);
  });
});
