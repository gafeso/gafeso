/** Granularités autorisées pour les séries temporelles (liste blanche = anti-injection SQL). */
export type Granularity = 'day' | 'week' | 'month';

export const GRANULARITIES: Granularity[] = ['day', 'week', 'month'];

export interface StatsPeriod {
  from: Date;
  to: Date; // borne EXCLUE
  granularity: Granularity;
}

/** Début du bucket (UTC) contenant `d`, aligné comme `date_trunc` de Postgres. */
export function bucketStart(d: Date, gran: Granularity): Date {
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (gran === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  if (gran === 'week') {
    // Postgres date_trunc('week') → lundi. getUTCDay : 0=dim..6=sam.
    const offset = (u.getUTCDay() + 6) % 7;
    u.setUTCDate(u.getUTCDate() - offset);
  }
  return u;
}

/** Bucket suivant. */
function nextBucket(d: Date, gran: Granularity): Date {
  const n = new Date(d);
  if (gran === 'day') n.setUTCDate(n.getUTCDate() + 1);
  else if (gran === 'week') n.setUTCDate(n.getUTCDate() + 7);
  else n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
}

/** Clé de bucket stable (YYYY-MM-DD, UTC) — même forme que `to_char(..., 'YYYY-MM-DD')`. */
export function bucketKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Tous les buckets alignés de [from, to), pour remplir les trous à zéro. */
export function eachBucket(period: StatsPeriod): string[] {
  const keys: string[] = [];
  let cur = bucketStart(period.from, period.granularity);
  while (cur < period.to) {
    keys.push(bucketKey(cur));
    cur = nextBucket(cur, period.granularity);
  }
  return keys;
}

/** Période PRÉCÉDENTE de même durée (pour la variation vs période précédente). */
export function previousPeriod(period: StatsPeriod): { from: Date; to: Date } {
  const span = period.to.getTime() - period.from.getTime();
  return { from: new Date(period.from.getTime() - span), to: new Date(period.from.getTime()) };
}
