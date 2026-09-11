/**
 * Aucun graphique ne produit de géométrie invalide sur des données dégradées.
 *
 * ⚠ POURQUOI CE TEST EXISTE, alors que le code est déjà défensif. Les écrans de
 * statistiques n'avaient RIEN à afficher jusqu'au 10 septembre 2026 : leurs
 * états dégradés n'avaient jamais été exercés parce que le fonds de
 * démonstration ne contenait ni prêt, ni retard, ni exemplaire. Ils vont être
 * montrés pour la première fois avec des données réelles.
 *
 * La famille visée est connue et coûteuse : `<circle attribute r: A negative
 * value is not valid>` a rempli la console de la page d'accueil publique
 * pendant des jours, sans rien casser — les étoiles fautives ne se dessinaient
 * simplement pas. Un `NaN` dans un attribut SVG se comporte pareil : le
 * navigateur l'ignore, le graphique paraît plausible, et l'erreur n'apparaît
 * que dans les outils de développement — ouverts, par exemple, pendant une
 * démonstration.
 *
 * Les quatre cas exercés sont exactement ceux où un dénominateur peut être nul :
 * série vide, série constante à zéro, point unique, total nul.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AreaLineChart, Donut, HorizontalBars, Sparkline } from '@/components/stat-charts';

/** Tout nombre écrit dans le DOM, quel que soit l'attribut qui le porte. */
function attributsNumeriques(conteneur: HTMLElement): string[] {
  const valeurs: string[] = [];
  conteneur.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) valeurs.push(attr.value);
    if (el instanceof HTMLElement && el.style.width) valeurs.push(el.style.width);
  });
  return valeurs;
}

function invalides(conteneur: HTMLElement): string[] {
  return attributsNumeriques(conteneur).filter((v) => /NaN|Infinity/.test(v));
}

const SERIE_VIDE: { date: string; loans: number; returns: number }[] = [];
const SERIE_ZERO = [
  { date: '2026-09-01', loans: 0, returns: 0 },
  { date: '2026-09-02', loans: 0, returns: 0 },
];
const UN_POINT = [{ date: '2026-09-01', loans: 0, returns: 0 }];

describe('⚠ courbe temporelle', () => {
  it('série vide : aucun NaN, aucun Infinity', () => {
    const { container } = render(<AreaLineChart data={SERIE_VIDE} />);
    expect(invalides(container)).toEqual([]);
  });

  it('série CONSTANTE à zéro : le dénominateur ne s’effondre pas', () => {
    const { container } = render(<AreaLineChart data={SERIE_ZERO} />);
    expect(invalides(container)).toEqual([]);
  });

  it('UN SEUL point : la division par (n - 1) ne se produit pas', () => {
    // n = 1 ⇒ i / (n - 1) = 0 / 0. C'est le cas le plus facile à écrire par
    // accident et le plus difficile à voir : une courbe à un point a l'air
    // d'une courbe à un point.
    const { container } = render(<AreaLineChart data={UN_POINT} />);
    expect(invalides(container)).toEqual([]);
  });
});

describe('⚠ sparkline, barres et anneau', () => {
  it('sparkline constante à zéro', () => {
    // ⚠ Son `span = max - min || 1` est du code MORT, et le contrôle négatif
    // l'a montré : le retirer ne fait rien tomber. `max` est borné à 1 par le
    // bas (`Math.max(...values, 1)`) et `min` à 0 par le haut, donc l'écart
    // vaut au moins 1 quoi qu'on lui donne. Le cas reste exercé — il vient
    // d'ailleurs que d'une division par zéro.
    const { container } = render(<Sparkline values={[0, 0, 0]} />);
    expect(invalides(container)).toEqual([]);
  });

  it('barres toutes à zéro : max nul', () => {
    const { container } = render(
      <HorizontalBars rows={[{ label: 'Droit', count: 0 }, { label: 'Arts', count: 0 }]} />,
    );
    expect(invalides(container)).toEqual([]);
  });

  it('anneau de total nul : il se tait au lieu de diviser', () => {
    const { container } = render(<Donut rows={[{ label: 'Droit', count: 0 }]} />);
    expect(invalides(container)).toEqual([]);
    expect(container.textContent).toContain('Aucun document.');
  });
});

describe('témoins — sans eux, « aucun NaN » serait vrai sur du vide', () => {
  it('un graphique nourri dessine vraiment quelque chose', () => {
    const { container } = render(
      <AreaLineChart
        data={[
          { date: '2026-09-01', loans: 3, returns: 1 },
          { date: '2026-09-02', loans: 5, returns: 4 },
        ]}
      />,
    );
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(invalides(container)).toEqual([]);
  });

  it('le détecteur SAIT reconnaître un NaN', () => {
    // Sans ce témoin, une expression fautive rendrait `invalides()` aveugle et
    // les six tests ci-dessus passeraient sur n'importe quoi.
    const { container } = render(
      <svg>
        <circle r={String(Number.NaN)} cx="1" cy="1" />
      </svg>,
    );
    expect(invalides(container)).toEqual(['NaN']);
  });
});
