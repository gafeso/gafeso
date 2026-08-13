// Aucune dépendance navigateur ici : importable depuis le middleware (edge) ET
// depuis les composants client.

/**
 * Page d'atterrissage après connexion, selon le rôle (bug prod 2026-07-16 :
 * la connexion renvoyait sur la vitrine publique « / », où rien n'indique
 * qu'on est connecté). On envoie plutôt vers une page utile :
 *  - ADMIN / MANAGER → tableau de bord d'administration
 *  - LIBRARIAN → guichet de prêt/retour
 *  - étudiants et autres → catalogue (OPAC)
 * Les rôles correspondent à la nav filtrée de components/header.tsx.
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
