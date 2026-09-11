// Aucune dépendance navigateur ici : importable depuis le middleware (edge) ET
// depuis les composants client.

/**
 * Page d'atterrissage après connexion, selon le rôle (bug prod 2026-07-16 :
 * la connexion renvoyait sur la vitrine publique « / », où rien n'indique
 * qu'on est connecté). On envoie plutôt vers une page utile :
 *  - ADMIN / MANAGER → espace professionnel (/admin, qui redirige ensuite
 *    vers la première section accessible, elle par FONCTION)
 *  - LIBRARIAN → guichet de prêt/retour
 *  - étudiants et autres → catalogue (OPAC)
 *
 * ⚠ CECI EST LE DERNIER POINT DU CHEMIN DU PERSONNEL QUI RAISONNE ENCORE PAR
 * RÔLE, ET C'EST VOLONTAIRE — ce n'est pas un oubli de la refonte de
 * navigation, qui a converti tout le reste aux fonctions (coque, en-tête,
 * redirection de /admin, garde du guichet).
 *
 * Raison : cette fonction est appelée depuis `middleware.ts`, qui tourne en
 * PÉRIPHÉRIE (edge). Le middleware ne dispose que des cookies ; les fonctions
 * effectives, elles, se résolvent en base à chaque requête et ne s'obtiennent
 * que par un appel à l'API (/auth/me/functions). Convertir cet atterrissage
 * demanderait donc un aller-retour réseau sur chaque navigation gardée.
 *
 * Le coût du compromis est faible : ce n'est PAS une décision d'accès, juste
 * une destination. Les deux destinations produites (/admin, /guichet) sont
 * dans la coque du personnel, qui refiltre par fonction à l'arrivée — un rôle
 * qui atterrirait au mauvais endroit y verrait sa navigation réelle.
 */
export function landingPathForRole(role: string | null | undefined): string {
  switch (role) {
    case 'ADMIN':
    case 'MANAGER':
      return '/admin';
    case 'LIBRARIAN':
      return '/guichet';
    default:
      return '/opac';
  }
}

/**
 * Libellé français d'un rôle système, pour l'affichage (page « Mon compte »).
 * Aligné sur ROLE_LABELS de l'écran admin des comptes. Un rôle dynamique
 * (personnalisé par l'école) n'a pas d'entrée ici : on retombe sur sa valeur
 * brute plutôt que d'inventer un libellé.
 */
export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'STUDENT':
      return 'Étudiant';
    case 'LIBRARIAN':
      return 'Bibliothécaire';
    case 'MANAGER':
      return 'Gestionnaire';
    case 'ADMIN':
      return 'Administrateur';
    default:
      return role ?? '—';
  }
}
