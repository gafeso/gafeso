/**
 * ⭐⭐ LES POLICES DE LA COUVERTURE — parité avec le mobile, et le faux gras barré.
 *
 * ## ⚠ LE DÉFAUT QUE CETTE ÉPREUVE EXISTE POUR ATTRAPER
 *
 * `SourceSans3-Variable` porte l'axe `wght` 200–900 avec un **défaut à 200**
 * (mesuré dans sa table `fvar`). Deux conséquences, et aucune ne se voit en
 * relisant le code :
 *
 * · un bloc qui n'exprime AUCUNE graisse sort en maigre extrême, pas en 400 ;
 * · un bloc qui demande 600 par `font-weight` SEUL fait **synthétiser** un faux
 *   gras au navigateur — il épaissit les traits lui-même, et le rendu ne
 *   ressemble plus à celui du mobile.
 *
 * ⭐ C'est pourquoi chaque usage pose `font-variation-settings` explicitement, et
 * pourquoi cette épreuve tombe si l'un d'eux disparaît.
 *
 * ## ⚠ ET LES DEUX FONTES NE SONT PAS DE MÊME NATURE
 *
 * | fichier | axes, mesurés | ce qu'on lui demande |
 * |---|---|---|
 * | `Poppins-Bold` | **AUCUN** (statique, 700) | 700, et rien d'autre |
 * | `SourceSans3-Variable` | `wght` 200–900, défaut 200 | 400, 600, 700, variation POSÉE |
 *
 * La consigne disait « ce sont des fontes variables » : une seule l'est. Poser
 * une variation sur Poppins ne ferait rien, et lui demander 400 ferait
 * synthétiser un faux MAIGRE.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CouvertureV3 } from '@/components/couverture-v3';
import { POSITIONS } from '@/lib/couvertures-v3.generated';

const POLICES = resolve(process.cwd(), 'public/polices');
const MANIFESTE = JSON.parse(readFileSync(resolve(POLICES, 'POLICES.json'), 'utf-8')) as {
  polices: Record<string, { woff2: string; sha256Woff2: string; sha256Source: string }>;
};

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

function blocs(): HTMLElement[] {
  const html = renderToStaticMarkup(<CouvertureV3 {...GRAND} />);
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return [...d.querySelectorAll('body > div > div')] as HTMLElement[];
}
const parTexte = (t: string) => blocs().find((b) => b.textContent?.trim() === t)!;

describe('⭐⭐ chaque bloc en Source Sans 3 POSE sa variation', () => {
  /*
   * ⚠ LES TROIS GRAISSES VIENNENT DE LA SOURCE, pas d'un nombre recopié : si
   * `positions-textes.json` change, ce cas convoque.
   */
  const ATTENDUS = [
    ['auteur', GRAND.auteur, POSITIONS.author.font_weight],
    ['annee', String(GRAND.annee), POSITIONS.year.font_weight],
    ['etablissement', GRAND.etablissement, POSITIONS.establishment.font_weight],
  ] as const;

  for (const [nom, texte, graisse] of ATTENDUS) {
    it(`⭐ ${nom} : \`'wght' ${graisse}\` est POSÉ — sinon le navigateur synthétise`, () => {
      const b = parTexte(texte);
      expect(b, `le bloc ${nom} est introuvable`).toBeTruthy();
      expect(b.style.fontFamily, `${nom} n’emploie pas Source Sans 3`).toContain(
        'Source Sans 3 Gafeso',
      );
      /*
       * ⚠ LES DEUX, ET C'EST LE POINT. `fontWeight` dit CE QU'ON VEUT ;
       * `fontVariationSettings` BOUGE l'axe. Sans le second, le navigateur
       * épaissit lui-même les traits — un faux gras, sur une fonte dont le
       * défaut est 200.
       */
      expect(b.style.fontWeight).toBe(String(graisse));
      expect(
        b.style.fontVariationSettings,
        `⚠ ${nom} ne pose PAS l’axe : le navigateur synthétisera au lieu de ` +
          'déplacer `wght`, et le rendu divergera du mobile',
      ).toBe(`'wght' ${graisse}`);
    });
  }

  /**
   * ⭐ POPPINS EST STATIQUE : on ne lui demande que 700, et AUCUNE variation.
   *
   * ⚠ Lui demander 400 ou 600 ferait synthétiser un faux MAIGRE — le défaut
   * symétrique du faux gras, et celui auquel personne ne pense.
   */
  it('⚠ les blocs en Poppins ne demandent QUE 700, et aucune variation', () => {
    for (const texte of [GRAND.type, GRAND.titre]) {
      const b = parTexte(texte);
      expect(b.style.fontFamily, `${texte} n’emploie pas Poppins`).toContain('Poppins Gafeso');
      expect(b.style.fontWeight, 'Poppins ne porte QUE la graisse 700').toBe('700');
      expect(
        b.style.fontVariationSettings,
        'une variation sur une fonte sans axe ne fait rien — elle égare le lecteur du code',
      ).toBe('');
    }
  });
});

describe('⭐ les fichiers servis, et leur PROVENANCE', () => {
  it('les deux woff2, les deux licences et le manifeste sont là', () => {
    for (const f of [
      'Poppins-Bold.woff2',
      'SourceSans3-Variable.woff2',
      'OFL-Poppins.txt',
      'OFL-SourceSans3.txt',
      'POLICES.json',
    ]) {
      expect(existsSync(resolve(POLICES, f)), `${f} manque sous public/polices/`).toBe(true);
    }
  });

  /**
   * ⭐⭐ LE TÉMOIN DE PROVENANCE. Une fonte remplacée par un téléchargement
   * approchant romprait la parité SANS RIEN CASSER : le texte s'afficherait,
   * un peu différemment, et personne ne le verrait. Le sha256 est la seule
   * chose qui le dise.
   */
  it('⚠ chaque woff2 servi est bien celui que le manifeste déclare', () => {
    for (const [nom, p] of Object.entries(MANIFESTE.polices)) {
      const octets = readFileSync(resolve(POLICES, p.woff2));
      expect(
        createHash('sha256').update(octets).digest('hex'),
        `${nom} : le woff2 servi n’est PAS celui du manifeste — fonte remplacée ?`,
      ).toBe(p.sha256Woff2);
      // ⚠ Et la source est consignée : c'est elle qui prouve la parité.
      expect(p.sha256Source, `${nom} : sha256 de source manquant`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  /**
   * ⭐ LES DEUX NATURES DE `@font-face`, et leur raison.
   *
   * ⚠ Sans `font-weight: 200 900` sur la variable, le navigateur la tient pour
   * une fonte de graisse unique — et SYNTHÉTISE pour 600 et 700, quand bien
   * même la variation serait posée.
   */
  it('⭐ la variable déclare sa PLAGE, la statique sa graisse unique', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf-8');
    const bloc = (nom: string) => {
      const d = css.indexOf(nom);
      expect(d, `aucun @font-face pour ${nom}`).toBeGreaterThan(-1);
      return css.slice(d, css.indexOf('}', d));
    };
    expect(bloc("'Source Sans 3 Gafeso'")).toMatch(/font-weight:\s*200\s+900/);
    expect(bloc("'Poppins Gafeso'")).toMatch(/font-weight:\s*700\s*;/);
    // ⚠ Témoin d'ABSENCE : la statique ne déclare PAS une plage qu'elle n'a pas.
    expect(bloc("'Poppins Gafeso'")).not.toMatch(/font-weight:\s*\d+\s+\d+/);
  });

  /**
   * ⭐ AUCUN APPEL À GOOGLE FONTS — et c'est une propriété, pas une intention.
   * Un `@import` ou un `<link>` suffirait à faire sortir une requête vers un
   * tiers depuis une page publique.
   */
  it('⚠ rien ne pointe vers Google Fonts', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf-8');
    expect(css).not.toMatch(/googleapis|gstatic/);
    expect(css).toMatch(/url\('\/polices\//);
  });
});
