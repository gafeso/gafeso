/**
 * LE QR CODE — ce qu'un test peut prouver, et ce qu'il ne peut pas.
 *
 * ## ⚠ CE QU'IL NE PEUT PAS, ET C'EST DÉCLARÉ
 *
 * **Aucun test de ce dépôt ne peut affirmer qu'un TÉLÉPHONE lit ce QR** : il
 * faudrait une caméra. Prétendre le contraire serait un faux dispositif — un
 * garde vert sur la seule propriété qui compte vraiment.
 *
 * ## ⭐ CE QU'IL PEUT : LES INVARIANTS D'ISO/IEC 18004
 *
 * Ils ne dépendent pas de `uqr` et se vérifient sur la matrice seule. Un rendu
 * ou une matrice qui se dégradent les font tomber :
 *
 * · le côté vaut `4 × version + 17` ;
 * · trois motifs de recherche 7×7, aux trois coins que la norme impose ;
 * · les motifs de synchronisation alternent sur la ligne et la colonne 6 ;
 * · le module sombre obligatoire est en `(8, 4 × version + 9)`.
 *
 * ## ⚠⚠ ET LE DÉFAUT QUE CES INVARIANTS ONT TROUVÉ, AVANT TOUT RENDU
 *
 * `uqr` met **UN** module de zone de silence par défaut, et il entre dans
 * `size` : `encode('x')` rend 23 pour une version 1, là où la norme donne 21.
 * La norme en exige **QUATRE**. Mesuré, pas lu dans sa documentation — et une
 * zone de silence au quart se scanne mal, ce qui ne se voit PAS à l'écran,
 * seulement devant un téléphone. C'est-à-dire chez le lecteur.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QrCode } from '@/components/qr-code';
import {
  SILENCE,
  coteAvecSilence,
  lesTroisMotifs,
  matriceQr,
  moduleSombreObligatoire,
  synchronisationAlternee,
  traceDesModules,
} from '@/lib/qr';
import { lienApplication, urlPubliqueDeNotice } from '@/lib/url-publique';

const URL_NOTICE = 'https://bibliotheque.exemple.bf/opac/9de9b299-cde5-4acc-9e76-0e800ad94281';

describe('la matrice respecte la NORME, pas la bibliothèque', () => {
  it('le côté vaut 4 × version + 17 — donc `uqr` ne nous rend plus sa bordure', () => {
    for (const t of ['x', URL_NOTICE, 'a'.repeat(200)]) {
      const m = matriceQr(t);
      expect(m.taille, `« ${t.slice(0, 12)}… » version ${m.version}`).toBe(
        4 * m.version + 17,
      );
    }
  });

  it('les trois motifs de recherche sont aux trois coins', () => {
    for (const t of ['x', URL_NOTICE, 'a'.repeat(200)]) {
      expect(lesTroisMotifs(matriceQr(t)), t.slice(0, 12)).toBe(true);
    }
  });

  it('les motifs de synchronisation alternent sur la ligne et la colonne 6', () => {
    for (const t of ['x', URL_NOTICE]) {
      expect(synchronisationAlternee(matriceQr(t)), t.slice(0, 12)).toBe(true);
    }
  });

  it('le module sombre obligatoire est posé', () => {
    for (const t of ['x', URL_NOTICE]) {
      expect(moduleSombreObligatoire(matriceQr(t)), t.slice(0, 12)).toBe(true);
    }
  });

  /**
   * ⭐ LE TÉMOIN D'ABSENCE DES INVARIANTS : ils doivent SAVOIR DIRE NON.
   *
   * Quatre assertions vertes ne prouvent rien si elles passent sur n'importe
   * quoi. On abîme donc la matrice d'UN module et on vérifie que le motif de
   * recherche le refuse — sans quoi ces quatre cas seraient décoratifs.
   */
  it('⚠ un seul module abîmé fait TOMBER le motif de recherche', () => {
    const m = matriceQr(URL_NOTICE);
    expect(lesTroisMotifs(m)).toBe(true);
    const abime = { ...m, modules: m.modules.map((l) => [...l]) };
    abime.modules[3][3] = !abime.modules[3][3]; // au cœur du premier motif
    expect(
      lesTroisMotifs(abime),
      'le contrôle des motifs accepte une matrice abîmée : il ne mesure rien',
    ).toBe(false);
  });

  it('⚠ et la synchronisation aussi', () => {
    const m = matriceQr(URL_NOTICE);
    const abime = { ...m, modules: m.modules.map((l) => [...l]) };
    abime.modules[6][10] = !abime.modules[6][10];
    expect(synchronisationAlternee(abime)).toBe(false);
  });
});

describe('la ZONE DE SILENCE vaut quatre modules', () => {
  it('le viewBox ajoute 4 modules de chaque côté', () => {
    const m = matriceQr(URL_NOTICE);
    expect(SILENCE).toBe(4);
    expect(coteAvecSilence(m)).toBe(m.taille + 8);
  });

  it('⚠ et le tracé est DÉCALÉ de 4 — rien ne touche le bord', () => {
    const m = matriceQr(URL_NOTICE);
    const trace = traceDesModules(m);
    const xs = [...trace.matchAll(/M(\d+) (\d+)h/g)].map((g) => [+g[1], +g[2]]);
    expect(xs.length, 'le tracé est vide : rien n’a été dessiné').toBeGreaterThan(20);
    const minX = Math.min(...xs.map(([x]) => x));
    const minY = Math.min(...xs.map(([, y]) => y));
    expect(minX, 'un module touche le bord gauche de la zone de silence').toBeGreaterThanOrEqual(4);
    expect(minY, 'un module touche le bord haut de la zone de silence').toBeGreaterThanOrEqual(4);
    // Le premier motif de recherche commence EXACTEMENT à 4.
    expect(minX).toBe(4);
    expect(minY).toBe(4);
  });
});

describe('le rendu : zéro requête, noir sur blanc, runs fondus', () => {
  const html = renderToStaticMarkup(<QrCode valeur={URL_NOTICE} taille={160} />);

  it('aucune requête : ni URL, ni image, ni source, ni police', () => {
    expect(html).not.toMatch(/https?:|\/\/|<image|\ssrc=|@import|xlink:href|url\(/);
    expect(html.length, 'le rendu est vide').toBeGreaterThan(200);
  });

  it('⚠ NOIR SUR BLANC en dur — un QR se lit par contraste de luminance', () => {
    expect(html).toContain('fill="#FFFFFF"');
    expect(html).toContain('fill="#000000"');
    // Témoin d'ABSENCE : aucun jeton de thème, aucune couleur du produit.
    expect(html).not.toMatch(/var\(--|currentColor|#1B5E3F|#E07A2B/);
  });

  it('⚠ le fond blanc est DESSINÉ, pas laissé transparent', () => {
    // Sur un fond sombre, une zone de silence transparente ne protège rien.
    const fond = html.match(/<rect[^>]*fill="#FFFFFF"[^>]*>/)?.[0] ?? '';
    const m = matriceQr(URL_NOTICE);
    expect(fond).toContain(`width="${coteAvecSilence(m)}"`);
  });

  it('⚠ UN SEUL `path` — les runs horizontaux sont FONDUS', () => {
    // Un `<rect>` par module ferait jusqu'à 1 089 éléments sur une version 3,
    // et ce tracé part dans le HTML d'une page du budget public.
    expect(html.match(/<path/g) ?? []).toHaveLength(1);
    expect(html.match(/<rect/g) ?? []).toHaveLength(1); // le fond, et lui seul
    // Témoin de COMPTE : la fusion gagne vraiment quelque chose.
    const m = matriceQr(URL_NOTICE);
    const sombres = m.modules.flat().filter(Boolean).length;
    const runs = (traceDesModules(m).match(/M/g) ?? []).length;
    expect(runs, 'aucune fusion : autant de segments que de modules').toBeLessThan(sombres);
  });

  it('⚠ il est DÉCORATIF — l’adresse est à l’appelant de l’afficher', () => {
    // Un QR ne sert à rien pour qui ne voit pas. Il est donc `aria-hidden`, et
    // la règle qui l’autorise est que l’appelant affiche l’adresse EN TEXTE.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    // Et il n’annonce pas l’adresse lui-même : deux sources diverger­aient.
    expect(html).not.toContain(URL_NOTICE);
  });

  it('⚠ `crispEdges` : sans lui l’anti-aliasage floute les modules', () => {
    expect(html).toContain('shape-rendering="crispEdges"');
  });
});

describe('deux QR différents, et le même QR deux fois', () => {
  it('deux adresses différentes donnent des matrices différentes', () => {
    const a = traceDesModules(matriceQr(`${URL_NOTICE}1`));
    const b = traceDesModules(matriceQr(`${URL_NOTICE}2`));
    expect(a).not.toBe(b);
  });

  it('⚠ la MÊME adresse donne le MÊME tracé — un QR ne change pas au rechargement', () => {
    expect(traceDesModules(matriceQr(URL_NOTICE))).toBe(
      traceDesModules(matriceQr(URL_NOTICE)),
    );
  });
});

describe('l’adresse publique et le lien d’application', () => {
  it('l’adresse publique est l’origine + /opac/<id>', () => {
    expect(urlPubliqueDeNotice('abc', 'https://bib.exemple.bf')).toBe(
      'https://bib.exemple.bf/opac/abc',
    );
  });

  it('⚠ le lien d’application ENCODE l’adresse — sinon le paramètre se coupe', () => {
    const lien = lienApplication('https://bib.exemple.bf/opac/abc?x=1');
    expect(lien).toBe('gafeso://notice?url=https%3A%2F%2Fbib.exemple.bf%2Fopac%2Fabc%3Fx%3D1');
    // Témoin d'ABSENCE : aucun `/` ni `?` brut après `url=`.
    expect(lien.split('url=')[1]).not.toMatch(/[/?]/);
  });

  it('⚠ et il transporte l’ADRESSE, pas l’identifiant', () => {
    // L'application peut ainsi retomber sur la page web si elle ne sait pas
    // traiter le lien — c'est ce qui rend le repli possible.
    expect(lienApplication('https://bib.exemple.bf/opac/abc')).toContain('opac');
  });
});
