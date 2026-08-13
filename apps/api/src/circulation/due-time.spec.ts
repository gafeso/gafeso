import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DUE_TIME,
  DEFAULT_TIMEZONE,
  civilDate,
  computeDueAt,
  parseDueTime,
  computeOverdueDays,
  zonedWallTimeToUtc,
} from './due-time';

/** Lisibilité : « le 15 à 16:00 heure locale du fuseau ». */
const local = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz,
    dateStyle: 'short',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(iso));

describe('parseDueTime', () => {
  it('accepte une heure valide', () => {
    expect(parseDueTime('16:00')).toEqual({ h: 16, m: 0 });
    expect(parseDueTime('08:30')).toEqual({ h: 8, m: 30 });
    expect(parseDueTime('23:59')).toEqual({ h: 23, m: 59 });
  });

  it('retombe sur le défaut si la valeur est absente ou invalide', () => {
    for (const v of [undefined, null, '', '25:00', '16h', '16:60', 'midi']) {
      expect(parseDueTime(v)).toEqual({ h: 16, m: 0 });
    }
    expect(DEFAULT_DUE_TIME).toBe('16:00');
  });
});

describe('computeDueAt — jours CALENDAIRES, heure fixe', () => {
  const TZ = DEFAULT_TIMEZONE; // Africa/Ouagadougou, UTC+0

  it('emprunt le matin : 14 jours → le 15 à 16:00', () => {
    const due = computeDueAt(new Date('2026-08-01T09:00:00Z'), 14, '16:00', TZ);
    expect(local(due.toISOString(), TZ)).toBe('15/08/2026 16:00');
  });

  it('RÈGLE : emprunt APRÈS l’heure d’échéance → même jour calendaire', () => {
    // 1er à 17 h, 14 jours → le 15, PAS le 16. C'est le comportement attendu
    // par un bibliothécaire : « rendu le 15 », quelle que soit l'heure.
    const due = computeDueAt(new Date('2026-08-01T17:00:00Z'), 14, '16:00', TZ);
    expect(local(due.toISOString(), TZ)).toBe('15/08/2026 16:00');
  });

  it('emprunt pile à l’heure d’échéance → même jour calendaire', () => {
    const due = computeDueAt(new Date('2026-08-01T16:00:00Z'), 14, '16:00', TZ);
    expect(local(due.toISOString(), TZ)).toBe('15/08/2026 16:00');
  });

  it('deux emprunts le même jour, à des heures différentes, ont la MÊME échéance', () => {
    const matin = computeDueAt(new Date('2026-08-01T08:00:00Z'), 7, '16:00', TZ);
    const soir = computeDueAt(new Date('2026-08-01T22:00:00Z'), 7, '16:00', TZ);
    expect(matin.toISOString()).toBe(soir.toISOString());
  });

  it('BORNE : franchit une fin de mois', () => {
    const due = computeDueAt(new Date('2026-01-25T10:00:00Z'), 10, '16:00', TZ);
    expect(local(due.toISOString(), TZ)).toBe('04/02/2026 16:00');
  });

  it('BORNE : année bissextile — 2028 a un 29 février', () => {
    const due = computeDueAt(new Date('2028-02-28T10:00:00Z'), 1, '16:00', TZ);
    expect(local(due.toISOString(), TZ)).toBe('29/02/2028 16:00');
  });

  it('BORNE : année NON bissextile — 2027 passe au 1er mars', () => {
    const due = computeDueAt(new Date('2027-02-28T10:00:00Z'), 1, '16:00', TZ);
    expect(local(due.toISOString(), TZ)).toBe('01/03/2027 16:00');
  });

  it('BORNE : franchit une fin d’année', () => {
    const due = computeDueAt(new Date('2026-12-28T10:00:00Z'), 7, '16:00', TZ);
    expect(local(due.toISOString(), TZ)).toBe('04/01/2027 16:00');
  });

  it('respecte une heure d’échéance personnalisée', () => {
    const due = computeDueAt(new Date('2026-08-01T09:00:00Z'), 3, '09:30', TZ);
    expect(local(due.toISOString(), TZ)).toBe('04/08/2026 09:30');
  });
});

describe('computeDueAt — autres fuseaux', () => {
  it('l’échéance est 16:00 LOCALES, pas 16:00 UTC', () => {
    // Dakar est aussi à UTC+0, mais Nairobi est à UTC+3 : 16:00 locales y
    // correspondent à 13:00 UTC. Une échéance figée en UTC serait fausse de
    // trois heures — le genre d'écart qui décale une amende d'un jour entier.
    const due = computeDueAt(new Date('2026-08-01T09:00:00Z'), 1, '16:00', 'Africa/Nairobi');
    expect(due.toISOString()).toBe('2026-08-02T13:00:00.000Z');
    expect(local(due.toISOString(), 'Africa/Nairobi')).toBe('02/08/2026 16:00');
  });

  it('reste juste de part et d’autre d’une bascule d’heure d’été', () => {
    // Paris passe à l'heure d'hiver le 25 octobre 2026. L'échéance doit rester
    // à 16:00 LOCALES des deux côtés, malgré le changement de décalage.
    const avant = computeDueAt(new Date('2026-10-20T09:00:00Z'), 1, '16:00', 'Europe/Paris');
    const apres = computeDueAt(new Date('2026-10-27T09:00:00Z'), 1, '16:00', 'Europe/Paris');
    expect(local(avant.toISOString(), 'Europe/Paris')).toBe('21/10/2026 16:00');
    expect(local(apres.toISOString(), 'Europe/Paris')).toBe('28/10/2026 16:00');
    // Les décalages UTC diffèrent bien : la correction de seconde passe sert.
    expect(avant.toISOString().slice(11, 16)).toBe('14:00'); // UTC+2
    expect(apres.toISOString().slice(11, 16)).toBe('15:00'); // UTC+1
  });
});

describe('helpers de fuseau', () => {
  it('civilDate rend la date vue DANS le fuseau, pas en UTC', () => {
    // 23:30 UTC = déjà le lendemain à Nairobi (UTC+3).
    expect(civilDate(new Date('2026-08-01T23:30:00Z'), 'Africa/Nairobi')).toEqual({
      y: 2026,
      m: 8,
      d: 2,
    });
    expect(civilDate(new Date('2026-08-01T23:30:00Z'), 'Africa/Ouagadougou')).toEqual({
      y: 2026,
      m: 8,
      d: 1,
    });
  });

  it('zonedWallTimeToUtc convertit une heure au mur en instant', () => {
    expect(zonedWallTimeToUtc(2026, 8, 15, 16, 0, 'Africa/Ouagadougou').toISOString()).toBe(
      '2026-08-15T16:00:00.000Z',
    );
    expect(zonedWallTimeToUtc(2026, 8, 15, 16, 0, 'Africa/Nairobi').toISOString()).toBe(
      '2026-08-15T13:00:00.000Z',
    );
  });
});

describe('computeOverdueDays — l’amende suit la MÊME référence que l’échéance', () => {
  const TZ = DEFAULT_TIMEZONE;
  const due = new Date('2026-08-18T16:00:00Z'); // le 18 à 16:00 locales

  it('rendu avant l’échéance → 0', () => {
    expect(computeOverdueDays(due, new Date('2026-08-18T09:00:00Z'), TZ)).toBe(0);
  });

  it('rendu PILE à l’heure d’échéance → 0 (la minute de grâce compte)', () => {
    expect(computeOverdueDays(due, new Date('2026-08-18T16:00:00Z'), TZ)).toBe(0);
  });

  it('BORNE : rendu le jour dit, 30 min après l’heure → 1', () => {
    expect(computeOverdueDays(due, new Date('2026-08-18T16:30:00Z'), TZ)).toBe(1);
  });

  it('BORNE : rendu le LENDEMAIN MATIN → toujours 1 (16 h n’est pas repassé)', () => {
    expect(computeOverdueDays(due, new Date('2026-08-19T08:00:00Z'), TZ)).toBe(1);
  });

  it('BORNE : rendu le lendemain APRÈS 16 h → 2', () => {
    expect(computeOverdueDays(due, new Date('2026-08-19T16:30:00Z'), TZ)).toBe(2);
  });

  it('NON-RÉGRESSION : identique à l’ancien calcul en 24 h, en décalage fixe', () => {
    // Le Burkina n'a pas d'heure d'été : aucune amende existante ne bouge.
    for (const h of [1, 5, 17, 23, 25, 48, 72, 100, 240]) {
      const retour = new Date(due.getTime() + h * 3600_000);
      const ancien = Math.ceil((retour.getTime() - due.getTime()) / 86_400_000);
      expect(computeOverdueDays(due, retour, TZ)).toBe(ancien);
    }
  });

  it('POURQUOI ce changement : l’ancien calcul dérivait d’une heure sous heure d’été', () => {
    // Échéance le 24 octobre à 16:00 à Paris (UTC+2). Le 25, la France repasse
    // à UTC+1 : « le lendemain à 16 h au mur » n'est plus à +24 h, mais à +25 h.
    const dueParis = zonedWallTimeToUtc(2026, 10, 24, 16, 0, 'Europe/Paris');
    const le25a1530 = zonedWallTimeToUtc(2026, 10, 25, 15, 30, 'Europe/Paris');
    // 16 h n'est pas repassé le 25 : un seul jour de retard.
    expect(computeOverdueDays(dueParis, le25a1530, 'Europe/Paris')).toBe(1);
    // L'ancien calcul en 24 h en comptait DEUX — une amende de trop.
    expect(Math.ceil((le25a1530.getTime() - dueParis.getTime()) / 86_400_000)).toBe(2);
  });

  it('BORNE : franchit une fin de mois', () => {
    const d = new Date('2026-01-31T16:00:00Z');
    expect(computeOverdueDays(d, new Date('2026-02-03T09:00:00Z'), TZ)).toBe(3);
  });

  it('l’heure de référence vient de l’ÉCHÉANCE, pas du réglage courant', () => {
    // Prêt hérité, dû à 09:00. Rendu à 10 h le jour dit → déjà 1 jour, même si
    // l'établissement affiche désormais 16:00 dans ses réglages.
    const ancienne = new Date('2026-08-18T09:00:00Z');
    expect(computeOverdueDays(ancienne, new Date('2026-08-18T10:00:00Z'), TZ)).toBe(1);
    expect(computeOverdueDays(ancienne, new Date('2026-08-18T08:00:00Z'), TZ)).toBe(0);
  });
});
