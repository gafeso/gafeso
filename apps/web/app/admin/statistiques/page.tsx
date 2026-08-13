'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert } from '@/components/ui';
import {
  AreaLineChart,
  ChartCard,
  Donut,
  EmptyState,
  HorizontalBars,
  KpiTile,
} from '@/components/stat-charts';

interface Rank { label: string; id?: string | null; count: number }
interface Dashboard {
  period: { from: string; to: string; granularity: string };
  kpis: {
    records: number; items: number; activeAccounts: number; openLoans: number;
    overdues: number; pendingHolds: number; digital: number;
  };
  activity: {
    loans: { current: number; previous: number; variationPct: number | null };
    returns: { current: number; previous: number; variationPct: number | null };
  };
  timeseries: { date: string; loans: number; returns: number }[];
  rankings: {
    mostBorrowed: Rank[];
    neverBorrowed: { count: number; sample: Rank[] };
    topCategories: Rank[];
    topClasses: Rank[];
    topAuthors: Rank[];
  };
  fundByCategory: Rank[];
  system: {
    reminders: { type: string; status: string; count: number }[];
    holds: { fulfilled: number; expired: number };
  };
}

const DAY = 24 * 3600 * 1000;
const iso = (d: Date) => d.toISOString();

// Presets → (from, to, granularité). `to` = maintenant (borne exclue côté API).
const PRESETS: { key: string; label: string; days: number; gran: string }[] = [
  { key: '7j', label: '7 jours', days: 7, gran: 'day' },
  { key: '30j', label: '30 jours', days: 30, gran: 'day' },
  { key: '12m', label: '12 mois', days: 365, gran: 'month' },
];

const REMINDER_TYPE: Record<string, string> = { DUE_SOON: 'Rappel d’échéance', OVERDUE: 'Relance de retard' };
const REMINDER_STATUS: Record<string, string> = {
  SENT: 'Envoyé', FAILED: 'Échec', SKIPPED_NO_EMAIL: 'Sans email', PENDING: 'En cours',
};

export default function StatsPage() {
  const { functions } = useMyFunctions();
  const canView = functions?.includes('etablissement.gerer');
  const params = useSearchParams();
  const router = useRouter();

  const from = params.get('from');
  const to = params.get('to');
  const granularity = params.get('granularity') ?? 'day';

  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const periodQs = useCallback(() => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    qs.set('granularity', granularity);
    return qs;
  }, [from, to, granularity]);

  const exportUrl = (dataset: string) => `/api/stats/export?dataset=${dataset}&${periodQs()}`;
  const reportUrl = () => `/api/stats/report?${periodQs()}`;

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<Dashboard>(`/stats/dashboard?${periodQs()}`, {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, [periodQs]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  function applyPreset(p: (typeof PRESETS)[number]) {
    const now = new Date();
    const qs = new URLSearchParams({
      from: iso(new Date(now.getTime() - p.days * DAY)),
      to: iso(now),
      granularity: p.gran,
    });
    router.push(`/admin/statistiques?${qs}`);
  }

  function applyCustom(f: string, t: string, g: string) {
    const qs = new URLSearchParams({
      from: iso(new Date(f)),
      to: iso(new Date(`${t}T23:59:59`)),
      granularity: g,
    });
    router.push(`/admin/statistiques?${qs}`);
  }

  if (functions && !canView) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission de consulter les statistiques (fonction
        «&nbsp;etablissement.gerer&nbsp;»).
      </Alert>
    );
  }

  const activeDays = from && to
    ? Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY)
    : 30;

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Statistiques</h1>
      <p className="mt-1 text-sm text-muted">
        Activité de la bibliothèque sur la période choisie.
      </p>

      {/* Sélecteur de période */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => {
          const active = Math.abs(activeDays - p.days) <= 1 && granularity === p.gran;
          return (
            <button
              key={p.key}
              onClick={() => applyPreset(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                active ? 'bg-ink text-white' : 'border border-line text-ink hover:bg-line/40'
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <CustomRange onApply={applyCustom} defaultGran={granularity} />
        <a
          href={reportUrl()}
          download
          className="ml-auto rounded-md border border-ink bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink/90"
        >
          Rapport d’activité (CSV)
        </a>
      </div>

      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      {!data && !error && <p className="mt-6 text-sm text-muted">Chargement…</p>}

      {data && (
        <>
          {/* Rangée KPI */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile
              label="Prêts (période)"
              value={data.activity.loans.current}
              spark={data.timeseries.map((t) => t.loans)}
              variationPct={data.activity.loans.variationPct}
            />
            <KpiTile
              label="Retours (période)"
              value={data.activity.returns.current}
              spark={data.timeseries.map((t) => t.returns)}
              variationPct={data.activity.returns.variationPct}
            />
            <KpiTile label="Prêts en cours" value={data.kpis.openLoans} />
            <KpiTile label="En retard" value={data.kpis.overdues} emphasis />
            <KpiTile label="Réservations en attente" value={data.kpis.pendingHolds} />
            <KpiTile label="Notices" value={data.kpis.records} />
            <KpiTile label="Exemplaires" value={data.kpis.items} />
            <KpiTile label="Comptes actifs" value={data.kpis.activeAccounts} />
            <KpiTile label="Documents numériques" value={data.kpis.digital} />
          </div>

          {/* Courbe + donut */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Prêts et retours dans le temps" action={<CsvLink href={exportUrl('timeseries')} />}>
                <AreaLineChart data={data.timeseries} />
              </ChartCard>
            </div>
            <ChartCard title="Fonds par catégorie" action={<CsvLink href={exportUrl('fund-by-category')} />}>
              <Donut rows={data.fundByCategory} />
            </ChartCard>
          </div>

          {/* Palmarès */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Documents les plus empruntés" action={<CsvLink href={exportUrl('most-borrowed')} />}>
              <HorizontalBars rows={data.rankings.mostBorrowed} valueSuffix=" prêts" />
            </ChartCard>
            <ChartCard title="Auteurs les plus consultés" action={<CsvLink href={exportUrl('top-authors')} />}>
              <HorizontalBars rows={data.rankings.topAuthors} accent valueSuffix=" prêts" />
            </ChartCard>
            <ChartCard title="Catégories les plus actives" action={<CsvLink href={exportUrl('top-categories')} />}>
              <HorizontalBars rows={data.rankings.topCategories} valueSuffix=" prêts" />
            </ChartCard>
            <ChartCard title="Classes les plus actives" action={<CsvLink href={exportUrl('top-classes')} />}>
              <HorizontalBars rows={data.rankings.topClasses} accent valueSuffix=" prêts" />
            </ChartCard>
          </div>

          {/* Désherbage + système */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title={`Jamais empruntés (${data.rankings.neverBorrowed.count})`}
              action={<CsvLink href={exportUrl('never-borrowed')} />}
            >
              <p className="mb-2 text-xs text-muted">
                Candidats au désherbage. {data.rankings.neverBorrowed.count} document(s) sans aucun prêt.
              </p>
              {data.rankings.neverBorrowed.sample.length === 0 ? (
                <EmptyState label="Tous les documents ont été empruntés au moins une fois." />
              ) : (
                <ul className="max-h-48 overflow-auto text-sm">
                  {data.rankings.neverBorrowed.sample.map((r) => (
                    <li key={r.id} className="truncate border-b border-line/50 py-1" title={r.label}>
                      {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
            <ChartCard title="Activité système" action={<CsvLink href={exportUrl('reminders')} />}>
              <div className="text-sm">
                <div className="font-medium">Réservations</div>
                <p className="mt-0.5 text-muted">
                  {data.system.holds.fulfilled} honorée(s) · {data.system.holds.expired} expirée(s)
                </p>
                <div className="mt-3 font-medium">Rappels envoyés</div>
                {data.system.reminders.length === 0 ? (
                  <p className="mt-0.5 text-muted">Aucun rappel sur la période.</p>
                ) : (
                  <table className="mt-1 w-full text-sm">
                    <tbody>
                      {data.system.reminders.map((r, i) => (
                        <tr key={i} className="border-b border-line/50">
                          <td className="py-1">{REMINDER_TYPE[r.type] ?? r.type}</td>
                          <td className="py-1 text-muted">{REMINDER_STATUS[r.status] ?? r.status}</td>
                          <td className="py-1 text-right tabular-nums">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

/** Petit lien de téléchargement CSV (cookie httpOnly → auth automatique). */
function CsvLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      download
      className="rounded border border-line px-2 py-0.5 text-xs font-medium text-ink hover:bg-line/40"
      title="Télécharger en CSV"
    >
      CSV
    </a>
  );
}

function CustomRange({
  onApply,
  defaultGran,
}: {
  onApply: (from: string, to: string, gran: string) => void;
  defaultGran: string;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [gran, setGran] = useState(defaultGran);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-line/40"
      >
        Personnalisé…
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-line p-2">
      <label className="text-xs">
        Du<br />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-line px-2 py-1 text-sm" />
      </label>
      <label className="text-xs">
        Au<br />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-line px-2 py-1 text-sm" />
      </label>
      <label className="text-xs">
        Pas<br />
        <select value={gran} onChange={(e) => setGran(e.target.value)} className="rounded border border-line px-2 py-1 text-sm">
          <option value="day">Jour</option>
          <option value="week">Semaine</option>
          <option value="month">Mois</option>
        </select>
      </label>
      <button
        onClick={() => from && to && onApply(from, to, gran)}
        disabled={!from || !to}
        className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        Appliquer
      </button>
    </div>
  );
}
