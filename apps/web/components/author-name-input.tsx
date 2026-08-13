'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Input } from '@/components/ui';

interface Suggestion {
  id: string;
  displayName: string;
}

/**
 * Champ nom d'auteur avec autocomplétion sur les fiches d'autorité existantes du
 * tenant — pour réutiliser une fiche plutôt que d'en créer un doublon (dédup à
 * la source). Saisir un nom inédit reste possible : il sera créé à
 * l'enregistrement (créer-si-absent, côté serveur).
 */
export function AuthorNameInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (name: string) => void;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  // Ignore la 1re résolution après une sélection (évite de rouvrir la liste).
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api<Suggestion[]>(
          `/authors/suggest?q=${encodeURIComponent(q)}`,
          {},
          getToken(),
        );
        setSuggestions(res);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-white shadow-md">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-line/50"
                // onMouseDown (avant le blur) pour que la sélection prenne.
                onMouseDown={(e) => {
                  e.preventDefault();
                  justPicked.current = true;
                  onChange(s.displayName);
                  setOpen(false);
                }}
              >
                {s.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
