'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Alert, Button, Card, Input } from '@/components/ui';

interface SetupResponse {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}
interface EnableResponse {
  backupCodes: string[];
  accessToken?: string;
  user?: unknown;
}

/**
 * Activation de la double authentification (TOTP). Réutilisable :
 *  - depuis le profil (session courante) → `enrollToken` absent ;
 *  - depuis l'enrôlement forcé au login → `enrollToken` fourni, et l'activation
 *    ouvre la session (onEnabled reçoit la réponse pour rediriger).
 * Les codes de secours sont affichés UNE SEULE FOIS après activation.
 */
export function TwoFactorSetup({
  enrollToken,
  onEnabled,
  onCancel,
}: {
  enrollToken?: string;
  onEnabled?: (res: EnableResponse) => void;
  onCancel?: () => void;
}) {
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    setError(null);
    try {
      const body = enrollToken ? { enrollToken } : {};
      setSetup(await api<SetupResponse>('/auth/2fa/setup', { method: 'POST', body: JSON.stringify(body) }, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de démarrer l’activation.');
    }
  }, [enrollToken]);

  useEffect(() => {
    void start();
  }, [start]);

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      const res = await api<EnableResponse>(
        '/auth/2fa/enable',
        { method: 'POST', body: JSON.stringify({ code, ...(enrollToken ? { enrollToken } : {}) }) },
        getToken(),
      );
      setBackupCodes(res.backupCodes);
      onEnabled?.(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setBusy(false);
    }
  }

  if (backupCodes) {
    return (
      <Card>
        <h3 className="font-serif text-lg font-bold text-green-800">
          Double authentification activée
        </h3>
        <Alert tone="warning">
          Conservez ces codes de secours en lieu sûr : chacun ne fonctionne
          qu’une fois et permet de vous connecter si vous perdez votre téléphone.
          Ils ne seront plus jamais affichés.
        </Alert>
        <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
          {backupCodes.map((c) => (
            <li key={c} className="rounded border border-line bg-paper px-3 py-1.5 text-center">
              {c}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Button onClick={() => onCancel?.()}>J’ai noté mes codes</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="font-serif text-lg font-bold">Activer la double authentification</h3>
      <p className="mt-1 text-sm text-muted">
        Scannez ce QR code avec une application d’authentification (Google
        Authenticator, Authy, FreeOTP…), puis saisissez le code à 6 chiffres
        pour confirmer.
      </p>
      {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {setup ? (
        <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
          {/* data: URL autorisée par la CSP (img-src data:) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qrDataUrl} alt="QR code de configuration 2FA" className="h-44 w-44 rounded border border-line" />
          <div className="flex-1">
            <p className="text-xs text-muted">Ou saisissez la clé manuellement :</p>
            <p className="mt-1 break-all font-mono text-sm">{setup.secret}</p>
            <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
              Code de vérification
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="w-40"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <Button onClick={confirm} disabled={busy || code.length < 6}>
                {busy ? 'Vérification…' : 'Activer'}
              </Button>
              {onCancel && !enrollToken && (
                <Button variant="ghost" onClick={onCancel}>
                  Annuler
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Préparation…</p>
      )}
    </Card>
  );
}
