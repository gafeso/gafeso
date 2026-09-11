// Diapositives du bandeau d'accueil.
//
// Aucune dépendance navigateur : importable depuis un Server Component comme
// depuis un composant client.
//
// ⚠ LA LISTE SE LIT À LA RACINE de GET /tenancy/home, à côté de `content` —
// JAMAIS dans `content.identity.heroSlides`. Les deux existent dans la charge
// utile et ne disent pas la même chose : la racine porte la liste EFFECTIVE
// (celle que l'API reconstruit à la volée pour un établissement configuré
// avant `heroSlides`), `content.identity` porte ce qui est réellement STOCKÉ.
// L'écran /admin/accueil relit ce même endpoint et renvoie `content` entier en
// PATCH : lire la liste effective depuis `content` la ferait persister dans les
// données du client, à un moment que personne n'aurait décidé.
//
// L'adaptateur front qui reconstruisait une diapositive depuis
// heroImageUrl/Kicker/Caption a été SUPPRIMÉ le 10 septembre 2026 : l'API tient
// désormais cette compatibilité, sans écriture (`heroSlidesEffectives`). Il
// demandait lui-même sa disparition ; c'était le moment.

/** Une diapositive, telle que l'API la sert. Miroir de HomeHeroSlide. */
export interface Diapositive {
  /** Image. OBLIGATOIRE : sans elle, il n'y a rien à montrer. */
  imageUrl: string;
  /** Texte mis en avant. Vide si non saisi. */
  titre: string;
  /** Texte affiché AU-DESSUS du titre. Vide si non saisi. */
  surtitre: string;
}

/**
 * Au-delà, personne ne les regarde et le poids s'envole.
 * ⚠ L'API borne déjà (MAX_HERO_SLIDES). Ce plafond-ci est une ceinture : le
 * bandeau existe pour tenir un budget de requêtes, il ne délègue pas à un
 * appelant le soin de ne pas le crever.
 */
export const MAX_DIAPOSITIVES = 5;

/** Écarte ce qui n'a pas d'image, puis borne. Dans cet ordre. */
export function bornerDiapositives(liste: Diapositive[]): Diapositive[] {
  // Écarter AVANT de borner : une entrée sans image n'est pas une diapositive
  // dégradée, c'en est zéro — la compter ferait perdre une diapositive valide.
  return liste.filter((d) => d.imageUrl.trim().length > 0).slice(0, MAX_DIAPOSITIVES);
}
