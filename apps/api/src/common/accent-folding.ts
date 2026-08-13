/**
 * Repli des accents pour la RECHERCHE, côté SQL comme côté JS.
 *
 * POURQUOI : `contains` + `mode: 'insensitive'` de Prisma ignore la casse mais
 * PAS les diacritiques. Sur un fonds sahélien, chercher « ouedraogo » ne
 * trouvait donc pas « Ouédraogo », ni « traore » → « Traoré », ni
 * « kabore » → « Kaboré » — c'est-à-dire l'essentiel des patronymes.
 *
 * POURQUOI PAS `unaccent` : l'extension existe et couvre plus d'Unicode, mais
 * `CREATE EXTENSION` est une étape de déploiement supplémentaire, donc un mode
 * de panne de plus pour un produit auto-hébergé et hors-ligne. `translate()`
 * est du SQL standard, disponible partout, sans installation.
 *
 * Les deux chaînes doivent rester STRICTEMENT de même longueur et alignées
 * caractère par caractère — c'est le contrat de `translate()`. Le test
 * l'affirme, pour qu'un ajout ne puisse pas les désaligner silencieusement.
 */

/** Caractères accentués reconnus (minuscules ; appliquer `lower()` avant). */
export const ACCENTED = 'áàâäãåéèêëíìîïóòôöõúùûüýÿçñ';
/** Leur équivalent sans diacritique, dans le MÊME ordre. */
export const UNACCENTED = 'aaaaaaeeeeiiiiooooouuuuyycn';

/**
 * Expression SQL repliant une colonne (ou un concat) en minuscules sans accents.
 * L'argument doit être une expression SQL SÛRE (nom de colonne littéral),
 * jamais une saisie utilisateur.
 */
export function sqlFoldExpression(sqlExpression: string): string {
  return `translate(lower(${sqlExpression}), '${ACCENTED}', '${UNACCENTED}')`;
}

/** Même repli, côté JS — sert à normaliser le TERME recherché avant de l'envoyer. */
export function foldAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
