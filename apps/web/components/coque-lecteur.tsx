import type { ReactNode } from 'react';

import { Header } from '@/components/header';
import { ID_CONTENU, LienDEvitement } from '@/components/lien-evitement';

/**
 * ⭐⭐ LA COQUE DE L'ESPACE LECTEUR — et elle naît d'une IMPASSE mesurée.
 *
 * ## 🔴 CE QU'ELLE RÉPARE
 *
 * Constaté par Jean sur la démonstration rc12, avec un compte étudiant :
 * `/mes-consultations` et `/mes-documents-hors-ligne` s'affichaient **sans
 * en-tête, sans menu et sans pied**. L'étudiant n'avait **aucune navigation** —
 * une impasse : pour en sortir, il fallait taper une adresse.
 *
 * ⚠ Et ce n'était pas un oubli isolé : six écrans de l'espace lecteur
 * recopiaient chacun `<LienDEvitement /> <Header />` dans leur propre `return`.
 * **La septième copie est celle qui manque toujours** — « deux tableaux qui se
 * ressemblent » appliqué à une coque. Elle existe donc UNE fois ici.
 *
 * ## ⚠ CE QU'ELLE PORTE, ET CE QU'ELLE NE PORTE PAS
 *
 * | | |
 * |---|---|
 * | le lien d'évitement | ⚠ il manquait à `mes-prets` jusqu'au 13 septembre 2026 : un usager au clavier traversait tout le menu à chaque visite |
 * | l'en-tête, donc le menu du compte | c'est la navigation |
 * | le `<main id>` que le lien d'évitement VISE | sans lui, le lien saute dans le vide |
 * | **aucun pied de page** | mesuré : il n'existe AUCUN composant de pied partagé — `<footer>` est écrit à la main dans l'accueil, `/e/[slug]` et la coque d'administration, et AUCUN écran de l'espace lecteur n'en porte. En ajouter un ici le ferait apparaître sur deux écrans et pas sur les six autres. C'est une décision à prendre pour les huit, pas un effet de bord de ce correctif. |
 *
 * ⭐ `coque-de-l-espace-lecteur.spec.ts` tient la propriété pour TOUS les
 * écrans, pas pour ces deux-là : chaque page hors administration rend la coque,
 * ou elle est déclarée exception AVEC SON MOTIF.
 */
export function CoqueLecteur({
  children,
  largeur = 'max-w-3xl',
}: {
  children: ReactNode;
  /** ⚠ Les écrans existants emploient `max-w-3xl` ; un seul l'élargit. */
  largeur?: string;
}) {
  return (
    <>
      <LienDEvitement />
      <Header />
      <main id={ID_CONTENU} className={`mx-auto ${largeur} px-6 py-8`}>
        {children}
      </main>
    </>
  );
}
