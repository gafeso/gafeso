'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { useModulesActifs } from '@/lib/modules-actifs';
import { LIBELLES } from '@/lib/libelles';
import { Badge, Button, Card, Input } from '@/components/ui';

// ── Types des réponses circulation ────────────────────────────
interface CheckoutResult {
  title: string;
  dueDate: string;
  rule: { loanPeriodDays: number; finePerDay: number };
}

interface ReturnResult {
  returned: boolean;
  fine: { overdueDays: number; amountXof: number };
  holdReady: { holdId: string; patronId: string; pickupDays: number } | null;
}

interface PatronSituation {
  patron: {
    id: string;
    barcode: string;
    category: string;
    expiryDate: string | null;
    user: { firstName: string; lastName: string } | null;
  };
  checkouts: {
    checkoutId: string;
    title: string;
    itemBarcode: string;
    dueDate: string;
    renewals: number;
    overdue: boolean;
    accruedFineXof: number;
  }[];
  holds: { id: string; status: string; record: { title: string } }[];
  fines: { recordedXof: number; accruingXof: number; totalXof: number };
}

const dateFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });
const nbFr = new Intl.NumberFormat('fr-FR');
const fcfa = (n: number) => `${nbFr.format(n)} FCFA`;

type Tab = 'checkout' | 'return' | 'patron' | 'holds';

const TABS: { id: Tab; label: string }[] = [
  { id: 'checkout', label: 'Prêt' },
  { id: 'return', label: 'Retour' },
  { id: 'patron', label: 'Adhérent' },
  { id: 'holds', label: 'Réservations' },
];

export default function GuichetPage() {
  const [tab, setTab] = useState<Tab>('checkout');
  // Garde par FONCTION, pas par rôle : un rôle personnalisé de l'école qui
  // porte circulation.faire tient le guichet, quel que soit son enum.
  const { functions } = useMyFunctions();
  const authorized = functions ? functions.includes('circulation.faire') : null;

  if (authorized === null) return null;
  if (!authorized) {
    return (
      <div>
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Le guichet est réservé au personnel qui tient la circulation.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Guichet de circulation</h1>
      <p className="mt-1 text-sm text-muted">
        Scannez ou saisissez les codes-barres — exemplaire et carte d’adhérent.
      </p>

      {/* `flex-wrap` : les quatre onglets débordaient de 34 px à 375 px et
          faisaient défiler la page latéralement — mesuré sur build de
          production. Même défaut que la barre du haut, sur l'écran où une
          bibliothécaire passe sa journée. */}
      <div className="mt-6 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-5 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'border border-b-0 border-line bg-white text-ink'
                : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'checkout' && <CheckoutTab />}
        {tab === 'return' && <ReturnTab />}
        {tab === 'patron' && <PatronTab />}
        {tab === 'holds' && <HoldsTab />}
      </div>
    </div>
  );
}

// ── Onglet Réservations : file d'attente par notice ───────────
interface HoldRow {
  holdId: string;
  recordId: string;
  title: string;
  status: string;
  position: number;
  patronBarcode: string;
  patronName: string | null;
  expiryDate: string | null;
}

function HoldsTab() {
  const [rows, setRows] = useState<HoldRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<HoldRow[]>('/circulation/holds', {}, getToken())
      .then(setRows)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Chargement impossible.'),
      );
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        {error}
      </p>
    );
  }
  if (!rows) return <p className="text-sm text-muted">Chargement…</p>;
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Aucune réservation active.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3">Document</th>
            <th className="py-2 pr-3">Position</th>
            <th className="py-2 pr-3">Adhérent</th>
            <th className="py-2 pr-3">Statut</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.holdId} className="border-b border-line/60">
              <td className="py-2 pr-3">{h.title}</td>
              <td className="py-2 pr-3">{h.position}</td>
              <td className="py-2 pr-3">
                {h.patronName ?? '—'}
                <span className="ml-2 font-mono text-xs text-muted">{h.patronBarcode}</span>
              </td>
              <td className="py-2 pr-3">
                {h.status === 'AVAILABLE' ? (
                  <Badge tone="green">Mis de côté</Badge>
                ) : (
                  <Badge tone="neutral">En file</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Onglet Prêt ───────────────────────────────────────────────
function CheckoutTab() {
  const [patronBarcode, setPatronBarcode] = useState('');
  const [itemBarcode, setItemBarcode] = useState('');
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await api<CheckoutResult>(
        '/circulation/checkout',
        { method: 'POST', body: JSON.stringify({ itemBarcode, patronBarcode }) },
        getToken(),
      );
      setResult(data);
      setItemBarcode(''); // prêt suivant : même adhérent, autre exemplaire
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Prêt impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Carte d’adhérent
          <Input
            value={patronBarcode}
            onChange={(e) => setPatronBarcode(e.target.value)}
            placeholder="P-2026-0001"
            required
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Exemplaire
          <Input
            value={itemBarcode}
            onChange={(e) => setItemBarcode(e.target.value)}
            placeholder="BIB-000123"
            required
          />
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Enregistrer le prêt'}
        </Button>
      </form>

      {result && (
        <div className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-900">
          <p className="font-semibold">Prêt enregistré : {result.title}</p>
          <p className="mt-0.5">
            À rendre le <strong>{dateFr.format(new Date(result.dueDate))}</strong>
            {' '}({result.rule.loanPeriodDays} jours
            {result.rule.finePerDay > 0
              ? ` · retard : ${fcfa(result.rule.finePerDay)}/jour`
              : ''}
            ).
          </p>
        </div>
      )}
    </Card>
  );
}

// ── Onglet Retour ─────────────────────────────────────────────
function ReturnTab() {
  const [itemBarcode, setItemBarcode] = useState('');
  const [result, setResult] = useState<ReturnResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await api<ReturnResult>(
        '/circulation/return',
        { method: 'POST', body: JSON.stringify({ itemBarcode }) },
        getToken(),
      );
      setResult(data);
      setItemBarcode('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Retour impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Exemplaire rendu
          <Input
            value={itemBarcode}
            onChange={(e) => setItemBarcode(e.target.value)}
            placeholder="BIB-000123"
            required
            autoFocus
          />
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Enregistrer le retour'}
        </Button>
      </form>

      {result && (
        <div className="mt-4 flex flex-col gap-2">
          <div
            className={`rounded-md px-4 py-3 text-sm ${
              result.fine.overdueDays > 0
                ? 'bg-amber-50 text-amber-900'
                : 'bg-green-50 text-green-900'
            }`}
          >
            <p className="font-semibold">Retour enregistré.</p>
            <p className="mt-0.5">
              {result.fine.overdueDays === 0
                ? LIBELLES.amendes.retourDansLesDelais
                : result.fine.amountXof > 0
                  ? LIBELLES.amendes.retourEnRetard(
                      result.fine.overdueDays,
                      fcfa(result.fine.amountXof),
                    )
                  : LIBELLES.amendes.retourEnRetardSansAmende(result.fine.overdueDays)}
            </p>
          </div>
          {result.holdReady && (
            <div className="rounded-md bg-ocre/15 px-4 py-3 text-sm text-ocre">
              <p className="font-semibold">
                ⚠ Ne pas remettre en rayon : exemplaire réservé.
              </p>
              <p className="mt-0.5">
                À mettre de côté — le réservataire a {result.holdReady.pickupDays} jours
                pour venir le retirer.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Onglet Adhérent ───────────────────────────────────────────
function PatronTab() {
  // État du module `amendes` — P4-4. `null` VAUT « PAS ENCORE SU » et garde le
  // comportement d'avant : on n'affirme pas qu'un module est éteint sur la foi
  // d'une réponse qui n'est pas arrivée.
  const { modulesActifs } = useModulesActifs();
  const amendesActives = modulesActifs === null ? null : modulesActifs.includes('amendes');
  const [barcode, setBarcode] = useState('');
  const [situation, setSituation] = useState<PatronSituation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSituation(null);
    setLoading(true);
    try {
      const token = getToken();
      const list = await api<{ patrons: { id: string; barcode: string }[] }>(
        `/patrons?q=${encodeURIComponent(barcode.trim())}`,
        {},
        token,
      );
      const match =
        list.patrons.find((p) => p.barcode === barcode.trim()) ?? list.patrons[0];
      if (!match) {
        setError('Aucun adhérent trouvé pour ce code-barres.');
        return;
      }
      setSituation(
        await api<PatronSituation>(`/circulation/patrons/${match.id}`, {}, token),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Recherche impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
            Carte d’adhérent
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="P-2026-0001"
              required
              autoFocus
            />
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? 'Recherche…' : 'Consulter'}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
      </Card>

      {situation && (
        <>
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-serif text-xl font-bold">
                  {situation.patron.user
                    ? `${situation.patron.user.firstName} ${situation.patron.user.lastName}`
                    : situation.patron.barcode}
                </h2>
                <p className="text-sm text-muted">
                  {situation.patron.barcode} · {situation.patron.category}
                  {situation.patron.expiryDate &&
                    ` · carte valable jusqu'au ${dateFr.format(new Date(situation.patron.expiryDate))}`}
                </p>
              </div>
              {amendesActives === false ? (
                // Module éteint : il ne reste que la DETTE, et seulement si elle
                // existe. Un « Aucune amende » vert ici laisserait croire qu'un
                // calcul a tourné et n'a rien trouvé.
                situation.fines.recordedXof > 0 && (
                  <Badge tone="ocre">
                    {LIBELLES.amendes.dues(fcfa(situation.fines.recordedXof))}
                  </Badge>
                )
              ) : situation.fines.totalXof > 0 ? (
                <Badge tone="ocre">Amendes : {fcfa(situation.fines.totalXof)}</Badge>
              ) : (
                <Badge tone="green">Aucune amende</Badge>
              )}
            </div>
            {amendesActives === false
              ? situation.fines.recordedXof > 0 && (
                  <p className="mt-2 text-sm text-muted">{LIBELLES.amendes.conservees}</p>
                )
              : situation.fines.totalXof > 0 && (
                  <p className="mt-2 text-sm text-muted">
                    Constatées aux retours : {fcfa(situation.fines.recordedXof)} · en cours
                    sur les retards : {fcfa(situation.fines.accruingXof)}
                  </p>
                )}
          </Card>

          <Card>
            <h3 className="font-serif text-lg font-bold">
              Prêts en cours ({situation.checkouts.length})
            </h3>
            {situation.checkouts.length === 0 && (
              <p className="mt-2 text-sm text-muted">Aucun prêt en cours.</p>
            )}
            <div className="mt-2 flex flex-col gap-2">
              {situation.checkouts.map((checkout) => (
                <div
                  key={checkout.checkoutId}
                  className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-semibold">{checkout.title}</p>
                    <p className="text-muted">
                      {checkout.itemBarcode} · à rendre le{' '}
                      {dateFr.format(new Date(checkout.dueDate))}
                      {checkout.renewals > 0 && ` · renouvelé ×${checkout.renewals}`}
                    </p>
                  </div>
                  {checkout.overdue ? (
                    <Badge tone="ocre">
                      {/*
                        ⚠ « En retard · 0 FCFA » écrit vingt-deux jours de retard
                        comme une ligne à zéro : le montant est exact, la lecture
                        est fausse. Le retard appartient à la circulation et se
                        dit toujours ; le montant n'est dit que s'il existe.
                        Trouvé À L'ÉCRAN, module éteint — aucun test unitaire du
                        lot ne montait cette liste.
                      */}
                      En retard
                      {checkout.accruedFineXof > 0 && ` · ${fcfa(checkout.accruedFineXof)}`}
                    </Badge>
                  ) : (
                    <Badge tone="green">Dans les délais</Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-serif text-lg font-bold">
              Réservations actives ({situation.holds.length})
            </h3>
            {situation.holds.length === 0 && (
              <p className="mt-2 text-sm text-muted">Aucune réservation.</p>
            )}
            <div className="mt-2 flex flex-col gap-2">
              {situation.holds.map((hold) => (
                <div
                  key={hold.id}
                  className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm"
                >
                  <p className="font-semibold">{hold.record.title}</p>
                  <Badge tone={hold.status === 'AVAILABLE' ? 'green' : 'neutral'}>
                    {hold.status === 'AVAILABLE' ? 'À retirer' : 'En attente'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
