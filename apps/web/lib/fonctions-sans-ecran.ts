// Fonctions qu'un rôle système DÉTIENT sans qu'aucune entrée de menu ne les
// réclame — et pourquoi.
//
// ⚠ CE FICHIER N'A AUCUN EFFET À L'EXÉCUTION. Il documente, et il est lu par
// tests/couverture-des-roles.spec.ts, qui refuse toute fonction absente d'ici.
//
// ── POURQUOI IL EXISTE ────────────────────────────────────────────────────
// On surveillait les ÉCRANS SANS PERMISSION — une entrée visible menant à un
// écran qui refuse. On n'a jamais surveillé l'inverse : une PERMISSION SANS
// ÉCRAN, c'est-à-dire un droit qu'on donne à quelqu'un sans lui donner la
// porte. Le 10 septembre 2026, la mesure de l'espace professionnel a montré
// qu'une bibliothécaire détient `adherents.gerer` — cinq routes d'API derrière
// elle, dont « inscrire un adhérent » — et qu'aucun écran ne l'ouvre.
//
// ⚠ DEUX NATURES, ET NE JAMAIS LES CONFONDRE. Une exception peut dire « c'est
// normal » ou « c'est un défaut connu ». Si les deux s'écrivaient pareil, cette
// liste deviendrait l'endroit où l'on enterre les trouvailles : il suffirait
// d'y ajouter une ligne pour faire taire le test. La nature est donc obligatoire
// et lisible d'un coup d'œil.

export type NatureSansEcran =
  /** S'exerce ailleurs que dans une entrée de menu. Rien à corriger. */
  | 'exercee-ailleurs'
  /** Le droit existe, la porte manque. C'est un DÉFAUT, suivi au backlog. */
  | 'defaut-connu';

export interface FonctionSansEcran {
  fonction: string;
  nature: NatureSansEcran;
  /** Une phrase. Où elle s'exerce, ou pourquoi elle ne s'exerce nulle part. */
  raison: string;
}

// ⚠ `adherents.gerer` FIGURAIT ICI en 'defaut-connu' jusqu'au 10 septembre 2026,
// avec « AUCUNE porte » pour raison. L'écran /admin/adherents existe désormais,
// une entrée de menu réclame la fonction, et la déclaration est donc PÉRIMÉE —
// le test l'a d'ailleurs refusée avant qu'on y pense. C'est la mécanique voulue :
// une dette qui ne se rappelle pas d'elle-même n'est pas une dette, c'est un
// oubli en attente.
export const FONCTIONS_SANS_ECRAN: FonctionSansEcran[] = [
  {
    fonction: 'document.lire',
    nature: 'exercee-ailleurs',
    raison:
      'S’exerce dans l’OPAC public (lecture en ligne d’une notice), pas dans ' +
      'l’espace professionnel. Aucune entrée de menu ne la réclame, et c’est ' +
      'normal : le catalogue public n’est pas derrière le menu du personnel.',
  },
  {
    fonction: 'comptes.activer',
    nature: 'exercee-ailleurs',
    raison:
      'S’exerce comme ACTION dans /admin/comptes, écran ouvert par ' +
      '`lecteurs.voir` que le Gestionnaire détient aussi. Le front ne ' +
      'conditionne pas le bouton : c’est l’API qui garde l’action, et c’est ' +
      'le bon endroit — un garde front en plus ne protégerait rien de neuf.',
  },
];
