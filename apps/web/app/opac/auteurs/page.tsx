'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Badge, Card, Input } from '@/components/ui';

interface AuthorRow {
  id: string;
  displayName: string;
  birthYear: number | null;
  deathYear: number | null;
  workCount: number;
}
interface AuthorsIndex {
  authors: AuthorRow[];
  total: number;
  page: number;
  totalPages: number;
}

function lifespan(a: AuthorRow): string {
  if (!a.birthYear && !a.deathYear) return '';
  return ` (${a.birthYear ?? '?'}–${a.deathYear ?? ''})`;
}

export default function AuthorsIndexPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [data, setData] = useState<AuthorsIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async (query: string, p: number) => {
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(p), limit: '50' });
      if (query.trim()) qs.set('q', query.trim());
      setData(await api<AuthorsIndex>(`/opac/authors?${qs}`, {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  // Débounce léger sur la saisie + reflet dans l'URL (partageable).
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      void load(q, 1);
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      router.replace(`/opac/auteurs${qs}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, load, router]);

  useEffect(() => {
    void load(q, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-3xl font-bold">Auteurs</h1>
        <Link href="/opac" className="text-sm text-muted hover:text-ink">
          ← Catalogue
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Index des auteurs de la bibliothèque, avec leur nombre d’œuvres.
      </p>

      <div className="mt-5">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un auteur par nom…"
          aria-label="Rechercher un auteur"
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {data && (
        <>
          <p className="mt-4 text-xs text-muted">{data.total} auteur(s)</p>
          <div className="mt-2 divide-y divide-line rounded-md border border-line">
            {data.authors.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">Aucun auteur.</p>
            )}
            {data.authors.map((a) => (
              <Link
                key={a.id}
                href={`/opac/auteurs/${a.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-line/40"
              >
                <span>
                  <span className="font-medium">{a.displayName}</span>
                  <span className="text-muted">{lifespan(a)}</span>
                </span>
                <Badge tone="neutral">
                  {a.workCount} œuvre{a.workCount > 1 ? 's' : ''}
                </Badge>
              </Link>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <button
                className="text-ocre underline disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Précédent
              </button>
              <span className="text-muted">
                Page {data.page} / {data.totalPages}
              </span>
              <button
                className="text-ocre underline disabled:opacity-40"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
