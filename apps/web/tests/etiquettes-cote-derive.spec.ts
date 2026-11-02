/**
 * ⭐⭐ LE CÔTÉ DU QR D'UNE ÉTIQUETTE EST **DÉRIVÉ**, pas recopié.
 *
 * ## ⚠ CE QUE CE FICHIER EXISTE POUR EMPÊCHER
 *
 * `QR_COTE_MM` valait **13, écrit en dur**, jusqu'au 2 novembre 2026. Le nombre
 * était juste pour les adresses d'alors, et rien ne le reliait au seuil qu'il
 * existe pour respecter. Le jour où `LARGEUR_MODULE_MIN_MM` monterait, le carré
 * serait resté à 13 — et les étiquettes auraient imprimé des modules sous le
 * minimum, **en silence, sur des livres**.
 *
 * ⭐ Exigence de Jean, 2 novembre 2026 : *« le 14 mm est dérivé de la mesure,
 * pas recopié : si `LARGEUR_MODULE_MIN_MM` change, le côté doit suivre, et une
 * épreuve doit le dire. »*
 *
 * ## ⚠ ET LA DÉRIVATION A DEUX MOITIÉS, dont une seule est arithmétique
 *
 * La formule — `ceil(modules × seuil)` — est triviale. Ce qui ne l'est pas est
 * le **PIRE CAS** qu'elle prend en entrée : `VERSION_MAX_ETIQUETTE = 7`. Ce
 * fichier l'ÉPROUVE en encodant réellement l'adresse la plus longue que le
 * produit puisse imprimer, au lieu de faire confiance au chiffre.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LARGEUR_MODULE_MIN_MM,
  MODULES_MAX_ETIQUETTE,
  QR_COTE_MM,
  SILENCE,
  VERSION_MAX_ETIQUETTE,
} from '@/lib/code128';
import { matriceQr, moduleQrMm, qrAssezGros } from '@/lib/qr';
import { pourLeQrDEtiquette } from '@/lib/url-publique';

/** Le slug le plus long qu'`apps/api/src/admin/dto/provision-tenant.dto.ts` autorise. */
const SLUG_MAX = 49;
const UUID = 'b2dcaa10-07f9-49ec-80ff-15e32359ee4d';

/** L'adresse la plus longue qu'une étiquette puisse porter, telle qu'imprimée. */
const pireAdresse = (n: number) => {
  const slug = 'a'.repeat(n);
  return pourLeQrDEtiquette(`https://${slug}.gafeso.org/p/oai:${slug}:${UUID}`);
};

describe('⭐⭐ le côté du QR est dérivé du seuil', () => {
  it('⭐ `QR_COTE_MM` vaut le côté minimal arrondi au mm supérieur', () => {
    expect(QR_COTE_MM).toBe(Math.ceil(MODULES_MAX_ETIQUETTE * LARGEUR_MODULE_MIN_MM));
    // 53 × 0,25 = 13,25 → 14
    expect(MODULES_MAX_ETIQUETTE).toBe(53);
    expect(QR_COTE_MM).toBe(14);
  });

  /**
   * ⭐⭐ ET CE CAS-LÀ EXISTE PARCE QUE LE PRÉCÉDENT NE SUFFIT PAS.
   *
   * 🔴 Contrôle négatif du 2 novembre 2026 : remettre `QR_COTE_MM = 14` ÉCRIT
   * EN DUR laissait les cinq cas de ce fichier **VERTS**. L'égalité
   * `14 === ceil(53 × 0,25)` est satisfaite par un littéral qui tombe juste —
   * c'est « deux sources qui s'accordent PAR COÏNCIDENCE », et un test
   * d'exécution ne peut pas les séparer : la constante est figée au chargement
   * du module, aucun test ne peut faire varier le seuil.
   *
   * ⭐ Le seul instrument qui discrimine lit donc la SOURCE, et exige que la
   * valeur soit une EXPRESSION des deux noms. C'est un garde de forme, avec le
   * défaut des gardes de forme — il ne voit que l'écriture qu'on a imaginée.
   *
   * ⚠ SA BORNE, ÉCRITE : il ne suit pas les variables. Quelqu'un qui
   * calculerait le côté dans une constante intermédiaire, puis l'assignerait,
   * lui échapperait. On factorise le CORPS, jamais la dérivation elle-même.
   */
  it('⭐⭐ et il est une EXPRESSION, pas un littéral — lu dans la SOURCE', () => {
    const source = readFileSync(join(__dirname, '..', 'lib', 'code128.ts'), 'utf8');
    /*
     * ⚠ ANCRÉ EN DÉBUT DE LIGNE. Ma première écriture cherchait
     * `includes('export const QR_COTE_MM')` et trouvait **le commentaire**, qui
     * cite l'ancienne forme `export const QR_COTE_MM = 13;` pour expliquer
     * pourquoi elle était fautive. Le garde accusait donc le code CORRECT, en
     * lisant la phrase qui raconte le défaut. Ce dépôt a payé ce motif trois
     * fois : un relevé qui lit l'intérieur des commentaires fabrique ses
     * trouvailles.
     */
    const ligne = source
      .split('\n')
      .find((l) => /^export const QR_COTE_MM\b/.test(l));
    expect(ligne, 'la déclaration de QR_COTE_MM n’est plus sur une seule ligne').toBeTruthy();
    expect(
      ligne,
      '🔴 `QR_COTE_MM` est redevenu un LITTÉRAL. Le jour où ' +
        '`LARGEUR_MODULE_MIN_MM` montera, le carré restera où il est et les ' +
        'étiquettes imprimeront des modules sous le minimum, en silence, sur des ' +
        'livres. Il doit rester dérivé : ' +
        'ceil(MODULES_MAX_ETIQUETTE × LARGEUR_MODULE_MIN_MM).',
    ).toContain('LARGEUR_MODULE_MIN_MM');
    expect(ligne).toContain('MODULES_MAX_ETIQUETTE');
    // ⚠ témoin d'ABSENCE : aucun nombre en dur dans la déclaration
    expect(ligne?.replace(/QR_COTE_MM/g, '')).not.toMatch(/\d/);
  });

  /*
   * ⭐⭐ LA MOITIÉ QUI COMPTE : le pire cas est MESURÉ, pas déclaré.
   *
   * On encode réellement l'adresse d'une école au slug maximal, telle qu'elle
   * s'imprime — majuscules comprises. Si elle demandait une version de plus,
   * ce cas tombe, et le côté dérivé serait trop petit.
   */
  it('⭐⭐ le pire cas LÉGAL tient dans la version déclarée — encodé, pas supposé', () => {
    const m = matriceQr(pireAdresse(SLUG_MAX));
    expect(
      m.version,
      `une école au slug de ${SLUG_MAX} caractères demande la version ${m.version}, ` +
        `et VERSION_MAX_ETIQUETTE vaut ${VERSION_MAX_ETIQUETTE} : le côté dérivé ` +
        `est trop petit, et les modules passeront sous le seuil`,
    ).toBeLessThanOrEqual(VERSION_MAX_ETIQUETTE);
    expect(m.taille + 2 * SILENCE).toBeLessThanOrEqual(MODULES_MAX_ETIQUETTE);
    // et le module obtenu tient au seuil, c'est tout l'objet de la dérivation
    expect(qrAssezGros(m.taille)).toBe(true);
    expect(moduleQrMm(m.taille)).toBeGreaterThanOrEqual(LARGEUR_MODULE_MIN_MM);
  });

  /*
   * ⚠ TÉMOIN D'ABSENCE : la dérivation doit RÉAGIR. Sans ce cas, un
   * `QR_COTE_MM` figé serait indiscernable d'un côté dérivé — et c'est
   * exactement l'état d'avant le 2 novembre.
   */
  it('⚠ si le seuil montait, le côté SUIVRAIT — la formule est éprouvée seule', () => {
    const cote = (seuil: number) => Math.ceil(MODULES_MAX_ETIQUETTE * seuil);
    expect(cote(0.25)).toBe(14);
    expect(cote(0.3)).toBe(16);
    expect(cote(0.33)).toBe(18);
    // ⚠ et un seuil ABAISSÉ rétrécit le carré : la dérivation va dans les deux sens
    expect(cote(0.2)).toBe(11);
  });

  /*
   * ⚠ LA BORNE GÉOMÉTRIQUE, mesurée le 2 novembre 2026 : une étiquette fait
   * 26 mm de haut, moins 1,5 mm de rembourrage de chaque côté → 23,00 mm. Un
   * côté dérivé qui la dépasserait ferait sortir le QR de l'étiquette, et
   * personne ne le verrait avant d'imprimer une planche entière.
   */
  it('⚠ le côté dérivé reste dans la HAUTEUR disponible — 23,00 mm', () => {
    const hauteurUtile = 26 - 2 * 1.5;
    expect(hauteurUtile).toBe(23);
    expect(
      QR_COTE_MM,
      `un carré de ${QR_COTE_MM} mm ne tient pas dans ${hauteurUtile} mm de hauteur ` +
        `utile : le QR sortirait de l’étiquette. DEUX ISSUES — réduire le pire cas ` +
        `admis, ou grandir l’étiquette (et le PDF du backend avec elle).`,
    ).toBeLessThanOrEqual(hauteurUtile);
  });

  /*
   * ⭐ ET CE QUE LE LOT A VRAIMENT GAGNÉ, chiffré : ce n'est pas le cas limite,
   * c'est CHAQUE étiquette réelle. `zinda` passe de 0,2653 mm par module
   * (ancienne adresse longue, 13 mm, minuscules) à 0,3415.
   */
  it('⭐ toutes les étiquettes réelles gagnent, pas seulement le cas limite', () => {
    for (const slug of ['zinda', 'horizon', 'gafeso-univ']) {
      const m = matriceQr(pireAdresse(slug.length));
      expect(moduleQrMm(m.taille), slug).toBeGreaterThan(0.3);
    }
  });
});
