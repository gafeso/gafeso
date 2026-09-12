/**
 * La mise en arbre des collections — éprouvée sans DOM.
 *
 * ⚠ P6-1 : profondeur maximale 3, garantie par un TRIGGER en base et non par
 * l'application. Le front ne la fait donc pas respecter — il l'affiche. Ce qu'il
 * doit garantir, lui, c'est de ne PERDRE aucune collection en chemin.
 */

import { describe, expect, it } from 'vitest';
import { enArbre, invisibleDeTous } from '@/lib/arbre-collections';

const n = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId });

describe('enArbre', () => {
  it('range les racines par nom', () => {
    const r = enArbre([n('b', 'Médecine'), n('a', 'Droit')]);
    expect(r.map((x) => x.noeud.name)).toEqual(['Droit', 'Médecine']);
    expect(r.every((x) => x.profondeur === 0)).toBe(true);
  });

  it('place chaque enfant sous sa parente, avec sa profondeur', () => {
    const r = enArbre([
      n('fac', 'Faculté de Droit'),
      n('dep', 'Département privé', 'fac'),
      n('typ', 'Thèses', 'dep'),
    ]);
    expect(r.map((x) => [x.noeud.name, x.profondeur])).toEqual([
      ['Faculté de Droit', 0],
      ['Département privé', 1],
      ['Thèses', 2],
    ]);
  });

  /**
   * ⚠ LE CAS QUI FAIT DISPARAÎTRE DES DONNÉES. Un `parentId` qui ne correspond à
   * rien — liste filtrée par droits, parente supprimée entre deux chargements —
   * ne doit pas faire tomber l'enfant hors de l'écran. Il remonte en racine.
   */
  it('un orphelin remonte en racine, il ne disparaît pas', () => {
    const r = enArbre([n('a', 'Droit'), n('perdu', 'Orpheline', 'parent-inconnu')]);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.noeud.name === 'Orpheline')?.profondeur).toBe(0);
  });

  it('aucune collection n’est perdue, quelle que soit la forme', () => {
    const plats = [
      n('a', 'A'), n('b', 'B', 'a'), n('c', 'C', 'b'),
      n('d', 'D'), n('e', 'E', 'inconnu'), n('f', 'F', 'd'),
    ];
    // ⚠ Le témoin COMPTE : six entrées, six rangs. Une récursion qui saute une
    // branche rendrait un arbre plausible et incomplet.
    expect(enArbre(plats)).toHaveLength(plats.length);
  });

  it('liste vide : arbre vide, pas d’exception', () => {
    expect(enArbre([])).toEqual([]);
  });
});

describe('invisibleDeTous', () => {
  it('zéro règle : invisible de tous', () => {
    expect(invisibleDeTous({ _count: { accessRules: 0 } })).toBe(true);
  });
  it('une règle : visible de quelqu’un', () => {
    expect(invisibleDeTous({ _count: { accessRules: 1 } })).toBe(false);
  });
});
