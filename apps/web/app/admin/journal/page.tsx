'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Button, Card, Input, Select } from '@/components/ui';

interface AuditEntry {
  id: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
interface AuditResponse {
  total: number;
  page: number;
  totalPages: number;
  entries: AuditEntry[];
}
interface ActionOption {
  code: string;
  label: string;
}

const EMPTY_FILTERS = { actor: '', action: '', from: '', to: '' };

export default function JournalPage() {
  const { functions } = useMyFunctions();
  const canView = functions?.includes('securite.audit');

  const [actions, setActions] = useState<ActionOption[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labelFor = useCallback(
    (code: string) => actions.find((a) => a.code === code)?.label ?? code,
    [actions],
  );

  const load = useCallback(
    async (f: typeof EMPTY_FILTERS, p: number) => {
      setError(null);
      try {
        const qs = new URLSearchParams({ page: String(p), limit: '50' });
        if (f.actor.trim()) qs.set('actor', f.actor.trim());
        if (f.action) qs.set('action', f.action);
        if (f.from) qs.set('from', new Date(f.from).toISOString());
        if (f.to) qs.set('to', new Date(f.to).toISOString());
        setData(await api<AuditResponse>(`/audit?${qs}`, {}, getToken()));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Chargement du journal impossible.');
      }
    },
    [],
  );

  useEffect(() => {
    if (!canView) return;
    api<ActionOption[]>('/audit/actions', {}, getToken())
      .then(setActions)
      .catch(() => setActions([]));
    void load(EMPTY_FILTERS, 1);
  }, [canView, load]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    void load(filters, 1);
  }

  function reset() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
    void load(EMPTY_FILTERS, 1);
  }

  function goTo(p: number) {
    setPage(p);
    void load(filters, p);
  }

  if (functions && !canView) {
    return <Alert tone="error">Réservé aux administrateurs de l’établissement.</Alert>;
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Journal d’audit</h1>
      <p className="mt-1 text-sm text-muted">
        Trace en lecture seule des actions sensibles (connexions, rôles,
        suppressions, page d’accueil…). Filtrable par utilisateur, action et période.
      </p>

      <form onSubmit={onSubmit} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Utilisateur
          <Input
            value={filters.actor}
            onChange={(e) => setFilters({ ...filters, actor: e.target.value })}
            placeholder="email (contient…)"
            className="w-52"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Action
          <Select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          >
            <option value="">Toutes les actions</option>
            {actions.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Du
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Au
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <Button type="submit">Filtrer</Button>
        <Button type="button" variant="ghost" onClick={reset}>
          Réinitialiser
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {data && (
        <>
          <p className="mt-4 text-sm text-muted">
            {data.total} entrée{data.total > 1 ? 's' : ''}
          </p>
          <Card className="mt-2 overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Utilisateur</th>
                  <th className="px-4 py-2.5 font-semibold">Cible</th>
                  <th className="px-4 py-2.5 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted">
                      Aucune entrée pour ces filtres.
                    </td>
                  </tr>
                )}
                {data.entries.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                      {new Date(e.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{labelFor(e.action)}</td>
                    <td className="px-4 py-2.5">
                      {e.actorEmail ?? '—'}
                      {e.actorRole ? (
                        <span className="ml-1 text-xs text-muted">({e.actorRole})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {e.targetLabel || e.targetId ? (
                        <span>
                          {e.targetType ? `${e.targetType} · ` : ''}
                          {e.targetLabel ?? e.targetId}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted">
                      {e.ip ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Button variant="ghost" disabled={page <= 1} onClick={() => goTo(page - 1)}>
                Précédent
              </Button>
              <span className="text-muted">
                Page {data.page} / {data.totalPages}
              </span>
              <Button
                variant="ghost"
                disabled={page >= data.totalPages}
                onClick={() => goTo(page + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
