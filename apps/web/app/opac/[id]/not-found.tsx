import Link from 'next/link';
import { ID_CONTENU } from '@/components/lien-evitement';
import { LIBELLES } from '@/lib/libelles';

/**
 * Ce que voit un visiteur arrivé sur une notice qui n'existe plus.
 *
 * ⚠ AVEC UNE SORTIE. Un écran qui annonce une absence sans proposer de suite
 * est un cul-de-sac — le même défaut que « Notice introuvable » côté
 * professionnel, corrigé le 10 septembre. Le lien retourne au catalogue.
 */
export default function NoticeIntrouvable() {
  return (
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-12 text-center">
      <h1 className="font-serif text-2xl font-bold">{LIBELLES.opac.noticeIntrouvableTitre}</h1>
      <p className="mt-2 text-sm text-muted">{LIBELLES.opac.noticeIntrouvableTexte}</p>
      <Link
        href="/opac"
        className="mt-6 inline-flex min-h-11 items-center font-semibold text-ocre hover:underline"
      >
        {LIBELLES.opac.retourCatalogue}
      </Link>
    </main>
  );
}
