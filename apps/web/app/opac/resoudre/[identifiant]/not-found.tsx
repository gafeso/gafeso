import Link from 'next/link';

import { ID_CONTENU } from '@/components/lien-evitement';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.resolution;

/**
 * LE 404 D'UN CODE SCANNÉ — explicite, et AVEC UNE SORTIE.
 *
 * ⚠ Celui qui arrive ici vient de scanner une étiquette, un livre à la main.
 * « Page introuvable » ne lui dirait rien : il n'a pas tapé d'adresse. Le texte
 * nomme donc ce qui s'est passé — le code n'est pas reconnu PAR CE CATALOGUE —
 * et la sortie est le geste qui lui reste : chercher le document par son titre.
 *
 * ⚠ ET IL NE DIT PAS « il existe ailleurs ». L'API refuse délibérément de le
 * révéler : ce serait dire à un inconnu ce que porte le fonds d'un autre
 * établissement, sur une route publique et sans session.
 */
export default function IdentifiantIntrouvable() {
  return (
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-12 text-center">
      <h1 className="font-serif text-2xl font-bold">{T.introuvableTitre}</h1>
      <p className="mt-2 text-sm text-muted">{T.introuvableTexte}</p>
      <Link
        href="/opac"
        className="mt-6 inline-flex min-h-11 items-center font-semibold text-ocre hover:underline"
      >
        {T.introuvableSortie}
      </Link>
    </main>
  );
}
