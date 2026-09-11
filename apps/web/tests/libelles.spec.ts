/**
 * Le fichier de libellés tient sa convention.
 *
 * Ce premier fichier fixe la forme de tous les suivants. Les règles qu'il porte
 * ne valent que si quelque chose les tient : un commentaire d'en-tête est lu
 * par qui le cherche, un test est exécuté par tout le monde.
 */

import { describe, expect, it } from 'vitest';
import { LIBELLES } from '@/lib/libelles';

type Noeud = string | ((...args: never[]) => string) | { [k: string]: Noeud };

/** Parcourt l'arbre et rend [chemin, valeur] pour chaque feuille. */
function feuilles(n: Noeud, chemin: string[] = []): [string, unknown][] {
  if (typeof n === 'string' || typeof n === 'function') return [[chemin.join('.'), n]];
  return Object.entries(n).flatMap(([k, v]) => feuilles(v as Noeud, [...chemin, k]));
}

describe('convention du fichier de libellés', () => {
  it('est STRUCTURÉ par écran ou domaine, jamais à plat', () => {
    // ⚠ La règle qui compte pour la suite. Un fichier à plat devient illisible
    // à deux cents entrées, et personne ne le restructure ensuite : le coût de
    // la mise à plat se paie une fois, celui du désordre à chaque lecture.
    for (const [cle, valeur] of Object.entries(LIBELLES)) {
      expect(typeof valeur, `LIBELLES.${cle} est une feuille à la racine`).toBe('object');
    }
    // Et il y a bien plusieurs domaines : un seul serait un plat déguisé.
    expect(Object.keys(LIBELLES).length).toBeGreaterThan(1);
  });

  it('chaque feuille porte un texte, jamais du vide', () => {
    const toutes = feuilles(LIBELLES as unknown as Noeud);
    expect(toutes.length).toBeGreaterThan(10); // témoin : le parcours a bien vu
    for (const [chemin, valeur] of toutes) {
      if (typeof valeur === 'string') {
        expect(valeur.trim(), chemin).not.toBe('');
      } else {
        expect(typeof valeur, chemin).toBe('function');
      }
    }
  });

  it('les textes à trou sont des FONCTIONS, pas des chaînes à concaténer', () => {
    // Une langue qui place ses mots autrement n'a rien à recomposer : elle
    // réécrit la fonction. Une chaîne « Image » + n + « sur » + total, elle,
    // impose l'ordre français à toutes les langues.
    expect(LIBELLES.bandeau.imageSur(2, 3)).toBe('Image 2 sur 3');
    expect(LIBELLES.catalogue.compteNotices(12)).toBe('12 notice(s)');
    expect(LIBELLES.importNotices.occurrences(1)).toBe('1 notice');
    expect(LIBELLES.importNotices.occurrences(3)).toBe('3 notices');
  });

  it('aucune feuille ne contient de balise ni d’espace insécable HTML', () => {
    // Un libellé est du TEXTE. Le balisage reste dans le composant, sinon la
    // traduction devient de la programmation et le rendu échappe au relecteur.
    for (const [chemin, valeur] of feuilles(LIBELLES as unknown as Noeud)) {
      if (typeof valeur !== 'string') continue;
      expect(valeur, chemin).not.toMatch(/<[a-z/]/i);
      expect(valeur, chemin).not.toContain('&nbsp;');
    }
  });
});
