import { notFound } from 'next/navigation';
import {
  type ClePageLegale,
  MODELES,
  type PageLegale,
  estPubliable,
  texteDuBloc,
} from '@/lib/pages-legales';
import { LIBELLES } from '@/lib/libelles';
import { ID_CONTENU } from '@/components/lien-evitement';

/**
 * UNE PAGE LÉGALE PUBLIQUE — et elle N'EXISTE PAS tant qu'elle n'est pas
 * publiée.
 *
 * ⚠ `notFound()` ET PAS UNE PAGE VIDE, ni un « bientôt disponible ». Trois
 * raisons, et la troisième décide :
 *
 * 1. une page portant « Durée de conservation : [à compléter] » sur le site
 *    d'une université serait pire que son absence — un faux dispositif, en droit ;
 * 2. les liens du pied ne s'affichent pas non plus tant qu'elle n'est pas
 *    publiée : la page ne peut être atteinte que par une adresse tapée ;
 * 3. ⚠ et un 404 est la réponse JUSTE : cette page n'existe pas sur cette
 *    instance. C'est « absent » et non « indisponible » — l'API a répondu, et ce
 *    qu'elle a répondu est que l'établissement n'a rien publié.
 */
export function PageLegalePublique({
  cle,
  titre,
  page,
}: {
  cle: ClePageLegale;
  titre: string;
  page: PageLegale | undefined;
}) {
  // ⚠ `publieeLe` ET `estPubliable` : la date seule ne suffit pas. Une page
  // publiée puis vidée par un geste ultérieur ne doit pas rester en ligne avec
  // des blocs manquants.
  if (!page || !page.publieeLe || !estPubliable(cle, page)) notFound();

  return (
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-serif text-3xl font-bold">{titre}</h1>
      <p className="mt-2 text-sm text-muted">
        {LIBELLES.pagesLegales.publieeLe(new Date(page.publieeLe))}
      </p>
      {MODELES[cle].map((bloc) => {
        const texte = texteDuBloc(bloc, page);
        if (!texte.trim()) return null;
        return (
          <section key={bloc.id} className="mt-7">
            <h2 className="font-serif text-xl font-bold">{bloc.titre}</h2>
            {/* ⚠ `whitespace-pre-line` : l'établissement écrit en paragraphes,
                et les perdre rendrait une adresse postale illisible. */}
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{texte}</p>
          </section>
        );
      })}
    </main>
  );
}
