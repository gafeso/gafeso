/**
 * Étiquettes de la constellation — elles doivent TENIR dans leur pastille.
 *
 * Défaut constaté sur téléphone réel : « étiquettes tronquées et superposées
 * quand les libellés sont longs ». Un texte SVG ne se replie ni ne se tronque
 * de lui-même — il déborde et vient chevaucher les nœuds voisins.
 */

import { describe, expect, it } from 'vitest';
import { lignesEtiquette } from '@/components/constellation';

// Rayons réels produits par nodeRadiusCap() : 76 est le plafond (peu de
// domaines), ~50 correspond à une orbite chargée.
const LARGE = 76;
const SERRE = 50;

/** Budget de caractères, recalculé comme le composant le fait. */
const budget = (r: number) => Math.max(7, Math.floor((r * 1.7) / 8.2));

describe('lignesEtiquette', () => {
  it('laisse un libellé court sur une seule ligne, intact', () => {
    expect(lignesEtiquette('Droit', LARGE)).toEqual(['Droit']);
    expect(lignesEtiquette('Médecine', LARGE)).toEqual(['Médecine']);
  });

  it('replie un libellé long sur deux lignes au lieu de le laisser déborder', () => {
    const lignes = lignesEtiquette('Histoire et disciplines auxiliaires', LARGE);
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.length).toBeLessThanOrEqual(2);
    // Le repli se fait aux espaces : aucun mot n'est coupé en deux.
    expect(lignes.join(' ')).toContain('Histoire');
  });

  it('ne dépasse JAMAIS deux lignes, quelle que soit la longueur', () => {
    const monstre = 'Agronomie, agriculture et activités connexes du monde rural sahélien';
    for (const r of [LARGE, SERRE, 40, 30]) {
      expect(lignesEtiquette(monstre, r).length, `rayon ${r}`).toBeLessThanOrEqual(2);
    }
  });

  it('respecte le budget de caractères, ellipse comprise', () => {
    const monstre = 'Agronomie, agriculture et activités connexes du monde rural sahélien';
    for (const r of [LARGE, SERRE, 40, 30]) {
      for (const ligne of lignesEtiquette(monstre, r)) {
        expect(ligne.length, `rayon ${r} — « ${ligne} »`).toBeLessThanOrEqual(budget(r));
      }
    }
  });

  it('tronque un mot unique trop long, avec une ellipse visible', () => {
    // Cas où le repli est impossible : rien à couper aux espaces.
    const lignes = lignesEtiquette('Anticonstitutionnellement', SERRE);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].endsWith('…')).toBe(true);
    expect(lignes[0].length).toBeLessThanOrEqual(budget(SERRE));
  });

  it('resserre les étiquettes quand les pastilles rétrécissent', () => {
    // Une orbite chargée a des nœuds plus petits : le budget doit suivre,
    // sinon le chevauchement revient exactement là où il faisait mal.
    const large = lignesEtiquette('Sciences sociales appliquées', LARGE);
    const serre = lignesEtiquette('Sciences sociales appliquées', 30);
    expect(Math.max(...serre.map((l) => l.length))).toBeLessThan(
      Math.max(...large.map((l) => l.length)),
    );
  });

  it('ne rend jamais de ligne vide', () => {
    for (const texte of ['Droit', 'Histoire et disciplines auxiliaires', 'A', '']) {
      for (const ligne of lignesEtiquette(texte, SERRE)) {
        expect(ligne.length).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * Rendu réel du composant avec des libellés longs.
 *
 * Le test unitaire ci-dessus prouve la logique ; celui-ci prouve qu'elle est
 * bien appliquée à l'écran. Il existe parce que les domaines de la base de
 * démonstration sont tous courts (« Droit », « Arts »…) : le défaut constaté
 * en production ne s'y reproduit pas, et une vérification au navigateur sur
 * ces données ne prouverait donc rien.
 */
describe('rendu SVG des vedettes longues', () => {
  const LONGS = [
    { category: 'Agronomie, agriculture et activités connexes', count: 4 },
    { category: 'Histoire et disciplines auxiliaires', count: 7 },
    { category: 'Droit', count: 12 },
  ];

  it('replie les libellés longs en tspan et laisse les courts sur une ligne', async () => {
    const { render } = await import('@testing-library/react');
    const { ConstellationSection } = await import('@/components/constellation');
    const { container } = render(
      <ConstellationSection domains={LONGS} totalRecords={23} tenantName="Test" />,
    );

    const svg = container.querySelector('svg[aria-label="Domaines de la bibliothèque"]');
    expect(svg, "la constellation SVG n'est pas rendue").toBeTruthy();

    const vedettes = [...svg!.querySelectorAll('text')].filter(
      (t) => t.getAttribute('font-weight') === '700' && t.getAttribute('font-size') === '16',
    );
    expect(vedettes).toHaveLength(3);

    const parTexte = new Map(
      vedettes.map((t) => [t.textContent ?? '', [...t.querySelectorAll('tspan')].map((s) => s.textContent)]),
    );
    // Le libellé court tient sur une ligne unique…
    const court = [...parTexte.entries()].find(([t]) => t.startsWith('Droit'));
    expect(court![1].length).toBe(1);
    // …les longs sont repliés, jamais laissés déborder d'un seul tenant.
    for (const [texte, lignes] of parTexte) {
      if (texte.startsWith('Droit')) continue;
      expect(lignes.length, `« ${texte} » n'est pas replié`).toBe(2);
    }
  });

  it('conserve le nom complet pour le survol et les lecteurs d’écran', async () => {
    // Le repli tronque à l'écran : rien ne doit être perdu pour autant.
    const { render } = await import('@testing-library/react');
    const { ConstellationSection } = await import('@/components/constellation');
    const { container } = render(
      <ConstellationSection domains={LONGS} totalRecords={23} tenantName="Test" />,
    );
    const svg = container.querySelector('svg[aria-label="Domaines de la bibliothèque"]');
    const titres = [...svg!.querySelectorAll('title')].map((t) => t.textContent);
    expect(titres).toContain('Agronomie, agriculture et activités connexes — 4 ressources');

    const liens = [...svg!.querySelectorAll('a')].map((a) => a.getAttribute('aria-label'));
    expect(liens).toContain('Histoire et disciplines auxiliaires — 7 ressources');
  });
});
