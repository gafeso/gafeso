/**
 * Contraste WCAG des couleurs réellement employées — la passe jamais faite.
 *
 * ⚠ CALCULÉ SUR LES JETONS, PAS SUR DES PIXELS. La seule mesure de contraste
 * qu'avait le dépôt avait été faussée par un canvas laissé vide : les zones
 * transparentes se lisent NOIRES, et le rapport sortait flatteur à 21:1 au lieu
 * de 18,98. Partir des couleurs DÉCLARÉES supprime l'instrument fautif — il n'y
 * a plus de pixels à lire, donc plus rien à peindre avant de mesurer.
 *
 * ⚠ ET LE CALCUL SEUL NE DÉSIGNE PAS LA FAUTE. Sur vingt paires calculées,
 * quatre échouaient ; trois étaient FABRIQUÉES par le relevé :
 *   — « accent sur fond » : c'est le `em` du bandeau, 38 à 60 px, donc un seuil
 *     de 3:1, qu'il franchit (3,61) ;
 *   — « highlight sur primaire » : cette paire N'EXISTE PAS. Le highlight est
 *     posé sur `--text` (7,51:1) et sur `--primary-dark` (5,35:1), jamais sur
 *     `--primary`.
 * D'où la forme de ce fichier : chaque paire porte l'endroit où elle est
 * employée ET la taille du texte, parce que c'est la taille qui décide du seuil.
 * Une paire qu'on ne sait pas situer n'a rien à faire ici.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Valeur d'une variable CSS, lue dans le fichier qui la déclare. */
function jeton(fichier: string, nom: string): string {
  const m = lire(fichier).match(new RegExp(`--${nom}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`jeton --${nom} introuvable dans ${fichier}`);
  return m[1];
}

/** Couleur `rgb` déclarée en composantes dans globals.css (marque du tenant). */
function jetonRgb(nom: string): string {
  const m = lire('app/globals.css').match(new RegExp(`--${nom}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!m) throw new Error(`jeton --${nom} introuvable`);
  return '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('');
}

const vers = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Couleur translucide posée sur un support — ce que l'œil voit réellement. */
function melange(avant: string, arriere: string, opacite: number): string {
  const [a, b] = [vers(avant), vers(arriere)];
  return '#' + a.map((v, i) => Math.round(v * opacite + b[i] * (1 - opacite)).toString(16).padStart(2, '0')).join('');
}

function luminance(h: string): number {
  const [r, g, b] = vers(h).map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const CSS = 'app/home.module.css';
const PUB = {
  accentTexte: jeton(CSS, 'accent-texte'),
  surface: jeton(CSS, 'surface'),
  bg: jeton(CSS, 'bg'),
  bgDeep: jeton(CSS, 'bg-deep'),
  text: jeton(CSS, 'text'),
  textSoft: jeton(CSS, 'text-soft'),
  primaryDark: jeton(CSS, 'primary-dark'),
  highlight: jeton(CSS, 'highlight'),
  danger: jeton(CSS, 'danger'),
};
const PRO = {
  ink: jetonRgb('brand-primary-rgb'),
  ocre: jetonRgb('brand-secondary-rgb'),
  heading: jetonRgb('heading-rgb'),
  paper: '#FCFBF7',
  line: '#E5E1D6',
  muted: '#5E6B78',
  blanc: '#FFFFFF',
};

/**
 * Couleur de texte d'un ton de `Badge`, LUE dans le composant.
 *
 * ⚠ ÉCRIT APRÈS UN CONTRÔLE NÉGATIF QUI N'A RIEN CASSÉ. Le tableau ci-dessous
 * DÉCLARAIT que le badge ocre écrit à l'encre ; rendre `text-ocre` au composant
 * — c'est-à-dire remettre le défaut à 2,56:1 — ne faisait donc rien tomber. Un
 * test qui restate le code ne garde que la palette, jamais l'appariement.
 *
 * Ici la classe est lue : changer `text-ink` en `text-ocre` change ce qu'on
 * mesure, et la suite refuse.
 */
function texteDuBadge(ton: 'neutral' | 'ocre' | 'green'): string {
  const src = lire('components/ui.tsx');
  const bloc = src.slice(src.indexOf('neutral:'), src.indexOf('green-800'));
  const m = bloc.match(new RegExp(`${ton}:\\s*'[^']*text-([a-z0-9-]+)`));
  if (!m) throw new Error(`ton ${ton} illisible dans components/ui.tsx`);
  const connues: Record<string, string> = {
    ink: PRO.ink, ocre: PRO.ocre, muted: PRO.muted, heading: PRO.heading,
  };
  const couleur = connues[m[1]];
  if (!couleur) throw new Error(`couleur « ${m[1]} » non cataloguée par ce test`);
  return couleur;
}

const AA_PETIT = 4.5;
const AA_GRAND = 3;

/** [ce qu'on lit, sur quoi, seuil, où — et la taille qui justifie le seuil] */
const PAIRES: [string, string, string, number, string][] = [
  // ── Espace professionnel ──────────────────────────────────────────────────
  ['texte courant', PRO.heading, PRO.paper, AA_PETIT, 'corps de page, 14–16 px'],
  ['texte secondaire', PRO.muted, PRO.paper, AA_PETIT, '`text-muted`, 12–14 px'],
  ['bouton primaire', PRO.blanc, PRO.ink, AA_PETIT, '`bg-ink text-white`, 14 px'],
  ['badge ocre', texteDuBadge('ocre'), melange(PRO.ocre, PRO.paper, 0.15), AA_PETIT,
    '« En retard », « Amendes constatées », 12 px gras — couleur LUE dans ui.tsx'],
  ['badge neutre (lu)', texteDuBadge('neutral'), melange(PRO.line, PRO.paper, 0.6), AA_PETIT,
    'couleur lue dans ui.tsx'],
  ['badge neutre', PRO.muted, melange(PRO.line, PRO.paper, 0.6), AA_PETIT, '12 px gras'],
  ['avertissement', PRO.ink, melange(PRO.ocre, PRO.paper, 0.1), AA_PETIT, '`Alert` ton warning, 14 px'],
  // ── Pages publiques ───────────────────────────────────────────────────────
  ['texte sur fond', PUB.text, PUB.bg, AA_PETIT, 'corps de la page d’accueil'],
  ['texte sur surface', PUB.text, PUB.surface, AA_PETIT, 'cartes'],
  ['texte doux', PUB.textSoft, PUB.bg, AA_PETIT, 'paragraphes secondaires'],
  ['accent en petit texte', PUB.accentTexte, PUB.surface, AA_PETIT, '`.cardEspace .cap`, 12 px'],
  ['accent en petit texte (fond)', PUB.accentTexte, PUB.bg, AA_PETIT, 'même jeton, autre fond'],
  ['accent en petit texte (fond profond)', PUB.accentTexte, PUB.bgDeep, AA_PETIT, 'même jeton'],
  ['danger', PUB.danger, PUB.bg, AA_PETIT, 'messages d’erreur'],
  ['pied : texte', PUB.surface, PUB.primaryDark, AA_PETIT, 'liens du pied, 14 px'],
  ['pied : titres', PUB.highlight, PUB.primaryDark, AA_PETIT, '`.titreDePied`, 12 px'],
  ['bandeau sombre : numéros', PUB.highlight, PUB.text, AA_PETIT, '`.serviceItem .num`, 12 px'],
];

describe('Contraste WCAG AA', () => {
  it.each(PAIRES)('%s — %s sur %s (≥ %s:1)', (_nom, texte, fond, seuil) => {
    expect(contraste(texte, fond)).toBeGreaterThanOrEqual(seuil);
  });

  /**
   * ⚠ Le `em` du bandeau est le SEUL usage de `--accent` en grand texte, et il
   * relève du seuil 3:1. Il est ici pour que personne ne « corrige » ce jeton en
   * croyant qu'il échoue : il ne doit PAS être jugé à 4,5.
   */
  it('bandeau : l’accent en grand texte relève du seuil 3:1', () => {
    const accent = jeton(CSS, 'accent');
    const r = contraste(accent, PUB.bg);
    expect(r).toBeGreaterThanOrEqual(AA_GRAND);
    expect(r).toBeLessThan(AA_PETIT); // il échouerait en petit texte — d'où `--accent-texte`
  });

  /** ⚠ Témoins : deux rapports dont je connais la valeur par cœur. */
  it('témoins — le calcul est juste', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contraste('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contraste('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // limite AA connue
  });

  /** ⚠ Témoin de lecture : les jetons viennent bien des fichiers. */
  it('témoin — les jetons sont lus, pas écrits en dur', () => {
    expect(PUB.accentTexte).toMatch(/^#[0-9a-f]{6}$/);
    expect(PRO.ink).toBe('#0f2b46');
    expect(() => jeton(CSS, 'jeton-qui-nexiste-pas')).toThrow();
    // ⚠ Et la lecture du composant : elle doit rendre l'encre, pas l'ocre.
    expect(texteDuBadge('ocre')).toBe(PRO.ink);
    expect(texteDuBadge('neutral')).toBe(PRO.muted);
  });
});
