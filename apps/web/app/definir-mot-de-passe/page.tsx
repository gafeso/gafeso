'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';

function SetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token');

  const [school, setSchool] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ name: string }>('/tenancy/current')
      .then((t) => setSchool(t.name))
      .catch(() => null);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await api('/accounts/set-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Opération impossible. Réessayez.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        Lien incomplet : le jeton est manquant. Utilisez le lien reçu par email,
        ou contactez le gestionnaire de votre établissement.
      </p>
    );
  }

  if (done) {
    return (
      <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-900">
        <p className="font-semibold">Mot de passe enregistré !</p>
        <p className="mt-1">Votre compte est prêt. Vous pouvez maintenant vous connecter.</p>
        <Link
          href="/login"
          className="mt-3 inline-block rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mt-1 text-sm text-muted">
        {school ? `${school} · ` : ''}Choisissez votre mot de passe (8 caractères
        minimum). Ce lien est à usage unique et expire au bout de 24 heures.
      </p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Nouveau mot de passe
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Confirmez le mot de passe
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Définir mon mot de passe'}
        </Button>
      </form>
    </>
  );
}

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="font-serif text-2xl font-bold">
          Définir mon <span className="text-ocre">mot de passe</span>
        </h1>
        <Suspense>
          <SetPasswordForm />
        </Suspense>
      </Card>
    </main>
  );
}
