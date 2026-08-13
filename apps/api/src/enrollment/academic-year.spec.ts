import { describe, expect, it } from 'vitest';
import {
  currentAcademicYear,
  isValidAcademicYear,
  DEFAULT_ACADEMIC_YEAR_START_MONTH,
} from './academic-year';

/** Raccourci lisible : un instant précis, en heure locale. */
const at = (y: number, m: number, d = 15) => new Date(y, m - 1, d);

describe('currentAcademicYear', () => {
  it('bascule au 1er septembre (mois de rentrée par défaut)', () => {
    expect(currentAcademicYear(at(2026, 8, 31))).toBe('2025-2026');
    expect(currentAcademicYear(at(2026, 9, 1))).toBe('2026-2027');
  });

  it('couvre septembre → décembre sur l’année civile en cours', () => {
    for (const month of [9, 10, 11, 12]) {
      expect(currentAcademicYear(at(2026, month))).toBe('2026-2027');
    }
  });

  it('RÉGRESSION : de janvier à août, reste sur l’année ouverte l’automne précédent', () => {
    // C'est précisément ce que l'ancien calcul côté navigateur ratait :
    // `${currentYear}-${currentYear + 1}` donnait « 2027-2028 » en mars 2027.
    for (const month of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(currentAcademicYear(at(2027, month))).toBe('2026-2027');
    }
  });

  it('accepte un mois de rentrée personnalisé (rentrée décalée)', () => {
    expect(currentAcademicYear(at(2026, 9), 10)).toBe('2025-2026');
    expect(currentAcademicYear(at(2026, 10), 10)).toBe('2026-2027');
    // Rentrée en janvier : l'année académique colle à l'année civile.
    expect(currentAcademicYear(at(2026, 1), 1)).toBe('2026-2027');
  });

  it('refuse un mois de rentrée hors bornes', () => {
    expect(() => currentAcademicYear(at(2026, 9), 0)).toThrow(/invalide/);
    expect(() => currentAcademicYear(at(2026, 9), 13)).toThrow(/invalide/);
  });

  it('le défaut est bien septembre', () => {
    expect(DEFAULT_ACADEMIC_YEAR_START_MONTH).toBe(9);
  });
});

describe('isValidAcademicYear', () => {
  it('accepte deux années consécutives', () => {
    expect(isValidAcademicYear('2026-2027')).toBe(true);
  });

  it('refuse un format ou un écart incorrect', () => {
    expect(isValidAcademicYear('2026-2028')).toBe(false); // non consécutives
    expect(isValidAcademicYear('2026-2025')).toBe(false); // à l'envers
    expect(isValidAcademicYear('2026')).toBe(false);
    expect(isValidAcademicYear('2026/2027')).toBe(false);
    expect(isValidAcademicYear('')).toBe(false);
  });
});
