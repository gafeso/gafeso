'use client';

import { DragEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Button, Card, Spinner } from '@/components/ui';

interface ImportRowError {
  line: number;
  matricule: string | null;
  reason: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

export default function ImportEtudiantsPage() {
  const { functions } = useMyFunctions();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tant que les fonctions ne sont pas résolues, on n'affiche rien de sensible.
  const allowed = functions?.includes('etudiants.importer');

  async function upload(file: File) {
    setResult(null);
    setError(null);
    setFileName(file.name);
    setLoading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      // FormData → pas de Content-Type manuel (le navigateur pose la frontière
      // multipart). On ne peut donc pas passer par le client `api` JSON.
      const res = await fetch('/api/accounts/expected-students/import', {
        method: 'POST',
        credentials: 'same-origin', // auth via cookie httpOnly bc_token
        body,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          Array.isArray(payload?.message)
            ? payload.message.join(' · ')
            : (payload?.message ?? 'Import refusé.'),
        );
      }
      setResult(payload as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import impossible.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  if (functions && !allowed) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission d’importer des étudiants (fonction
        «&nbsp;etudiants.importer&nbsp;»).
      </Alert>
    );
  }

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
            if (file) void upload(file);
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
          {loading ? (
            <span className="inline-flex items-center gap-2 text-muted">
              <Spinner /> Import en cours…
            </span>
          ) : (
            <>
              <span className="font-semibold text-ink">
                Glissez un fichier CSV ici, ou cliquez pour choisir
              </span>
              {fileName && <span className="text-muted">Dernier fichier : {fileName}</span>}
            </>
          )}
        </div>
      </Card>

      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {result && (
        <div className="mt-4">
          <Alert tone={result.errors.length === 0 ? 'success' : 'error'}>
            {result.imported} étudiant(s) importé(s)
            {result.errors.length > 0
              ? `, ${result.errors.length} ligne(s) en erreur (voir ci-dessous).`
              : ' — aucune erreur.'}
          </Alert>

          {result.errors.length > 0 && (
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
                  {result.errors.map((err, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-mono">{err.line}</td>
                      <td className="px-4 py-2.5 font-mono">{err.matricule ?? '—'}</td>
                      <td className="px-4 py-2.5 text-red-800">{err.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
