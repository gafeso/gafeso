/**
 * Le ciel étoilé ne produit pas de géométrie invalide.
 *
 * ⚠ Ce défaut a vécu des jours dans la console de la page d'accueil PUBLIQUE.
 * `h >> 20` sur un hachage supérieur à 2³¹ rend un négatif — le décalage signé
 * de JavaScript convertit d'abord en entier 32 bits signé — et le reste `%`
 * conserve le signe. Résultat : `r = 0.6 + (-9)/12 = -0.15`, refusé par SVG,
 * répété à chaque rendu.
 *
 * Rien ne CASSAIT : les étoiles fautives ne se dessinaient simplement pas, et
 * un ciel étoilé auquel il manque quelques points ressemble à un ciel étoilé.
 * C'est le genre de défaut qu'on ne voit que dans les outils de développement —
 * ouverts, par exemple, pendant une démonstration client.
 */

import { describe, expect, it } from 'vitest';
import { ETOILES_POUR_TEST } from '@/components/constellation';

const etoiles = ETOILES_POUR_TEST();

describe('champ d’étoiles', () => {
  it('en produit bien un ciel, pas une poignée', () => {
    // Témoin : sans lui, « aucun rayon négatif » serait vrai sur zéro étoile.
    expect(etoiles.length).toBe(70);
  });

  it('aucun rayon n’est négatif ou nul — SVG les refuse', () => {
    const fautifs = etoiles.filter((e) => !(e.r > 0));
    expect(fautifs.map((e) => e.r)).toEqual([]);
  });

  it('aucune opacité hors des bornes', () => {
    const fautifs = etoiles.filter((e) => !(e.o >= 0 && e.o <= 1));
    expect(fautifs.map((e) => e.o)).toEqual([]);
  });

  it('aucune étoile hors du cadre — sinon elle est calculée pour rien', () => {
    // `y` souffrait du MÊME décalage signé : une ordonnée négative plaçait
    // l'étoile au-dessus du viewBox, invisible et sans erreur pour le dire.
    const fautifs = etoiles.filter((e) => e.x < 0 || e.x > 800 || e.y < 0 || e.y > 800);
    expect(fautifs).toEqual([]);
  });

  it('reste DÉTERMINISTE : deux rendus donnent le même ciel', () => {
    // Le hachage existe pour que le serveur et le client dessinent la même
    // chose — sans quoi l'hydratation signalerait un écart à chaque visite.
    expect(ETOILES_POUR_TEST()).toEqual(etoiles);
  });
});
