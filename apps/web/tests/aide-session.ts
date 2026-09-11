// Session de test, côté navigateur seulement.
//
// `useMyFunctions` court-circuite son appel à /auth/me/functions quand aucune
// session n'existe (cookie non sensible `bc_user`) : un écran rendu sans ce
// cookie voit donc « aucune fonction » et affiche son refus. Les tests qui
// rendent un écran du personnel doivent poser ce cookie.
//
// ⚠ Rien de secret ici : `bc_user` est le PROFIL D'AFFICHAGE, pas le jeton.
// Le JWT vit dans un cookie httpOnly posé par l'API, illisible en JS — et on
// ne fabrique jamais de session à partir d'un secret d'environnement.

const PROFIL = {
  id: 'u-test',
  email: 'test@exemple.bf',
  firstName: 'Test',
  lastName: 'Utilisateur',
  role: 'LIBRARIAN',
  className: null,
};

export function ouvrirSession(profil: Partial<typeof PROFIL> = {}): void {
  const valeur = encodeURIComponent(JSON.stringify({ ...PROFIL, ...profil }));
  document.cookie = `bc_user=${valeur}; path=/`;
}

export function fermerSession(): void {
  document.cookie = 'bc_user=; path=/; max-age=0';
}
