'use client';

import { DragEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.importEtudiants;

interface ImportRowError {
  line: number;
  matricule: string | null;
  reason: string;
}

interface LigneRetiree {
  matricule: string;
  nom: string;
  className: string;
}

/** Ce que rend `POST /accounts/expected-students/import/apercu` — aucune écriture. */
interface Apercu {
  aImporter: number;
  enErreur: number;
  errors: ImportRowError[];
  classes: string[];
  retraits: { total: number; premiers: LigneRetiree[] };
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportRowError[];
  /** Servi par l'API depuis le premier jour. Il s'affiche : une suppression se rapporte. */
  retires: number;
}

function corpsMultipart(file: File, champs: Record<string, string> = {}): FormData {
  const body = new FormData();
  body.append('file', file);
  for (const [cle, valeur] of Object.entries(champs)) body.append(cle, valeur);
  return body;
}

function messageDeRefus(payload: unknown, defaut: string): string {
  const m = (payload as { message?: unknown } | null)?.message;
  if (Array.isArray(m)) return m.join(' · ');
  return typeof m === 'string' ? m : defaut;
}

function TableErreurs({ errors }: { errors: ImportRowError[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2.5 font-semibold">Ligne</th>
            <th className="px-4 py-2.5 font-semibold">Matricule</th>
            <th className="px-4 py-2.5 font-semibold">Motif du rejet</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((err, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 font-mono">{err.line}</td>
              <td className="px-4 py-2.5 font-mono">{err.matricule ?? '—'}</td>
              <td className="px-4 py-2.5 text-red-800">{err.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImportEtudiantsPage() {
  const { functions } = useMyFunctions();
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ⚠ Le désaccord de nombre n'est PAS une erreur : c'est la garde qui joue, et
  // elle a une suite utile. Il a donc son propre état, et son propre ton.
  const [desaccord, setDesaccord] = useState<string | null>(null);
  // ⚠ DÉCOCHÉE : la suppression est un second geste explicite, jamais l'effet de
  // bord du premier.
  //
  // ⚠ ET CE N'EST PAS CETTE LIGNE QUI LE TIENT — mesuré par contrôle négatif :
  // la mettre à `true` ne fait tomber aucun test, parce que la case n'existe
  // qu'APRÈS un aperçu et que `analyser()` la remet à `false` à chaque fichier.
  // C'est ce `setSupprimer(false)`-là qui porte la propriété ; le retirer fait
  // tomber trois tests. Ne pas « simplifier » l'un en croyant l'autre suffisant.
  const [supprimer, setSupprimer] = useState(false);
  const [enCours, setEnCours] = useState<'apercu' | 'import' | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tant que les fonctions ne sont pas résolues, on n'affiche rien de sensible.
  const allowed = functions?.includes('outils.lecteurs');

  // FormData → pas de Content-Type manuel (le navigateur pose la frontière
  // multipart). On ne peut donc pas passer par le client `api` JSON.
  //
  // ⚠ ET LE `fetch` RESTE ÉCRIT EN ENTIER À CHAQUE APPEL, chemin littéral et
  // `method` ensemble. Une première rédaction les avait factorisés dans un
  // `envoyer(url, …)` : `routes-connues-de-l-api.spec.ts` a cessé de voir les
  // deux appels — il lit le verbe DANS les parenthèses de l'appel qui porte le
  // chemin. Un garde qui lit la source ne suit pas les variables ; ce qu'on
  // factorise ici, c'est le corps, jamais l'adresse.

  /** Premier geste sur un fichier : on REGARDE. L'import ne part jamais d'ici. */
  async function analyser(file: File) {
    setFichier(file);
    setApercu(null);
    setResult(null);
    setError(null);
    setDesaccord(null);
    setSupprimer(false);
    setEnCours('apercu');
    try {
      const res = await fetch('/api/accounts/expected-students/import/apercu', {
        method: 'POST',
        credentials: 'same-origin', // auth via cookie httpOnly bc_token
        body: corpsMultipart(file),
      });
      const payload: unknown = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(messageDeRefus(payload, 'Lecture du fichier refusée.'));
      setApercu(payload as Apercu);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture du fichier impossible.');
    } finally {
      setEnCours(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  /** Second geste, et le seul qui écrit. */
  async function importer() {
    if (!fichier || !apercu || enCours) return;
    // Le nombre renvoyé est celui que l'écran a AFFICHÉ, jamais un recompte :
    // c'est cette égalité-là que l'API vérifie.
    const remplace = supprimer && apercu.retraits.total > 0;
    setError(null);
    setDesaccord(null);
    setEnCours('import');
    try {
      const res = await fetch('/api/accounts/expected-students/import', {
        method: 'POST',
        credentials: 'same-origin',
        body: corpsMultipart(
          fichier,
          remplace
            ? { remplacer: 'true', confirmeRetraits: String(apercu.retraits.total) }
            : {},
        ),
      });
      const payload: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = messageDeRefus(payload, 'Import refusé.');
        // Un refus SUR UN REMPLACEMENT est la garde de concordance : l'aperçu
        // est conservé, et on propose le seul geste qui débloque.
        if (remplace && res.status === 400) {
          setDesaccord(message);
          return;
        }
        throw new Error(message);
      }
      setResult(payload as ImportResult);
      setApercu(null);
      setSupprimer(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import impossible.');
    } finally {
      setEnCours(null);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void analyser(file);
  }

  if (functions && !allowed) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission d’importer des étudiants (fonction
        «&nbsp;outils.lecteurs&nbsp;»).
      </Alert>
    );
  }

  const retraits = apercu?.retraits.total ?? 0;

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Import des étudiants attendus</h1>
      <p className="mt-1 text-sm text-muted">
        Chargez la liste de votre établissement (CSV, UTF-8). Un étudiant dont le
        matricule + email figurent dans cette liste voit son compte activé
        automatiquement à l’inscription.
      </p>

      <Card className="mt-5">
        <p className="text-sm font-semibold">Colonnes acceptées</p>
        <p className="mt-1 text-sm text-muted">
          <code className="rounded bg-paper px-1">matricule</code>,{' '}
          <code className="rounded bg-paper px-1">email</code>,{' '}
          <code className="rounded bg-paper px-1">firstName</code>|
          <code className="rounded bg-paper px-1">prenom</code>,{' '}
          <code className="rounded bg-paper px-1">lastName</code>|
          <code className="rounded bg-paper px-1">nom</code>,{' '}
          <code className="rounded bg-paper px-1">className</code>|
          <code className="rounded bg-paper px-1">classe</code> — la 1re ligne est
          l’en-tête.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void analyser(file);
          }}
        />
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center text-sm transition-colors ${
            dragging ? 'border-ocre bg-ocre/5' : 'border-line hover:border-ocre/50'
          }`}
        >
          {enCours ? (
            <span className="inline-flex items-center gap-2 text-muted">
              <Spinner /> {enCours === 'apercu' ? T.analyse : T.enCours}
            </span>
          ) : (
            <>
              <span className="font-semibold text-ink">
                Glissez un fichier CSV ici, ou cliquez pour choisir
              </span>
              {fichier && <span className="text-muted">Dernier fichier : {fichier.name}</span>}
            </>
          )}
        </div>
      </Card>

      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {apercu && (
        <Card className="mt-4">
          <h2 className="font-serif text-xl font-bold">{T.apercuTitre}</h2>
          <p className="mt-1 text-sm text-muted">{T.rienEcrit}</p>

          <ul className="mt-4 space-y-1 text-sm">
            <li>
              {apercu.aImporter > 0 ? T.lignesAImporter(apercu.aImporter) : T.aucuneLigne}
            </li>
            {apercu.classes.length > 0 && (
              <li className="text-muted">
                {T.classesConcernees} : {apercu.classes.join(', ')}
              </li>
            )}
            {apercu.enErreur > 0 && (
              <li className="text-red-800">{T.lignesEnErreur(apercu.enErreur)}</li>
            )}
          </ul>

          {apercu.errors.length > 0 && <TableErreurs errors={apercu.errors} />}

          {retraits > 0 && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50/60 p-4">
              <p className="text-sm font-semibold text-red-900">{T.retraitsTitre(retraits)}</p>
              <p className="mt-1 text-sm text-red-900/80">{T.retraitsPortee}</p>
              <ul className="mt-3 space-y-0.5 text-sm">
                {apercu.retraits.premiers.map((l) => (
                  <li key={l.matricule}>
                    <span className="font-semibold">{l.nom}</span>{' '}
                    <span className="text-muted">
                      — {l.className} · <span className="font-mono">{l.matricule}</span>
                    </span>
                  </li>
                ))}
                {retraits > apercu.retraits.premiers.length && (
                  <li className="text-muted">
                    {T.retraitsEtAutres(retraits - apercu.retraits.premiers.length)}
                  </li>
                )}
              </ul>

              <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-red-900">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={supprimer}
                  onChange={(e) => setSupprimer(e.target.checked)}
                />
                <span>{T.caseSupprimer(retraits)}</span>
              </label>
              <p className="mt-1 pl-6 text-sm text-red-900/80">{T.conserverParDefaut}</p>
            </div>
          )}

          {desaccord && (
            <Alert tone="warning" className="mt-4">
              <span className="font-semibold">{T.desaccordTitre}</span> — {desaccord}{' '}
              {T.desaccordSuite}
            </Alert>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void importer()}
              disabled={enCours !== null || apercu.aImporter === 0}
            >
              {supprimer && retraits > 0 ? T.importerEtSupprimer(retraits) : T.importer}
            </Button>
            {desaccord && fichier && (
              <Button
                variant="ghost"
                onClick={() => void analyser(fichier)}
                disabled={enCours !== null}
              >
                {T.relancerApercu}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => inputRef.current?.click()}
              disabled={enCours !== null}
            >
              {T.changerDeFichier}
            </Button>
          </div>
        </Card>
      )}

      {result && (
        <div className="mt-4">
          <Alert tone={result.errors.length === 0 ? 'success' : 'error'}>
            {T.importees(result.imported)}
            {result.errors.length > 0
              ? T.avecErreurs(result.errors.length)
              : T.sansErreur}{' '}
            {result.retires > 0 ? T.retiresFaits(result.retires) : T.aucunRetrait}
          </Alert>

          {result.errors.length > 0 && <TableErreurs errors={result.errors} />}

          <p className="mt-4 text-sm text-muted">
            Corrigez les lignes en erreur dans votre fichier puis relancez l’import
            (il est idempotent : réimporter un matricule déjà présent le met à jour).{' '}
            <Link href="/admin/comptes" className="font-semibold text-ocre underline">
              Voir la file d’activation
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
