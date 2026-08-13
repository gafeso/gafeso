import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';
import { LOGO_HORIZONTAL_PNG } from './marque-logo';

/**
 * QR d'établissement — l'affiche que la bibliothèque colle à l'entrée, sur les
 * tables et en amphi pour que les lecteurs connectent l'application mobile.
 *
 * ── Ce que le QR contient, et pourquoi ────────────────────────────────────
 * `https://<domaine de l'établissement>/e/<slug>` — l'origine et l'identifiant,
 * rien d'autre. En particulier PAS l'URL de l'API.
 *
 * UN QR IMPRIMÉ EST UN OBJET PHYSIQUE QUI SURVIT À LA CONFIGURATION. Graver
 * l'adresse de l'API dans le code condamnerait chaque affiche du bâtiment le
 * jour d'une migration de serveur — et personne ne ferait le lien entre « les
 * étudiants ne peuvent plus s'inscrire » et « on a déplacé l'API le mois
 * dernier ». L'application lit donc l'adresse de l'API dans
 * `/.well-known/gafeso.json`, servi par l'origine scannée : le serveur peut
 * déménager sans qu'on réimprime quoi que ce soit.
 *
 * Une URL `https` plutôt qu'un `gafeso://` : sur un téléphone où l'application
 * n'est pas installée — c'est-à-dire celui de la majorité des gens devant
 * l'affiche — un schéma applicatif ne fait strictement rien. Une URL ouvre une
 * vraie page qui explique quoi installer.
 *
 * ── Correction d'erreur ───────────────────────────────────────────────────
 * Niveau Q (25 % de redondance) et non le M par défaut : ces affiches vivent
 * sur un mur, se salissent, se cornent et se photographient de biais. La
 * charge utile est courte, la densité reste faible — la robustesse ne coûte
 * quasiment rien ici.
 */

/** Charge utile encodée dans le QR. `appUrl` est l'origine publique de l'école. */
export function enrollmentUrl(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, '')}/e/${slug}`;
}

const QR_OPTIONS = {
  errorCorrectionLevel: 'Q' as const,
  margin: 2,
  color: { dark: '#000000', light: '#FFFFFF' },
};

/** PNG du QR seul, pour l'aperçu à l'écran et l'insertion dans un document. */
export async function qrPng(appUrl: string, slug: string, width = 1024): Promise<Buffer> {
  return QRCode.toBuffer(enrollmentUrl(appUrl, slug), { ...QR_OPTIONS, width, type: 'png' });
}

/** Découpe un texte pour qu'il tienne dans `maxWidth`, sans couper les mots. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lignes: string[] = [];
  let courante = '';
  for (const mot of text.split(/\s+/).filter(Boolean)) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (font.widthOfTextAtSize(essai, size) <= maxWidth) {
      courante = essai;
    } else {
      if (courante) lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

const A4 = { w: 595.28, h: 841.89 };

/**
 * Affiche A4 prête à imprimer : nom de l'établissement, QR en grand, adresse en
 * clair sous le code.
 *
 * L'adresse est écrite EN TOUTES LETTRES sous le QR. Un lecteur dont l'appareil
 * photo ne lit pas les codes — vieil appareil, écran fêlé, mauvaise lumière —
 * doit pouvoir la recopier. Une affiche qui n'offre que le code exclut
 * silencieusement ceux qui ne peuvent pas le scanner.
 */
export async function qrPosterPdf(
  appUrl: string,
  slug: string,
  schoolName: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.w, A4.h]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const url = enrollmentUrl(appUrl, slug);
  const marge = 56;
  const largeur = A4.w - marge * 2;
  let y = A4.h - marge - 24;

  // Nom de l'établissement, sur autant de lignes que nécessaire : « Bibliothèque
  // Universitaire Centrale de … » ne tient pas sur une ligne à 24 pt.
  for (const ligne of wrap(schoolName, bold, 24, largeur)) {
    const l = bold.widthOfTextAtSize(ligne, 24);
    page.drawText(ligne, { x: (A4.w - l) / 2, y, size: 24, font: bold, color: rgb(0.06, 0.17, 0.27) });
    y -= 30;
  }

  y -= 14;
  const accroche = 'Bibliothèque numérique — lecture hors connexion';
  const la = font.widthOfTextAtSize(accroche, 13);
  page.drawText(accroche, { x: (A4.w - la) / 2, y, size: 13, font, color: rgb(0.35, 0.35, 0.35) });

  // QR : grand, centré. 320 pt ≈ 11 cm de côté — lisible à plusieurs mètres,
  // ce qui est le point d'une affiche d'amphi.
  const png = await pdf.embedPng(await qrPng(appUrl, slug, 1024));
  const cote = 320;
  y -= cote + 34;
  page.drawImage(png, { x: (A4.w - cote) / 2, y, width: cote, height: cote });

  y -= 40;
  const consigne = 'Scannez ce code avec l’appareil photo de votre téléphone.';
  const lc = font.widthOfTextAtSize(consigne, 13);
  page.drawText(consigne, { x: (A4.w - lc) / 2, y, size: 13, font, color: rgb(0.15, 0.15, 0.15) });

  y -= 26;
  const repli = 'Le code ne fonctionne pas ? Ouvrez cette adresse dans votre navigateur :';
  const lr = font.widthOfTextAtSize(repli, 10.5);
  page.drawText(repli, { x: (A4.w - lr) / 2, y, size: 10.5, font, color: rgb(0.42, 0.42, 0.42) });

  y -= 20;
  const lu = bold.widthOfTextAtSize(url, 13);
  page.drawText(url, { x: (A4.w - lu) / 2, y, size: 13, font: bold, color: rgb(0.06, 0.17, 0.27) });

  // Logo en pied de page, à la place du « Gafeso — bibliothèque numérique »
  // qui s'y trouvait en toutes lettres : le logo porte déjà le nom.
  //
  // 130 pt de large contre 320 pt pour le QR — LE CODE RESTE LA PIÈCE
  // DOMINANTE, et c'est le seul arbitrage qui compte ici. Cette affiche ne
  // sert pas à faire connaître la marque, elle sert à faire scanner un code
  // depuis le fond d'un amphi ; un logo qui rivaliserait avec le QR
  // travaillerait contre elle.
  const logo = await pdf.embedPng(LOGO_HORIZONTAL_PNG);
  const largeurLogo = 130;
  const hauteurLogo = largeurLogo * (logo.height / logo.width);
  // Le fichier de marque porte sa propre marge (7 % de la hauteur sous le
  // dessin). On la retranche pour que ce soit le LOGO VISIBLE, et non sa
  // boîte, qui s'aligne sur la marge de la page.
  page.drawImage(logo, {
    x: (A4.w - largeurLogo) / 2,
    y: marge - hauteurLogo * 0.07,
    width: largeurLogo,
    height: hauteurLogo,
  });

  return pdf.save();
}
