import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adresseGraveeSurEtiquette,
  LARGEUR_MODULE_MIN_MM,
  MODULES_MAX_ETIQUETTE,
  QR_COTE_MM,
} from '../opac/identifiant-perenne';

/**
 * ⭐⭐ UNE SEULE DÉRIVATION POUR CE QUI EST GRAVÉ — ET ELLE SE PROUVE EN
 * LISANT LA SOURCE DES DEUX CÔTÉS.
 *
 * *Décidé par Jean le 2 novembre 2026, option (a) : l'API est propriétaire de
 * la chaîne à encoder ET de la géométrie qui en découle. Le front consomme, il
 * ne recalcule pas.*
 *
 * ## ⚠ CE FICHIER REMPLACE `etiquette-adresse-courte.spec.ts`, ET C'EST LUI QUI
 * ## M'A ARRÊTÉ
 *
 * L'ancien garde verrouillait l'inverse : « le service appelle la forme COURTE,
 * et jamais la pérenne ». Il a REFUSÉ mon changement, et il avait raison de le
 * faire — c'était une décision verrouillée. Elle a été inversée sur une mesure
 * du front : la route `/p/` raccourcit assez pour que la forme pérenne tienne,
 * et la forme courte MEURT AVEC LE DOMAINE.
 *
 * ⚠ Il est donc RÉÉCRIT, pas supprimé ni assoupli. Un garde qu'on fait taire
 * quand il dérange ne garde plus rien ; un garde qui change de propriété avec
 * la décision reste un garde.
 *
 * ## 🔴 POURQUOI IL LIT LA SOURCE, ET NE SE CONTENTE PAS DE COMPARER DES VALEURS
 *
 * Mesuré par le front, et c'est la raison d'être de ce fichier : **un test
 * d'exécution verrait une constante figée s'accorder avec sa propre valeur.**
 * `expect(QR_COTE_MM).toBe(14)` passerait aussi bien sur un `14` écrit à la
 * main que sur un `14` dérivé — donc il ne mesure rien de ce qui compte.
 *
 * Et le contrôle négatif qui compte VRAIMENT, posé par Jean : **si le front
 * cesse de consommer la valeur de l'API et retombe sur une constante locale,
 * cette épreuve doit tomber.** Sinon on aurait déplacé la divergence au lieu de
 * la supprimer.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');

const SOURCE_API = lire('apps/api/src/opac/identifiant-perenne.ts');
const SERVICE = lire('apps/api/src/labels/labels.service.ts');
const PDF = lire('apps/api/src/labels/label-pdf.ts');
const FRONT_GEO = lire('apps/web/lib/code128.ts');
const FRONT_URL = lire('apps/web/lib/url-publique.ts');

/**
 * ⭐⭐ DÉPOUILLE LES COMMENTAIRES — un garde textuel mesure du CODE, ou rien.
 *
 * *Posé le 3 novembre 2026, parce que mon contrôle négatif NE MORDAIT PAS.* Le
 * front a renommé `coteMm` partout dans ses bibliothèques et mon garde est
 * resté VERT : les cinq occurrences restantes de `lib/code128.ts` sont toutes
 * dans des commentaires qui RACONTENT que le côté a quitté ce fichier.
 *
 * ⚠ C'est mon propre défaut de la veille, rejoué sur autre chose — le garde de
 * version satisfait par le commentaire qui le nomme, le contrôle de
 * disparition satisfait par le texte qui explique le retrait. La forme est
 * toujours la même : **une vérification satisfaisable par de la prose.**
 *
 * ⚠ Et le dépouilleur est un INSTRUMENT NEUF : il porte ses deux témoins
 * ci-dessous. Un précédent mangeait 2 262 caractères d'un fichier parce qu'une
 * accolade suivie d'un JSDoc lui ressemblait à un bloc.
 */
export function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // ⚠ `(?<!:)` épargne `https://…` : sans lui, un `//` d'URL emporterait la
    // fin de la ligne, donc du CODE.
    .replace(/(?<!:)\/\/[^\n]*/g, ' ');
}

describe('⚠ TÉMOIN DE LECTURE — les cinq sources sont lues, et non vides', () => {
  it('chacune porte un ancrage qui lui est propre', () => {
    // ⚠ Posé sur la SOURCE, jamais sur les trouvailles : un fichier
    // PARFAITEMENT conforme n'a aucune forme fautive à compter, et un témoin
    // qui compterait des trouvailles punirait celui qui fait bien.
    expect(SOURCE_API).toContain('adresseGraveeSurEtiquette');
    expect(SERVICE).toContain('shortUrl');
    expect(PDF).toContain('qrPngPourEtiquette');
    // ⚠ CE TÉMOIN A ÉTÉ CHANGÉ le 3 novembre 2026. Il exigeait
    // `QR_COTE_MM` — le nom que le front a eu RAISON de supprimer en
    // basculant. Un témoin dont la condition de succès est l'existence de la
    // forme fautive punit celui qui fait bien, et s'aggrave à mesure que le
    // code se conforme. L'ancrage porte sur une constante que ce fichier garde
    // légitimement : la largeur de module, qui est à LUI.
    expect(FRONT_GEO).toContain('LARGEUR_MODULE_MIN_MM');
    expect(FRONT_URL).toContain('/p/');
  });

  /**
   * ⚠ LE DÉPOUILLEUR PORTE SES DEUX TÉMOINS — c'est un instrument neuf, et un
   * instrument neuf porte la faute qu'il traque jusqu'à preuve du contraire.
   */
  it('⭐ le dépouilleur retire la PROSE et garde le CODE', () => {
    const bloc = [
      '/** coteMm a quitté ce fichier — voir l’API. */',
      'const a = 1; // coteMm était ici',
      'const lu = etiquette.coteMm;',
      "const u = 'https://x/p/ID'; // commentaire",
    ].join('\n');
    const net = sansCommentaires(bloc);
    // PRÉSENCE : la seule consommation réelle survit.
    expect(net).toContain('etiquette.coteMm');
    // ABSENCE : les trois mentions de prose disparaissent — c'est la confusion
    // PLAUSIBLE, et c'est exactement elle qui a rendu mon garde vert.
    expect(net).not.toContain('a quitté ce fichier');
    expect(net).not.toContain('était ici');
    expect((net.match(/coteMm/g) ?? []).length, 'une seule occurrence doit rester').toBe(1);
    // ⚠ ET L'URL SURVIT ENTIÈRE : un dépouilleur naïf couperait à `https://`
    // et emporterait du code.
    expect(net).toContain("'https://x/p/ID'");
  });
});

describe('🔴 LA CHAÎNE GRAVÉE — une seule source, et c’est l’API', () => {
  it('⭐ par l’EFFET : elle est pérenne, courte, en CAPITALES, deux-points bruts', () => {
    const a = adresseGraveeSurEtiquette(
      'https://app.exemple.bf',
      'bib.ecole.bf',
      'd13bd5ee-1111-2222-3333-444455556666',
      'zinda',
    );
    expect(a).toBe('HTTPS://BIB.ECOLE.BF/P/OAI:ZINDA:D13BD5EE-1111-2222-3333-444455556666');
    // Les trois décisions, chacune vérifiée séparément pour que le message dise
    // LAQUELLE a cédé.
    expect(a, 'la route courte /p/').toContain('/P/');
    expect(a, 'jamais /opac/resoudre').not.toContain('RESOUDRE');
    expect(a, 'deux-points BRUTS, pas %3A').not.toContain('%3A');
    expect(a, 'CAPITALES — le mode alphanumérique du QR').toBe(a?.toUpperCase());
  });

  it('⭐ le SERVICE d’étiquettes n’appelle QUE cette dérivation', () => {
    const grave = SERVICE.split('\n').filter((l) => /adresseGraveeSurEtiquette\(/.test(l));
    expect(grave.length, 'le service doit appeler la dérivation unique').toBeGreaterThan(0);
    // ⚠ Et il ne doit plus appeler les DEUX autres constructions d'adresse :
    // chacune serait une seconde chaîne gravée.
    const code = SERVICE.split('\n').filter((l) => !l.trimStart().startsWith('//'));
    for (const autre of ['adresseCourteDeLaNotice(', 'adressePubliqueDeLaNotice(']) {
      expect(
        code.filter((l) => l.includes(autre)),
        `le service ne doit pas construire l’adresse par ${autre} — une seule dérivation`,
      ).toEqual([]);
    }
  });

  it('🔴 le GÉNÉRATEUR de planche n’écrit AUCUNE adresse lui-même', () => {
    // ⚠ LES LIGNES D'IMPORT SONT EXCLUES, et ce n'est pas une complaisance :
    // ma première écriture accusait `from '../opac/identifiant-perenne'` —
    // c'est-à-dire la ligne même qui PROUVE que le côté est importé. Un
    // détecteur qui signale du code correct se fait désactiver, et il ne sert
    // plus le jour où il a raison.
    const code = PDF.split('\n').filter(
      (l) =>
        !l.trimStart().startsWith('*') &&
        !l.trimStart().startsWith('//') &&
        !l.trimStart().startsWith('import '),
    );
    // ⚠ Et les motifs d'adresse exigent un GUILLEMET : c'est la fabrication
    // d'un littéral qu'on refuse, pas la mention d'un chemin de module.
    for (const motif of ["'/p/", "'/opac/", '`/p/', '`/opac/', 'toUpperCase()']) {
      expect(
        code.filter((l) => l.includes(motif)),
        `label-pdf.ts ne doit pas fabriquer d’adresse (${motif}) : il reçoit shortUrl`,
      ).toEqual([]);
    }
  });
});

describe('🔴 LE CÔTÉ — dérivé du seuil, et la preuve LIT LA SOURCE', () => {
  it('⭐ il vaut ce que le calcul rend, et le calcul est écrit', () => {
    expect(QR_COTE_MM).toBe(Math.ceil(MODULES_MAX_ETIQUETTE * LARGEUR_MODULE_MIN_MM));
    expect(QR_COTE_MM).toBe(14);
  });

  it('🔴 il est DÉRIVÉ dans la source, pas écrit — un nombre en dur est refusé', () => {
    // ⭐ C'EST LE SEUL CONTRÔLE QUI DISTINGUE LES DEUX. Le cas ci-dessus
    // passerait sur `export const QR_COTE_MM = 14;`.
    const ligne = SOURCE_API.split('\n').find((l) => /^export const QR_COTE_MM\b/.test(l));
    expect(ligne, 'QR_COTE_MM doit être déclaré dans la source de l’API').toBeTruthy();
    expect(ligne, 'le côté doit être CALCULÉ, pas écrit').toMatch(/Math\.ceil\(/);
    expect(ligne, 'il doit dériver du nombre de modules ET du seuil').toContain(
      'MODULES_MAX_ETIQUETTE',
    );
    expect(ligne).toContain('LARGEUR_MODULE_MIN_MM');
    expect(ligne, 'aucun millimètre écrit à la main dans cette ligne').not.toMatch(/=\s*\d/);
  });

  it('🔴 le GÉNÉRATEUR l’IMPORTE, il ne le redéclare pas', () => {
    expect(PDF, 'label-pdf doit importer le côté').toMatch(
      /import \{[^}]*QR_COTE_MM[^}]*\} from '\.\.\/opac\/identifiant-perenne'/,
    );
    expect(
      PDF.split('\n').filter((l) => /^(export )?const QR_COTE_MM\s*=/.test(l)),
      'label-pdf ne doit PAS redéclarer le côté — c’était la divergence 13 contre 14',
    ).toEqual([]);
  });
});

/**
 * 🔴 LE CONTRÔLE QUI COMPTE VRAIMENT — « si le front cesse de consommer ta
 * valeur et retombe sur une constante locale, l'épreuve doit tomber. Sinon on
 * aura déplacé la divergence au lieu de la supprimer. » (Jean, 2 nov. 2026)
 *
 * ⚠ IL FRANCHIT LA FRONTIÈRE DES ESPACES DE TRAVAIL, EN LECTURE SEULE, et
 * délibérément — c'est la forme qu'emploie déjà
 * `fonctions-connues-de-l-api.spec.ts` chez le web : le couplage existe dans
 * les faits, autant qu'il soit vérifié.
 *
 * ⚠ CE QU'IL NE PEUT PAS FAIRE, et c'est écrit plutôt que découvert : tant que
 * le front DÉRIVE le côté par la même formule, il ne CONSOMME pas encore la
 * valeur de l'API — il y a deux dérivations qui s'accordent. Ce garde refuse
 * donc les deux états fautifs qu'on peut distinguer en lisant la source : une
 * constante ÉCRITE, et une formule DIFFÉRENTE. Le jour où le front importera la
 * valeur servie, le second cas deviendra inutile et ce commentaire tombera.
 */
/**
 * 🔴 LE FRONT CONSOMME, IL NE DÉCLARE PLUS — et ce témoin a été RETOURNÉ.
 *
 * ## ⚠ CE QU'IL EXIGEAIT HIER, ET POURQUOI C'ÉTAIT UNE IMPASSE
 *
 * Sa première écriture portait `expect(ligneFront).toBeTruthy()` : elle
 * EXIGEAIT que `QR_COTE_MM` soit DÉCLARÉ dans `apps/web/lib/code128.ts`, et
 * vérifiait qu'il y était dérivé par la même formule.
 *
 * ⭐ **Donc elle interdisait la correction qu'elle existait pour préparer.**
 * Supprimer la constante du front — le geste même qui supprime la seconde
 * dérivation — faisait tomber ce garde. Jean a demandé au front de satisfaire
 * un garde en le cassant ; le front a refusé et n'a posé aucun repli, ce qui
 * était la bonne conduite.
 *
 * ⚠ Et la cause de l'impasse était chez MOI : aucune route ne servait la
 * géométrie ni l'adresse gravée, et `apps/web` ne peut pas importer
 * `apps/api` (aucun alias, aucune dépendance). Le front n'avait rien à
 * consommer. `/opac/records/:id` sert désormais
 * `etiquette: { adresseGravee, coteMm }`.
 *
 * ## Ce qu'il exige MAINTENANT
 *
 * · le front ne DÉCLARE plus de côté — toute constante locale le fait tomber ;
 * · il CONSOME la valeur servie — il la lit dans la réponse de l'API.
 *
 * ⚠ TANT QUE LE FRONT N'A PAS BASCULÉ, ces cas sont `skip`és avec leur motif,
 * et le premier d'entre eux MESURE l'état réel pour que le `skip` ne survive
 * pas à sa raison. Un `skip` muet serait une dette tue ; celui-ci se lèvera
 * tout seul le jour où la déclaration disparaîtra.
 */
describe('🔴 LE FRONT CONSOMME LA VALEUR SERVIE, il ne la redéclare pas', () => {
  const ligneFront = FRONT_GEO.split('\n').find((l) => /^export const QR_COTE_MM\b/.test(l));
  const frontADejaBascule = ligneFront === undefined;

  /**
   * 🔴 LE `skip` A ÉTÉ RETIRÉ — SA CONDITION DÉRIVAIT DE CE QU'IL GARDAIT.
   *
   * *Mesuré le 3 novembre 2026, en contrôle négatif.* Ces cas étaient
   * `skipIf(!frontADejaBascule)` le temps que le front bascule — une dette
   * nommée plutôt que tue, et c'était juste. **Mais `frontADejaBascule` est
   * calculé sur l'absence de déclaration locale** : le jour où quelqu'un
   * redéclarerait un côté chez le front, les deux cas ne TOMBERAIENT pas, ils
   * se SKIPERAIENT. Mesuré : « 10 passed | 2 skipped », verdict vert.
   *
   * ⚠ C'est « un garde dont la population dérive de la chose mal configurée ne
   * peut pas la voir », appliqué à une condition de SKIP. Le garde était
   * complet sur sa population, et sa population se vidait du défaut même.
   *
   * Le front a basculé — 0 déclaration de `QR_COTE_MM` dans `apps/web` — donc
   * la condition a cessé d'exister. Ce cas-ci l'AFFIRME désormais : une
   * régression du front fait tomber, elle ne désarme plus.
   */
  it('🔴 le front a bien basculé — cette affirmation remplace l’ancien `skip`', () => {
    expect(
      ligneFront,
      `le front redéclare un côté : ${ligneFront?.trim()} — la seconde dérivation est de retour`,
    ).toBeUndefined();
  });

  it(
    '🔴 le front ne déclare AUCUN côté local — sinon la divergence est de retour',
    () => {
      expect(
        ligneFront,
        'le front a redéclaré QR_COTE_MM : une seconde dérivation est revenue',
      ).toBeUndefined();
    },
  );

  /**
   * 🔴 CE CAS NE MORDAIT PAS — il était satisfait par de la PROSE.
   *
   * *Mesuré par le front le 3 novembre 2026 : il a renommé `coteMm` partout
   * dans ses bibliothèques, et ce garde est resté VERT.* Les occurrences
   * restantes de `lib/code128.ts` sont toutes dans des commentaires qui
   * expliquent que le côté a quitté ce fichier — et le motif `|coteMm` les
   * prenait pour une consommation.
   *
   * ⚠ ET CE GARDE RESTE LE PLUS FAIBLE DES DEUX, même dépouillé : il lit un
   * NOM. Le garde d'EFFET est chez le front, et aucune prose ne le satisfait :
   *
   *     apps/web/tests/etiquettes-cote-servi.spec.tsx
   *     « ⭐⭐ le côté SERVI atteint le rendu — deux valeurs, deux tailles »
   *
   * Il rend l'étiquette avec deux côtés servis différents et exige que le QR
   * DESSINÉ suive — `expect(grand / petit).toBeCloseTo(22 / 14, 5)`. Si le
   * composant refige le côté, ce cas-là tombe, quoi que disent les
   * commentaires de part et d'autre.
   *
   * ⚠ Le renvoi est écrit ICI exprès, pour que personne ne réécrive demain une
   * vérification satisfaisable par un commentaire en croyant suffire.
   */
  it('🔴 et il CONSOMME `etiquette.coteMm` servi par l’API', () => {
    const codeFront = sansCommentaires(FRONT_GEO) + sansCommentaires(FRONT_URL);
    expect(
      /\bcoteMm\b/.test(codeFront),
      'le front doit LIRE coteMm dans la réponse de l’API — et dans du CODE, ' +
        'pas dans un commentaire qui raconte la bascule',
    ).toBe(true);
  });

  /**
   * ⚠ CE CAS-CI N'EST PAS `skip`é, et c'est le seul qui compte aujourd'hui :
   * tant que les deux dérivations coexistent, elles doivent rendre LA MÊME
   * valeur. C'est lui qui a mordu quand on a figé le front à 13.
   */
  it('⭐ tant que les deux coexistent, elles rendent LA MÊME valeur', () => {
    if (frontADejaBascule) return;
    const nb = (motif: RegExp) => {
      const l = FRONT_GEO.split('\n').find((x) => motif.test(x));
      const m = l?.match(/=\s*([0-9.]+)\s*;/);
      return m ? Number(m[1]) : NaN;
    };
    /**
     * 🔴 ON LIT LA VALEUR QUE LE FRONT DÉCLARE, PAS CELLE QU'IL DEVRAIT AVOIR.
     *
     * ⚠ Ma première écriture recalculait la formule depuis les FACTEURS du
     * front (`seuil`, `silence`, `version`) et comparait ce résultat à l'API.
     * Elle ne lisait JAMAIS son `QR_COTE_MM`. Le contrôle négatif l'a dit :
     * figer le front à `13` ne faisait tomber AUCUN cas, parce que les
     * facteurs, eux, n'avaient pas changé — je mesurais ce que le front
     * DEVRAIT obtenir, pas ce qu'il obtient.
     *
     * C'est « l'instrument qui se trompe sur ce qu'il mesure », dans un garde
     * écrit pour traquer exactement cette famille.
     *
     * Les deux formes se lisent donc séparément : un LITTÉRAL se prend tel
     * quel, une DÉRIVATION se recalcule depuis les facteurs.
     */
    const litteral = ligneFront?.match(/=\s*([0-9.]+)\s*;/);
    let coteFront: number;
    if (litteral) {
      coteFront = Number(litteral[1]);
    } else {
      const seuil = nb(/^export const LARGEUR_MODULE_MIN_MM\b/);
      const silence = nb(/^export const SILENCE\b/);
      const version = nb(/^export const VERSION_MAX_ETIQUETTE\b/);
      expect([seuil, silence, version].some(Number.isNaN), 'facteurs illisibles').toBe(false);
      coteFront = Math.ceil((4 * version + 17 + 2 * silence) * seuil);
    }
    expect(
      coteFront,
      `le côté du front (${coteFront} mm) diffère de celui de l’API (${QR_COTE_MM} mm) — ` +
        'une étiquette collée est définitive',
    ).toBe(QR_COTE_MM);
  });
});
