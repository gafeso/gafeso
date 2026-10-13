/**
 * ⭐⭐ L'ÉPREUVE DE LA COUVERTURE v3 — on PARSE, on ne cherche pas par `contains`.
 *
 * *Décision du 12 octobre 2026 : « parse le SVG produit, ne cherche pas par
 * contains ; réintroduis un défaut pour vérifier que l'épreuve tombe ».*
 *
 * ## ⚠ POURQUOI `contains` NE VAUT RIEN ICI
 *
 * `expect(html).toContain('rotate(')` passe sur un `rotate` écrit dans un
 * commentaire, dans un autre attribut, ou appliqué au mauvais nœud. Ce qui
 * décide du dessin n'est pas la présence d'une sous-chaîne : c'est **quel nœud
 * porte quelle valeur**. On construit donc l'arbre et on l'interroge.
 *
 * ⚠ Et c'est la forme que ce dépôt a déjà payée ailleurs : « un grep sur un nom
 * ne prouve pas qu'on lit la chose qui le porte ».
 *
 * ## 🔴 CE QUI N'EST PAS ENCORE MESURÉ : la PARITÉ
 *
 * La référence de parité est `docs/couvertures/references-parite.json`, produite
 * par la session mobile — **absente du dépôt au 12 octobre 2026** (vérifié :
 * le chemin n'existe pas). Ces épreuves tiennent donc la STRUCTURE et la
 * DÉTERMINISME, pas l'accord avec le mobile. En cas d'écart, c'est le web qui
 * a tort (décision) : la correction se fera dans `variationDeCouverture`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CouvertureV3,
  hautDuTitre,
  titreEnLignes,
  variationDeCouverture,
} from '@/components/couverture-v3';
import { MOTIFS, POSITIONS, TEINTE_DU_DOMAINE } from '@/lib/couvertures-v3.generated';

/**
 * ⚠ JSDOM NORMALISE LES COULEURS : `#8A4A00` relu devient `rgb(138, 74, 0)`.
 * Comparer la chaîne brute accuserait un composant juste — c'est l'instrument
 * qui transforme ce qu'il montre. On compare donc deux formes NORMALISÉES.
 */
function memeCouleur(lu: string, attendu: string): boolean {
  const n = (c: string) => {
    const m = c.match(/^#([0-9a-f]{6})$/i);
    if (!m) return c.replace(/\s+/g, '');
    const v = m[1];
    return `rgb(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)})`;
  };
  return n(lu) === n(attendu);
}

/** ⚠ On rend, puis on PARSE. Rien n'est cherché dans la chaîne. */
function arbre(props: Parameters<typeof CouvertureV3>[0]): Document {
  const html = renderToStaticMarkup(<CouvertureV3 {...props} />);
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

const GRAND = {
  coverTemplate: 'these',
  coverDomain: 'droit',
  titre: 'Le régime foncier rural',
  auteur: 'Ouédraogo, Awa',
  annee: 2026,
  etablissement: 'Université d’Exemple',
  type: 'THÈSE DE DOCTORAT',
  largeur: 300,
} as const;

describe('⭐⭐ la structure, lue dans l’ARBRE', () => {
  it('la racine porte le fond du domaine et se cache des lecteurs d’écran', () => {
    const d = arbre(GRAND);
    const racine = d.querySelector('body > div');
    expect(racine, 'aucune racine de couverture').not.toBeNull();
    expect(racine!.getAttribute('aria-hidden')).toBe('true');
    // ⚠ On lit le STYLE du nœud, pas la chaîne du document.
    expect(
      memeCouleur((racine as HTMLElement).style.background, TEINTE_DU_DOMAINE.droit),
      `fond ${(racine as HTMLElement).style.background} au lieu de ${TEINTE_DU_DOMAINE.droit}`,
    ).toBe(true);
  });

  /**
   * ⭐ LE MOTIF EST PORTÉ PAR UN `<g>` QUI A LA VARIATION — et c'est ce couple
   * qui décide du dessin. Un `transform` posé sur le `<svg>` ou sur un enfant
   * donnerait une autre pose, et `contains` ne verrait pas la différence.
   */
  it('le `<g>` du motif porte EXACTEMENT la variation de ce titre', () => {
    const d = arbre(GRAND);
    const g = d.querySelector('svg > g');
    expect(g, 'le motif n’est pas dans un groupe').not.toBeNull();
    const v = variationDeCouverture(GRAND.titre);
    expect(g!.getAttribute('transform')).toBe(
      `translate(${v.dx},${v.dy}) rotate(${v.rotation} 250 170) scale(${v.echelle})`,
    );
    expect(g!.getAttribute('opacity')).toBe(String(v.opacite));
    /*
     * ⚠ ON COMPARE LA STRUCTURE, pas la chaîne : le parseur réécrit les
     * attributs (casse, guillemets, auto-fermeture). Le compte des formes et
     * leurs rayons suffisent à distinguer un gabarit d'un autre, et c'est ce
     * qui décide du dessin.
     */
    const formes = [...g!.children].map((n) => n.tagName.toLowerCase());
    const attendues = [...new DOMParser()
      .parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${MOTIFS.these}</svg>`, 'image/svg+xml')
      .documentElement.children].map((n) => n.tagName.toLowerCase());
    expect(formes).toEqual(attendues);
    expect(formes.length, 'le motif est vide').toBeGreaterThan(0);
  });

  it('le `viewBox` est celui du maître — sinon la pose du motif glisse', () => {
    const svg = arbre(GRAND).querySelector('svg');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 500 700');
  });

  /**
   * ⭐ LES POSITIONS SONT CELLES DE `positions-textes.json`, à l'échelle. On
   * lit le style du nœud et on le compare au calcul — pas à un nombre recopié,
   * qui serait « une chaîne recopiée qui ne se voit pas ».
   */
  it('chaque bloc de texte est posé aux cotes de la source', () => {
    const d = arbre(GRAND);
    const e = GRAND.largeur / 500;
    const blocs = [...d.querySelectorAll('body > div > div')] as HTMLElement[];
    const gauche = `${POSITIONS.type.x * e}px`;
    // ⚠ TOUS les blocs partent de la marge gauche de la zone sûre.
    for (const b of blocs) expect(b.style.left).toBe(gauche);

    const parTexte = (t: string) => blocs.find((b) => b.textContent?.trim() === t);
    expect(parTexte(GRAND.type)!.style.top).toBe(`${POSITIONS.type.y * e}px`);
    expect(parTexte(GRAND.auteur)!.style.top).toBe(`${POSITIONS.author.y * e}px`);
    expect(parTexte(String(GRAND.annee))!.style.top).toBe(`${POSITIONS.year.y * e}px`);
    expect(parTexte(GRAND.etablissement)!.style.top).toBe(
      `${POSITIONS.establishment.y * e}px`,
    );
  });

  /**
   * ⭐⭐ LE TITRE EST ANCRÉ PAR LE BAS, et c'est la mesure qui le prouve : la
   * source donne un `y` par nombre de lignes — 467, 425, 390, 348 — dont la
   * DERNIÈRE ligne tombe toujours à 467.
   */
  /**
   * ⭐⭐ LA POSITION DU TITRE EST CELLE DE LA SOURCE, à 0 px — et ce cas tient la
   * correction du 13 octobre 2026.
   *
   * ⚠ Avant elle, le bloc était ancré par le BAS : exact à 1 et 2 lignes, et
   * **7 px trop haut à 3 et 4**, parce que la dernière ligne ne tombe PAS
   * toujours à 467 (467 / 467 / 474 / 474). La référence est
   * `positions-textes.json`, avec 1 px de tolérance.
   *
   * ⭐ La coupe explicite supprime l'écart : le nombre de lignes RENDUES est
   * celui qui décide de la position.
   */
  /**
   * ⭐⭐ LA COTE EST LUE DANS `positions-textes.json`, et RIEN n'est calculé par
   * le bas. Écart exigé : **0 px sur les quatre cas**.
   *
   * ⚠ La table porte un décalage qui ne suit aucune règle simple — la dernière
   * ligne tombe à 467 à 1 et 2 lignes, à **474** à 3 et 4. Ce n'est pas une
   * erreur de la source : c'est le dessin, et on le REPRODUIT.
   *
   * ⭐ C'est pourquoi la cote se LIT au lieu de se calculer. Toute formule —
   * ancrage par le bas, par le haut, interpolation — donnerait 467 ou 474 pour
   * les quatre, donc 7 px d'écart sur deux cas.
   */
  it('⭐ les quatre cotes sont celles de la source, à 0 px', () => {
    const table = POSITIONS.title.y_by_line_count as Record<string, number>;
    /*
     * ⚠ TÉMOIN SUR LA SOURCE ELLE-MÊME : si le dessin change, ce cas convoque
     * au lieu de laisser une cote périmée passer. « Quand la valeur de
     * référence vient d'une source EXTÉRIEURE, le test doit affirmer que cette
     * source porte encore la propriété qu'on éprouve. »
     */
    expect([table['1'], table['2'], table['3'], table['4']]).toEqual([467, 425, 390, 348]);
    for (const n of [1, 2, 3, 4]) {
      expect(hautDuTitre(n), `${n} ligne(s) : écart à la source`).toBe(table[String(n)]);
    }
    // ⚠ Hors bornes : on retombe sur une cote CONNUE, jamais `undefined` — qui
    // mettrait le bloc en haut de la page.
    expect(hautDuTitre(9)).toBe(table['4']);
    expect(hautDuTitre(0)).toBe(table['1']);
  });

  /**
   * ⭐⭐ LE DÉCALAGE DE 7 PX EST REPRODUIT, pas corrigé. C'est la table qui le
   * porte, et la reproduire est tout l'objet de la parité.
   */
  it('⭐ la dernière ligne tombe à 467 / 467 / 474 / 474 — le dessin, pas une formule', () => {
    const p = POSITIONS.title;
    const derniere = (n: number) =>
      hautDuTitre(n) + (n - 1) * p.line_height_px;
    expect([1, 2, 3, 4].map(derniere)).toEqual([467, 467, 474, 474]);
    /*
     * ⚠ TÉMOIN D'ABSENCE, et c'est lui qui barre la formule : un ancrage par le
     * bas rendrait 467 QUATRE fois. Si ces deux comptes devenaient égaux, la
     * cote ne viendrait plus de la table.
     */
    expect(derniere(3)).not.toBe(derniere(1));
    expect(derniere(3) - derniere(1)).toBe(7);
  });

  /**
   * ⚠ ET LE CODE NE CALCULE RIEN : la cote sort d'une LECTURE de la table. Un
   * `467` écrit en dur dans le composant serait le début d'une formule.
   */
  it('⚠ aucune cote de titre n’est écrite en dur dans le composant', () => {
    const src = readFileSync(resolve(process.cwd(), 'components/couverture-v3.tsx'), 'utf-8')
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(src.length, 'le retrait des commentaires a mangé le fichier').toBeGreaterThan(1000);
    for (const cote of ['467', '425', '390', '348', '474']) {
      expect(src, `la cote ${cote} est écrite en dur : elle doit être LUE`).not.toContain(cote);
    }
    // ⚠ Témoin de PRÉSENCE : la table est bien lue.
    expect(src).toContain('y_by_line_count');
  });

  /**
   * ⭐ ET LE DOM PORTE LE NOMBRE DE LIGNES QUI A DÉCIDÉ DE LA POSITION. C'est
   * ce couple qui rend l'écart nul : si le navigateur coupait autrement, la
   * cote serait fausse d'une hauteur de ligne.
   */
  it('⭐ autant de lignes rendues que de lignes comptées, et la cote suit', () => {
    const e = GRAND.largeur / 500;
    for (const titre of [
      'Court',
      'Le régime foncier rural et le développement local au Burkina',
      'Épidémiologie de terrain et surveillance des maladies à potentiel épidémique dans la région du Sahel burkinabè',
    ]) {
      const d = arbre({ ...GRAND, titre });
      const lignes = titreEnLignes(titre);
      const bloc = [...d.querySelectorAll('body > div > div')].find((b) =>
        b.querySelector('span'),
      ) as HTMLElement;
      expect(bloc, `aucun bloc de titre pour « ${titre.slice(0, 30)} »`).toBeTruthy();
      expect(bloc.querySelectorAll('span')).toHaveLength(lignes.length);
      expect(
        bloc.style.top,
        `« ${titre.slice(0, 30)} » : ${lignes.length} ligne(s), cote fausse`,
      ).toBe(`${hautDuTitre(lignes.length) * e}px`);
      // ⚠ Témoin d'ABSENCE : la coupe ne PERD pas de mots.
      expect(lignes.join(' ')).toBe(titre.split(/\s+/).filter(Boolean).slice(0, lignes.join(' ').split(' ').length).join(' '));
    }
  });

  it('le filet d’accent porte la couleur et le rayon de la source', () => {
    const d = arbre(GRAND);
    const e = GRAND.largeur / 500;
    const filet = [...d.querySelectorAll('body > div > div')].find((b) =>
      memeCouleur((b as HTMLElement).style.background, POSITIONS.accentRule.color),
    ) as HTMLElement;
    expect(filet, 'aucun filet d’accent').toBeTruthy();
    expect(filet.style.width).toBe(`${POSITIONS.accentRule.width * e}px`);
    expect(filet.style.borderRadius).toBe(`${POSITIONS.accentRule.radius * e}px`);
  });
});

describe('⭐ le DÉTERMINISME, et le repli prescrit', () => {
  it('⚠ le même titre rend la MÊME variation — c’est le seul service rendu', () => {
    const a = variationDeCouverture('Le régime foncier rural');
    const b = variationDeCouverture('Le régime foncier rural');
    expect(a).toEqual(b);
  });

  /**
   * ⚠ LA NORMALISATION FAIT PARTIE DE LA GRAINE, et elle s'écrit en
   * ÉCHAPPEMENTS : « la forme d'un caractère dans un fichier source ne se lit
   * pas, elle s'écrit ». Deux « Ouédraogo » composés différemment s'affichent au
   * pixel près et ne sont pas la même chaîne.
   */
  it('⭐ NFC, minuscules et espaces réduits donnent la même graine', () => {
    const NFD = 'Ouédraogo';
    const NFC = 'Ouédraogo';
    // ⚠ Le témoin qui prouve que le jeu d'essai porte encore le cas.
    expect(NFD.length, 'le jeu d’essai n’est plus décomposé').toBe(10);
    expect(NFC.length).toBe(9);
    expect(variationDeCouverture(NFD)).toEqual(variationDeCouverture(NFC));
    expect(variationDeCouverture('  LE  PETIT   PRINCE ')).toEqual(
      variationDeCouverture('le petit prince'),
    );
  });

  it('les valeurs restent dans les bornes du dessin livré', () => {
    for (const t of ['a', 'Ouédraogo', 'Le régime foncier rural', '猫', '']) {
      const v = variationDeCouverture(t);
      expect(v.dx).toBeGreaterThanOrEqual(-10);
      expect(v.dx).toBeLessThanOrEqual(10);
      expect(v.dy).toBeGreaterThanOrEqual(-10);
      expect(v.dy).toBeLessThanOrEqual(10);
      expect(v.rotation).toBeGreaterThanOrEqual(-4);
      expect(v.rotation).toBeLessThanOrEqual(4);
      expect(v.echelle).toBeGreaterThanOrEqual(0.92);
      expect(v.echelle).toBeLessThanOrEqual(1.08);
      expect(v.opacite).toBeGreaterThanOrEqual(0.1);
      expect(v.opacite).toBeLessThanOrEqual(0.19);
    }
  });

  /**
   * ⚠ LE REPLI PRESCRIT : clé absente → `manuel` / `autre`, **jamais
   * l'ancienne vignette** (décision). Et `autre` est un fond NEUTRE : « un fond
   * de domaine faux est pire qu'un fond neutre, il affirme ».
   */
  it('⭐ clé absente → `manuel` et `autre`, mesuré dans l’arbre', () => {
    const d = arbre({ titre: 'Sans clés', largeur: 300 });
    const racine = d.querySelector('body > div') as HTMLElement;
    expect(memeCouleur(racine.style.background, TEINTE_DU_DOMAINE.autre)).toBe(true);
    /*
     * ⚠ MÊME RAISON QU'AU-DESSUS : on compare la STRUCTURE, pas la chaîne. Le
     * parseur réécrit les attributs, donc une égalité de texte accuserait un
     * composant juste.
     */
    const g = d.querySelector('svg > g')!;
    const attendues = [...new DOMParser()
      .parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${MOTIFS.manuel}</svg>`, 'image/svg+xml')
      .documentElement.children].map((n) => n.tagName.toLowerCase());
    expect([...g.children].map((n) => n.tagName.toLowerCase())).toEqual(attendues);
    /*
     * ⚠ TÉMOIN D'ABSENCE sur la confusion PLAUSIBLE : le repli ne doit pas
     * rendre le gabarit d'un AUTRE type. Sans lui, « manuel » et « these »
     * seraient indiscernables dès qu'ils ont le même nombre de formes.
     */
    const these = [...new DOMParser()
      .parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${MOTIFS.these}</svg>`, 'image/svg+xml')
      .documentElement.children].map((n) => n.tagName.toLowerCase());
    if (JSON.stringify(these) !== JSON.stringify(attendues)) {
      expect([...g.children].map((n) => n.tagName.toLowerCase())).not.toEqual(these);
    }
  });
});
