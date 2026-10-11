/**
 * L'APERÇU DES ÉTIQUETTES — le code-barres, le QR, et les deux bornes.
 *
 * ## ⭐ CE QUI REND CET APERÇU HONNÊTE : il EST la sortie
 *
 * Un aperçu qui MONTRE une autre sortie diverge — et c'est l'aperçu qu'on
 * croit. Ici le DOM prévisualisé est le DOM imprimé, donc aucune divergence
 * n'est possible. Le PDF du serveur subsiste et ne porte PAS de QR : les deux
 * sorties ne sont pas interchangeables, et l'écran le DIT.
 *
 * ## ⭐⭐ ET LE CODE-BARRES EST LE MÊME QUE CELUI DU PDF — mesuré
 *
 * `label-pdf.ts` encode en Code 128 avec `bwip-js` ; l'aperçu avec l'encodeur
 * CODE 128 de `jsbarcode` (2 755 o gzip contre 262 912 pour `bwip-js` en
 * navigateur). Les deux ont été comparés sur six valeurs de la forme réelle,
 * par la LARGEUR EN MODULES : **6 comparés, 0 écart**, commutations de
 * sous-ensemble comprises. Sans cet accord, on validerait une planche à l'écran
 * et une autre sortirait.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { Etiquette } from '@/components/etiquette';
import { LIBELLES } from '@/lib/libelles';
import { SILENCE_BARRES, barresCode128, traceDesBarres } from '@/lib/code128';

const URL_NOTICE = 'https://bib.exemple.bf/opac/9de9b299-cde5-4acc-9e76-0e800ad94281';

describe('l’encodeur Code 128', () => {
  /**
   * ⚠ LES LARGEURS MESURÉES CONTRE `bwip-js`, FIGÉES ICI. Si l'encodeur change
   * de sous-ensemble, ces nombres bougent — et l'aperçu cesserait d'imprimer le
   * même code que le PDF du serveur, sans que rien d'autre ne le dise.
   */
  it('les largeurs en modules sont celles que bwip-js produit', () => {
    const attendues: [string, number][] = [
      ['BIB-000123', 123],
      ['ZK-000124', 112],
      ['BIB-000001', 123],
      ['A1', 57],
      ['BIB-999999', 123],
      ['ZK-X-42', 112],
    ];
    for (const [valeur, modules] of attendues) {
      const b = barresCode128(valeur);
      expect(b, `${valeur} refusé par l’encodeur`).not.toBeNull();
      expect(b!.motif.length, `${valeur} : largeur en modules`).toBe(modules);
    }
  });

  it('⚠ une valeur non encodable rend `null` — elle ne devient pas un code vide', () => {
    // Code 128 n'accepte que l'ASCII imprimable. Un « code » encodé depuis une
    // valeur refusée serait illisible, et on accuserait l'imprimante.
    expect(barresCode128('BIB-é0123')).toBeNull();
    // Témoin d'ABSENCE : une valeur valide n'est PAS refusée.
    expect(barresCode128('BIB-000123')).not.toBeNull();
  });

  it('⚠ le tracé FOND les barres voisines — une planche en porte vingt-quatre', () => {
    const b = barresCode128('BIB-000123')!;
    const segments = (traceDesBarres(b.motif).match(/M/g) ?? []).length;
    const barresSeules = [...b.motif].filter((c) => c === '1').length;
    expect(segments, 'aucune fusion').toBeLessThan(barresSeules);
    expect(segments).toBeGreaterThan(0);
  });

  it('⚠ la zone de silence vaut DIX modules — ISO 15417, pas un choix', () => {
    // L'oublier donne un code que les lecteurs de guichet ratent au bord de
    // l'étiquette : la bibliothèque le découvre au comptoir, pas ici.
    expect(SILENCE_BARRES).toBe(10);
  });
});

describe('l’étiquette rendue', () => {
  const html = renderToStaticMarkup(
    <Etiquette
      barcode="BIB-000123"
      cote="SCI MAT"
      titre="Mathématiques appliquées et développement local"
      etablissement="Université d’Exemple"
      urlNotice={URL_NOTICE}
    />,
  );

  it('porte le QR, les barres, la cote, le titre et l’établissement', () => {
    expect(html).toContain('SCI MAT');
    expect(html).toContain('Mathématiques appliquées');
    expect(html).toContain('Université d’Exemple');
    // Deux SVG : le QR et le code-barres.
    expect(html.match(/<svg/g) ?? []).toHaveLength(2);
  });

  /**
   * ⭐ LE CODE EN CLAIR SOUS LES BARRES — même règle que l'adresse sous le QR :
   * les deux SVG sont `aria-hidden`, et un code que le lecteur optique rate
   * doit pouvoir être tapé à la main au guichet.
   */
  it('⚠ le code est écrit EN CLAIR, et il survit au retrait des SVG', () => {
    expect(html).toContain('BIB-000123');
    const sansSvg = html.replace(/<svg[\s\S]*?<\/svg>/g, '');
    expect(
      sansSvg,
      '⚠ le code n’est porté que par les barres, qui sont aria-hidden',
    ).toContain('BIB-000123');
  });

  it('⚠ NOIR SUR BLANC, et aucune requête', () => {
    expect(html).toContain('fill="#FFFFFF"');
    expect(html).toContain('fill="#000000"');
    expect(html).not.toMatch(/https?:\/\/[^"]*\.(png|jpg|svg)|<image|\ssrc=/);
    expect(html).not.toMatch(/var\(--|currentColor/);
  });

  it('⚠ un code NON ENCODABLE se DIT, et le code reste lisible', () => {
    const casse = renderToStaticMarkup(
      <Etiquette
        barcode="BIB-é0123"
        cote="SCI"
        titre="T"
        etablissement="E"
        urlNotice={URL_NOTICE}
      />,
    );
    expect(casse).toContain('BIB-é0123');
    expect(casse).toContain('Code non encodable');
    // Un seul SVG : le QR. Pas de barres dessinées à partir de rien.
    expect(casse.match(/<svg/g) ?? []).toHaveLength(1);
  });

  it('⚠ une cote absente DISPARAÎT — aucun champ inventé', () => {
    const sansCote = renderToStaticMarkup(
      <Etiquette
        barcode="BIB-000123"
        cote={null}
        titre="T"
        etablissement="E"
        urlNotice={URL_NOTICE}
      />,
    );
    expect(sansCote).not.toMatch(/—|s\.\s?d\.|sans cote/i);
  });
});

/**
 * ⚠ LES DEUX BORNES DE CET APERÇU, déclarées dans `textes-qui-promettent.ts` et
 * ÉPROUVÉES ici — ce fichier-là s'exclut de son propre relevé, pour ne pas se
 * satisfaire tout seul.
 */
describe('la borne de l’aperçu, et ce qu’elle doit continuer de dire', () => {
  it('⚠ elle NOMME les deux portées sans aperçu', () => {
    expect(LIBELLES.etiquettes.seulementSelection).toMatch(/localisation/i);
    expect(LIBELLES.etiquettes.seulementSelection).toMatch(/nouveaut/i);
  });

  it('⚠ et elle RENVOIE au PDF — sinon elle laisse sans issue', () => {
    expect(LIBELLES.etiquettes.seulementSelection).toMatch(/PDF/);
  });

  it('⚠ elle dit ce que l’aperçu COUVRE, pas seulement ce qu’il exclut', () => {
    expect(LIBELLES.etiquettes.seulementSelection).toMatch(/sélection/i);
  });

  it('⚠ et l’intro dit que les DEUX sorties diffèrent — le PDF n’a pas de QR', () => {
    expect(LIBELLES.etiquettes.intro).toMatch(/QR/);
    expect(LIBELLES.etiquettes.intro).toMatch(/s’imprimera|imprimera/);
  });
});
