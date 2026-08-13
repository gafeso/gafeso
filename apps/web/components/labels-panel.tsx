'use client';

// Panneau d'impression d'étiquettes code-barres (vague 2 §1). Construit l'URL
// du PDF serveur selon la portée choisie (sélection cochée / localisation /
// nouveautés), la grille et l'étiquette de départ, puis propose le
// téléchargement. L'authentification passe par le cookie same-origin (bc_token)
// — un simple lien <a download> suffit, aucun jeton dans l'URL.

import { useState } from 'react';
import { ITEM_LOCATIONS } from '@/lib/item-locations';
import { Button, Input, Select } from '@/components/ui';

type Scope = 'selection' | 'location' | 'nouveaute';

export function LabelsPanel({ selectedRecordIds }: { selectedRecordIds: string[] }) {
  const [scope, setScope] = useState<Scope>('location');
  const [location, setLocation] = useState(ITEM_LOCATIONS[0]);
  const [start, setStart] = useState('1');
  const [columns, setColumns] = useState('3');
  const [rows, setRows] = useState('8');

  const selectionEmpty = scope === 'selection' && selectedRecordIds.length === 0;

  function buildUrl(): string {
    const p = new URLSearchParams();
    if (scope === 'selection') p.set('recordIds', selectedRecordIds.join(','));
    if (scope === 'location') p.set('location', location);
    if (scope === 'nouveaute') p.set('nouveaute', '1');
    p.set('columns', columns);
    p.set('rows', rows);
    p.set('start', start);
    return `/api/cataloging/labels?${p.toString()}`;
  }

  return (
    <div className="rounded-lg border border-line bg-paper/60 p-3">
      <p className="text-sm font-semibold">Étiquettes code-barres</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Portée
          <Select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="location">Par localisation</option>
            <option value="nouveaute">Nouveautés (30 j)</option>
            <option value="selection">
              Sélection cochée ({selectedRecordIds.length})
            </option>
          </Select>
        </label>
        {scope === 'location' && (
          <label className="flex flex-col gap-1 text-xs font-medium">
            Localisation
            <Select value={location} onChange={(e) => setLocation(e.target.value)}>
              {ITEM_LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex w-20 flex-col gap-1 text-xs font-medium">
          Colonnes
          <Input
            type="number"
            min={1}
            max={8}
            value={columns}
            onChange={(e) => setColumns(e.target.value)}
          />
        </label>
        <label className="flex w-20 flex-col gap-1 text-xs font-medium">
          Lignes
          <Input
            type="number"
            min={1}
            max={12}
            value={rows}
            onChange={(e) => setRows(e.target.value)}
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs font-medium">
          Démarrer à
          <Input
            type="number"
            min={1}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            title="Sauter les premières étiquettes d’une planche déjà entamée"
          />
        </label>
        {selectionEmpty ? (
          <Button variant="ghost" disabled title="Cochez au moins une notice">
            Aucune sélection
          </Button>
        ) : (
          <a
            href={buildUrl()}
            download
            className="inline-flex items-center rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90"
          >
            Télécharger le PDF
          </a>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        Planche A4 autocollante. « Démarrer à » permet de finir une planche déjà
        entamée.
      </p>
    </div>
  );
}
