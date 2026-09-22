'use client';

// Écran de récolement (vague 2 §2) : scan à la douchette (le champ reçoit le
// code + Entrée), feedback immédiat, progression, rapport et actions.

import { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Button, Card } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.recolement;

type ScanResult = 'SEEN' | 'ALREADY' | 'UNKNOWN' | 'OUT_OF_SCOPE' | 'ON_LOAN';

interface ItemInfo {
  id: string;
  barcode: string;
  title: string;
  callNumber: string | null;
  location: string | null;
  status: string;
}
interface SessionDetail {
  id: string;
  name: string;
  scope: string;
  location: string | null;
  status: string;
  progress: { expected: number; scanned: number; totalScans: number };
}
interface ScanResponse {
  result: ScanResult;
  barcode: string;
  item: ItemInfo | null;
}
interface Report {
  counts: { seen: number; missing: number; onLoan: number; unexpected: number; expected: number };
  seen: ItemInfo[];
  missing: ItemInfo[];
  onLoan: ItemInfo[];
  unexpected: { barcode: string; result: ScanResult }[];
}

const RESULT_META: Record<ScanResult, { label: string; cls: string }> = {
  SEEN: { label: 'Vu ✓', cls: 'bg-green-100 text-green-900' },
  ALREADY: { label: 'Déjà scanné', cls: 'bg-amber-100 text-amber-900' },
  UNKNOWN: { label: 'Code inconnu', cls: 'bg-red-100 text-red-900' },
  OUT_OF_SCOPE: { label: 'Hors périmètre', cls: 'bg-orange-100 text-orange-900' },
  ON_LOAN: { label: 'Actuellement en prêt', cls: 'bg-blue-100 text-blue-900' },
};

interface LogLine extends ScanResponse {
  key: number;
  /** ⚠ La ligne RESTE quand on annule, barrée : on voit ce qu'on vient de
   *  défaire. La retirer donnerait un journal qui ment sur ce qui s'est passé. */
  annule?: boolean;
}

export default function RecolementSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aAnnuler, setAAnnuler] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  const loadSession = useCallback(async () => {
    setSession(await api<SessionDetail>(`/inventory/sessions/${id}`, {}, getToken()));
  }, [id]);

  const loadReport = useCallback(async () => {
    setReport(await api<Report>(`/inventory/sessions/${id}/report`, {}, getToken()));
  }, [id]);

  useEffect(() => {
    void loadSession().catch((e) =>
      setError(e instanceof ApiError ? e.message : 'Session introuvable.'),
    );
    void loadReport().catch(() => setReport(null));
  }, [loadSession, loadReport]);

  async function submitScan(value: string) {
    const code = value.trim();
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<ScanResponse>(
        `/inventory/sessions/${id}/scan`,
        { method: 'POST', body: JSON.stringify({ barcode: code }) },
        getToken(),
      );
      counter.current += 1;
      setLog((prev) => [{ ...res, key: counter.current }, ...prev].slice(0, 20));
      setBarcode('');
      // La progression suit chaque scan « vu » du périmètre.
      await loadSession();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Scan impossible.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  /**
   * ⚠ ANNULER UN SCAN — la porte manquante, relevée par le backend.
   *
   * L'API l'écrit : « sans elle, une erreur de scan DÉFAIT SILENCIEUSEMENT le
   * récolement — l'exemplaire est marqué vu pour toujours, "marquer les
   * manquants" ne le signale pas, et un exemplaire réellement absent reste
   * disponible au catalogue ».
   *
   * ⚠ UNE SEULE ACTION, DEUX PORTES, et elles servent deux MOMENTS :
   *  · le journal, quand l'erreur se voit tout de suite — le code-barres est
   *    déjà là, le faire retaper serait une punition ;
   *  · le champ, quand elle se voit plus tard — après un rechargement, le
   *    journal est vide, et le rapport ne rend PAS la liste des « vus » : le
   *    code-barres est alors la seule prise.
   *
   * ⚠ ON N'INVENTE AUCUN MESSAGE DE REFUS. L'API en a deux, précis — session
   * close, ou aucun scan à ce code — et ce sont les siens qu'on affiche.
   */
  async function annulerScan(code: string) {
    const barcode = code.trim();
    if (!barcode || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(
        `/inventory/sessions/${id}/scans/${encodeURIComponent(barcode)}`,
        { method: 'DELETE' },
        getToken(),
      );
      setLog((prev) =>
        prev.map((l) => (l.barcode === barcode ? { ...l, annule: true } : l)),
      );
      setNotice(T.annule(barcode));
      setAAnnuler('');
      // ⚠ LES DEUX : la progression ET le rapport. Annuler change le compte
      // des vus, et un rapport laissé en place afficherait l'ancien.
      await Promise.all([loadSession(), loadReport()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Annulation impossible.');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Les douchettes USB « tapent » le code puis un Entrée.
    if (e.key === 'Enter') {
      e.preventDefault();
      void submitScan(barcode);
    }
  }

  async function refreshReport() {
    setError(null);
    try {
      await loadReport();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rapport indisponible.');
    }
  }

  /**
   * ⚠ ROUVRIR — la seconde porte manquante relevée par le backend.
   *
   * L'API l'écrit : « sans elle, un clic coûtait le récolement entier — `scan`
   * refuse sur une session close en disant "rouvrez-en une NOUVELLE",
   * c'est-à-dire recommencer sur plusieurs milliers d'exemplaires ».
   *
   * ⚠ Elle recharge la session ET le rapport : rouvrir change l'état ET ce que
   * le rapport signifie (une session close n'accepte plus de scan ; rouverte,
   * si). Laisser l'un des deux en place ferait dire à l'écran l'inverse de ce
   * qui vient de se passer.
   */
  async function rouvrirSession() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/inventory/sessions/${id}/reopen`, { method: 'POST' }, getToken());
      setNotice(T.rouverte);
      await Promise.all([loadSession(), loadReport()]);
    } catch (err) {
      // ⚠ Le refus de l'API est précis — « le catalogue a été modifié, ouvrez
      // une nouvelle session ». On n'en invente pas un plus court.
      setError(err instanceof ApiError ? err.message : 'Réouverture impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function markMissing() {
    if (!confirm('Marquer tous les manquants comme « introuvables » (statut MISSING) ?')) return;
    try {
      const r = await api<{ marked: number }>(
        `/inventory/sessions/${id}/mark-missing`,
        { method: 'POST' },
        getToken(),
      );
      setNotice(`${r.marked} exemplaire(s) marqué(s) introuvable(s).`);
      await Promise.all([loadReport(), loadSession()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    }
  }

  async function closeSession() {
    if (!confirm('Clôturer la session ? Le scan ne sera plus possible.')) return;
    try {
      await api(`/inventory/sessions/${id}/close`, { method: 'POST' }, getToken());
      await loadSession();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Clôture impossible.');
    }
  }

  if (!session) {
    return (
      <div>
        <Link href="/admin/recolement" className="text-sm text-muted hover:text-ocre">
          ← Récolement
        </Link>
        {error && <p className="mt-4 text-sm text-red-800">{error}</p>}
      </div>
    );
  }

  const open = session.status === 'OPEN';
  /**
   * ⚠ TROIS ÉTATS, PAS DEUX. Cet écran n'en connaissait que deux — ouverte, ou
   * « clôturée ». La base en porte trois, et le troisième existe PRÉCISÉMENT
   * pour que « rouvrir » puisse refuser : une session dont on a marqué les
   * manquants a CHANGÉ LE CATALOGUE.
   * Les confondre aurait donné un bouton dont la seule issue est un refus.
   */
  const appliquee = session.status === 'APPLIED';
  const etat = open ? T.etatEnCours : appliquee ? T.etatAppliquee : T.etatCloturee;
  const p = session.progress;
  const pct = p.expected ? Math.round((p.scanned / p.expected) * 100) : 0;

  return (
    <div>
      <Link href="/admin/recolement" className="text-sm text-muted hover:text-ocre">
        ← Récolement
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">{session.name}</h1>
          <p className="mt-1 text-sm text-muted">
            Périmètre : {session.scope === 'LOCATION' ? session.location : 'tout le fonds'} ·{' '}
            {etat}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/inventory/sessions/${id}/report.csv`}
            download
            className="inline-flex items-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-line/40"
          >
            Export CSV
          </a>
          {open && (
            <Button variant="ghost" onClick={closeSession}>
              Clôturer
            </Button>
          )}
          {/* ⚠ LA PORTE MANQUANTE, et elle ne s'affiche QUE sur une session
              qu'on peut rouvrir. Sur une session appliquée, c'est la PHRASE
              qui prend sa place — voir plus bas : un bouton dont la seule
              issue est un refus se lit comme une panne. */}
          {!open && !appliquee && (
            <Button variant="ghost" onClick={rouvrirSession} disabled={busy}>
              {T.rouvrir}
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* Progression */}
      <div className="mt-4">
        <div className="flex justify-between text-sm text-muted">
          <span>
            {p.scanned} / {p.expected} exemplaires vus
          </span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-line/50">
          <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ⚠ À LA PLACE DU BOUTON, PAS À CÔTÉ. On ne propose pas un geste dont la
          seule issue est un refus — on dit pourquoi il n'est pas là, à
          l'endroit exact où on le cherchait. */}
      {appliquee && (
        <p className="mt-4 rounded-md border border-line bg-paper px-4 py-3 text-sm">
          {T.dejaAppliquee}
        </p>
      )}

      {/* Scan */}
      {open && (
        <Card className="mt-4">
          <label className="text-sm font-medium">Scanner un exemplaire</label>
          <div className="mt-2 flex gap-2">
            {/* input natif : la douchette a besoin du focus persistant (ref) */}
            <input
              ref={inputRef}
              autoFocus
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Douchette ou saisie manuelle, puis Entrée"
              aria-label="Code-barres à scanner"
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocre"
            />
            <Button onClick={() => void submitScan(barcode)} disabled={busy}>
              Valider
            </Button>
          </div>
          {/* ⚠ SECONDE PORTE — l'erreur vue APRÈS COUP, et c'est le cas qui
              arrive vraiment. Après un rechargement le journal est vide, et le
              rapport ne rend PAS la liste des « vus » : le code-barres est
              alors la seule prise sur un exemplaire pointé par erreur. */}
          <div className="mt-4 border-t border-line pt-3">
            <label className="text-sm font-medium" htmlFor="annuler-scan">
              {T.annulerScan}
            </label>
            <p className="mt-0.5 text-xs text-muted">{T.aQuoiCaSert}</p>
            <div className="mt-2 flex gap-2">
              <input
                id="annuler-scan"
                value={aAnnuler}
                onChange={(e) => setAAnnuler(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void annulerScan(aAnnuler);
                  }
                }}
                placeholder={T.codeBarresAAnnuler}
                aria-label={T.codeBarresAAnnuler}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocre"
              />
              {/* ⚠ Son nom VISIBLE est « Annuler » — le titre juste au-dessus
                  dit de quoi il s'agit. Son nom ACCESSIBLE le répète, parce
                  qu'un bouton annoncé « Annuler » tout court ne dit rien à qui
                  ne voit pas ce qui l'entoure. */}
              <Button
                variant="ghost"
                aria-label={T.annulerScan}
                onClick={() => void annulerScan(aAnnuler)}
                disabled={busy || !aAnnuler.trim()}
              >
                {T.annulerCeScan}
              </Button>
            </div>
          </div>

          {/* Journal des derniers scans (feedback immédiat) */}
          {log.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {log.map((l) => {
                const meta = RESULT_META[l.result];
                return (
                  <li
                    key={l.key}
                    className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${
                      l.annule ? 'bg-line/40 text-muted line-through' : meta.cls
                    }`}
                  >
                    <span className="font-mono">{l.barcode}</span>
                    <span className="truncate px-2 text-xs">{l.item?.title ?? ''}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">
                        {l.annule ? T.ligneAnnulee : meta.label}
                      </span>
                      {/* ⚠ PREMIÈRE PORTE — seulement sur un scan qui a COMPTÉ.
                          Un code inconnu ou hors périmètre n'a rien ajouté au
                          récolement : proposer de l'annuler serait un bouton
                          sans effet, et l'API répondrait « rien à annuler ». */}
                      {!l.annule && (l.result === 'SEEN' || l.result === 'ALREADY') && (
                        <button
                          type="button"
                          onClick={() => void annulerScan(l.barcode)}
                          disabled={busy}
                          aria-label={T.annulerLeScanDe(l.barcode)}
                          className="rounded px-2 py-0.5 text-xs font-semibold underline underline-offset-2 disabled:opacity-50"
                        >
                          {T.annulerCeScan}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {/* Rapport */}
      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold">Rapport</h2>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={refreshReport}>
              Rafraîchir
            </Button>
            {report && report.counts.missing > 0 && (
              <Button onClick={markMissing}>Marquer les manquants</Button>
            )}
          </div>
        </div>
        {!report ? (
          <p className="mt-2 text-sm text-muted">Rapport indisponible.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { k: 'Vus', v: report.counts.seen, cls: 'text-green-800' },
                { k: 'Manquants', v: report.counts.missing, cls: 'text-red-800' },
                { k: 'En prêt', v: report.counts.onLoan, cls: 'text-blue-800' },
                { k: 'Inattendus', v: report.counts.unexpected, cls: 'text-orange-800' },
              ].map((c) => (
                <div key={c.k} className="rounded-lg border border-line bg-paper px-3 py-2">
                  <div className={`text-2xl font-bold ${c.cls}`}>{c.v}</div>
                  <div className="text-xs text-muted">{c.k}</div>
                </div>
              ))}
            </div>

            {report.missing.length > 0 && (
              <ReportList
                title={LIBELLES.rapportRecolement.manquants}
                rows={report.missing.map((i) => [i.barcode, i.callNumber ?? '—', i.title, i.status])}
              />
            )}
            {/*
              ⚠ « VUS » MANQUAIT, et c'est la seule des quatre catégories que
              l'écran ne montrait pas. Le COMPTE était là, dans la tuile verte ;
              la LISTE — servie par l'API, déclarée dans le type juste
              au-dessus — était jetée.

              Ce n'est pas un choix d'affichage : une bibliothécaire qui veut
              vérifier qu'un exemplaire précis a bien été scanné ne pouvait que
              constater son absence de « Manquants », ce qui n'est pas la même
              chose quand le périmètre est partiel (une session par salle ne
              attend pas tout le fonds).

              ⚠ Et elle ne coûte RIEN de plus : `GET /report` transporte déjà
              les quatre listes. La réduction de charge viendra du chemin
              PAGINÉ (`counts` + `items/:categorie`), qui attend que le backend
              le pousse — voir la passation du 22 septembre.
            */}
            {report.seen.length > 0 && (
              <ReportList
                title={LIBELLES.rapportRecolement.vus}
                rows={report.seen.map((i) => [i.barcode, i.callNumber ?? '—', i.title])}
              />
            )}
            {report.unexpected.length > 0 && (
              <ReportList
                title={LIBELLES.rapportRecolement.inattendus}
                rows={report.unexpected.map((u) => [
                  u.barcode,
                  u.result === 'UNKNOWN' ? 'Code inconnu' : 'Hors périmètre',
                ])}
              />
            )}
            {report.onLoan.length > 0 && (
              <ReportList
                title={LIBELLES.rapportRecolement.enPret}
                rows={report.onLoan.map((i) => [i.barcode, i.callNumber ?? '—', i.title])}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function ReportList({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-1 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {r.map((cell, j) => (
                  <td key={j} className={`px-3 py-1.5 ${j === 0 ? 'font-mono' : 'text-muted'}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
