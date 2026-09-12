'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LIBELLES } from '@/lib/libelles';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';

/** Ce qui est RÉELLEMENT arrivé à l'email (rendu par l'API). */
type MailOutcome =
  | { sent: true }
  | { sent: false; reason: 'smtp_absent' | 'smtp_error'; detail?: string };

interface RegisterResponse {
  userId: string;
  status: 'ACTIVE' | 'PENDING';
  autoActivated: boolean;
  /**
   * ⚠ L'API le rend TOUJOURS sur cette route ; l'optionnel est défensif, pour
   * qu'une réponse plus ancienne ne fasse pas planter la lecture. La convention
   * est celle de `/admin/comptes`, qui a tranché la première : en l'absence du
   * champ, on garde la formulation d'envoi plutôt que d'inventer une troisième
   * façon de dire la même chose.
   */
  mail?: MailOutcome;
}

type Profil = 'etudiant' | 'personnel';

export default function InscriptionPage() {
  const [school, setSchool] = useState<string | null>(null);
  const [profil, setProfil] = useState<Profil>('etudiant');
  const [form, setForm] = useState({
    matricule: '',
    email: '',
    firstName: '',
    lastName: '',
    className: '',
  });
  const [result, setResult] = useState<RegisterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ name: string }>('/tenancy/current')
      .then((t) => setSchool(t.name))
      .catch(() => null);
  }, []);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [field]: e.target.value });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Profil personnel : ni matricule ni classe — le rôle sera défini par
      // le gestionnaire à l'activation (jamais choisi ici).
      const body =
        profil === 'etudiant'
          ? form
          : {
              email: form.email,
              firstName: form.firstName,
              lastName: form.lastName,
            };
      setResult(
        await api<RegisterResponse>('/accounts/register', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Inscription impossible. Réessayez.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-2xl font-bold">
          Créer un <span className="text-ocre">compte</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          {school ? `${school} · ` : ''}
          {profil === 'etudiant'
            ? 'Si votre matricule figure dans la liste de votre établissement, le compte est activé immédiatement.'
            : 'Votre compte sera validé par le gestionnaire, qui définira votre rôle à l’activation.'}
        </p>

        {!result && (
          <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Profil">
            {(
              [
                ['etudiant', 'Étudiant'],
                ['personnel', 'Personnel & autres'],
              ] as [Profil, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={profil === value}
                onClick={() => setProfil(value)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                  profil === value
                    ? 'border-ocre bg-ocre/10 text-ocre'
                    : 'border-line text-muted hover:border-ocre/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {result ? (
          <div
            className={`mt-6 rounded-md px-4 py-3 text-sm ${
              result.autoActivated
                ? 'bg-green-50 text-green-900'
                : 'bg-amber-50 text-amber-900'
            }`}
          >
            {result.autoActivated ? (
              <>
                <p className="font-semibold">{LIBELLES.inscription.compteActive}</p>
                {/*
                  ⚠ L'ÉCRAN NE DÉCLARE PLUS L'ENVOI SANS LE SAVOIR. L'API rend le
                  sort de l'email, avec un commentaire qui dit pourquoi :
                  « l'interface doit pouvoir dire la vérité ». L'ignorer envoyait
                  l'étudiant attendre une messagerie muette — et sans aucun
                  recours, le lien de définition de mot de passe étant le SEUL
                  chemin vers son compte.
                */}
                {result.mail?.sent === false ? (
                  <p className="mt-1">{LIBELLES.inscription.emailNonParti}</p>
                ) : (
                  <p className="mt-1">
                    {LIBELLES.inscription.emailParti} Vous pourrez ensuite{' '}
                    <Link href="/login" className="font-semibold underline">
                      vous connecter
                    </Link>
                    .
                  </p>
                )}
              </>
            ) : (
              <>
                {/*
                  ⚠ L'ÉCRAN NE PEUT PAS SAVOIR SI QUELQU'UN A ÉTÉ PRÉVENU.
                  L'issue de la notification aux gestionnaires est journalisée
                  puis avalée côté API — le cas « aucun gestionnaire actif » est
                  reconnu dans le code et n'atteint jamais la réponse.

                  On ne peut donc pas rendre la phrase vraie. On lui donne une
                  SORTIE : si rien ne vient, se présenter à la bibliothèque. Un
                  inscrit n'a aucun autre canal — il n'a pas encore de compte.
                */}
                <p className="font-semibold">{LIBELLES.inscription.enAttenteTitre}</p>
                <p className="mt-1">
                  {profil === 'etudiant'
                    ? LIBELLES.inscription.enAttenteEtudiant
                    : LIBELLES.inscription.enAttentePersonnel}{' '}
                  {LIBELLES.inscription.enAttenteSuite}
                </p>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            {profil === 'etudiant' && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Matricule
                <Input
                  value={form.matricule}
                  onChange={set('matricule')}
                  placeholder="ETU-2026-0142"
                  required
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Adresse email
              <Input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="prenom.nom@exemple.bf"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Prénom
                <Input value={form.firstName} onChange={set('firstName')} required />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Nom
                <Input value={form.lastName} onChange={set('lastName')} required />
              </label>
            </div>
            {profil === 'etudiant' && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Classe / filière
                <Input
                  value={form.className}
                  onChange={set('className')}
                  placeholder="L1_DROIT"
                  required
                />
              </label>
            )}

            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? 'Création…' : 'Créer mon compte'}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-muted">
          Déjà un compte ?{' '}
          <Link href="/login" className="font-semibold text-ocre underline">
            Se connecter
          </Link>
        </p>
      </Card>
    </main>
  );
}
