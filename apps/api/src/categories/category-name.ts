/**
 * Normalisation d'un nom de domaine (catégorie) — SOURCE UNIQUE.
 *
 * Deux écritures normalisaient différemment : `CategoriesService` réduisait les
 * espaces internes, `CatalogingService` non. « droit  public » (deux espaces) et
 * « droit public » devenaient donc deux domaines distincts, dont un
 * inatteignable — le renommage cherche l'ancien nom EXACT, et la suppression
 * compte sur la même égalité stricte.
 *
 * Toute écriture d'un nom de domaine — ligne `categories` comme colonne
 * `biblio_records.category` — passe par ici.
 */

/** Forme canonique stockée : sans espaces superflus, en minuscules. */
export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Clé de COMPARAISON, en plus débarrassée des accents : « Économie » et
 * « economie » désignent le même domaine. Sert au seed (ne pas recréer un
 * doublon accentué) et au rapprochement des valeurs importées.
 *
 * ⚠ Ce n'est PAS la forme stockée : on ne dépouille jamais un nom de ses
 * accents en base.
 */
export function foldCategoryName(name: string): string {
  return normalizeCategoryName(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
