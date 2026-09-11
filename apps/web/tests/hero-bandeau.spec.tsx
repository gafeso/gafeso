/**
 * Bandeau d'accueil — le mécanisme, pas l'apparence.
 *
 * ⚠ CE QUE CE FICHIER PROTÈGE : sur mobile, les images non affichées ne doivent
 * jamais être TÉLÉCHARGÉES. jsdom ne charge pas les images, donc on ne peut pas
 * compter des requêtes ici — on compte les <img> MONTÉS, ce qui est le bon
 * proxy : une image absente du DOM ne peut pas être demandée, et une image
 * masquée en CSS y serait présente. C'est précisément ce qui fait tomber ce
 * test si quelqu'un remplace le montage conditionnel par du `display:none`.
 *
 * Le comptage des requêtes réellement émises reste à faire au navigateur, avec
 * de vraies données multiples — voir la note de reprise en fin de fichier.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { HeroBandeau } from '@/components/home/hero-bandeau';
import { bornerDiapositives, MAX_DIAPOSITIVES } from '@/lib/hero-slides';

// Forme SERVIE par l'API (HomeHeroSlide) : imageUrl / titre / surtitre.
const TROIS = [
  { imageUrl: 'https://ex.bf/1.jpg', titre: 'Salle de lecture', surtitre: 'CAMPUS' },
  { imageUrl: 'https://ex.bf/2.jpg', titre: 'Fonds ancien', surtitre: 'COLLECTIONS' },
  { imageUrl: 'https://ex.bf/3.jpg', titre: 'Étudiants', surtitre: 'VIE' },
];

/** Pilote `matchMedia` : c'est lui qui décide de ce qui est monté. */
function ecran({ large, moinsDAnimation = false }: { large: boolean; moinsDAnimation?: boolean }) {
  vi.stubGlobal('matchMedia', (requete: string) => ({
    matches: requete.includes('prefers-reduced-motion') ? moinsDAnimation : large,
    media: requete,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const images = (c: HTMLElement) => [...c.querySelectorAll('img')];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('cas 1 — mobile : une seule image MONTÉE', () => {
  it('ne monte qu’une image sur trois configurées', () => {
    ecran({ large: false });
    const { container } = render(<HeroBandeau diapositives={TROIS} />);

    const rendues = images(container);
    expect(rendues).toHaveLength(1);
    expect(rendues[0].getAttribute('src')).toBe(TROIS[0].imageUrl);

    // CONTRÔLE NÉGATIF, formulé sur le MÉCANISME : si les trois étaient dans
    // le document et masquées en CSS, ces deux assertions tomberaient — et
    // c'est exactement le piège que le lot existe pour éviter.
    expect(container.innerHTML).not.toContain(TROIS[1].imageUrl);
    expect(container.innerHTML).not.toContain(TROIS[2].imageUrl);
  });

  it('montre la PREMIÈRE configurée, celle que l’admin a ordonnée en tête', () => {
    ecran({ large: false });
    const { container } = render(<HeroBandeau diapositives={TROIS} />);
    expect(images(container)[0].getAttribute('src')).toBe(TROIS[0].imageUrl);
    expect(screen.getByText('Salle de lecture')).toBeInTheDocument();
  });

  it('n’affiche ni points ni contrôles', () => {
    ecran({ large: false });
    render(<HeroBandeau diapositives={TROIS} />);
    expect(screen.queryByRole('group', { name: 'Choisir une image' })).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('cas 2 — grand écran', () => {
  it('monte les trois images, la première immédiate et les suivantes différées', () => {
    ecran({ large: true });
    const { container } = render(<HeroBandeau diapositives={TROIS} />);
    const rendues = images(container);
    expect(rendues).toHaveLength(3);
    expect(rendues[0].getAttribute('loading')).toBe('eager');
    expect(rendues[1].getAttribute('loading')).toBe('lazy');
    expect(rendues[2].getAttribute('loading')).toBe('lazy');
  });

  it('fait défiler, et la pause au survol arrête la rotation', () => {
    vi.useFakeTimers();
    ecran({ large: true });
    const { container } = render(<HeroBandeau diapositives={TROIS} />);

    expect(screen.getByText('Salle de lecture')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(7000));
    expect(screen.getByText('Fonds ancien')).toBeInTheDocument();

    fireEvent.mouseEnter(container.firstElementChild!);
    act(() => void vi.advanceTimersByTime(21000));
    expect(screen.getByText('Fonds ancien')).toBeInTheDocument(); // toujours figé
  });
});

describe('cas 3, 4, 5 — cas limites', () => {
  it('aucune diapositive : RIEN n’est rendu, pas même un cadre', () => {
    ecran({ large: true });
    const { container } = render(<HeroBandeau diapositives={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('une seule diapositive : ni points ni rotation, sur les deux largeurs', () => {
    for (const large of [false, true]) {
      ecran({ large });
      const { container, unmount } = render(<HeroBandeau diapositives={[TROIS[0]]} />);
      expect(images(container)).toHaveLength(1);
      expect(screen.queryByRole('group', { name: 'Choisir une image' })).toBeNull();
      unmount();
    }
  });

  it('image sans titre ni légende : aucun bloc de texte vide', () => {
    ecran({ large: true });
    const { container } = render(
      <HeroBandeau diapositives={[{ imageUrl: 'https://ex.bf/1.jpg', titre: '', surtitre: '' }]} />,
    );
    expect(images(container)).toHaveLength(1);
    // Le conteneur ne porte que l'image : pas de div de légende vide.
    expect(container.textContent).toBe('');
  });

  it('grand écran : une image en échec est ignorée, les autres continuent', () => {
    ecran({ large: true });
    const { container } = render(<HeroBandeau diapositives={TROIS} />);
    fireEvent.error(images(container)[1]);
    const restantes = images(container).map((i) => i.getAttribute('src'));
    expect(restantes).toEqual([TROIS[0].imageUrl, TROIS[2].imageUrl]);
  });

  it('mobile : si la seule image échoue, RIEN — pas de seconde requête', () => {
    // Aller chercher la suivante coûterait exactement ce que ce bandeau existe
    // pour éviter. Un bandeau absent vaut mieux qu'un bandeau à deux images.
    ecran({ large: false });
    const { container } = render(<HeroBandeau diapositives={TROIS} />);
    fireEvent.error(images(container)[0]);
    expect(container.innerHTML).toBe('');
  });
});

describe('cas 6, 7 — accessibilité', () => {
  it('prefers-reduced-motion : pas de rotation, points utilisables', () => {
    vi.useFakeTimers();
    ecran({ large: true, moinsDAnimation: true });
    render(<HeroBandeau diapositives={TROIS} />);

    act(() => void vi.advanceTimersByTime(30000));
    expect(screen.getByText('Salle de lecture')).toBeInTheDocument(); // n'a pas bougé

    const points = screen.getAllByRole('button');
    expect(points).toHaveLength(3);
    fireEvent.click(points[2]);
    expect(screen.getByText('Étudiants')).toBeInTheDocument();
  });

  it('clavier seul : les points sont atteignables et actionnables', () => {
    ecran({ large: true });
    render(<HeroBandeau diapositives={TROIS} />);
    const points = screen.getAllByRole('button');

    for (const p of points) {
      expect(p.tagName).toBe('BUTTON'); // focalisable nativement
      expect(p).toHaveAttribute('aria-label');
    }
    points[1].focus();
    expect(document.activeElement).toBe(points[1]);
    fireEvent.click(points[1]); // Entrée/Espace sur un <button> déclenche click
    expect(screen.getByText('Fonds ancien')).toBeInTheDocument();
    expect(points[1]).toHaveAttribute('aria-current', 'true');
  });

  it('les images sont décoratives : alt vide, aucun lien', () => {
    ecran({ large: true });
    const { container } = render(<HeroBandeau diapositives={TROIS} />);
    for (const i of images(container)) expect(i.getAttribute('alt')).toBe('');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('bornage de la liste', () => {
  it('écarte les entrées sans image, PUIS borne à cinq', () => {
    // L'ordre compte : borner d'abord ferait perdre une diapositive valide à
    // cause d'une entrée qui n'aurait jamais dû compter.
    const brut = Array.from({ length: 8 }, (_, i) => ({
      imageUrl: `https://ex.bf/${i}.jpg`,
      titre: '',
      surtitre: '',
    }));
    expect(bornerDiapositives(brut)).toHaveLength(MAX_DIAPOSITIVES);
    expect(bornerDiapositives([{ imageUrl: '  ', titre: 'x', surtitre: '' }])).toEqual([]);
    expect(
      bornerDiapositives([{ imageUrl: '', titre: '', surtitre: '' }, ...brut]),
    ).toHaveLength(MAX_DIAPOSITIVES);
  });
});

/**
 * ✅ CAS 1 ET 2 DE LA RECETTE : MESURÉS le 10 septembre 2026.
 *
 * Sur build de production, avec trois diapositives réellement stockées, en
 * comptant les requêtes émises (`performance.getEntriesByType('resource')`) :
 *   375 px → UNE seule requête d'image ;
 *   large  → TROIS, la première `eager`, les suivantes `lazy`.
 *
 * ⚠ Les tests de ce fichier comptent les <img> MONTÉS, pas les requêtes. C'est
 * le bon proxy du MÉCANISME — une image absente du DOM ne peut pas être
 * demandée, une image masquée en CSS y serait — et c'est ce qui fait tomber le
 * test si quelqu'un revient à un `display:none`. Mais un test jsdom ne charge
 * aucune image : il ne remplacera jamais la mesure au navigateur, et la mesure
 * ne remplacera jamais ce test. Les deux tiennent des choses différentes.
 */
