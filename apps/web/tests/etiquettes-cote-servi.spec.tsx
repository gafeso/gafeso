/**
 * ⭐⭐ LE CÔTÉ DU QR EST **SERVI**, pas déclaré — et ce fichier a changé de sujet.
 *
 * ## ⚠ CE QU'IL GARDAIT HIER, ET POURQUOI CE N'ÉTAIT QU'UN SURSIS
 *
 * Il s'appelait `etiquettes-cote-derive.spec.ts` et il prouvait que
 * `QR_COTE_MM` était une EXPRESSION et non un littéral — en lisant la source,
 * parce qu'un test d'exécution ne peut pas distinguer `= 14` d'un
 * `ceil(53 × 0,25)` qui vaut 14.
 *
 * ⭐ C'était juste et insuffisant. Le backend dérivait de son côté par la MÊME
 * formule : deux dérivations qui s'accordent ne sont pas une source unique.
 * Jean, 2 novembre 2026 : *« ce n'est pas la suppression, c'est un sursis. »*
 *
 * ## ⭐ CE QU'IL GARDE AUJOURD'HUI : la CONSOMMATION
 *
 * `GET /opac/records/:id` sert `etiquette: { adresseGravee, coteMm }`. Ce
 * fichier vérifie donc les trois propriétés de la bascule :
 *
 * | | |
 * |---|---|
 * | plus AUCUN côté déclaré dans mes bibliothèques | sinon la divergence revient |
 * | le bloc servi est LU, et validé | un bloc à moitié servi n'est pas une étiquette |
 * | aucun REPLI, même pas silencieux | un repli grave une géométrie que l'API ne garantit plus |
 *
 * ⚠ Et le garde du backend (`etiquette-derivation-unique.spec.ts`) tient
 * l'autre moitié : il refuse que je REDÉCLARE. Les deux se regardent, chacun
 * depuis son espace, en lecture seule.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Etiquette } from '@/components/etiquette';
import { LIBELLES } from '@/lib/libelles';
import { moduleQrMm, qrAssezGros, matriceQr } from '@/lib/qr';
import { etiquetteServie } from '@/lib/url-publique';
import { contenuDuQr } from './aide-trace-qr';

const UUID = 'B2DCAA10-07F9-49EC-80FF-15E32359EE4D';
/** ⚠ Tel que l'API le SERT — mesuré le 3 novembre 2026, pas composé ici. */
const SERVI = {
  adresseGravee: `HTTPS://BIBLIO.UNIV-EXEMPLE.BF/P/OAI:EXEMPLE:${UUID}`,
  coteMm: 14,
};

const source = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');

describe('⭐⭐ plus aucun côté n’est DÉCLARÉ dans mes bibliothèques', () => {
  /*
   * ⭐ Le miroir exact du garde retourné du backend. Il lit la SOURCE parce
   * qu'une constante figée au chargement s'accorde par coïncidence avec sa
   * propre valeur — mesuré le 2 novembre : remettre `= 14` passait au vert.
   */
  it('⭐⭐ `QR_COTE_MM` n’existe plus — ni dérivé, ni écrit', () => {
    for (const f of ['lib/code128.ts', 'lib/qr.ts', 'lib/url-publique.ts']) {
      const declare = source(f)
        .split('\n')
        .find((l) => /^(export )?const QR_COTE_MM\b/.test(l));
      expect(
        declare,
        `🔴 ${f} redéclare un côté local : la seconde dérivation est revenue, et ` +
          'une étiquette collée est définitive',
      ).toBeUndefined();
    }
  });

  /*
   * ⚠ TÉMOIN DE PRÉSENCE : sans lui, les cas ci-dessus seraient verts sur des
   * fichiers vides ou renommés. On vérifie que la MATIÈRE est là.
   */
  it('⚠ témoin : les trois bibliothèques sont bien lues', () => {
    for (const f of ['lib/code128.ts', 'lib/qr.ts', 'lib/url-publique.ts']) {
      expect(source(f).length, f).toBeGreaterThan(500);
    }
    // et le seuil du CODE-BARRES, lui, reste déclaré ici
    expect(source('lib/code128.ts')).toContain('LARGEUR_MODULE_MIN_MM');
  });

  /**
   * 🔴 ET CE CAS EST UN GARDE D'EFFET, parce qu'un garde de FORME ne tient pas
   * ici — mesuré le 3 novembre 2026.
   *
   * Le contrôle du backend cherche `coteMm` dans mes deux bibliothèques. Il est
   * satisfait : `lib/code128.ts` en contient cinq occurrences — **toutes dans
   * des commentaires**, ceux qui expliquent précisément que le côté a quitté ce
   * fichier. Son contrôle négatif « déclaration retirée sans consommer » ne
   * peut donc pas mordre : j'ai renommé le champ partout, et il est resté vert.
   *
   * ⚠ C'est « un relevé qui lit l'intérieur des commentaires », appliqué à une
   * vérification de CONSOMMATION. Rapporté au backend ; le fichier est à eux.
   *
   * ⭐ Ce que je peux tenir, moi, est l'EFFET : on rend l'étiquette avec DEUX
   * côtés servis différents, et la taille du QR dessiné doit suivre. Aucune
   * prose ne satisfait ça, et un composant qui ignorerait `coteMm` tombe.
   */
  it('⭐⭐ le côté SERVI atteint le rendu — deux valeurs, deux tailles', () => {
    const tailleRendue = (coteMm: number) => {
      const { unmount } = render(
        <Etiquette
          barcode="BIB-000229"
          cote="004 GAF"
          titre="T"
          etablissement="E"
          etiquette={{ adresseGravee: SERVI.adresseGravee, coteMm }}
        />,
      );
      const svg = Array.from(document.querySelectorAll('svg')).find((x) => {
        const v = (x.getAttribute('viewBox') ?? '').trim().split(/\s+/);
        return v.length === 4 && v[2] === v[3];
      });
      const t = Number(svg?.getAttribute('width') ?? NaN);
      unmount();
      return t;
    };
    /*
     * ⚠ LES DEUX CÔTÉS DOIVENT ÊTRE DESSINABLES, et j'ai cherché deux fois.
     *
     * · 10 mm → le module tombe à 0,2439 et `qrAssezGros` abandonne ;
     * · 28 mm → `qrTient` abandonne, parce que le CODE-BARRES n'a plus la
     *   largeur (123 modules à 0,25 mm dans 63,67 − 28 − 2).
     *
     * Mesuré, et c'est le composant qui a eu raison les deux fois : 11, 14, 20,
     * 22 et 25 mm rendent respectivement 41,58 · 52,92 · 75,60 · 83,16 · 94,50
     * de largeur. Le côté servi atteint bien le rendu.
     */
    const petit = tailleRendue(14);
    const grand = tailleRendue(22);
    /*
     * ⚠ ET LES DEUX MOTIFS D'ABSENCE SE DISENT SÉPARÉMENT. Mon premier message
     * accusait le composant de « garder une constante » alors que ma donnée
     * d'essai faisait abandonner le QR : un message d'échec qui envoie au
     * mauvais endroit coûte plus qu'un test absent.
     */
    for (const [nom, t] of [['14 mm', petit], ['22 mm', grand]] as const) {
      expect(
        Number.isFinite(t) && t > 0,
        `à ${nom} aucun QR n’est dessiné : la DONNÉE D’ESSAI est hors des ` +
          `bornes (seuil de module, ou place du code-barres), rien n’est mesuré`,
      ).toBe(true);
    }
    expect(
      grand,
      '🔴 la taille du QR ne suit PAS le côté servi : le composant garde une ' +
        'constante quelque part, et la géométrie imprimée n’est plus celle que ' +
        'l’API garantit',
    ).toBeGreaterThan(petit);
    // et le rapport est exactement celui des deux côtés servis
    expect(grand / petit).toBeCloseTo(22 / 14, 5);
  });
});

describe('⭐ le bloc servi est VALIDÉ — champ par champ', () => {
  it('⭐ un bloc complet est accepté tel quel', () => {
    expect(etiquetteServie(SERVI)).toEqual(SERVI);
  });

  /*
   * ⚠ Les deux champs sont validés SÉPARÉMENT, et chaque cas est une forme
   * qu'une API peut réellement servir : un champ absent, une chaîne vide, un
   * nombre nul. Un bloc à moitié servi ne doit pas donner une étiquette à
   * moitié juste.
   */
  it('⚠ un bloc à MOITIÉ servi rend null, jamais une moitié d’étiquette', () => {
    expect(etiquetteServie(null)).toBeNull();
    expect(etiquetteServie(undefined)).toBeNull();
    expect(etiquetteServie({})).toBeNull();
    expect(etiquetteServie({ adresseGravee: SERVI.adresseGravee })).toBeNull();
    expect(etiquetteServie({ coteMm: 14 })).toBeNull();
    expect(etiquetteServie({ adresseGravee: '', coteMm: 14 })).toBeNull();
    expect(etiquetteServie({ adresseGravee: '   ', coteMm: 14 })).toBeNull();
    expect(etiquetteServie({ adresseGravee: SERVI.adresseGravee, coteMm: 0 })).toBeNull();
    expect(etiquetteServie({ adresseGravee: SERVI.adresseGravee, coteMm: -1 })).toBeNull();
    expect(etiquetteServie({ adresseGravee: SERVI.adresseGravee, coteMm: NaN })).toBeNull();
    // ⚠ le cas qui ressemble le plus à un nombre sans en être un
    expect(etiquetteServie({ adresseGravee: SERVI.adresseGravee, coteMm: '14' })).toBeNull();
  });
});

describe('⭐⭐ l’étiquette GRAVE ce qui est servi, et rien d’autre', () => {
  const poser = (etiquette: ReturnType<typeof etiquetteServie>) =>
    render(
      <Etiquette
        barcode="BIB-000229"
        cote="004 GAF"
        titre="Gafeso — Guide d’utilisation"
        etablissement="Université d’Exemple"
        etiquette={etiquette}
      />,
    );

  it('⭐ le tracé dessiné porte EXACTEMENT `adresseGravee`', () => {
    poser(SERVI);
    const encodé = contenuDuQr([SERVI.adresseGravee, SERVI.adresseGravee.toLowerCase()]);
    expect(encodé, 'aucune candidate ne produit le tracé dessiné').toBe(SERVI.adresseGravee);
  });

  /*
   * ⭐⭐ LE CÔTÉ SERVI DÉCIDE LA GÉOMÉTRIE, et on le prouve en le CHANGEANT :
   * un carré plus petit rend des modules plus fins. Sans ce cas, un composant
   * qui ignorerait `coteMm` et garderait une constante serait invisible.
   */
  it('⭐⭐ et le `coteMm` servi décide du module — vérifié en le changeant', () => {
    const m = matriceQr(SERVI.adresseGravee);
    expect(moduleQrMm(m.taille, 14)).toBeGreaterThan(moduleQrMm(m.taille, 13));
    expect(moduleQrMm(m.taille, 14)).toBeCloseTo(0.3415, 4);
    expect(qrAssezGros(m.taille, 14)).toBe(true);
    // ⚠ témoin d'ABSENCE : un carré assez petit DOIT être refusé
    expect(qrAssezGros(m.taille, 9)).toBe(false);
  });

  /*
   * ⚠⚠ AUCUN REPLI : sans bloc servi, pas de QR, et le motif se DIT. C'est la
   * seule issue honnête — recomposer l'adresse ou retomber sur un ancien côté
   * seraient deux divergences qui attendent leur heure.
   */
  it('⚠⚠ sans bloc servi : AUCUN QR, et le refus se dit', () => {
    poser(null);
    expect(contenuDuQr([SERVI.adresseGravee, SERVI.adresseGravee.toLowerCase()])).toBeNull();
    expect(screen.queryByText(LIBELLES.etiquettes.qrSansAdresse)).not.toBeNull();
  });
});
