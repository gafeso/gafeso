'use client';

// « Récupérer une notice » (cahier interop vague 2 §2) : recherche une notice
// sur les serveurs SRU configurés (BnF, LoC…) par ISBN ou titre, et laisse
// l'utilisateur en choisir une pour pré-remplir le formulaire de saisie. Le
// pré-remplissage n'écrit QUE des champs bruts (titre, auteurs, éditeur…) ; la
// création réelle passe ensuite par le chemin habituel (autorités + validation
// serveur), sans aucun contournement.

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Button, Input } from '@/components/ui';

export interface LookupCandidate {
  source: string;
  title: string;
  titleComplement: string | null;
  contributors: { name: string; role: string }[];
  publisher: string | null;
  publicationCity: string | null;
  publishYear: number | null;
  isbn: string | null;
  language: string | null;
  recordType: string | null;
}

interface LookupResult {
  candidates: LookupCandidate[];
  errors: { source: string; message: string }[];
}

const CONTRIB_LABEL: Record<string, string> = {
  AUTEUR_PRINCIPAL: 'aut.',
  AUTEUR_SECONDAIRE: 'coll.',
  DIRECTEUR_MEMOIRE: 'dir.',
};

export function RecordLookup({ onApply }: { onApply: (candidate: LookupCandidate) => void }) {
  const [mode, setMode] = useState<'isbn' | 'texte'>('isbn');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const term = value.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const qs = new URLSearchParams(mode === 'isbn' ? { isbn: term } : { q: term });
      // La recherche externe peut être lente : le serveur borne déjà chaque
      // cible à 6 s et n'échoue jamais en bloc — on affiche ce qui revient.
      setResult(await api<LookupResult>(`/cataloging/lookup?${qs}`, {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Recherche impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="col-span-2 rounded-lg border border-line bg-paper/60 p-3">
      <p className="text-sm font-semibold">Récupérer une notice existante</p>
      <p className="mt-0.5 text-xs text-muted">
        Recherche sur la BnF et la Bibliothèque du Congrès, puis pré-remplissage.
        Vous relisez et ajustez avant d’enregistrer.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'isbn' | 'texte')}
          className="rounded-md border border-line bg-white px-2 py-2 text-sm"
          aria-label="Critère de recherche"
        >
          <option value="isbn">ISBN</option>
          <option value="texte">Titre / auteur</option>
        </select>
        <div className="min-w-[12rem] flex-1">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
            placeholder={mode === 'isbn' ? '978-2-226-25701-7' : 'Titre ou auteur'}
            aria-label="Terme de recherche"
          />
        </div>
        <Button type="button" variant="ghost" onClick={() => void search()} disabled={loading}>
          {loading ? 'Recherche…' : 'Rechercher'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 flex flex-col gap-2">
          {result.candidates.length === 0 && result.errors.length === 0 && (
            <p className="text-sm text-muted">Aucune notice trouvée pour ce critère.</p>
          )}
          {result.candidates.map((c, i) => (
            <div
              key={`${c.source}-${i}`}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-line bg-white px-3 py-2"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {c.title}
                  {c.titleComplement ? ` : ${c.titleComplement}` : ''}
                </p>
                <p className="text-xs text-muted">
                  {c.contributors
                    .map((k) => `${k.name} (${CONTRIB_LABEL[k.role] ?? k.role})`)
                    .join(' ; ') || 'Auteur inconnu'}
                </p>
                <p className="text-xs text-muted">
                  {[c.publisher, c.publicationCity, c.publishYear].filter(Boolean).join(', ')}
                  {c.isbn ? ` — ISBN ${c.isbn}` : ''} · {c.source}
                </p>
              </div>
              <Button type="button" onClick={() => onApply(c)} className="shrink-0">
                Utiliser
              </Button>
            </div>
          ))}
          {/* Serveurs injoignables : informatif, jamais bloquant. */}
          {result.errors.map((e, i) => (
            <p key={`err-${i}`} className="text-xs text-muted">
              {e.source} : {e.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
