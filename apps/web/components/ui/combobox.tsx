'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Combobox : liste déroulante filtrable, navigable au clavier et tolérante aux
 * accents. Sert partout où l'on choisissait jusqu'ici un identifiant technique
 * en le TAPANT (classe, palier, étudiant) — une saisie libre qui, en cas de
 * faute de frappe, produisait une règle ou un compte que rien ne pouvait faire
 * correspondre, sans aucun message.
 *
 * Deux modes :
 *  - `options` fourni → filtrage LOCAL (listes courtes : classes, paliers) ;
 *  - `onSearch` fourni → recherche DISTANTE avec anti-rebond (listes longues :
 *    comptes). Les deux peuvent coexister : `options` sert alors d'amorce.
 *
 * L'affichage montre le libellé ET le nom technique (« Master 2 Médecine
 * (M2_MEDECINE) ») : l'utilisateur voit exactement la valeur qui sera stockée
 * et comparée par les règles d'accès.
 */

export interface ComboboxOption {
  /** Valeur réellement enregistrée (nom technique). */
  value: string;
  /** Libellé lisible. À défaut, `value` est affiché seul. */
  label?: string | null;
  /** Complément discret (ex. email, matricule). */
  hint?: string | null;
}

/** Repli des accents — « médecine » doit matcher « medecine », et l'inverse. */
export function foldAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function optionText(o: ComboboxOption): string {
  return [o.label, o.value, o.hint].filter(Boolean).join(' ');
}

interface ComboboxProps {
  value: string;
  onChange: (value: string, option?: ComboboxOption) => void;
  options?: ComboboxOption[];
  onSearch?: (query: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  /** Libellé de l'entrée « aucune valeur » (ex. joker d'une règle d'accès). */
  emptyLabel?: string;
  required?: boolean;
  debounceMs?: number;
  id?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  onSearch,
  placeholder,
  emptyLabel,
  required,
  debounceMs = 250,
  id,
}: ComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  /** Dernière option sélectionnée, pour l'affichage en recherche distante. */
  const [chosen, setChosen] = useState<ComboboxOption | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = `${id ?? 'combobox'}-list`;

  // Recherche distante, anti-rebond. La réponse d'une frappe périmée est
  // ignorée (garde `cancelled`) : sans elle, une réponse lente écrasait une
  // réponse plus récente et la liste affichait le résultat d'une autre saisie.
  useEffect(() => {
    if (!onSearch) return;
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await onSearch(query);
        if (!cancelled) setRemote(found);
      } catch {
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, onSearch, open, debounceMs]);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const visible = useMemo(() => {
    const base = onSearch ? remote : (options ?? []);
    const folded = foldAccents(query.trim());
    const filtered =
      onSearch || !folded
        ? base
        : base.filter((o) => foldAccents(optionText(o)).includes(folded));
    const head: ComboboxOption[] = emptyLabel ? [{ value: '', label: emptyLabel }] : [];
    return [...head, ...filtered];
  }, [onSearch, remote, options, query, emptyLabel]);

  useEffect(() => setHighlight(0), [visible.length]);
  useEffect(() => {
    if (!value) setChosen(null);
  }, [value]);

  const select = useCallback(
    (o: ComboboxOption) => {
      // On MÉMORISE l'option choisie : en recherche distante, `options` est
      // vide et le champ afficherait sinon la valeur brute (un identifiant de
      // compte), illisible pour l'utilisateur.
      setChosen(o.value ? o : null);
      onChange(o.value, o);
      setQuery('');
      setOpen(false);
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = visible[highlight];
      if (target) select(target);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Libellé affiché : l'option locale si on en a une, sinon celle mémorisée à
  // la sélection (cas de la recherche distante). En dernier recours seulement,
  // la valeur brute.
  const current = (options ?? []).find((o) => o.value === value) ?? (chosen?.value === value ? chosen : undefined);
  const display = open
    ? query
    : value
      ? current?.label
        ? // Le nom technique n'est répété entre parenthèses que s'il est
          // lisible (classe, palier) — pas pour un identifiant opaque.
          current.hint
          ? current.label
          : `${current.label} (${value})`
        : value
      : '';

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        required={required}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={display}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {loading && <li className="px-3 py-2 text-sm text-slate-500">Recherche…</li>}
          {!loading && visible.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">Aucun résultat</li>
          )}
          {!loading &&
            visible.map((o, i) => (
              <li
                key={`${o.value}-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(o);
                }}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === highlight ? 'bg-slate-100' : ''
                }`}
              >
                <span>{o.label ?? o.value}</span>
                {/* Le nom technique est TOUJOURS visible : c'est lui qui sera
                    stocké et comparé par les règles d'accès. */}
                {o.label && o.value && (
                  <span className="ml-1 font-mono text-xs text-slate-500">({o.value})</span>
                )}
                {o.hint && <span className="ml-1 text-xs text-slate-500">· {o.hint}</span>}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
