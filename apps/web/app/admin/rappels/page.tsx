'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Badge, Button, Card, Select } from '@/components/ui';
import { ReminderSettings } from '@/components/reminder-settings';

interface ReminderLogEntry {
  id: string;
  type: 'DUE_SOON' | 'OVERDUE' | string;
  status: string;
  recipientEmail: string | null;
  recipientName: string | null;
  recordTitle: string | null;
  itemBarcode: string | null;
  dueDate: string | null;
  error: string | null;
  createdAt: string;
}
interface LogResponse {
  total: number;
  page: number;
  totalPages: number;
  entries: ReminderLogEntry[];
}

const TYPE_LABELS: Record<string, string> = {
  DUE_SOON: 'Rappel d’échéance',
  OVERDUE: 'Relance de retard',
};
const STATUS_LABELS: Record<string, string> = {
  SENT: 'Envoyé',
  FAILED: 'Échec',
  SKIPPED_NO_EMAIL: 'Sans email',
  PENDING: 'En cours',
};
const STATUS_TONE: Record<string, 'green' | 'ocre' | 'neutral'> = {
  SENT: 'green',
  FAILED: 'ocre',
  SKIPPED_NO_EMAIL: 'neutral',
  PENDING: 'neutral',
};

const EMPTY = { type: '', status: '' };

export default function ReminderJournalPage() {
  const { functions } = useMyFunctions();
  const canView = functions?.includes('circulation.retards');

  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (f: typeof EMPTY, p: number) => {
      setError(null);
      try {
        const qs = new URLSearchParams({ page: String(p), limit: '50' });
        if (f.type) qs.set('type', f.type);
        if (f.status) qs.set('status', f.status);
        setData(await api<LogResponse>(`/reminders/log?${qs}`, {}, getToken()));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Chargement du journal impossible.');
      }
    },
    [],
  );

  useEffect(() => {
    if (canView) void load(filters, page);
  }, [canView, load, filters, page]);

  if (functions && !canView) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission de consulter ce journal (fonction
        «&nbsp;circulation.retards&nbsp;»).
      </Alert>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Rappels envoyés</h1>
      <p className="mt-1 text-sm text-muted">
        Journal des rappels d’échéance et relances de retard (lecture seule).
      </p>

      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      <Card className="mt-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Type
            <Select
              value={filters.type}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, type: e.target.value }));
              }}
            >
              <option value="">Tous</option>
              <option value="DUE_SOON">Rappel d’échéance</option>
              <option value="OVERDUE">Relance de retard</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Statut
            <Select
              value={filters.status}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, status: e.target.value }));
              }}
            >
              <option value="">Tous</option>
              <option value="SENT">Envoyé</option>
              <option value="FAILED">Échec</option>
              <option value="SKIPPED_NO_EMAIL">Sans email</option>
            </Select>
          </label>
          {(filters.type || filters.status) && (
            <Button
              variant="ghost"
              onClick={() => {
                setPage(1);
                setFilters(EMPTY);
              }}
            >
              Réinitialiser
            </Button>
          )}
        </div>
      </Card>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Destinataire</th>
              <th className="py-2 pr-3">Document</th>
              <th className="py-2 pr-3">Échéance</th>
              <th className="py-2 pr-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((e) => (
              <tr key={e.id} className="border-b border-line/60 align-top">
                <td className="py-2 pr-3 whitespace-nowrap text-muted">
                  {new Date(e.createdAt).toLocaleString('fr-FR')}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{TYPE_LABELS[e.type] ?? e.type}</td>
                <td className="py-2 pr-3">
                  {e.recipientName && <div>{e.recipientName}</div>}
                  <div className="text-muted">{e.recipientEmail ?? '—'}</div>
                </td>
                <td className="py-2 pr-3">
                  {e.recordTitle ?? '—'}
                  {e.itemBarcode && <div className="text-xs text-muted">{e.itemBarcode}</div>}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-muted">
                  {e.dueDate ? new Date(e.dueDate).toLocaleDateString('fr-FR') : '—'}
                </td>
                <td className="py-2 pr-3">
                  <Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>
                    {STATUS_LABELS[e.status] ?? e.status}
                  </Badge>
                  {e.error && e.status !== 'SENT' && (
                    <div className="mt-0.5 text-xs text-muted" title={e.error}>
                      {e.error.length > 48 ? `${e.error.slice(0, 48)}…` : e.error}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {data && data.entries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted">
                  Aucun rappel enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Précédent
          </Button>
          <span className="text-muted">
            Page {data.page} / {data.totalPages} — {data.total} rappel(s)
          </span>
          <Button
            variant="ghost"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant →
          </Button>
        </div>
      )}
      {/* ⚠ VENU DE /admin/parametres le 11 septembre 2026. Son API exige
          `circulation.retards` — la permission de CET écran, pas celle de
          l'établissement. Sur l'écran d'origine il refusait pour la personne
          même qui pouvait le voir. Le droit et le métier concordent ici. */}
      <div className="mt-8 max-w-2xl">
        <ReminderSettings />
      </div>
    </div>
  );
}
