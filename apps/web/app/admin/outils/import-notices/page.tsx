'use client';

// Import de notices MARC — Outils · Catalogue.
//
// Extrait de app/admin/catalogue/page.tsx lors de la refonte de navigation :
// l'opération vivait sous forme de bouton dans l'écran de catalogage, ce qui
// laissait l'onglet « Outils » nommé d'après une opération vers laquelle il ne
// pouvait pas pointer. Le bloc a été DÉPLACÉ, pas réécrit — même appel, même
// compte rendu à trois cas, mêmes libellés.
//
// Pas de garde de fonction côté client : ni le catalogue ni le récolement n'en
// posent. La navigation masque l'entrée, l'API refuse l'action, et chaque page
// resterait de toute façon sans autorité sur le sujet.

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.importNotices;

/**
 * Compte rendu d'import MARC, tel que l'API le renvoie.
 *
 * TROIS cas distincts, jamais fondus en deux : « la source ne portait pas de
 * domaine » et « elle en portait un qu'on n'a pas reconnu » sont deux
 * situations différentes pour la bibliothécaire. Les afficher séparément est
 * la raison d'être de cet écran — un compte rendu que personne ne lit ne vaut
 * pas mieux qu'un silence.
 */
type ImportReport = {
  imported: number;
  skipped: number;
  categories: {
    sansValeur: number;
    reconnues: number;
    inconnues: number;
    /** Déjà triées par occurrences décroissantes côté serveur — ordre respecté. */
    valeursInconnues: { valeur: string; occurrences: number }[];
  };
};

export default function ImportNoticesPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [marcType, setMarcType] = useState('UNIMARC');
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onImportMarc(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setNotice(null);
    setError(null);
    setImportReport(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('marcFormat', marcType);
      const res = await fetch('/api/cataloging/records/import-marc', {
        method: 'POST',
        credentials: 'same-origin', // auth via cookie httpOnly bc_token
        body,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? T.importRefuse);
      const result = (await res.json()) as ImportReport;
      setImportReport(result);
      setNotice(T.importReussi(result.imported, result.skipped));
    } catch (err) {
      setError(err instanceof Error ? err.message : T.importImpossible);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{T.titre}</h1>
      <p className="mt-1 text-sm text-muted">
        {T.introduction}
      </p>

      <Card className="mt-5 max-w-2xl">
        <h2 className="font-serif text-lg font-bold">{T.fichierAImporter}</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {T.formatMarc}
            <select
              value={marcType}
              onChange={(e) => setMarcType(e.target.value)}
              className="rounded-md border border-line bg-white px-2 py-2 text-sm"
              aria-label={T.formatMarc}
            >
              {/* Dialecte du fichier ENTRANT : Gafeso lit les deux et range le
                  résultat dans sa propre notice. Rien à voir avec le format de
                  sortie, qui est du MarcXchange (UNIMARC). */}
              <option value="UNIMARC">UNIMARC</option>
              <option value="MARC21">MARC21</option>
            </select>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".mrc,.marc,.iso,application/marc,application/octet-stream"
            onChange={onImportMarc}
            className="hidden"
          />
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            {T.importerUnFichier}
          </Button>
        </div>
      </Card>

      {notice && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {importReport && (
        <Card className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-lg font-bold">{T.compteRenduTitre}</h2>
            <button
              type="button"
              onClick={() => setImportReport(null)}
              className="text-sm text-muted underline hover:text-ink"
            >
              {T.masquer}
            </button>
          </div>

          <p className="mt-2 text-sm">
            <strong>{importReport.imported}</strong> notice(s) importée(s)
            {importReport.skipped > 0 && <>{T.ignoreesSansTitre(importReport.skipped)}</>}
          </p>

          {/* Les TROIS cas, séparés. Les confondre serait un silence de plus. */}
          <h3 className="mt-4 text-sm font-medium">{T.domaines}</h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-line px-3 py-2">
              <dt className="text-xs text-muted">{T.casReconnus}</dt>
              <dd className="text-lg font-semibold">{importReport.categories.reconnues}</dd>
            </div>
            <div className="rounded-md border border-line px-3 py-2">
              <dt className="text-xs text-muted">{T.casAbsents}</dt>
              <dd className="text-lg font-semibold">{importReport.categories.sansValeur}</dd>
            </div>
            <div className="rounded-md border border-line px-3 py-2">
              <dt className="text-xs text-muted">{T.casInconnus}</dt>
              <dd className="text-lg font-semibold">{importReport.categories.inconnues}</dd>
            </div>
          </dl>

          {importReport.categories.valeursInconnues.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium">{T.valeursNonReconnues}</h3>
              <p className="mt-1 text-sm text-muted">
                {T.valeursNonReconnuesTexte}{' '}
                <Link href="/admin/categories" className="underline">
                  Domaines
                </Link>
                {T.valeursNonReconnuesSuite}
              </p>
              <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                {importReport.categories.valeursInconnues.map((v) => (
                  <li
                    key={v.valeur}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{v.valeur}</span>
                    <span className="text-muted">
                      {T.occurrences(v.occurrences)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
