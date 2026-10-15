import Link from 'next/link';

import { Header } from '@/components/header';
import { ID_CONTENU, LienDEvitement } from '@/components/lien-evitement';
import { PiedCommun } from '@/components/pied-commun';
import { LIBELLES } from '@/lib/libelles';

/**
 * ⭐ LE 404 RACINE — il n'y en avait AUCUN.
 *
 * Sans lui, tout `notFound()` tombait sur la page intégrée de Next : hors des
 * coques, donc sans en-tête, sans pied, et sans aucun chemin de retour. Une
 * adresse de mentions légales qui a circulé et qui mène à ça ne dit pas « cette
 * page n'existe pas ici », elle dit « ce site est cassé ».
 */
export default function Introuvable() {
  return (
    <>
      <LienDEvitement />
      <Header />
      <main id={ID_CONTENU} className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-serif text-2xl font-bold">{LIBELLES.introuvable.titre}</h1>
        <p className="mt-3 max-w-prose text-sm text-muted">{LIBELLES.introuvable.explication}</p>
        {/*
          ⚠ UNE SORTIE, TOUJOURS. Un écran qui annonce une absence sans proposer
          de geste est une impasse — c'est la même règle que pour les états
          vides, et elle vaut d'autant plus ici que la personne est arrivée par
          un lien qu'elle n'a pas choisi.
        */}
        <p className="mt-6">
          <Link href="/opac" className="text-ocre underline">
            {LIBELLES.introuvable.retour}
          </Link>
        </p>
      </main>
      <PiedCommun />
    </>
  );
}
