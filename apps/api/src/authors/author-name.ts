/**
 * Nom d'auteur normalisé, clé de déduplication du fichier d'autorités :
 * minuscules, accents retirés (NFD + suppression des marques combinantes),
 * espaces réduits, sans espaces de bord. « Ouédraogo  Jean » et
 * « ouedraogo jean » se regroupent donc sur la même fiche.
 */
export function normalizeAuthorName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // marques combinantes (diacritiques décomposés)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
