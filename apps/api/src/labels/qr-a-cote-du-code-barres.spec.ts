/**
 * 🔴 LE QR NE DOIT JAMAIS RENDRE LE CODE-BARRES ILLISIBLE.
 *
 * Les douchettes déjà en service chez un établissement client lisent le
 * **code-barres**. Le QR est un
 * ajout pour les téléphones ; s'il rétrécissait le motif sous le seuil de
 * lecture, il casserait le circuit de prêt d'une bibliothèque entière pour un
 * gain d'affichage.
 *
 * ⭐ L'INVARIANT EST DONC : **le code-barres d'abord, le QR si la place
 * reste.** Ce fichier le mesure — en millimètres, pas en intention.
 *
 * ## ⚠ CE QU'ON MESURE, ET POURQUOI PAS « EST-CE LISIBLE ? »
 *
 * Décoder le PNG demanderait un décodeur de code-barres, donc une dépendance
 * de plus pour un test. On mesure la grandeur dont la lisibilité DÉPEND : la
 * largeur de module (X-dimension), en millimètres sur le papier.
 *
 * ⚠ Et c'est une borne honnête, pas un substitut déguisé : au-dessous de
 * 0,25 mm la lecture cesse d'être garantie par les scanneurs de comptoir, et
 * au-dessus elle l'est. La borne est écrite dans `LARGEUR_MODULE_MIN_MM`.
 */
import bwipjs from 'bwip-js';
import { describe, expect, it } from 'vitest';
import {
  buildLabelsPdf,
  DEFAULT_LAYOUT,
  LARGEUR_MODULE_MIN_MM,
  type LabelData,
} from './label-pdf';

const MM = 72 / 25.4;
const A4_W = 210 * MM;
const ECHELLE = 3;

/** Le nombre de modules d'un code-barres, mesuré par le MÊME encodeur. */
async function modules(texte: string): Promise<number> {
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text: texte,
    scale: ECHELLE,
    height: 8,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
  // Largeur du PNG, en-tête IHDR — divisée par l'échelle de rendu.
  return (png as Buffer).readUInt32BE(16) / ECHELLE;
}

function largeurCellule(): number {
  const { columns, marginLeftMm, columnGapMm } = DEFAULT_LAYOUT;
  return (A4_W - 2 * marginLeftMm * MM - (columns - 1) * columnGapMm * MM) / columns;
}

function etiquette(barcode: string, shortUrl: string | null): LabelData {
  return { barcode, callNumber: 'A 123', title: 'Un titre', sigle: 'BUC', shortUrl };
}

const URL_TYPE = 'https://bib.uo.bf/opac/9de9b299-cde5-4acc-9e76-0e800ad94281';

describe('🔴 Le QR à côté du code-barres', () => {
  it('⭐ CONTRÔLE NÉGATIF : le code-barres reste LISIBLE avec le QR', async () => {
    // Un code-barres RÉEL du fonds — « BIB-000123 », « ZK-000124 ».
    const n = await modules('BIB-000123');
    const pad = 3 * MM;
    const boxAvecQr = largeurCellule() - 2 * pad - (13 + 2) * MM;
    const xMm = boxAvecQr / n / MM;
    expect(
      xMm,
      `Avec le QR, un module ne mesure plus que ${xMm.toFixed(3)} mm. ` +
        `Sous ${LARGEUR_MODULE_MIN_MM} mm, les douchettes de comptoir cessent ` +
        'de garantir la lecture — et c’est le circuit de prêt qui casse.',
    ).toBeGreaterThanOrEqual(LARGEUR_MODULE_MIN_MM);
  });

  it('🔴 CONTRÔLE NÉGATIF : un code-barres TROP LONG fait abandonner le QR', async () => {
    // ⚠ LE TÉMOIN D'ABSENCE, et c'est lui qui prouve que l'arbitrage existe.
    // Sans ce cas, un code qui dessinerait TOUJOURS le QR serait indiscernable
    // d'un code qui arbitre — et plus rassurant, puisqu'il ne renonce jamais.
    const tresLong = 'BIB-' + '0'.repeat(60);
    const { qrAbandonnes } = await buildLabelsPdf([etiquette(tresLong, URL_TYPE)]);
    expect(
      qrAbandonnes,
      'Un code-barres de 64 caractères ne laisse pas la place au QR : il doit ' +
        'être ABANDONNÉ, et RAPPORTÉ — un QR qui disparaît sans un mot est une ' +
        'dégradation silencieuse.',
    ).toEqual([tresLong]);
  });

  it('⭐⭐ DEUX GRANDEURS EN mm/MODULE, et ce ne sont PAS les mêmes', async () => {
    // 🔴 LA CONFUSION QUE CE CAS EXISTE POUR EMPÊCHER, et elle a failli être
    // la mienne le 11 octobre 2026.
    //
    // La session front a mesuré, AVANT la bascule de `shortUrl` sur
    // l'identifiant pérenne, que le module du QR passait de 0,289 à 0,265 mm
    // dans son carré FIXE de 13 mm. `LARGEUR_MODULE_MIN_MM` vaut 0,25. Les deux
    // nombres s'expriment en millimètres par module, ils sont du même ordre, et
    // j'ai failli conclure qu'une école au nom long ferait ABANDONNER le QR.
    //
    // ⭐ Elles ne mesurent pas la même chose :
    //
    // | La grandeur | Ce qu'elle borne | De quoi elle dépend |
    // |---|---|---|
    // | `LARGEUR_MODULE_MIN_MM` | le module du **CODE 128** | la longueur du CODE-BARRES |
    // | le module du QR dans 13 mm | la densité du **QR** | la longueur de l'URL |
    //
    // Allonger l'URL ne touche donc PAS l'arbitrage : le QR devient plus dense,
    // et le code-barres garde exactement la même place. C'est ce que ce cas
    // mesure — par l'EFFET, sur deux URLs dont l'une est deux fois l'autre.
    const COURTE = 'https://bib.uo.bf/opac/3f2a9c1e-7b40-4d8a-9e21-1c5b6d7e8f90';
    const LONGUE =
      'https://bibliotheque.universite-ouaga.bf/opac/resoudre/' +
      encodeURIComponent('oai:universite-ouaga:3f2a9c1e-7b40-4d8a-9e21-1c5b6d7e8f90');
    // ⚠ TÉMOIN : les deux jeux d'essai diffèrent VRAIMENT en longueur, sinon ce
    // cas comparerait deux fois la même chose.
    expect(LONGUE.length, 'la longue doit être nettement plus longue').toBeGreaterThan(
      COURTE.length + 40,
    );

    const courte = await buildLabelsPdf([etiquette('BIB-000123', COURTE)]);
    const longue = await buildLabelsPdf([etiquette('BIB-000123', LONGUE)]);

    expect(
      courte.qrAbandonnes,
      'une URL courte n’abandonne pas : témoin de présence du cas nominal',
    ).toEqual([]);
    expect(
      longue.qrAbandonnes,
      'ALLONGER L’URL NE DOIT PAS FAIRE ABANDONNER LE QR : l’arbitrage porte ' +
        'sur la longueur du CODE-BARRES, jamais sur celle de l’adresse. Si ce ' +
        'cas tombe, quelqu’un a branché le seuil du Code 128 sur la densité du QR.',
    ).toEqual([]);
  });

  it('⭐ un code-barres ordinaire GARDE son QR', async () => {
    const { qrAbandonnes } = await buildLabelsPdf([etiquette('BIB-000123', URL_TYPE)]);
    expect(qrAbandonnes, 'aucun abandon sur un code-barres normal').toEqual([]);
  });

  it('⚠ sans shortUrl, AUCUN QR et le code-barres reprend TOUTE la largeur', async () => {
    const sans = await buildLabelsPdf([etiquette('BIB-000123', null)]);
    const avec = await buildLabelsPdf([etiquette('BIB-000123', URL_TYPE)]);
    expect(sans.qrAbandonnes).toEqual([]);
    // La planche SANS QR est plus LÉGÈRE : un PNG de moins.
    expect(
      sans.pdf.length,
      'la planche sans QR doit être plus légère — sinon le QR est dessiné quand même',
    ).toBeLessThan(avec.pdf.length);
  });

  it('⭐ le QR ajoute EXACTEMENT une image — et le code-barres reste', async () => {
    // ⚠ MA PREMIÈRE ÉCRITURE COMPTAIT DES NOMBRES ABSOLUS (« deux images ») et
    // elle a trouvé TROIS : `pdf-lib` écrit le dictionnaire d'un XObject à plus
    // d'un endroit. Le nombre absolu mesurait donc la plomberie de la
    // bibliothèque, pas mon dessin.
    //
    // ⭐ La DIFFÉRENCE, elle, ne mesure que ce que j'ajoute — et c'est la seule
    // chose que ce test a à dire.
    const compterImages = async (bytes: Uint8Array): Promise<number> => {
      const brut = new TextDecoder('latin1').decode(bytes);
      return (brut.match(/\/Subtype\s*\/Image/g) ?? []).length;
    };
    const avec = await compterImages((await buildLabelsPdf([etiquette('BIB-000123', URL_TYPE)])).pdf);
    const sans = await compterImages((await buildLabelsPdf([etiquette('BIB-000123', null)])).pdf);
    expect(sans, 'sans QR, le code-barres est toujours dessiné').toBeGreaterThan(0);
    expect(avec - sans, 'le QR ajoute une image, et une seule').toBe(1);
  });

  it('⚠ le CODE EN CLAIR tient dans sa boîte, QR ou pas — c’est le recours', () => {
    // Quand la douchette ne lit pas, c'est ce que la bibliothécaire TAPE. Un
    // code tronqué en « BIB-0… » serait inutilisable, et la troncature est
    // exactement ce que l'arrivée du QR rend possible : la boîte rétrécit.
    //
    // ⚠ BORNE ASSUMÉE, ET MESURÉE PLUTÔT QUE DÉCLARÉE. Je voulais l'affirmer
    // sur le PDF produit — « ce document contient-il la chaîne ? ». Il a fallu
    // QUATRE tentatives d'extracteur maison (le marqueur `stream` qui matche
    // l'intérieur d'`endstream`, le saut de ligne que `inflate` refuse…), et
    // chaque échec ACCUSAIT le produit alors que `pdftotext` lit le code sans
    // difficulté. Écrire un analyseur de PDF dans un test, c'est fabriquer un
    // instrument plus fragile que ce qu'il mesure.
    //
    // On mesure donc la grandeur dont la troncature DÉPEND : la largeur
    // disponible contre la largeur du texte. Vérifié par ailleurs avec un vrai
    // décodeur — `pdftotext` rend « BUC  A 123 » puis « BIB-000123 ».
    const pad = 3 * MM;
    const boxAvecQr = largeurCellule() - 2 * pad - (13 + 2) * MM;
    // Courier 8 pt : 0,6 em par caractère, la métrique de toute Courier.
    const largeurTexte = 'BIB-000123'.length * 8 * 0.6;
    expect(
      largeurTexte,
      `« BIB-000123 » mesure ${largeurTexte.toFixed(1)} pt et sa boîte ` +
        `${boxAvecQr.toFixed(1)} pt : il serait TRONQUÉ, donc intapable.`,
    ).toBeLessThanOrEqual(boxAvecQr);
  });
});
