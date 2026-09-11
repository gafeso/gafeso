/**
 * Le voile du bandeau garantit la lisibilité, QUELLE QUE SOIT L'IMAGE.
 *
 * Du texte blanc sur une photo est le défaut classique de ce motif : « ça
 * passe » sur la photo du jour ne dit rien de la suivante, et l'établissement
 * change ses images sans nous demander. La garantie ne peut donc pas dépendre
 * du contenu — elle doit tenir sur le PIRE CAS, une photo entièrement blanche.
 *
 * Le calcul est fermé. Texte blanc sur un voile noir d'opacité α, composé sur
 * du blanc :
 *     α 0,55 → 4,76:1     α 0,65 → 6,98:1     α 0,70 → 8,52:1
 *     seuil AA  (4,5:1) → α ≥ 0,535
 *     seuil AAA (7:1)   → α ≥ 0,651  ← celui qu'on tient
 *
 * Ce test lit le VRAI dégradé dans la feuille de style et vérifie que son
 * opacité, sur toute la hauteur où le texte peut se poser, ne descend jamais
 * sous ce seuil. Il ne juge rien : il calcule.
 *
 * AAA plutôt que AA : cette page est consultée sur des téléphones d'entrée de
 * gamme, souvent en plein soleil. La marge d'un écran de bureau n'existe pas là.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Hauteur (en % du dégradé) sous laquelle le bloc de texte est ancré. */
const ZONE_TEXTE = 52;
/** AAA, et non AA : page publique, téléphones d'entrée de gamme, lecture en plein soleil. */
const SEUIL_AAA = 7;

function luminance(canal255: number): number {
  const c = canal255 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Contraste du BLANC sur un voile noir d'opacité α posé sur du blanc. */
function contrasteBlancSurVoile(alpha: number): number {
  // Composition sRGB (le navigateur compose en gamma, pas en linéaire).
  const gris = 255 * (1 - alpha);
  return 1.05 / (luminance(gris) + 0.05);
}

/** Arrêts du dégradé de `.heroVoile` : [position %, opacité]. */
function arretsDuVoile(): [number, number][] {
  const css = readFileSync(resolve(process.cwd(), 'app', 'home.module.css'), 'utf-8');
  const bloc = css.slice(css.indexOf('.heroVoile'), css.indexOf('}', css.indexOf('.heroVoile')));
  return [...bloc.matchAll(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)\s+([\d.]+)%/g)].map((m) => [
    Number(m[2]),
    Number(m[1]),
  ]);
}

describe('contraste du bandeau', () => {
  it('le calcul de référence est juste', () => {
    // Témoin : si cette fonction dérive, toutes les assertions suivantes
    // deviennent des tampons sur du vide.
    expect(contrasteBlancSurVoile(0.7)).toBeGreaterThan(8.5);
    expect(contrasteBlancSurVoile(0.7)).toBeLessThan(8.6);
    expect(contrasteBlancSurVoile(0.3)).toBeLessThan(2.5);
  });

  it('le dégradé est bien lu dans la feuille de style', () => {
    // Témoin : un sélecteur renommé rendrait une liste vide, et « aucun arrêt
    // sous le seuil » serait vrai sans rien prouver.
    const arrets = arretsDuVoile();
    expect(arrets.length).toBeGreaterThanOrEqual(3);
    expect(arrets[0][0]).toBe(0); // ancré en bas, là où le texte se pose
  });

  it('sur toute la zone de texte, le pire cas reste au-dessus de AAA', () => {
    const sousLeTexte = arretsDuVoile().filter(([position]) => position <= ZONE_TEXTE);
    expect(sousLeTexte.length).toBeGreaterThan(0);

    for (const [position, alpha] of sousLeTexte) {
      const contraste = contrasteBlancSurVoile(alpha);
      expect(
        contraste,
        `à ${position}% le voile est à ${alpha} → ${contraste.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(SEUIL_AAA);
    }
  });

  it('même une photo BLANCHE reste lisible — c’est tout l’objet du voile', () => {
    const minimum = Math.min(
      ...arretsDuVoile()
        .filter(([p]) => p <= ZONE_TEXTE)
        .map(([, a]) => a),
    );
    expect(minimum).toBeGreaterThanOrEqual(0.651);
    expect(contrasteBlancSurVoile(minimum)).toBeGreaterThanOrEqual(SEUIL_AAA);
  });
});
