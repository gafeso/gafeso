/**
 * ⭐⭐ LES MAJUSCULES NE SORTENT JAMAIS DU QR IMPRIMÉ.
 *
 * ## ⭐ LA DÉCISION, et le chiffre qui l'a motivée
 *
 * Décisions de Jean, 2 novembre 2026 :
 *
 * · le contenu du QR d'une ÉTIQUETTE est en **MAJUSCULES** — le mode
 *   alphanumérique de la norme QR couvre `0-9 A-Z $%*+-./:` mais pas les
 *   minuscules, et une adresse en capitales gagne une version entière ;
 * · **elles ne sortent JAMAIS du QR imprimé.** Ni dans OAI-PMH, ni sur la
 *   fiche, ni dans un `aria-label`, ni dans aucune adresse publiée. La forme
 *   canonique reste minuscule partout ailleurs.
 *
 * Mesuré, carré de 14 mm : `zinda` passe de la version 5 à la 4, soit
 * **0,3415 mm par module au lieu de 0,3111**. Et le pire cas légal — un slug de
 * 49 caractères — tombe de la version 9 à la 7, ce qui est ce qui rend le
 * slug LIBRE.
 *
 * ## ⚠ CE QUE CETTE ÉPREUVE MESURE, et ce qu'elle refuse de mesurer
 *
 * Elle ne relit AUCUN prop et ne construit AUCUNE chaîne à côté : elle décode
 * les deux tracés **réellement dessinés** — celui de l'étiquette et celui de la
 * fiche — en les identifiant parmi les deux casses. Exigence de Jean : *« une
 * épreuve le prouve sur le tracé RÉELLEMENT DESSINÉ, pas sur une chaîne
 * construite à côté. Contrôle négatif : une casse qui ne se relit pas à
 * l'identique fait TOMBER l'épreuve. »*
 *
 * ⭐ Le contrôle négatif est STRUCTUREL ici : `contenuDuQr` rend `null` quand
 * aucune candidate ne produit le tracé, et chaque cas fait tomber ce `null`.
 * Une casse inattendue — ou une transformation glissée ailleurs — ne peut donc
 * pas passer.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BlocPartage } from '@/components/bloc-partage';
import { Etiquette } from '@/components/etiquette';
import { normaliserPrefixePerenne } from '@/middleware';
import { identifiantDuSegment, pourLeQrDEtiquette } from '@/lib/url-publique';
import { contenuDuQr } from './aide-trace-qr';

const UUID = 'b2dcaa10-07f9-49ec-80ff-15e32359ee4d';
const ORIGINE = 'https://biblio.univ-exemple.bf';
const IDENTIFIANT = `oai:exemple:${UUID}`;
/** La forme CANONIQUE — minuscule, celle que les moissonneurs ont stockée. */
const CANONIQUE = `${ORIGINE}/p/${IDENTIFIANT}`;
/** Ce que l'étiquette IMPRIME. */
const IMPRIMÉE = pourLeQrDEtiquette(CANONIQUE);
const CASSES = [CANONIQUE, IMPRIMÉE] as const;

describe('⭐⭐ l’ÉTIQUETTE imprime en MAJUSCULES', () => {
  it('⭐ le tracé dessiné porte la forme en capitales, identifiée depuis le SVG', () => {
    render(
      <Etiquette
        barcode="BIB-000229"
        cote="004 GAF"
        titre="Gafeso — Guide d’utilisation"
        etablissement="Université d’Exemple"
        urlNotice={CANONIQUE}
      />,
    );
    const encodé = contenuDuQr(CASSES);
    expect(encodé, 'aucune des deux casses ne produit le tracé dessiné').not.toBeNull();
    expect(encodé).toBe(IMPRIMÉE);
    expect(encodé).toBe(encodé?.toUpperCase());
  });

  /*
   * ⭐⭐ ET LA REMISE EN MINUSCULES EST SANS PERTE — c'est ce qui autorise les
   * capitales. Le chemin est celui du résolveur : ce que le QR porte, passé par
   * `identifiantDuSegment`, doit redonner l'identifiant canonique EXACT.
   */
  it('⭐⭐ ce que le QR porte se relit en l’identifiant CANONIQUE, à l’identique', () => {
    render(
      <Etiquette
        barcode="BIB-000229"
        cote="004 GAF"
        titre="T"
        etablissement="E"
        urlNotice={CANONIQUE}
      />,
    );
    const encodé = contenuDuQr(CASSES);
    expect(encodé).not.toBeNull();
    /*
     * Le segment tel que Next le livrera, depuis l'adresse DESSINÉE.
     * ⚠ Le découpage est insensible à la casse : le tracé est en capitales,
     * donc `/p/` y est `/P/`. Ma première écriture découpait sur `/p/` et
     * accusait le produit — « le tracé ne porte pas un chemin /p/ » — alors
     * que c'était mon assertion qui ignorait la transformation qu'elle
     * éprouvait.
     */
    const segment = (encodé as string).split(/\/p\//i)[1];
    expect(segment, 'le tracé ne porte pas un chemin /p/').toBeTruthy();
    expect(identifiantDuSegment(segment)).toBe(IDENTIFIANT);
  });

  it('⚠ et le résolveur accepte les DEUX casses, et les deux écritures', () => {
    for (const s of [
      IDENTIFIANT,
      IDENTIFIANT.toUpperCase(),
      encodeURIComponent(IDENTIFIANT),
      encodeURIComponent(IDENTIFIANT).toUpperCase(),
    ]) {
      expect(identifiantDuSegment(s), s).toBe(IDENTIFIANT);
    }
  });
});

describe('⭐⭐ et elles NE SORTENT PAS — la fiche reste minuscule', () => {
  async function monterFiche(publicUrl: string) {
    vi.stubGlobal('location', { ...window.location, origin: ORIGINE });
    render(<BlocPartage recordId={UUID} publicUrl={publicUrl} />);
    await screen.findByRole('img', { name: /Code QR/i });
  }

  /*
   * ⭐⭐ LE CAS QUI PORTE LA MOITIÉ « ELLES NE SORTENT PAS ».
   *
   * ⚠ Il tombe si l'on fusionne les deux chemins — si `pourLeQrDEtiquette`
   * remonte dans une aide partagée, dans `adresseDuQr`, ou dans le composant
   * `QrCode`. C'est le contrôle négatif de l'exigence 2, et il est posé sur
   * l'EFFET : le tracé de la fiche, décodé.
   */
  it('⭐⭐ le QR de la FICHE encode la forme canonique, PAS les capitales', async () => {
    await monterFiche(CANONIQUE);
    const encodé = contenuDuQr(CASSES);
    expect(encodé, 'aucune des deux casses ne produit le tracé de la fiche').not.toBeNull();
    expect(encodé).toBe(CANONIQUE);
    expect(encodé).not.toBe(IMPRIMÉE);
  });

  it('⚠ et l’adresse ANNONCÉE au lecteur d’écran reste minuscule', async () => {
    await monterFiche(CANONIQUE);
    const nom = screen.getByRole('img', { name: /Code QR/i }).getAttribute('aria-label') ?? '';
    expect(nom).toContain(CANONIQUE);
    expect(nom).not.toContain(IMPRIMÉE);
    // ⚠ témoin de forme : aucune séquence de capitales du chemin ne doit y être
    expect(nom).not.toMatch(/\/P\/OAI:/);
  });
});

/**
 * ⭐⭐ ET LE CHEMIN EN CAPITALES DOIT ÊTRE ATTEIGNABLE — le défaut le plus
 * grave que ce lot a produit, trouvé par une MESURE.
 *
 * ## 🔴 CE QUE LE `curl` SANS COOKIE A DIT, le 2 novembre 2026
 *
 * ```
 * /P/OAI:ZINDA:B2DCAA10-…  → 307 /login
 * /p/oai:zinda:b2dcaa10-…  → 308 /opac/b2dcaa10-…
 * ```
 *
 * **Et c'est en capitales que l'étiquette imprime.** Toute planche produite ce
 * jour-là aurait mené un lecteur, livre en main, à un écran de connexion.
 *
 * ⚠ DEUX couches étaient sensibles à la casse — le préfixe public du
 * middleware, ET le routeur de Next, dont les segments statiques le sont. Le
 * préfixe est donc NORMALISÉ en un seul endroit, et l'arrivée a été mesurée :
 * 2 bonds, 200, sur la notice.
 *
 * ⭐ L'entrée de ces cas est DÉRIVÉE de la forme imprimée — `pourLeQrDEtiquette`
 * — et non tapée à la main : le jour où la transformation change, le garde suit.
 */
describe('⭐⭐ le chemin que l’étiquette imprime est atteignable', () => {
  /** Le chemin tel qu'un appareil photo le livrera, depuis la forme imprimée. */
  const cheminImprimé = new URL(IMPRIMÉE).pathname;

  it('⭐ le préfixe en capitales est normalisé vers la route réelle', () => {
    expect(cheminImprimé).toMatch(/^\/P\//);
    const normalisé = normaliserPrefixePerenne(cheminImprimé);
    expect(
      normalisé,
      '🔴 le chemin que l’étiquette IMPRIME n’est pas normalisé : il rendra 307 ' +
        'vers /login, et l’étiquette est collée dans un livre',
    ).not.toBeNull();
    expect(normalisé).toBe(`/p/${cheminImprimé.slice(3)}`);
  });

  it('⚠ le SEGMENT n’est pas touché — seul le préfixe', () => {
    const normalisé = normaliserPrefixePerenne(cheminImprimé) as string;
    // les capitales de l'identifiant SURVIVENT : c'est `identifiantDuSegment`
    // qui les abaisse, après décodage, et sans perte.
    expect(normalisé).toContain('OAI:');
    expect(normalisé.slice(3)).toBe(cheminImprimé.slice(3));
  });

  /*
   * ⚠ TÉMOIN D'ABSENCE : un chemin DÉJÀ minuscule ne doit pas être réécrit —
   * sinon chaque lecture du cas normal paierait un bond inutile, et une
   * normalisation qui réécrit tout serait indiscernable d'une juste.
   */
  it('⚠ et un chemin déjà minuscule n’est PAS réécrit', () => {
    expect(normaliserPrefixePerenne(new URL(CANONIQUE).pathname)).toBeNull();
    // ⚠ ni un chemin qui commence par la même lettre sans être le préfixe
    expect(normaliserPrefixePerenne('/profil')).toBeNull();
    expect(normaliserPrefixePerenne('/Profil')).toBeNull();
  });
});

/**
 * ⚠ LA FORME CANONIQUE EST MINUSCULE — assertion sur la fonction elle-même,
 * séparée de son emploi : « un test qui restate la constante ne voit pas
 * qu'elle est devenue inutile ».
 */
describe('la mise en majuscules est une TRANSFORMATION, pas la forme canonique', () => {
  it('elle est réversible sans perte sur les identifiants du produit', () => {
    // slug `[a-z][a-z0-9-]*` (DTO du backend), uuid hexadécimal
    for (const slug of ['zinda', 'horizon', 'gafeso-univ', 'a1-b2-c3']) {
      const id = `oai:${slug}:${UUID}`;
      expect(pourLeQrDEtiquette(id).toLowerCase()).toBe(id);
    }
  });

  it('⚠ et elle ne touche QUE la casse — aucune autre réécriture', () => {
    expect(pourLeQrDEtiquette(CANONIQUE)).toHaveLength(CANONIQUE.length);
    expect(pourLeQrDEtiquette(CANONIQUE).toLowerCase()).toBe(CANONIQUE);
  });
});
