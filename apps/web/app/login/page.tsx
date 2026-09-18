'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { LIBELLES } from '@/lib/libelles';
import { saveSession, SessionUser } from '@/lib/session';
import { landingPathForRole } from '@/lib/roles';
import { Button, Card, Input } from '@/components/ui';
import { TwoFactorSetup } from '@/components/two-factor-setup';

interface LoginResult {
  accessToken?: string;
  user?: SessionUser;
  twoFactorRequired?: boolean;
  twoFactorToken?: string;
  methods?: string[];
  mustEnroll2fa?: boolean;
  enrollToken?: string;
}

export default function LoginPage() {
  const router = useRouter();
  /**
   * ⚠ Posé par `header.tsx` quand `POST /auth/logout` n'a PAS abouti. L'écran
   * doit alors dire que la session du serveur peut survivre — et donner le
   * geste. Sans ça, « déconnecté » est une affirmation que rien ne soutient.
   */
  const deconnexionIncomplete = useSearchParams().get('deconnexion') === 'incomplete';
  const [step, setStep] = useState<'password' | 'twofactor' | 'enroll'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [school, setSchool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // État du second facteur
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [methods, setMethods] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [enrollToken, setEnrollToken] = useState('');
  const [enrolledUser, setEnrolledUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    api<{ name: string }>('/tenancy/current')
      .then((t) => setSchool(t.name))
      .catch(() => null);
  }, []);

  function finish(user: SessionUser) {
    saveSession(user);
    router.push(landingPathForRole(user.role));
  }

  async function onSubmitPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api<LoginResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (result.twoFactorRequired && result.twoFactorToken) {
        setTwoFactorToken(result.twoFactorToken);
        setMethods(result.methods ?? ['totp']);
        setStep('twofactor');
      } else if (result.mustEnroll2fa && result.enrollToken) {
        setEnrollToken(result.enrollToken);
        setStep('enroll');
      } else if (result.user) {
        finish(result.user);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitTwoFactor(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api<LoginResult>('/auth/login/2fa', {
        method: 'POST',
        body: JSON.stringify({ twoFactorToken, code }),
      });
      if (result.user) finish(result.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setLoading(false);
    }
  }

  async function sendEmailCode() {
    setError(null);
    try {
      // ⚠ ON LIT LE SORT DE L'ENVOI. L'API le REND depuis le 12 septembre 2026 —
      // 200 veut dire « la demande a été traitée », pas « le courriel est parti ».
      // Écrire « Code envoyé ✓ » sur un simple 200 enfermait dehors quelqu'un qui
      // a perdu son appareil TOTP : ce repli est sa seule porte.
      const issue = await api<{ sent: boolean; reason?: string }>(
        '/auth/login/2fa/email',
        { method: 'POST', body: JSON.stringify({ twoFactorToken }) },
      );
      if (issue?.sent === false) {
        // ⚠ LE MOTIF CHANGE LE GESTE À FAIRE, donc il change la phrase. « Réessayez »
        // devant une messagerie non configurée est une impasse polie.
        setEmailSent(false);
        setError(
          issue.reason === 'smtp_absent'
            ? LIBELLES.connexion.codeNonPartiDefinitif
            : issue.reason === 'smtp_error'
              ? LIBELLES.connexion.codeNonPartiReessayable
              : LIBELLES.connexion.codeNonParti,
        );
        return;
      }
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Envoi impossible.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <Card>
          <h1 className="font-serif text-2xl font-bold">
            Gafe<span className="text-ocre">so</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {school ? (
              <>
                Bibliothèque de <span className="font-semibold text-ink">{school}</span>
              </>
            ) : (
              'Connectez-vous avec le compte de votre établissement.'
            )}
          </p>

          {deconnexionIncomplete && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <p className="font-semibold">{LIBELLES.connexion.deconnexionNonConfirmee}</p>
              <p className="mt-0.5">{LIBELLES.connexion.deconnexionNonConfirmeeGeste}</p>
            </div>
          )}

          {step === 'password' && (
            <>
              <form onSubmit={onSubmitPassword} className="mt-6 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Adresse email
                  <Input
                    className="min-h-11"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="prenom.nom@ecole.bf"
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Mot de passe
                  <Input
                    className="min-h-11"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                {error && (
                  <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </p>
                )}
                <Button type="submit" className="min-h-11" disabled={loading}>
                  {loading ? 'Connexion…' : 'Se connecter'}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted">
                Pas encore de compte ?{' '}
                <Link href="/inscription" className="inline-flex min-h-11 items-center font-semibold text-ocre underline">
                  Créer un compte étudiant
                </Link>
              </p>
            </>
          )}

          {step === 'twofactor' && (
            <form onSubmit={onSubmitTwoFactor} className="mt-6 flex flex-col gap-4">
              <p className="text-sm text-muted">
                Saisissez le code de votre application d’authentification. Vous
                pouvez aussi utiliser un <strong>code de secours</strong>.
              </p>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Code de vérification
                <Input
                  className="min-h-11"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="text"
                  autoComplete="one-time-code"
                  placeholder="123456 ou code de secours"
                  autoFocus
                  required
                />
              </label>
              {error && (
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              )}
              <Button type="submit" className="min-h-11" disabled={loading}>
                {loading ? 'Vérification…' : 'Valider'}
              </Button>
              {methods.includes('email') && (
                <button
                  type="button"
                  onClick={sendEmailCode}
                  className="text-sm text-ocre underline"
                >
                  {emailSent ? LIBELLES.connexion.codeEnvoye : LIBELLES.connexion.codeDemander}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setStep('password');
                  setCode('');
                  setError(null);
                }}
                className="text-sm text-muted underline"
              >
                ← Recommencer
              </button>
            </form>
          )}

          {step === 'enroll' && (
            <div className="mt-4">
              <p className="mb-3 rounded-md bg-ocre/10 px-3 py-2 text-sm text-ink">
                Votre établissement exige la double authentification pour votre
                rôle. Configurez-la pour continuer.
              </p>
              <TwoFactorSetup
                enrollToken={enrollToken}
                // La session est ouverte, mais on RESTE sur l'écran des codes de
                // secours (affichés une seule fois) : on ne redirige qu'au clic
                // sur « J'ai noté mes codes » (onCancel).
                onEnabled={(res) => {
                  if (res.user) {
                    saveSession(res.user as SessionUser);
                    setEnrolledUser(res.user as SessionUser);
                  }
                }}
                onCancel={() => {
                  if (enrolledUser) {
                    router.push(landingPathForRole(enrolledUser.role));
                  }
                }}
              />
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
