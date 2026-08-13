import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tenantSchemaName } from '../tenancy/tenant-schema';
import { eachBucket, Granularity, previousPeriod, StatsPeriod } from './stats-period';
import { joinCsvSections, toCsv } from './csv';

/** Jeux de données exportables en CSV. */
export const EXPORT_DATASETS = [
  'kpis',
  'timeseries',
  'most-borrowed',
  'never-borrowed',
  'top-categories',
  'top-classes',
  'top-authors',
  'reminders',
  'fund-by-category',
] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export interface RankRow {
  label: string;
  id?: string | null;
  count: number;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Table qualifiée par le schéma du tenant (slug validé → sûr en SQL brut). */
  private q(slug: string, table: string): string {
    return `"${tenantSchemaName(slug)}"."${table}"`;
  }

  // ── KPIs instantanés ──────────────────────────────────────────────────────
  async kpis(slug: string, now: Date = new Date()) {
    const db = this.prisma.forTenant(slug);
    const [records, items, activeAccounts, openLoans, overdues, pendingHolds, digital] =
      await Promise.all([
        db.biblioRecord.count(),
        db.item.count(),
        db.user.count({ where: { status: 'ACTIVE' } }),
        db.checkout.count({ where: { returnDate: null } }),
        db.checkout.count({ where: { returnDate: null, dueDate: { lt: now } } }),
        db.hold.count({ where: { status: 'PENDING' } }),
        db.digitalCopy.count(),
      ]);
    return { records, items, activeAccounts, openLoans, overdues, pendingHolds, digital };
  }

  // ── Activité de la période (avec variation vs période précédente) ─────────
  async activity(slug: string, period: StatsPeriod) {
    const db = this.prisma.forTenant(slug);
    const prev = previousPeriod(period);
    const [loans, returns, prevLoans, prevReturns] = await Promise.all([
      db.checkout.count({ where: { checkoutDate: { gte: period.from, lt: period.to } } }),
      db.checkout.count({ where: { returnDate: { gte: period.from, lt: period.to } } }),
      db.checkout.count({ where: { checkoutDate: { gte: prev.from, lt: prev.to } } }),
      db.checkout.count({ where: { returnDate: { gte: prev.from, lt: prev.to } } }),
    ]);
    const variation = (cur: number, before: number): number | null =>
      before === 0 ? null : Math.round(((cur - before) / before) * 100);
    return {
      loans: { current: loans, previous: prevLoans, variationPct: variation(loans, prevLoans) },
      returns: {
        current: returns,
        previous: prevReturns,
        variationPct: variation(returns, prevReturns),
      },
    };
  }

  // ── Séries temporelles (date_trunc, trous remplis à zéro) ─────────────────
  async timeseries(slug: string, period: StatsPeriod) {
    const gran: Granularity = period.granularity;
    // gran vient d'une liste blanche (DTO) → interpolation SQL sûre.
    const loanRows = await this.prisma.$queryRawUnsafe<{ bucket: string; n: bigint }[]>(
      `SELECT to_char(date_trunc('${gran}', checkout_date), 'YYYY-MM-DD') AS bucket, count(*)::bigint AS n
       FROM ${this.q(slug, 'checkouts')}
       WHERE checkout_date >= $1 AND checkout_date < $2
       GROUP BY 1`,
      period.from,
      period.to,
    );
    const returnRows = await this.prisma.$queryRawUnsafe<{ bucket: string; n: bigint }[]>(
      `SELECT to_char(date_trunc('${gran}', return_date), 'YYYY-MM-DD') AS bucket, count(*)::bigint AS n
       FROM ${this.q(slug, 'checkouts')}
       WHERE return_date >= $1 AND return_date < $2
       GROUP BY 1`,
      period.from,
      period.to,
    );
    // date_trunc produit des buckets déjà alignés (jour/lundi/1er du mois),
    // identiques aux clés de eachBucket → jointure directe par clé YYYY-MM-DD.
    const loanMap = new Map(loanRows.map((r) => [r.bucket, Number(r.n)]));
    const returnMap = new Map(returnRows.map((r) => [r.bucket, Number(r.n)]));
    return eachBucket(period).map((key) => ({
      date: key,
      loans: loanMap.get(key) ?? 0,
      returns: returnMap.get(key) ?? 0,
    }));
  }

  // ── Palmarès ──────────────────────────────────────────────────────────────
  /** Documents les plus empruntés sur la période. */
  async mostBorrowed(slug: string, period: StatsPeriod, limit = 10): Promise<RankRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; title: string; n: bigint }[]>(
      `SELECT r.id, r.title, count(*)::bigint AS n
       FROM ${this.q(slug, 'checkouts')} c
       JOIN ${this.q(slug, 'items')} i ON i.id = c.item_id
       JOIN ${this.q(slug, 'biblio_records')} r ON r.id = i.record_id
       WHERE c.checkout_date >= $1 AND c.checkout_date < $2
       GROUP BY r.id, r.title
       ORDER BY n DESC, r.title ASC
       LIMIT ${limit}`,
      period.from,
      period.to,
    );
    return rows.map((r) => ({ id: r.id, label: r.title, count: Number(r.n) }));
  }

  /** Documents JAMAIS empruntés (désherbage) : total + échantillon. */
  async neverBorrowed(slug: string, limit = 20) {
    const countRows = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM ${this.q(slug, 'biblio_records')} r
       WHERE NOT EXISTS (
         SELECT 1 FROM ${this.q(slug, 'items')} i
         JOIN ${this.q(slug, 'checkouts')} c ON c.item_id = i.id
         WHERE i.record_id = r.id)`,
    );
    const sample = await this.neverBorrowedList(slug, limit);
    return { count: Number(countRows[0]?.n ?? 0), sample };
  }

  /** Liste (bornée) des documents jamais empruntés — sert l'affichage ET l'export. */
  async neverBorrowedList(slug: string, limit?: number): Promise<RankRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; title: string }[]>(
      `SELECT r.id, r.title FROM ${this.q(slug, 'biblio_records')} r
       WHERE NOT EXISTS (
         SELECT 1 FROM ${this.q(slug, 'items')} i
         JOIN ${this.q(slug, 'checkouts')} c ON c.item_id = i.id
         WHERE i.record_id = r.id)
       ORDER BY r.title ASC${limit ? ` LIMIT ${limit}` : ''}`,
    );
    return rows.map((r) => ({ id: r.id, label: r.title, count: 0 }));
  }

  /** Catégories les plus actives (emprunts sur la période). */
  async topCategories(slug: string, period: StatsPeriod, limit = 10): Promise<RankRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<{ category: string | null; n: bigint }[]>(
      `SELECT r.category, count(*)::bigint AS n
       FROM ${this.q(slug, 'checkouts')} c
       JOIN ${this.q(slug, 'items')} i ON i.id = c.item_id
       JOIN ${this.q(slug, 'biblio_records')} r ON r.id = i.record_id
       WHERE c.checkout_date >= $1 AND c.checkout_date < $2
       GROUP BY r.category ORDER BY n DESC LIMIT ${limit}`,
      period.from,
      period.to,
    );
    return rows.map((r) => ({ label: r.category ?? '(sans catégorie)', count: Number(r.n) }));
  }

  /** Classes/promotions les plus actives (emprunts sur la période). */
  async topClasses(slug: string, period: StatsPeriod, limit = 10): Promise<RankRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<{ class_name: string; n: bigint }[]>(
      `SELECT u.class_name, count(*)::bigint AS n
       FROM ${this.q(slug, 'checkouts')} c
       JOIN ${this.q(slug, 'patrons')} p ON p.id = c.patron_id
       JOIN ${this.q(slug, 'users')} u ON u.id = p.user_id
       WHERE c.checkout_date >= $1 AND c.checkout_date < $2 AND u.class_name IS NOT NULL
       GROUP BY u.class_name ORDER BY n DESC LIMIT ${limit}`,
      period.from,
      period.to,
    );
    return rows.map((r) => ({ label: r.class_name, count: Number(r.n) }));
  }

  /** Auteurs les plus consultés (emprunts sur la période, via le fichier d'autorités). */
  async topAuthors(slug: string, period: StatsPeriod, limit = 10): Promise<RankRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; display_name: string; n: bigint }[]>(
      `SELECT a.id, a.display_name, count(*)::bigint AS n
       FROM ${this.q(slug, 'checkouts')} c
       JOIN ${this.q(slug, 'items')} i ON i.id = c.item_id
       JOIN ${this.q(slug, 'record_contributors')} rc ON rc.record_id = i.record_id
       JOIN ${this.q(slug, 'authors')} a ON a.id = rc.author_id
       WHERE c.checkout_date >= $1 AND c.checkout_date < $2
       GROUP BY a.id, a.display_name ORDER BY n DESC LIMIT ${limit}`,
      period.from,
      period.to,
    );
    return rows.map((r) => ({ id: r.id, label: r.display_name, count: Number(r.n) }));
  }

  /** Répartition du fonds par catégorie (anneau) — état courant, pas la période. */
  async fundByCategory(slug: string): Promise<RankRow[]> {
    const db = this.prisma.forTenant(slug);
    const groups = await db.biblioRecord.groupBy({
      by: ['category'],
      _count: { _all: true },
      orderBy: { _count: { category: 'desc' } },
    });
    return groups.map((g) => ({
      label: g.category ?? '(sans catégorie)',
      count: g._count._all,
    }));
  }

  // ── Activité système ──────────────────────────────────────────────────────
  async systemActivity(slug: string, tenantId: string, period: StatsPeriod) {
    const db = this.prisma.forTenant(slug);
    const [reminderGroups, fulfilled, expired] = await Promise.all([
      // reminder_logs vit dans le schéma PUBLIC (tenantId) — client de base.
      this.prisma.reminderLog.groupBy({
        by: ['type', 'status'],
        where: { tenantId, createdAt: { gte: period.from, lt: period.to } },
        _count: { _all: true },
      }),
      db.hold.count({ where: { status: 'FULFILLED', createdAt: { gte: period.from, lt: period.to } } }),
      db.hold.count({ where: { status: 'EXPIRED', createdAt: { gte: period.from, lt: period.to } } }),
    ]);
    return {
      reminders: reminderGroups.map((g) => ({
        type: g.type,
        status: g.status,
        count: g._count._all,
      })),
      holds: { fulfilled, expired },
    };
  }

  // ── Exports CSV ───────────────────────────────────────────────────────────
  /** Un jeu de données en CSV (en-têtes FR). Pour l'export, palmarès élargis. */
  async datasetCsv(
    slug: string,
    tenantId: string,
    dataset: ExportDataset,
    period: StatsPeriod,
    now: Date = new Date(),
  ): Promise<{ filename: string; csv: string }> {
    const rank = (rows: { label: string; count: number }[]) => rows.map((r) => [r.label, r.count]);
    let filename: string = dataset;
    let csv = '';
    switch (dataset) {
      case 'kpis': {
        const k = await this.kpis(slug, now);
        csv = toCsv(
          ['Indicateur', 'Valeur'],
          [
            ['Notices', k.records],
            ['Exemplaires', k.items],
            ['Comptes actifs', k.activeAccounts],
            ['Prêts en cours', k.openLoans],
            ['En retard', k.overdues],
            ['Réservations en attente', k.pendingHolds],
            ['Documents numériques', k.digital],
          ],
        );
        filename = 'indicateurs';
        break;
      }
      case 'timeseries': {
        const series = await this.timeseries(slug, period);
        csv = toCsv(['Date', 'Prêts', 'Retours'], series.map((s) => [s.date, s.loans, s.returns]));
        filename = 'series-temporelles';
        break;
      }
      case 'most-borrowed':
        csv = toCsv(['Document', 'Prêts'], rank(await this.mostBorrowed(slug, period, 100)));
        filename = 'plus-empruntes';
        break;
      case 'never-borrowed':
        csv = toCsv(['Document'], (await this.neverBorrowedList(slug)).map((r) => [r.label]));
        filename = 'jamais-empruntes';
        break;
      case 'top-categories':
        csv = toCsv(['Catégorie', 'Prêts'], rank(await this.topCategories(slug, period, 100)));
        filename = 'categories-actives';
        break;
      case 'top-classes':
        csv = toCsv(['Classe', 'Prêts'], rank(await this.topClasses(slug, period, 100)));
        filename = 'classes-actives';
        break;
      case 'top-authors':
        csv = toCsv(['Auteur', 'Prêts'], rank(await this.topAuthors(slug, period, 100)));
        filename = 'auteurs-consultes';
        break;
      case 'fund-by-category':
        csv = toCsv(['Catégorie', 'Notices'], rank(await this.fundByCategory(slug)));
        filename = 'fonds-par-categorie';
        break;
      case 'reminders': {
        const sys = await this.systemActivity(slug, tenantId, period);
        csv = toCsv(
          ['Type', 'Statut', 'Nombre'],
          sys.reminders.map((r) => [r.type, r.status, r.count]),
        );
        filename = 'rappels';
        break;
      }
    }
    return { filename, csv };
  }

  /** Rapport d'activité complet : tous les indicateurs de la période en un fichier. */
  async reportCsv(slug: string, tenantId: string, period: StatsPeriod, now: Date = new Date()) {
    const datasets: ExportDataset[] = [
      'kpis',
      'timeseries',
      'most-borrowed',
      'top-categories',
      'top-classes',
      'top-authors',
      'never-borrowed',
      'reminders',
      'fund-by-category',
    ];
    const titles: Record<ExportDataset, string> = {
      kpis: 'INDICATEURS',
      timeseries: 'SÉRIE PRÊTS / RETOURS',
      'most-borrowed': 'DOCUMENTS LES PLUS EMPRUNTÉS',
      'top-categories': 'CATÉGORIES LES PLUS ACTIVES',
      'top-classes': 'CLASSES LES PLUS ACTIVES',
      'top-authors': 'AUTEURS LES PLUS CONSULTÉS',
      'never-borrowed': 'DOCUMENTS JAMAIS EMPRUNTÉS',
      reminders: 'RAPPELS ENVOYÉS',
      'fund-by-category': 'FONDS PAR CATÉGORIE',
    };
    const header = toCsv(
      ['Rapport d’activité — période'],
      [[`${period.from.toISOString().slice(0, 10)} → ${period.to.toISOString().slice(0, 10)}`]],
    );
    const sections = await Promise.all(
      datasets.map(async (d) => ({ title: titles[d], csv: (await this.datasetCsv(slug, tenantId, d, period, now)).csv })),
    );
    return joinCsvSections([{ title: 'RAPPORT', csv: header }, ...sections]);
  }

  // ── Agrégat pour le dashboard (un seul appel) ─────────────────────────────
  async dashboard(slug: string, tenantId: string, period: StatsPeriod, now: Date = new Date()) {
    const [kpis, activity, series, mostBorrowed, neverBorrowed, categories, classes, authors, fund, system] =
      await Promise.all([
        this.kpis(slug, now),
        this.activity(slug, period),
        this.timeseries(slug, period),
        this.mostBorrowed(slug, period),
        this.neverBorrowed(slug),
        this.topCategories(slug, period),
        this.topClasses(slug, period),
        this.topAuthors(slug, period),
        this.fundByCategory(slug),
        this.systemActivity(slug, tenantId, period),
      ]);
    return {
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        granularity: period.granularity,
      },
      kpis,
      activity,
      timeseries: series,
      rankings: { mostBorrowed, neverBorrowed, topCategories: categories, topClasses: classes, topAuthors: authors },
      fundByCategory: fund,
      system,
    };
  }
}
