/**
 * ⭐⭐ L'ALPHABET DU QR D'ÉTIQUETTE — et la mesure du module en dépend.
 *
 * ## ⚠ CE QUE LA SESSION MOBILE A SOULEVÉ
 *
 * Le mode ALPHANUMÉRIQUE de la norme QR ne couvre pas tout : il ne connaît ni
 * `?` ni `=`. Une adresse d'étiquette portant un paramètre de requête
 * retomberait donc en mode **OCTET** et perdrait la version entière que les
 * capitales ont gagnée — **et la mesure du module à 14 mm serait alors fausse**,
 * donc le côté dérivé ne garantirait plus rien.
 *
 * ⭐ C'est le cas le plus retors de ce lot : rien ne casse. Le QR reste valide,
 * il se scanne, il mène à la bonne notice. Seule sa DENSITÉ change, en silence,
 * sur un carré qui ne grandit pas.
 *
 * ## ⭐ L'ALPHABET EST MESURÉ ICI, PAS RECOPIÉ
 *
 * Écrire les 45 caractères à la main serait « un index est une chaîne recopiée
 * qui ne se voit pas » : le jour où l'encodeur change d'avis, la liste resterait
 * juste à l'œil et fausse en fait. Ce fichier la DÉRIVE de l'encodeur, par un
 * discriminant mesuré le 2 novembre 2026 :
 *
 * | 60 copies de… | Version | Mode |
 * |---|---|---|
 * | `0` | 2 | numérique |
 * | `A` | 3 | alphanumérique |
 * | `a` | **4** | **octet** |
 *
 * Un caractère est donc « dense » si 60 copies tiennent en version ≤ 3. Mesuré
 * sur tout l'ASCII imprimable : **45 caractères** — l'espace, `$%*+-./`, `0-9`,
 * `:`, `A-Z` — exactement l'alphabet de la norme, et `? = & _ ~ #` en sont
 * dehors.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { Etiquette } from '@/components/etiquette';
import { LARGEUR_MODULE_MIN_MM } from '@/lib/code128';
import { matriceQr, moduleQrMm } from '@/lib/qr';
import { contenuDuQr } from './aide-trace-qr';

const UUID = 'b2dcaa10-07f9-49ec-80ff-15e32359ee4d';
const ORIGINE = 'https://biblio.univ-exemple.bf';
const CANONIQUE = `${ORIGINE}/p/oai:exemple:${UUID}`;
/**
 * ⚠ LE CÔTÉ EST UNE DONNÉE D'ESSAI, pas une constante du produit : il est servi
 * par `etiquette.coteMm` depuis le 3 novembre 2026, et
 * `etiquettes-cote-servi.spec.tsx` garde qu'aucune bibliothèque ne le déclare.
 */
const COTE_SERVI = 14;

/**
 * ⭐ L'ALPHABET DENSE, DÉRIVÉ DE L'ENCODEUR — jamais écrit.
 *
 * ⚠ Le seuil `≤ 3` vient du discriminant mesuré, et le témoin de compte juste
 * en dessous le garde : si l'encodeur changeait de comportement, c'est le
 * compte qui convoquerait, pas une liste qu'on relirait.
 */
const ALPHABET_DENSE = (() => {
  const dense = new Set<string>();
  for (let code = 32; code < 127; code++) {
    const c = String.fromCharCode(code);
    if (matriceQr(c.repeat(60)).version <= 3) dense.add(c);
  }
  return dense;
})();

/** Les caractères d'une chaîne qui la feraient retomber en mode octet. */
const horsAlphabet = (s: string) => [...new Set([...s])].filter((c) => !ALPHABET_DENSE.has(c));

describe("⭐ l'alphabet dense est MESURÉ sur l'encodeur", () => {
  /*
   * ⚠ TÉMOIN DE COMPTE : la norme en donne 45. Un compte exact ne dit pas que
   * le relevé est juste, il OBLIGE à revenir le regarder — ici le jour où
   * l'encodeur changerait de mode pour un caractère.
   */
  it('⭐ il en contient exactement 45', () => {
    expect(
      ALPHABET_DENSE.size,
      `l’encodeur range désormais ${ALPHABET_DENSE.size} caractères en mode dense ` +
        `au lieu de 45 : relisez quels caractères une étiquette peut porter`,
    ).toBe(45);
  });

  it('⚠ et il contient bien ce qu’une adresse pérenne emploie', () => {
    for (const c of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/.-']) {
      expect(ALPHABET_DENSE.has(c), `« ${c} » devrait être dense`).toBe(true);
    }
  });

  /*
   * ⭐⭐ LE TÉMOIN D'ABSENCE, et c'est lui qui porte l'alerte du mobile : sans
   * lui, un alphabet qui contiendrait TOUT serait indiscernable d'un alphabet
   * juste — et plus rassurant, puisqu'il n'exclurait jamais rien.
   */
  it('⭐⭐ et « ? » et « = » n’en sont PAS — c’est tout l’objet de ce fichier', () => {
    for (const c of ['?', '=', '&', '_', '~', '#']) {
      expect(ALPHABET_DENSE.has(c), `« ${c} » ne doit PAS être dense`).toBe(false);
    }
    // les minuscules non plus : c'est la raison des capitales
    expect(ALPHABET_DENSE.has('a')).toBe(false);
  });
});

/* ──────────── L'ÉPREUVE, SUR LA CHAÎNE RÉELLEMENT ENCODÉE ──────────── */

/**
 * ⚠ On ne juge PAS la valeur passée au composant : on relit le tracé dessiné et
 * on identifie la chaîne qu'il porte. Une transformation glissée n'importe où
 * dans la chaîne d'appel serait vue ici.
 */
function chaineGravee(adresse: string): string {
  // ⚠ L'API sert l'adresse DÉJÀ gravée : on la donne telle qu'elle arrivera.
  const gravee = adresse.toUpperCase();
  render(
    <Etiquette
      barcode="BIB-000229"
      cote="004 GAF"
      titre="Gafeso — Guide d’utilisation"
      etablissement="Université d’Exemple"
      etiquette={{ adresseGravee: gravee, coteMm: COTE_SERVI }}
    />,
  );
  const encodé = contenuDuQr([gravee, adresse]);
  expect(encodé, 'aucune candidate ne produit le tracé dessiné').not.toBeNull();
  return encodé as string;
}

describe("⭐⭐ ce qu'une étiquette GRAVE tient dans l'alphabet dense", () => {
  it('⭐ la chaîne réellement encodée n’a aucun caractère hors alphabet', () => {
    const gravee = chaineGravee(CANONIQUE);
    const fautifs = horsAlphabet(gravee);
    expect(
      fautifs,
      `🔴 la chaîne gravée porte ${fautifs.length} caractère(s) hors du mode ` +
        `alphanumérique : ${fautifs.map((c) => `« ${c} »`).join(', ')}. Le QR ` +
        `retombe en mode OCTET, perd une version entière, et la mesure du ` +
        `module à ${COTE_SERVI} mm ne vaut plus rien.`,
    ).toEqual([]);
  });

  /*
   * ⭐⭐ ET LA CONSÉQUENCE EST MESURÉE, pas déduite : on compare la version de
   * la chaîne gravée à celle de la même chaîne avec un « ? » injecté. L'écart
   * EST le gain qu'on perdrait.
   */
  it('⭐⭐ et rester dans l’alphabet VAUT une version entière', () => {
    const gravee = chaineGravee(CANONIQUE);
    const propre = matriceQr(gravee);
    const souillee = matriceQr(`${gravee}?PRINT=1`);
    expect(souillee.version).toBeGreaterThan(propre.version);
    expect(moduleQrMm(propre.taille, COTE_SERVI)).toBeGreaterThan(moduleQrMm(souillee.taille, COTE_SERVI));
    // et le module propre tient le seuil
    expect(moduleQrMm(propre.taille, COTE_SERVI)).toBeGreaterThanOrEqual(LARGEUR_MODULE_MIN_MM);
  });

  /*
   * ⭐⭐ LE CONTRÔLE NÉGATIF DEMANDÉ : une adresse portant un paramètre de
   * requête fait TOMBER l'épreuve, et le message NOMME le caractère fautif.
   *
   * ⚠ Ce n'est pas un cas théorique : il suffit qu'une `publicUrl` servie porte
   * un `?utm=…`, ou que quelqu'un ajoute `?print=1` pour bien faire.
   */
  it('⭐⭐ contrôle négatif : un « ? » dans l’adresse est DÉTECTÉ et NOMMÉ', () => {
    const gravee = chaineGravee(`${CANONIQUE}?print=1`);
    const fautifs = horsAlphabet(gravee);
    expect(fautifs, 'le « ? » doit être détecté').toContain('?');
    // ⚠ et le message que l'épreuve nominale produirait le NOMME
    const message = `caractère(s) hors du mode alphanumérique : ${fautifs
      .map((c) => `« ${c} »`)
      .join(', ')}`;
    expect(message).toContain('« ? »');
    // le « = » aussi, et c'est le second caractère d'un paramètre de requête
    expect(fautifs).toContain('=');
  });
});
