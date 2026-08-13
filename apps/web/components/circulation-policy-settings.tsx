'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Alert, Button, Card, Input } from '@/components/ui';

interface Policy {
  onlineRenewalEnabled: boolean;
  onlineRenewalMax: number;
  onlineRenewalDays: number;
  onlineRenewalRefuseOverdue: boolean;
  holdPickupDays: number;
}

export function CirculationPolicySettings() {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [max, setMax] = useState(2);
  const [days, setDays] = useState(14);
  const [refuseOverdue, setRefuseOverdue] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const p = await api<Policy>('/circulation-policy', {}, getToken());
      setEnabled(p.onlineRenewalEnabled);
      setMax(p.onlineRenewalMax);
      setDays(p.onlineRenewalDays);
      setRefuseOverdue(p.onlineRenewalRefuseOverdue);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api(
        '/circulation-policy',
        {
          method: 'PATCH',
          body: JSON.stringify({
            onlineRenewalEnabled: enabled,
            onlineRenewalMax: max,
            onlineRenewalDays: days,
            onlineRenewalRefuseOverdue: refuseOverdue,
          }),
        },
        getToken(),
      );
      setNotice('Politique de renouvellement enregistrée.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded && !error) {
    return <p className="mt-3 text-sm text-muted">Chargement de la politique…</p>;
  }

  return (
    <Card className="mt-5">
      <h2 className="font-serif text-lg font-bold">Renouvellement en ligne</h2>
      <p className="mt-1 text-sm text-muted">
        Règles appliquées quand un lecteur renouvelle lui-même un prêt depuis son
        espace.
      </p>

      {notice && <Alert tone="success" className="mt-3">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}

      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span className="font-medium">Autoriser le renouvellement en ligne</span>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Nombre max de renouvellements par prêt
          <Input
            type="number"
            min={0}
            max={10}
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
            className="max-w-[8rem]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Durée d’un renouvellement (jours)
          <Input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="max-w-[8rem]"
          />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={refuseOverdue}
          onChange={(e) => setRefuseOverdue(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-medium">Refuser si le prêt est déjà en retard</span>
          <span className="mt-0.5 block text-muted">
            Un document réservé par un autre lecteur est toujours refusé, quelle que
            soit cette option.
          </span>
        </span>
      </label>

      <div className="mt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Card>
  );
}
