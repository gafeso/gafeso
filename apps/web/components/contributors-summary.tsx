import Link from 'next/link';
import { AuthorRef, ContributorRow, splitContributors } from './contributors-editor';

/** Repli quand aucune fiche n'est liée : l'index des auteurs filtré sur ce nom. */
export function authorSearchHref(name: string): string {
  return `/opac/auteurs?q=${encodeURIComponent(name)}`;
}

/** Lien vers la fiche d'autorité d'un auteur. */
export function authorHref(id: string): string {
  return `/opac/auteurs/${id}`;
}

/**
 * Rend une liste d'auteurs séparés par « ; ». Si `link`, chaque nom devient un
 * lien : vers sa FICHE d'autorité quand `authorId` est connu (fichier
 * d'autorités), sinon vers une recherche par nom (notices pas encore migrées /
 * réindexées).
 */
export function AuthorNames({ authors, link }: { authors: AuthorRef[]; link?: boolean }) {
  return (
    <>
      {authors.map((a, i) => (
        <span key={`${a.name}-${i}`}>
          {i > 0 ? ' ; ' : ''}
          {link ? (
            <Link
              href={a.authorId ? authorHref(a.authorId) : authorSearchHref(a.name)}
              className="hover:text-ocre hover:underline"
            >
              {a.name}
            </Link>
          ) : (
            a.name
          )}
        </span>
      ))}
    </>
  );
}

/**
 * Résumé « auteurs » affiché sous un titre (résultats OPAC, tableau du catalogue
 * admin) et dans la fiche. Montre la relation livre↔auteurs (demande directrice
 * BUC) : auteurs principaux/secondaires d'abord, puis le directeur avec « dir. ».
 *
 * `contributors` = liste ordonnée {name, role, authorId?}. `fallbackAuthor`
 * couvre les notices pas encore migrées (ancien champ auteur seul).
 * `linkAuthors` rend chaque nom cliquable (fiche d'autorité si liée, sinon
 * recherche par nom).
 */
export function ContributorsSummary({
  contributors,
  fallbackAuthor,
  linkAuthors = false,
}: {
  contributors?: ContributorRow[] | null;
  fallbackAuthor?: string | null;
  linkAuthors?: boolean;
}) {
  const { authors, directors } = splitContributors(contributors);
  const authorRefs: AuthorRef[] =
    authors.length > 0 ? authors : fallbackAuthor ? [{ name: fallbackAuthor }] : [];

  if (authorRefs.length === 0 && directors.length === 0) {
    return <span className="text-muted">Auteur inconnu</span>;
  }

  return (
    <span>
      <AuthorNames authors={authorRefs} link={linkAuthors} />
      {directors.length > 0 && (
        <span className="text-muted">
          {authorRefs.length > 0 ? ' · ' : ''}dir.{' '}
          <AuthorNames authors={directors} link={linkAuthors} />
        </span>
      )}
    </span>
  );
}
