// Chiffres du fonds — quelles tuiles méritent d'être montrées.
//
// Aucune dépendance navigateur : utilisable depuis un Server Component.

import type { ChiffresDuFonds } from './server-api';

/**
 * ⚠ SEUIL D'AFFICHAGE D'UNE TUILE — un seul endroit, délibérément.
 *
 * Une bibliothèque qui démarre ne montre pas « 12 documents » devant un
 * comité : ce n'est pas un mensonge, c'est une mise en scène de sa propre
 * faiblesse, et l'effet obtenu est l'inverse de celui recherché. En dessous du
 * seuil, la tuile disparaît — et si AUCUNE ne l'atteint, la section entière
 * disparaît, comme le bandeau vide avant elle.
 *
 * 50, décidé le 10 septembre 2026. Ma proposition initiale distinguait les
 * quatre grandeurs (100 documents / 50 lecteurs / 20 numériques / 20 lectures),
 * au motif qu'elles ne sont pas comparables — cinquante documents est une
 * bibliothèque qui démarre, cinquante lecteurs une classe entière. Un seuil
 * unique a été retenu ; la structure ci-dessous permet de repasser à quatre
 * valeurs en une ligne si l'usage montre que c'était la bonne intuition.
 */
export const SEUIL_TUILE = 50;

export interface Tuile {
  cle: keyof ChiffresDuFonds;
  valeur: number;
}

/** L'ordre est celui de la maquette ; il ne dépend pas des valeurs. */
const ORDRE: (keyof ChiffresDuFonds)[] = [
  'documents',
  'lecteurs',
  'documentsNumeriques',
  'lecturesHorsLigne',
];

/**
 * Les tuiles à afficher. Vide si aucune n'atteint le seuil — l'appelant en
 * déduit que la section ne se rend pas.
 */
export function tuilesSignificatives(chiffres: ChiffresDuFonds | null): Tuile[] {
  if (!chiffres) return [];
  return ORDRE.map((cle) => ({ cle, valeur: chiffres[cle] })).filter(
    (t) => Number.isFinite(t.valeur) && t.valeur >= SEUIL_TUILE,
  );
}

/** Séparateur de milliers en français : espace insécable fine, pas de virgule. */
export function formaterNombre(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}
