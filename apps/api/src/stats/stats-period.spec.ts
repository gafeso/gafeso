import { describe, expect, it } from 'vitest';
import { bucketStart, eachBucket, previousPeriod } from './stats-period';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('stats-period', () => {
  it('bucketStart aligne jour / semaine (lundi) / mois', () => {
    // 2026-07-15 = mercredi.
    expect(bucketStart(new Date('2026-07-15T13:00:00Z'), 'day').toISOString()).toBe(
      '2026-07-15T00:00:00.000Z',
    );
    expect(bucketStart(new Date('2026-07-15T13:00:00Z'), 'week').toISOString()).toBe(
      '2026-07-13T00:00:00.000Z', // lundi
    );
    expect(bucketStart(new Date('2026-07-15T13:00:00Z'), 'month').toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('eachBucket génère les buckets alignés de [from, to)', () => {
    const keys = eachBucket({ from: d('2026-07-01'), to: d('2026-07-04'), granularity: 'day' });
    expect(keys).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });

  it('eachBucket mensuel', () => {
    const keys = eachBucket({ from: d('2026-01-01'), to: d('2026-04-01'), granularity: 'month' });
    expect(keys).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('previousPeriod : même durée, immédiatement avant', () => {
    const prev = previousPeriod({ from: d('2026-07-08'), to: d('2026-07-15'), granularity: 'day' });
    expect(prev.from.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(prev.to.toISOString()).toBe('2026-07-08T00:00:00.000Z');
  });
});
