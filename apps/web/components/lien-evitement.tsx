// Lien d'évitement — partagé par la coque professionnelle et les pages publiques.
//
// ⚠ POURQUOI IL EST EXTRAIT. Il a d'abord vécu dans `admin-shell.tsx`, où il ne
// servait que le personnel. Le relevé d'accessibilité des pages PUBLIQUES a
// montré qu'aucune ne l'avait — y compris le catalogue et la fiche d'une notice,
// c'est-à-dire les écrans des étudiants, qui sont le plus grand nombre.
//
// ⚠ ET SA POSITION VIT DANS `globals.css`, PAS ICI. Deux écritures en variantes
// Tailwind ont laissé le lien hors de l'écran au focus, et aucun test en jsdom
// ne pouvait le dire — il n'y a pas de mise en page. Voir le commentaire de la
// règle `.lien-evitement`, qui porte la mesure.

import { LIBELLES } from '@/lib/libelles';

/** Cible du lien — une seule chaîne pour tous les `<main>` du produit. */
export const ID_CONTENU = 'contenu';

export function LienDEvitement() {
  return (
    <a
      href={`#${ID_CONTENU}`}
      className="lien-evitement z-50 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"
    >
      {LIBELLES.accessibilite.allerAuContenu}
    </a>
  );
}
