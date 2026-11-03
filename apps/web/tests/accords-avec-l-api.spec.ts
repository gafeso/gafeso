/**
 * ⭐⭐ LES VALEURS QUI VIVENT DES DEUX CÔTÉS — confrontées à la VRAIE.
 *
 * ## ⚠ CE QU'ON BALAIE ICI, et ce que le balayage a trouvé
 *
 * Relevé le 3 novembre 2026, à la clôture de la v1 : **quatre** constantes
 * portent le même nom dans `apps/web/lib` et dans `apps/api/src`. Triées :
 *
 * | | valeurs | gardé par |
 * |---|---|---|
 * | `RECORD_TYPES` | identiques | `vocabulaire-du-depot.spec.ts`, qui traverse déjà |
 * | `ITEM_LOCATIONS` | identiques | 🔴 **rien** |
 * | `LARGEUR_MODULE_MIN_MM` | identiques | 🔴 **plus rien** |
 * | `QR_ECART_MM` | identiques | 🔴 **rien** |
 *
 * ⭐ Les trois dernières sont des **accords PAR COÏNCIDENCE** au sens exact de
 * ce dépôt : elles disent la même chose depuis toujours, donc la divergence
 * n'existe pas — elle naîtra à la seconde où l'une changera. Et c'est le
 * motif qui nous a coûté le plus souvent ici.
 *
 * ⚠ `LARGEUR_MODULE_MIN_MM` était gardée jusqu'au 3 novembre par
 * `etiquette-derivation-unique.spec.ts` côté API. Son cas commence par
 * `if (frontADejaBascule) return;` — depuis que le front a cessé de déclarer
 * son côté, il sort avant de mesurer. L'accord n'est donc plus tenu par
 * personne, et ce n'est la faute de personne : le garde a fait son office et
 * son sujet a disparu sous lui.
 *
 * ## ⚠ IL TRAVERSE LA FRONTIÈRE DES ESPACES DE TRAVAIL, EN LECTURE SEULE
 *
 * Délibérément, et c'est la forme qu'emploie déjà
 * `fonctions-connues-de-l-api.spec.ts` : le couplage existe dans les faits,
 * autant qu'il soit vérifié. On lit la SOURCE de l'API plutôt que d'importer
 * son module — `apps/api` n'est pas résolvable d'ici.
 *
 * ## ⚠ CE QU'IL NE PEUT PAS FAIRE, écrit plutôt que découvert
 *
 * Il compare des LITTÉRAUX. Une valeur calculée côté API lui échapperait — il
 * le DIRAIT, parce que son témoin exige d'avoir lu un nombre ou un tableau.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ITEM_LOCATIONS } from '@/lib/item-locations';
import { LARGEUR_MODULE_MIN_MM, QR_ECART_MM } from '@/lib/code128';

const API = join(process.cwd(), '..', 'api', 'src');

/** Le code de l'API, commentaires retirés : un commentaire n'est pas une valeur. */
function codeApi(chemin: string): string {
  const brut = readFileSync(join(API, chemin), 'utf8');
  return brut
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');
}

/** Le nombre que l'API déclare sous ce nom, ou `NaN`. */
function nombreDeLApi(chemin: string, nom: string): number {
  const l = codeApi(chemin)
    .split('\n')
    .find((x) => new RegExp(`^(export )?const ${nom}\\b`).test(x));
  const m = l?.match(/=\s*([0-9.]+)\s*;/);
  return m ? Number(m[1]) : NaN;
}

/** Le tableau de chaînes que l'API déclare sous ce nom, ou `null`. */
function tableauDeLApi(chemin: string, nom: string): string[] | null {
  const code = codeApi(chemin);
  const i = code.search(new RegExp(`^(export )?const ${nom}\\b`, 'm'));
  if (i < 0) return null;
  const bloc = code.slice(i, code.indexOf(';', i));
  const dedans = bloc.slice(bloc.indexOf('['), bloc.lastIndexOf(']') + 1);
  const valeurs = [...dedans.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  return valeurs.length > 0 ? valeurs : null;
}

describe('⭐⭐ les accords par coïncidence avec l’API sont CONFRONTÉS', () => {
  /*
   * ⚠ TÉMOIN DE LECTURE, et il porte sur la MATIÈRE, pas sur les trouvailles :
   * un chemin faux ou un fichier déplacé rendrait tous les cas suivants verts
   * sur du vide. « Un témoin dont la condition de succès est l'existence d'une
   * forme fautive punit celui qui fait bien » — celui-ci demande seulement que
   * la source soit là.
   */
  it('⚠ témoin : la source de l’API est bien lue', () => {
    expect(codeApi('opac/identifiant-perenne.ts').length).toBeGreaterThan(1000);
    expect(codeApi('cataloging/item-locations.ts').length).toBeGreaterThan(200);
  });

  it('⭐ `LARGEUR_MODULE_MIN_MM` — le seuil d’impression, des deux côtés', () => {
    /*
     * ⚠ ON LIT CELLE QUE LA DÉRIVATION EMPLOIE — `opac/identifiant-perenne.ts`.
     *
     * 🔴 Relevé le 3 novembre 2026 : l'API déclare `LARGEUR_MODULE_MIN_MM`
     * DEUX FOIS, à 0,25 dans `labels/label-pdf.ts:49` ET dans
     * `opac/identifiant-perenne.ts:282`. Leur dérivation du côté lit la
     * seconde ; leur décision d'abandon du code-barres lit la première. C'est
     * un accord par coïncidence DANS leur propre espace, et il n'est pas à moi
     * de le fermer — rapporté en passation.
     */
    const cote = nombreDeLApi('opac/identifiant-perenne.ts', 'LARGEUR_MODULE_MIN_MM');
    expect(Number.isNaN(cote), 'le seuil de l’API n’est plus un littéral : relisez-le').toBe(
      false,
    );
    expect(
      LARGEUR_MODULE_MIN_MM,
      `le seuil du front (${LARGEUR_MODULE_MIN_MM}) diffère de celui de l’API ` +
        `(${cote}). Les deux décident si un code imprimé est lisible, et ` +
        `l’aperçu web cesserait de dire ce que le PDF imprime.`,
    ).toBe(cote);
  });

  it('⭐ `QR_ECART_MM` — l’écart entre le QR et le code-barres', () => {
    const cote = nombreDeLApi('opac/identifiant-perenne.ts', 'QR_ECART_MM');
    expect(Number.isNaN(cote)).toBe(false);
    expect(
      QR_ECART_MM,
      `l’écart du front (${QR_ECART_MM} mm) diffère de celui de l’API (${cote} mm) : ` +
        `la décision d’abandon du QR n’est plus la même des deux côtés`,
    ).toBe(cote);
  });

  /*
   * ⭐⭐ LE PLUS CONSÉQUENT DES TROIS, et le seul qui n'est pas une géométrie :
   * un VOCABULAIRE que l'API VALIDE (`isItemLocation`) et que le front OFFRE
   * dans une liste déroulante. Les deux sens cassent :
   *
   * · l'API ajoute un emplacement → le front ne le propose jamais ;
   * · le front en ajoute un → l'API le REFUSE à la saisie.
   */
  it('⭐⭐ `ITEM_LOCATIONS` — le vocabulaire que l’API valide et que le front offre', () => {
    const cote = tableauDeLApi('cataloging/item-locations.ts', 'ITEM_LOCATIONS');
    expect(cote, 'le vocabulaire de l’API n’est plus un tableau de littéraux').not.toBeNull();
    expect(
      [...ITEM_LOCATIONS].sort(),
      'le vocabulaire des emplacements diverge : l’API refuserait ce que le ' +
        'front propose, ou le front cacherait ce que l’API accepte',
    ).toEqual([...(cote as string[])].sort());
  });

  /*
   * ⚠ TÉMOIN D'ABSENCE : les lecteurs doivent savoir dire NON. Sans ce cas, un
   * `nombreDeLApi` qui rendrait toujours une valeur — ou un `tableauDeLApi` qui
   * rendrait toujours un tableau — serait indiscernable d'un lecteur juste, et
   * les quatre cas ci-dessus seraient verts sur des comparaisons vides.
   */
  it('⚠ et les lecteurs DISCRIMINENT — ils rendent NaN et null', () => {
    expect(
      Number.isNaN(nombreDeLApi('opac/identifiant-perenne.ts', 'CONSTANTE_INEXISTANTE')),
    ).toBe(true);
    expect(tableauDeLApi('cataloging/item-locations.ts', 'PAS_UN_TABLEAU')).toBeNull();
    // ⚠ la confusion PLAUSIBLE : un nom qui existe mais n'est pas un nombre
    expect(Number.isNaN(nombreDeLApi('cataloging/item-locations.ts', 'ITEM_LOCATIONS'))).toBe(
      true,
    );
  });
});
