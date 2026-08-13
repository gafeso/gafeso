'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken, getUser } from '@/lib/session';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { Header } from '@/components/header';

interface CurrentLoan {
  checkoutId: string;
  recordId: string;
  title: string;
  itemBarcode: string;
  dueDate: string;
  renewals: number;
  overdue: boolean;
  overdueDays: number;
}
interface HistoryLoan {
  checkoutId: string;
  recordId: string;
  title: string;
  itemBarcode: string;
  checkoutDate: string;
  dueDate: string;
  returnDate: string | null;
}
interface LoansResponse {
  hasCard: boolean;
  current: CurrentLoan[];
  history: { entries: HistoryLoan[]; total: number; page: number; totalPages: number };
  counters: { current: number; overdue: number };
}
interface Hold {
  holdId: string;
  recordId: string;
  title: string;
  status: string;
  position: number;
  expiryDate: string | null;
}

const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR');

export default function MyLoansPage() {
  const router = useRouter();
  const [data, setData] = useState<LoansResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const loadHolds = useCallback(async () => {
    try {
      const res = await api<{ hasCard: boolean; holds: Hold[] }>('/reader/holds', {}, getToken());
      setHolds(res.holds ?? []);
    } catch {
      setHolds([]);
    }
  }, []);

  const load = useCallback(async (p: number) => {
    setError(null);
    try {
      setData(
        await api<LoansResponse>(`/reader/loans?historyPage=${p}&historyLimit=10`, {}, getToken()),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  async function cancelHold(holdId: string) {
    setActionError(null);
    setActionNotice(null);
    setCancelling(holdId);
    try {
      await api(`/reader/holds/${holdId}/cancel`, { method: 'POST' }, getToken());
      setActionNotice('Réservation annulée.');
      await loadHolds();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Annulation impossible.');
    } finally {
      setCancelling(null);
    }
  }

  async function renew(checkoutId: string) {
    setActionError(null);
    setActionNotice(null);
    setRenewing(checkoutId);
    try {
      const res = await api<{ dueDate: string; remaining: number }>(
        `/reader/loans/${checkoutId}/renew`,
        { method: 'POST' },
        getToken(),
      );
      setActionNotice(
        `Prêt renouvelé jusqu’au ${fmt(res.dueDate)} (${res.remaining} renouvellement(s) restant(s)).`,
      );
      await load(historyPage);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Renouvellement impossible.');
    } finally {
      setRenewing(null);
    }
  }

  useEffect(() => {
    if (!getUser()) {
      router.push('/login');
      return;
    }
    void load(historyPage);
    void loadHolds();
  }, [load, loadHolds, historyPage, router]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-serif text-3xl font-bold">Mes prêts</h1>
        <p className="mt-1 text-sm text-muted">
          Vos emprunts en cours et votre historique.
        </p>

        {error && <Alert tone="error" className="mt-4">{error}</Alert>}

        {data && !data.hasCard && (
          <Alert tone="warning" className="mt-5">
            Aucune carte de bibliothèque n’est associée à votre compte. Adressez-vous
            à un bibliothécaire pour emprunter des documents.
          </Alert>
        )}

        {data && data.hasCard && (
          <>
            <div className="mt-5 flex gap-3">
              <Card className="flex-1 text-center">
                <div className="text-2xl font-bold">{data.counters.current}</div>
                <div className="text-xs text-muted">Prêt(s) en cours</div>
              </Card>
              <Card className="flex-1 text-center">
                <div className={`text-2xl font-bold ${data.counters.overdue ? 'text-red-700' : ''}`}>
                  {data.counters.overdue}
                </div>
                <div className="text-xs text-muted">En retard</div>
              </Card>
            </div>

            <section className="mt-8">
              <h2 className="font-serif text-xl font-bold">En cours</h2>
              {actionNotice && <Alert tone="success" className="mt-3">{actionNotice}</Alert>}
              {actionError && <Alert tone="error" className="mt-3">{actionError}</Alert>}
              {data.current.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Aucun prêt en cours.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="py-2 pr-3">Titre</th>
                        <th className="py-2 pr-3">Code-barres</th>
                        <th className="py-2 pr-3">Échéance</th>
                        <th className="py-2 pr-3">Statut</th>
                        <th className="py-2 pr-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.current.map((l) => (
                        <tr key={l.checkoutId} className="border-b border-line/60">
                          <td className="py-2 pr-3">
                            <Link href={`/opac/${l.recordId}`} className="text-ocre underline">
                              {l.title}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted">{l.itemBarcode}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{fmt(l.dueDate)}</td>
                          <td className="py-2 pr-3">
                            {l.overdue ? (
                              <Badge tone="ocre">En retard · {l.overdueDays} j</Badge>
                            ) : (
                              <Badge tone="green">À jour</Badge>
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <Button
                              variant="ghost"
                              onClick={() => renew(l.checkoutId)}
                              disabled={renewing === l.checkoutId}
                            >
                              {renewing === l.checkoutId ? 'Renouvellement…' : 'Renouveler'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-8">
              <h2 className="font-serif text-xl font-bold">Mes réservations</h2>
              {holds.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Aucune réservation en cours.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="py-2 pr-3">Titre</th>
                        <th className="py-2 pr-3">Statut</th>
                        <th className="py-2 pr-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {holds.map((h) => (
                        <tr key={h.holdId} className="border-b border-line/60">
                          <td className="py-2 pr-3">
                            <Link href={`/opac/${h.recordId}`} className="text-ocre underline">
                              {h.title}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">
                            {h.status === 'AVAILABLE' ? (
                              <Badge tone="green">Disponible — à retirer</Badge>
                            ) : (
                              <Badge tone="ocre">En file · position {h.position}</Badge>
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <Button
                              variant="ghost"
                              onClick={() => cancelHold(h.holdId)}
                              disabled={cancelling === h.holdId}
                            >
                              {cancelling === h.holdId ? 'Annulation…' : 'Annuler'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-8">
              <h2 className="font-serif text-xl font-bold">Historique</h2>
              {data.history.entries.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Aucun prêt passé.</p>
              ) : (
                <>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                          <th className="py-2 pr-3">Titre</th>
                          <th className="py-2 pr-3">Emprunté</th>
                          <th className="py-2 pr-3">Rendu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.history.entries.map((l) => (
                          <tr key={l.checkoutId} className="border-b border-line/60">
                            <td className="py-2 pr-3">
                              <Link href={`/opac/${l.recordId}`} className="text-ocre underline">
                                {l.title}
                              </Link>
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap text-muted">{fmt(l.checkoutDate)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap text-muted">
                              {l.returnDate ? fmt(l.returnDate) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.history.totalPages > 1 && (
                    <div className="mt-3 flex items-center gap-3 text-sm">
                      <button
                        className="text-ocre underline disabled:opacity-40"
                        disabled={historyPage <= 1}
                        onClick={() => setHistoryPage((p) => p - 1)}
                      >
                        ← Précédent
                      </button>
                      <span className="text-muted">
                        Page {data.history.page} / {data.history.totalPages}
                      </span>
                      <button
                        className="text-ocre underline disabled:opacity-40"
                        disabled={historyPage >= data.history.totalPages}
                        onClick={() => setHistoryPage((p) => p + 1)}
                      >
                        Suivant →
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
