'use client';

import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { ContributorsSummary } from '@/components/contributors-summary';

interface Hit {
  id: string;
  title: string;
  author: string | null;
  contributorList?: { name: string; role: string; authorId?: string | null }[];
  category: string | null;
  language: string;
  publishYear: number | null;
}

interface SearchResponse {
  hits: Hit[];
  totalHits: number;
  page: number;
  totalPages: number;
  facets: {
    category?: Record<string, number>;
    recordType?: Record<string, number>;
  };
}

const TYPE_LABELS: Record<string, string> = {
  memoire: 'Mémoires',
  these: 'Thèses',
  publication: 'Publications',
  ouvrage: 'Ouvrages',
};

function OpacSearch() {
  const params = useSearchParams();
  const router = useRouter();
  // La requête ACTIVE est portée par l'URL (?q=) : c'est elle qui est
  // partageable et qui pilote la recherche — cliquer un auteur navigue vers
  // /opac?q=<nom>, ce qui relance la recherche sur cet auteur.
  const urlQ = params.get('q') ?? '';
  const urlDans = params.get('dans') ?? 'tout';
  const [q, setQ] = useState(urlQ); // texte du champ (contrôlé)
  const [dans, setDans] = useState(urlDans); // mode de recherche (contrôlé)
  const [category, setCategory] = useState<string | null>(params.get('category'));
  const [recordType, setRecordType] = useState<string | null>(params.get('recordType'));
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (query: string, mode: string, cat: string | null, type: string | null) => {
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (query) qs.set('q', query);
        if (mode && mode !== 'tout') qs.set('dans', mode);
        if (cat) qs.set('category', cat);
        if (type) qs.set('recordType', type);
        const data = await api<SearchResponse>(
          `/opac/search?${qs.toString()}`,
          {},
          getToken(),
        );
        setResult(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Recherche indisponible.');
      }
    },
    [],
  );

  // Recale le champ quand l'URL change (ex. clic sur un lien auteur).
  useEffect(() => {
    setQ(urlQ);
    setDans(urlDans);
  }, [urlQ, urlDans]);

  // Mode « auteur » : on redirige vers l'index des auteurs (comme PMB) plutôt
  // que de chercher dans les notices.
  useEffect(() => {
    if (urlDans === 'auteur') {
      router.replace(urlQ ? `/opac/auteurs?q=${encodeURIComponent(urlQ)}` : '/opac/auteurs');
    }
  }, [urlDans, urlQ, router]);

  // Recherche à chaque changement de la requête active (URL) ou d'une facette.
  useEffect(() => {
    if (urlDans === 'auteur') return; // redirigé ci-dessus
    void search(urlQ, urlDans, category, recordType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ, urlDans, category, recordType]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // Mode auteur → index des auteurs. Sinon, requête + mode poussés dans l'URL.
    if (dans === 'auteur') {
      router.push(q ? `/opac/auteurs?q=${encodeURIComponent(q)}` : '/opac/auteurs');
      return;
    }
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (dans !== 'tout') qs.set('dans', dans);
    const url = qs.toString() ? `/opac?${qs}` : '/opac';
    // Même requête active : relancer directement (l'URL ne changerait pas).
    if (q === urlQ && dans === urlDans) {
      void search(q, dans, category, recordType);
    } else {
      router.push(url);
    }
  }

  const facets = result?.facets.category ?? {};
  const typeFacets = result?.facets.recordType ?? {};

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="font-serif text-3xl font-bold">Catalogue</h1>

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap gap-2">
        <div className="w-40 shrink-0">
          <Select value={dans} onChange={(e) => setDans(e.target.value)} aria-label="Champ de recherche">
            <option value="tout">Tout</option>
            <option value="titre">Titre</option>
            <option value="auteur">Auteur</option>
            <option value="categorie">Catégorie</option>
          </Select>
        </div>
        <div className="min-w-[12rem] flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              dans === 'titre'
                ? 'Mot du titre…'
                : dans === 'auteur'
                  ? 'Nom d’auteur…'
                  : dans === 'categorie'
                    ? 'Nom de catégorie…'
                    : 'Titre, auteur, ISBN…'
            }
            aria-label="Recherche dans le catalogue"
          />
        </div>
        <Button type="submit">Rechercher</Button>
      </form>

      {Object.keys(facets).length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Domaines
          </span>
          {Object.entries(facets).map(([name, count]) => (
            <button
              key={name}
              onClick={() => setCategory(category === name ? null : name)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                category === name
                  ? 'border-ocre bg-ocre/15 font-semibold text-ocre'
                  : 'border-line bg-white text-muted hover:border-ocre/50'
              }`}
            >
              {name} · {count}
            </button>
          ))}
        </div>
      )}

      {Object.keys(typeFacets).length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Types
          </span>
          {Object.entries(typeFacets).map(([name, count]) => (
            <button
              key={name}
              onClick={() => setRecordType(recordType === name ? null : name)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                recordType === name
                  ? 'border-ink bg-ink/10 font-semibold text-ink'
                  : 'border-line bg-white text-muted hover:border-ink/40'
              }`}
            >
              {TYPE_LABELS[name] ?? name} · {count}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {result && (
        <>
          <p className="mt-6 text-sm text-muted">
            {result.totalHits} résultat{result.totalHits > 1 ? 's' : ''}
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {result.hits.map((hit) => (
              <Card key={hit.id} className="transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-lg font-bold">
                      <Link href={`/opac/${hit.id}`} className="hover:text-ocre">
                        {hit.title}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-sm">
                      <ContributorsSummary
                        contributors={hit.contributorList}
                        fallbackAuthor={hit.author}
                        linkAuthors
                      />
                      {hit.publishYear ? (
                        <span className="text-muted"> · {hit.publishYear}</span>
                      ) : null}
                    </p>
                  </div>
                  {hit.category && <Badge tone="ocre">{hit.category}</Badge>}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

export default function OpacPage() {
  return (
    <Suspense>
      <OpacSearch />
    </Suspense>
  );
}
