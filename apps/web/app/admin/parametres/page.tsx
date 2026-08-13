'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Button, Card, Input } from '@/components/ui';
import { ReminderSettings } from '@/components/reminder-settings';
import { TenantQrSection } from '@/components/tenant-qr';
import { CirculationPolicySettings } from '@/components/circulation-policy-settings';

interface TenantSettings {
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  require2fa: boolean;
  /** Adresse encodée dans le QR — calculée par le serveur, pas par le navigateur. */
  enrollmentUrl?: string | null;
}

export default function ParametresPage() {
  const { functions: myFunctions } = useMyFunctions();
  const canManage = myFunctions?.includes('etablissement.gerer');

  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#0F2B46');
  const [secondaryColor, setSecondaryColor] = useState('#D97B2B');
  const [require2fa, setRequire2fa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const current = await api<TenantSettings>('/tenancy/current');
      setSettings(current);
      setPrimaryColor(current.primaryColor);
      setSecondaryColor(current.secondaryColor);
      setRequire2fa(current.require2fa);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  async function saveSecurity(next: boolean) {
    setSavingSecurity(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        '/tenancy/settings',
        { method: 'PATCH', body: JSON.stringify({ require2fa: next }) },
        getToken(),
      );
      setRequire2fa(next);
      setNotice(
        next
          ? 'Double authentification désormais obligatoire pour les gestionnaires et administrateurs.'
          : 'Double authentification rendue optionnelle.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setSavingSecurity(false);
    }
  }

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        '/tenancy/settings',
        { method: 'PATCH', body: JSON.stringify({ primaryColor, secondaryColor }) },
        getToken(),
      );
      setNotice('Couleurs enregistrées. La page va se recharger pour les appliquer partout.');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (myFunctions && !canManage) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission de modifier l’établissement (fonction
        «&nbsp;etablissement.gerer&nbsp;»).
      </Alert>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Établissement</h1>
      <p className="mt-1 text-sm text-muted">
        Couleurs de {settings?.name ?? 'l’école'}, appliquées sur tout le site (page
        d’accueil, constellation, boutons).
      </p>

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {settings === null && !error && <p className="mt-5 text-sm text-muted">Chargement…</p>}

      {settings !== null && (
        <Card className="mt-5 max-w-md">
          <form onSubmit={save} className="flex flex-col gap-4">
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              Couleur principale
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-16 cursor-pointer p-1"
                />
                <span className="font-mono text-xs text-muted">{primaryColor}</span>
              </div>
            </label>
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              Couleur secondaire
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-9 w-16 cursor-pointer p-1"
                />
                <span className="font-mono text-xs text-muted">{secondaryColor}</span>
              </div>
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </form>
        </Card>
      )}

      {settings !== null && (
        <Card className="mt-5 max-w-md">
          <h2 className="font-serif text-lg font-bold">Sécurité</h2>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={require2fa}
              disabled={savingSecurity}
              onChange={(e) => saveSecurity(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium">
                Exiger la double authentification pour les rôles sensibles
              </span>
              <span className="mt-0.5 block text-muted">
                S’applique aux comptes disposant de «&nbsp;gérer les comptes&nbsp;»
                ou «&nbsp;modifier l’établissement&nbsp;». À leur prochaine
                connexion, ils devront configurer la 2FA avant d’accéder à leur
                espace.
              </span>
            </span>
          </label>
        </Card>
      )}

      {settings !== null && canManage && (
        <div className="max-w-2xl">
          <TenantQrSection slug={settings.slug} url={settings.enrollmentUrl} />
        </div>
      )}

      {settings !== null && (
        <div className="max-w-2xl">
          <CirculationPolicySettings />
          <ReminderSettings />
        </div>
      )}
    </div>
  );
}
