'use client';

import { Header } from '@/components/header';
import { ID_CONTENU, LienDEvitement } from '@/components/lien-evitement';
import { LIBELLES } from '@/lib/libelles';

/**
 * Ce qu'on affiche quand l'écran demandé appartient à un module ÉTEINT.
 *
 * ⚠ UNE SEULE SOURCE, et voici pourquoi elle a été extraite le 14 septembre
 * 2026. La coque du personnel portait ce bloc en ligne ; le circuit de dépôt
 * ajoute DEUX écrans qui vivent hors de cette coque — `/mon-depot` (l'étudiant)
 * et `/depots-a-valider` (le directeur). Recopier le bloc aurait fait trois
 * copies d'un même message, et une copie diverge : c'est le défaut que ce dépôt
 * a payé cinq fois en une journée sur un vocabulaire de dépôt.
 *
 * ⚠ UNE INFORMATION, PAS UNE ALERTE. Un module désactivé est un état que le
 * produit permet de créer EXPRÈS : un administrateur l'a éteint, la veille
 * peut-être. Le peindre en rouge qualifie d'anomalie un réglage volontaire, et
 * apprend à lire les rouges comme du décor. La règle est écrite : ce que
 * quelqu'un a pu vouloir s'affiche en information ; l'avertissement est réservé
 * à ce que personne n'a pu vouloir.
 */
export function EcranModuleEteint({ fonctions }: { fonctions?: string[] | null }) {
  return (
    <>
      <LienDEvitement />
      <Header fonctions={fonctions} />
      <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-8">
        <p className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-muted">
          {LIBELLES.modules.ecranModuleInactif}
        </p>
      </main>
    </>
  );
}
