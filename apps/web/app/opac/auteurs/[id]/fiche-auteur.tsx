'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Card } from '@/components/ui';

interface Work {
  recordId: string;
  title: string;
  year: number | null;
  recordType: string;
}
interface WorksByRole {
  role: string;
  count: number;
  works: Work[];
}
export interface AuthorDetail {
  id: string;
  displayName: string;
  bio: string | null;
  birthYear: number | null;
  deathYear: number | null;
  worksByRole: WorksByRole[];
  totalWorks: number;
}

// Formule par rôle (« Auteur de », « Directeur de mémoire de » — utile aux
// enseignants) ; repli sur le code brut pour un rôle non prévu.
const ROLE_HEADINGS: Record<string, string> = {
  AUTEUR_PRINCIPAL: 'Auteur de',
  AUTEUR_SECONDAIRE: 'Co-auteur de',
  DIRECTEUR_MEMOIRE: 'Directeur de mémoire / de thèse de',
};

function lifespan(a: AuthorDetail): string {
  if (!a.birthYear && !a.deathYear) return '';
  return ` (${a.birthYear ?? '?'}–${a.deathYear ?? ''})`;
}

/**
 * ⚠ `initial` VIENT DU SERVEUR, et il peut être nul — l'état « indisponible ».
 * La fiche se charge alors côté client comme avant et dit elle-même son échec.
 * Passer un objet vide à la place afficherait un auteur sans nom : une page qui
 * affirme un contenu qu'elle n'a pas.
 */
export function FicheAuteur({ initial = null }: { initial?: AuthorDetail | null }) {
  const { id } = useParams<{ id: string }>();
  const [author, setAuthor] = useState<AuthorDetail | null>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AuthorDetail>(`/opac/authors/${id}`, {}, getToken())
      .then(setAuthor)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Auteur indisponible.'),
      );
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      </main>
    );
  }
  if (!author) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/opac/auteurs" className="text-sm text-muted hover:text-ink">
        ← Tous les auteurs
      </Link>

      <h1 className="mt-4 font-serif text-3xl font-bold">
        {author.displayName}
        <span className="text-lg font-normal text-muted">{lifespan(author)}</span>
      </h1>
      <p className="mt-1 text-sm text-muted">
        {author.totalWorks} œuvre{author.totalWorks > 1 ? 's' : ''} dans le catalogue
      </p>
      {author.bio && <p className="mt-3 text-sm">{author.bio}</p>}

      {author.worksByRole.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Aucune œuvre rattachée.</p>
      ) : (
        author.worksByRole.map((group) => (
          <section key={group.role} className="mt-8">
            <h2 className="font-serif text-xl font-bold">
              {ROLE_HEADINGS[group.role] ?? group.role}{' '}
              <span className="text-sm font-normal text-muted">({group.count})</span>
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {group.works.map((w) => (
                <Card key={w.recordId} className="!p-3">
                  <Link href={`/opac/${w.recordId}`} className="text-ocre underline">
                    {w.title}
                  </Link>
                  {w.year && <span className="ml-2 text-xs text-muted">{w.year}</span>}
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
