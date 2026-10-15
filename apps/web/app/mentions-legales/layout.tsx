import type { ReactNode } from 'react';

import { Header } from '@/components/header';
import { LienDEvitement } from '@/components/lien-evitement';
import { PiedCommun } from '@/components/pied-commun';

/**
 * ⚠ LA SEULE CLASSE D'ÉCRANS DE CE PRODUIT DONT LE PUBLIC EST LE DEHORS.
 *
 * Elles rendaient leur texte NU : ni en-tête, ni navigation, ni pied. Quelqu'un
 * qui y arrive par un lien — et c'est le seul chemin, puisque ces adresses
 * circulent — n'avait aucun moyen de revenir au catalogue, et aucun moyen
 * d'atteindre l'autre page légale.
 *
 * ⚠ ET LA COQUE REND AUSSI LE 404 : quand la page n'est pas publiée, le
 * `notFound()` du rendu serveur s'affiche DANS cette coque. Un 404 avec un
 * en-tête et un pied est une page dont on peut repartir ; un 404 nu est une
 * impasse.
 */
export default function CoqueLegale({ children }: { children: ReactNode }) {
  return (
    <>
      <LienDEvitement />
      <Header />
      {children}
      <PiedCommun />
    </>
  );
}
