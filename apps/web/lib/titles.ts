// Affichage du titre d'une notice : « Titre : complément » quand un
// complément/sous-titre existe (cahier des charges fiche de saisie §2.1).
// Le séparateur « : » relève de l'AFFICHAGE uniquement — les deux parties
// restent stockées séparément en base, jamais concaténées.
export function formatTitle(title: string, titleComplement?: string | null): string {
  return titleComplement ? `${title} : ${titleComplement}` : title;
}
