'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { getToken, getUser, SessionUser } from '@/lib/session';
import { roleLabel } from '@/lib/roles';
import { Alert, Button, Card, Input } from '@/components/ui';
import { Header } from '@/components/header';
import { ID_CONTENU, LienDEvitement } from '@/components/lien-evitement';
import { TwoFactorSetup } from '@/components/two-factor-setup';

interface TwoFactorStatus {
  enabled: boolean;
  pendingSetup: boolean;
  backupCodesRemaining: number;
  required: boolean;
}

interface ActivityEntry {
  action: string;
  label: string;
  ip: string | null;
  createdAt: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'setup' | 'disable' | 'regen'>('idle');
  const [password, setPassword] = useState('');
  const [regenPassword, setRegenPassword] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);

  // Changement de mot de passe
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  // Activité récente (self-scopée)
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await api<TwoFactorStatus>('/auth/2fa/status', {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const res = await api<{ entries: ActivityEntry[] }>('/auth/me/activity', {}, getToken());
      setActivity(res.entries);
    } catch {
      setActivity([]); // l'activité est secondaire : on n'affiche pas d'erreur bloquante
    }
  }, []);

  useEffect(() => {
    const current = getUser();
    if (!current) {
      router.push('/login');
      return;
    }
    setUser(current);
    void load();
    void loadActivity();
  }, [load, loadActivity, router]);

  async function disable(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password }) }, getToken());
      setNotice('Double authentification désactivée.');
      setMode('idle');
      setPassword('');
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Désactivation impossible.');
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPwError(null);
    setPwNotice(null);
    if (pwNext !== pwConfirm) {
      setPwError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    if (pwNext.length < 8 || !/[A-Za-z]/.test(pwNext) || !/\d/.test(pwNext)) {
      setPwError('Le nouveau mot de passe doit faire au moins 8 caractères, avec une lettre et un chiffre.');
      return;
    }
    setPwSaving(true);
    try {
      await api(
        '/auth/password',
        { method: 'POST', body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNext }) },
        getToken(),
      );
      setPwNotice('Mot de passe changé. Il sera demandé à votre prochaine connexion.');
      setPwCurrent('');
      setPwNext('');
      setPwConfirm('');
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Changement impossible.');
    } finally {
      setPwSaving(false);
    }
  }

  async function regenerate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const res = await api<{ backupCodes: string[] }>(
        '/auth/2fa/backup-codes',
        { method: 'POST', body: JSON.stringify({ password: regenPassword }) },
        getToken(),
      );
      setNewBackupCodes(res.backupCodes);
      setMode('idle');
      setRegenPassword('');
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Régénération impossible.');
    }
  }

  return (
    <>
      {/*
        ⚠ LIEN D'ÉVITEMENT AJOUTÉ LE 13 SEPTEMBRE 2026. Cet écran porte son
        propre en-tête — donc sa propre navigation — et n'en avait aucun :
        un usager au clavier traversait tout le menu à chaque visite.
        Le garde nommé « lien-evitement-partout » ne le voyait pas, sa liste
        de fichiers étant écrite à la main.
      */}
      <LienDEvitement />
      <Header />
      <main id={ID_CONTENU} className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="font-serif text-3xl font-bold">Mon compte</h1>
        <p className="mt-1 text-sm text-muted">
          Vos informations, votre mot de passe et la sécurité de votre compte.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/mes-prets" className="text-ocre underline">
            Voir mes prêts et réservations →
          </Link>
        </p>

        {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}

        {/* ── Mes informations (lecture seule) ──────────────────────────── */}
        <section className="mt-8">
          <h2 className="font-serif text-xl font-bold">Mes informations</h2>
          {user && (
            <Card className="mt-3">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">Nom</dt>
                  <dd className="mt-0.5 text-sm">
                    {user.firstName} {user.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">Adresse email</dt>
                  <dd className="mt-0.5 text-sm">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">Rôle</dt>
                  <dd className="mt-0.5 text-sm">{roleLabel(user.role)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">Classe</dt>
                  <dd className="mt-0.5 text-sm">{user.className ?? '—'}</dd>
                </div>
              </dl>
              {/* Le rôle (et la classe) ne se modifient JAMAIS ici : c'est un
                  responsable qui les gère dans Administration → Comptes. */}
              <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                Le rôle et la classe sont attribués par un responsable de
                l’établissement (Administration&nbsp;→&nbsp;Comptes) et ne sont
                pas modifiables ici.
              </p>
            </Card>
          )}
        </section>

        {/* ── Mot de passe ──────────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="font-serif text-xl font-bold">Mot de passe</h2>
          <p className="mt-1 text-sm text-muted">
            Changez votre mot de passe. Votre mot de passe actuel est exigé pour
            confirmer que c’est bien vous.
          </p>
          <Card className="mt-3 max-w-md">
            {pwNotice && <Alert tone="success" className="mb-3">{pwNotice}</Alert>}
            {pwError && <Alert tone="error" className="mb-3">{pwError}</Alert>}
            <form onSubmit={changePassword} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Mot de passe actuel
                <Input
                  type="password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Nouveau mot de passe
                <Input
                  type="password"
                  value={pwNext}
                  onChange={(e) => setPwNext(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <span className="text-xs font-normal text-muted">
                  8 caractères minimum, au moins une lettre et un chiffre.
                </span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Confirmer le nouveau mot de passe
                <Input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <div>
                <Button type="submit" disabled={pwSaving}>
                  {pwSaving ? 'Changement…' : 'Changer le mot de passe'}
                </Button>
              </div>
            </form>
          </Card>
        </section>

        {/* ── Sécurité (2FA) ────────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="font-serif text-xl font-bold">Sécurité</h2>
          <p className="mt-1 text-sm text-muted">
            Double authentification (2FA) : un second facteur en plus du mot de passe.
          </p>

          {status && (
            <div className="mt-3">
              {mode === 'setup' ? (
                <TwoFactorSetup
                  onEnabled={() => setNotice('Double authentification activée.')}
                  onCancel={() => {
                    setMode('idle');
                    void load();
                  }}
                />
              ) : status.enabled ? (
                <Card>
                  <p className="text-sm">
                    <span className="font-semibold text-green-800">Activée</span> —{' '}
                    {status.backupCodesRemaining} code(s) de secours restant(s).
                  </p>
                  {status.required && (
                    <Alert tone="warning" className="mt-3">
                      Votre établissement exige la 2FA pour votre rôle : la
                      désactiver vous obligera à la reconfigurer à la prochaine
                      connexion.
                    </Alert>
                  )}
                  {newBackupCodes && (
                    <div className="mt-3">
                      <p className="text-sm font-medium">Nouveaux codes de secours (affichés une seule fois) :</p>
                      <ul className="mt-2 grid grid-cols-2 gap-2 font-mono text-sm">
                        {newBackupCodes.map((c) => (
                          <li key={c} className="rounded border border-line bg-paper px-3 py-1.5 text-center">
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => setMode('regen')}>
                      Régénérer les codes de secours
                    </Button>
                    <Button variant="ghost" onClick={() => setMode('disable')}>
                      Désactiver la 2FA
                    </Button>
                  </div>

                  {mode === 'regen' && (
                    <form onSubmit={regenerate} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                      <p className="text-sm text-muted">
                        Régénérer invalide immédiatement vos anciens codes de
                        secours. Confirmez votre mot de passe pour continuer.
                      </p>
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        Mot de passe
                        <Input
                          type="password"
                          value={regenPassword}
                          onChange={(e) => setRegenPassword(e.target.value)}
                          autoComplete="current-password"
                          required
                          className="max-w-xs"
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button type="submit">Régénérer</Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setMode('idle');
                            setRegenPassword('');
                          }}
                        >
                          Annuler
                        </Button>
                      </div>
                    </form>
                  )}

                  {mode === 'disable' && (
                    <form onSubmit={disable} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        Confirmez votre mot de passe pour désactiver
                        <Input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          required
                          className="max-w-xs"
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button type="submit">Confirmer la désactivation</Button>
                        <Button type="button" variant="ghost" onClick={() => setMode('idle')}>
                          Annuler
                        </Button>
                      </div>
                    </form>
                  )}
                </Card>
              ) : (
                <Card>
                  <p className="text-sm text-muted">
                    La double authentification n’est pas activée.
                    {status.required && (
                      <span className="text-ink"> Votre rôle l’exige : activez-la dès maintenant.</span>
                    )}
                  </p>
                  <div className="mt-4">
                    <Button onClick={() => setMode('setup')}>Activer la double authentification</Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Activité récente — self-scopée : uniquement CET utilisateur. */}
          <div className="mt-5">
            <h3 className="text-sm font-semibold">Activité récente</h3>
            <p className="mt-0.5 text-xs text-muted">
              Vos 10 dernières actions (connexions, changements). Vous ne voyez
              que votre propre activité.
            </p>
            {activity === null ? (
              <p className="mt-2 text-sm text-muted">Chargement…</p>
            ) : activity.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Aucune activité enregistrée.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                {activity.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>{e.label}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {new Date(e.createdAt).toLocaleString('fr-FR')}
                      {e.ip ? ` · ${e.ip}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <p className="mt-8 text-sm text-muted">
          <Link href="/opac" className="text-ocre underline">
            ← Retour au catalogue
          </Link>
        </p>
      </main>
    </>
  );
}
