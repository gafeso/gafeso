'use client';

// Récolement / inventaire (vague 2 §2) — liste des sessions + création.
// L'écran de scan et le rapport vivent dans [id]/page.tsx.

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useMyFunctions } from '@/lib/functions';
import { LIBELLES } from '@/lib/libelles';
import { getToken } from '@/lib/session';
import { Alert, Button, Card, Input, Select } from '@/components/ui';
import { ITEM_LOCATIONS } from '@/lib/item-locations';

interface Session {
  id: string;
  name: string;
  scope: string;
  location: string | null;
  status: string;
  createdAt: string;
  closedAt: string | null;
  _count: { scans: number };
}

export default function RecolementPage() {
  const { functions } = useMyFunctions();
  // ⚠ `null` TANT QU'ON NE SAIT PAS, jamais `[]` — un tableau vide ne distingue
  // pas « pas encore chargé » de « il n'y en a aucun », et l'écran affirme
  // alors le vide avant d'avoir la réponse. Même correction que
  // /admin/catalogue le 8 septembre 2026, répliquée le 10.
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'ALL' | 'LOCATION'>('LOCATION');
  const [location, setLocation] = useState(ITEM_LOCATIONS[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSessions(await api<Session[]>('/inventory/sessions', {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(
        '/inventory/sessions',
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            scope,
            location: scope === 'LOCATION' ? location : undefined,
          }),
        },
        getToken(),
      );
      setName('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  // ⚠ UN REFUS N'EST PAS UNE ATTENTE. Sans ce garde, un compte sans la fonction
  // atteignait l'écran en TAPANT l'adresse, l'API répondait 403, et le tableau
  // restait sur « Chargement… » indéfiniment — une invitation à patienter sur
  // quelque chose qui n'arrivera jamais. Le menu cachait bien l'entrée : ce
  // n'est pas la porte qui manquait, c'est la SORTIE.
  if (functions && !functions.includes('outils.catalogue')) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.recolement}</Alert>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">Récolement</h1>
          <p className="mt-1 text-sm text-muted">
            Inventaire des exemplaires : scannez les rayons, obtenez la liste des
            manquants.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Fermer' : 'Nouvelle session'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {showForm && (
        <Card className="mt-4 max-w-xl">
          <h2 className="font-serif text-lg font-bold">Nouvelle session</h2>
          <form onSubmit={create} className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nom de la session
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Récolement Documentation — juillet"
                required
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Périmètre
                <Select value={scope} onChange={(e) => setScope(e.target.value as 'ALL' | 'LOCATION')}>
                  <option value="LOCATION">Une localisation</option>
                  <option value="ALL">Tout le fonds</option>
                </Select>
              </label>
              {scope === 'LOCATION' && (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
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
            </div>
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Création…' : 'Démarrer la session'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mt-5 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">Session</th>
              <th className="px-4 py-2.5 font-semibold">Périmètre</th>
              <th className="px-4 py-2.5 font-semibold">Scans</th>
              <th className="px-4 py-2.5 font-semibold">État</th>
            </tr>
          </thead>
          <tbody>
            {sessions === null && !error && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  {LIBELLES.commun.chargement}
                </td>
              </tr>
            )}
            {sessions === null && error !== null && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  {LIBELLES.commun.listeNonChargee}
                </td>
              </tr>
            )}
            {sessions !== null && sessions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Aucune session de récolement.
                </td>
              </tr>
            )}
            {(sessions ?? []).map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0 hover:bg-paper">
                <td className="px-4 py-2.5 font-medium">
                  <Link href={`/admin/recolement/${s.id}`} className="hover:text-ocre">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  {s.scope === 'LOCATION' ? s.location : 'Tout le fonds'}
                </td>
                <td className="px-4 py-2.5">{s._count.scans}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === 'OPEN'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-line/60 text-muted'
                    }`}
                  >
                    {s.status === 'OPEN' ? 'En cours' : 'Clôturée'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
