'use client';

// Champ « tags » des mots-clés (cahier fiche de saisie §2.4) : saisie +
// Entrée (ou virgule), suppression par croix, autocomplétion native
// (datalist) sur les mots-clés déjà utilisés dans le tenant. La règle des 3
// minimum est validée côté client pour l'UX (message avant envoi) et côté
// serveur pour la vérité (§4.1).

import { useState } from 'react';
import { Input } from '@/components/ui';

/** Même normalisation que le serveur : minuscules, espaces réduits. */
function normalizeKeyword(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function KeywordsInput({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (keywords: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState('');

  /**
   * Ajoute un ou PLUSIEURS mots-clés : « foncier ; droit rural ; burkina »
   * saisi ou collé sur une même ligne devient autant de badges (demande de
   * la responsable — séparateur « ; », la virgule marche aussi).
   */
  function add(raw: string) {
    const names = raw
      .split(/[;,]/)
      .map(normalizeKeyword)
      .filter((name) => name.length > 0);
    if (names.length > 0) {
      const merged = [...value];
      for (const name of names) {
        if (!merged.includes(name)) merged.push(name);
      }
      onChange(merged);
    }
    setDraft('');
  }

  return (
    <div className="col-span-2 flex flex-col gap-1.5 text-sm font-medium">
      <span>Mots-clés (minimum 3)</span>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((keyword) => (
            <span
              key={keyword}
              className="inline-flex items-center gap-1.5 rounded-full bg-line/60 px-2.5 py-1 text-xs font-medium"
            >
              {keyword}
              <button
                type="button"
                aria-label={`Retirer le mot-clé ${keyword}`}
                onClick={() => onChange(value.filter((k) => k !== keyword))}
                className="text-muted hover:text-ink"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        list="bc-keywords-suggestions"
        value={draft}
        onChange={(e) => {
          // Texte collé contenant des séparateurs : découpé immédiatement.
          if (/[;,]/.test(e.target.value)) add(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          // Entrée (ou séparateur) ajoute le(s) tag(s) SANS soumettre le formulaire.
          if (e.key === 'Enter' || e.key === ';' || e.key === ',') {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
        placeholder="Mot-clé puis Entrée — ou plusieurs séparés par « ; »"
        aria-label="Ajouter un mot-clé"
      />
      <datalist id="bc-keywords-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
