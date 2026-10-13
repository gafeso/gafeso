#!/usr/bin/env node
/**
 * ENGENDRE UN DOCUMENT DE DÉMONSTRATION RÉALISTE pour une notice.
 *
 * ## Pourquoi, et ce que ça remplace
 *
 * Le fonds de démonstration portait des PDF d'UNE page, vides. Sur une capture
 * du magasin ou devant un client, un lecteur ouvert sur un cadre blanc ne
 * montre rien — et c'est l'écran qu'on a le plus envie de montrer.
 *
 * ## 🔴 CE QUI EST INTERDIT, ET POURQUOI CE N'EST PAS UNE PRÉCAUTION
 *
 * **Jamais un contenu sous droits.** Une capture publiée sur une boutique
 * d'applications est une PUBLICATION : y montrer plusieurs pages d'un ouvrage
 * protégé est une republication sans licence, quelle que soit la bonne foi.
 *
 * Le corpus est donc fait d'œuvres du DOMAINE PUBLIC en français, moissonnées
 * de Wikisource, **chacune avec sa provenance écrite dans son fichier** —
 * l'auteur, sa date de mort, l'URL, la date du moissonnage. Et le document
 * engendré porte une PAGE DE CRÉDITS qui cite la source : une fixture sans
 * origine est un texte qu'on ne peut plus ni renouveler ni contester.
 *
 * ## ⭐ DÉTERMINISTE ET IDEMPOTENT, et c'est une CONDITION
 *
 * Deux appels pour la même notice rendent les MÊMES octets. Sans cela, le
 * script de remplacement ne pourrait pas répondre « ce document est déjà le
 * bon » : il réécrirait 88 fichiers à chaque passage.
 *
 * · les dates du PDF sont FIGÉES (`pdf-lib` pose l'heure courante par défaut) ;
 * · le choix de l'œuvre et des ornements dérive de `recordId`, pas d'un hasard.
 *
 * Usage : node scripts/dev/engendrer-document-demo.mjs <fichier-de-sortie>
 *         (avec GAFESO_DEMO_NOTICE = le JSON de la notice)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';
import { decouper, pourWinAnsi } from '../lib/texte-pdf.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/**
 * ⭐ LE CORPUS VIT À CÔTÉ DU SCRIPT QUI LE LIT, et ce n'est pas un rangement.
 *
 * 🔴 Il était sous `apps/api/src/cataloging/`. L'image de production ne copie
 * PAS `src/` — elle copie `dist`, `prisma`, `package.json` et `scripts`. Le
 * 12 octobre 2026, `remplacer-documents-demo.mjs` a donc planté DANS le
 * conteneur de la démonstration :
 *
 * ```
 * ENOENT '/app/apps/api/src/cataloging/corpus-demonstration'
 * ```
 *
 * ⚠ Et ma recette ne pouvait pas le voir : elle avait tourné HORS conteneur,
 * dans l'arbre du dépôt, où `src/` existe. « Une recette qui fournit
 * l'environnement qu'elle éprouve ne mesure que sa propre fixture. »
 *
 * ⭐ POURQUOI DÉPLACER PLUTÔT QU'AJOUTER UN `COPY` : `scripts/` est copié EN
 * ENTIER par le Dockerfile. Un fichier de corpus ajouté demain est donc dans
 * l'image **sans que personne y pense** — la dépendance devient structurelle,
 * là où une ligne `COPY` de plus serait une liste à tenir, et donc un oubli en
 * attente.
 */
const CORPUS = join(RACINE, 'scripts/dev/corpus-demonstration');

const L = 595.28;
const H = 841.89;
const MARGE = 62;
const LARGEUR = L - 2 * MARGE;
const VERT = rgb(0.106, 0.369, 0.247);
const ENCRE = rgb(0.13, 0.14, 0.16);
const GRIS = rgb(0.45, 0.47, 0.5);
const FILET = rgb(0.86, 0.87, 0.88);

/** ⭐ FIGÉE — l'idempotence du script appelant en dépend. */
const EPOQUE = new Date('2026-10-11T00:00:00.000Z');

/** Les œuvres disponibles, lues une fois, avec leur provenance. */
function corpus() {
  return readdirSync(CORPUS)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => {
      const brut = readFileSync(join(CORPUS, f), 'utf-8');
      const [entete, ...reste] = brut.split('\n---\n');
      const champ = (nom) =>
        (new RegExp(`^${nom}\\s*:\\s*(.+)$`, 'm').exec(entete)?.[1] ?? '').trim();
      return {
        fichier: f,
        oeuvre: champ('Œuvre'),
        auteur: champ('Auteur'),
        source: champ('Source'),
        statut: champ('Statut'),
        texte: reste.join('\n---\n').trim(),
      };
    });
}

/**
 * ⚠ LE CHOIX DÉRIVE DE L'IDENTIFIANT, pas d'un tirage.
 *
 * Deux générations pour la même notice doivent rendre les mêmes octets ; un
 * `Math.random()` ici rendrait le script non idempotent, et la vérification
 * « ce document est-il déjà le bon ? » deviendrait impossible.
 */
function graine(recordId) {
  return parseInt(createHash('sha256').update(String(recordId)).digest('hex').slice(0, 8), 16);
}

/**
 * ⭐ LE TEXTE SUIT LE DOMAINE quand on en a un qui convient.
 *
 * Une notice de médecine qui s'ouvre sur Claude Bernard, une de droit sur
 * Montesquieu : la démonstration y gagne, et ça ne coûte qu'une table.
 *
 * ⚠ ET LE REPLI RESTE DÉTERMINISTE : un domaine qu'on ne connaît pas prend
 * l'œuvre désignée par la graine, pas la première de la liste. Sans quoi tous
 * les domaines non nommés porteraient le MÊME texte, et le fonds de
 * démonstration se répéterait.
 */
const PAR_DOMAINE = {
  medecine: 'bernard-medecine.txt',
  sciences: 'bernard-medecine.txt',
  droit: 'montesquieu-lois.txt',
  economie: 'montesquieu-lois.txt',
  philosophie: 'descartes-methode.txt',
  litterature: 'maupassant-becasse.txt',
  langues: 'maupassant-becasse.txt',
};

function choisir(oeuvres, domaine, g) {
  // ⚠ Le domaine est comparé SANS ACCENTS ni casse : le fonds porte
  // « medecine » et le vocabulaire « médecine », et ce module n'a pas à
  // trancher laquelle est la bonne — c'est une dette nommée ailleurs.
  const cle = String(domaine ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const voulu = PAR_DOMAINE[cle];
  return oeuvres.find((o) => o.fichier === voulu) ?? oeuvres[g % oeuvres.length];
}

async function engendrer(notice) {
  const oeuvres = corpus();
  if (oeuvres.length === 0) throw new Error('corpus de démonstration vide');
  const g = graine(notice.id ?? notice.recordId ?? 'sans-id');
  const oeuvre = choisir(oeuvres, notice.category, g);

  const doc = await PDFDocument.create();
  const normale = await doc.embedFont(StandardFonts.TimesRoman);
  const gras = await doc.embedFont(StandardFonts.TimesRomanBold);
  const italique = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sansSerif = await doc.embedFont(StandardFonts.Helvetica);

  doc.setTitle(pourWinAnsi(notice.title ?? 'Document'));
  doc.setAuthor(pourWinAnsi(notice.author ?? ''));
  doc.setSubject('Document de démonstration Gafeso');
  doc.setProducer('Gafeso');
  doc.setCreator('Gafeso');
  doc.setCreationDate(EPOQUE);
  doc.setModificationDate(EPOQUE);

  let page = doc.addPage([L, H]);
  let y = H - MARGE;
  let numero = 1;

  const pied = (p, n) => {
    if (n === 1) return;
    p.drawLine({ start: { x: MARGE, y: 48 }, end: { x: L - MARGE, y: 48 }, thickness: 0.5, color: FILET });
    p.drawText(pourWinAnsi('Document de démonstration Gafeso'), {
      x: MARGE, y: 34, size: 8, font: sansSerif, color: GRIS,
    });
    const s = String(n);
    p.drawText(s, {
      x: L - MARGE - sansSerif.widthOfTextAtSize(s, 8), y: 34, size: 8, font: sansSerif, color: GRIS,
    });
  };
  const nouvellePage = () => {
    pied(page, numero);
    page = doc.addPage([L, H]);
    numero += 1;
    y = H - MARGE;
  };
  const reserver = (h) => { if (y - h < 70) nouvellePage(); };
  const ecrire = (txt, o = {}) => {
    const { font = normale, taille = 11, interligne = 15.5, couleur = ENCRE,
            x = MARGE, largeur = LARGEUR, avant = 0, apres = 0, alinea = 0 } = o;
    const propre = pourWinAnsi(txt);
    if (!propre) return;
    y -= avant;
    const lignes = decouper(propre, font, taille, largeur - alinea);
    lignes.forEach((ligne, i) => {
      reserver(interligne);
      y -= interligne;
      page.drawText(ligne, { x: x + (i === 0 ? alinea : 0), y, size: taille, font, color: couleur });
    });
    y -= apres;
  };

  // ── PAGE DE TITRE ────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 8, width: L, height: 8, color: VERT });
  y = H - 170;
  ecrire(notice.establishment ?? '', { font: sansSerif, taille: 10.5, interligne: 15, couleur: VERT });
  y -= 18;
  ecrire(notice.title ?? 'Sans titre', { font: gras, taille: 26, interligne: 32, couleur: ENCRE });
  if (notice.titleComplement) {
    ecrire(notice.titleComplement, { font: italique, taille: 14, interligne: 19, couleur: GRIS, avant: 4 });
  }
  y -= 10;
  ecrire(notice.author ?? '', { taille: 14, interligne: 19, couleur: ENCRE });
  y -= 22;
  page.drawLine({ start: { x: MARGE, y }, end: { x: MARGE + 110, y }, thickness: 1.5, color: VERT });
  y -= 24;
  for (const ligne of [
    notice.recordType ? `Type : ${notice.recordType}` : null,
    notice.category ? `Domaine : ${notice.category}` : null,
    notice.publishYear ? `Année : ${notice.publishYear}` : null,
  ].filter(Boolean)) {
    ecrire(ligne, { font: sansSerif, taille: 10, interligne: 15, couleur: GRIS });
  }
  y -= 26;
  ecrire('Document de démonstration Gafeso', { font: sansSerif, taille: 11, interligne: 16, couleur: VERT });
  ecrire(
    'Ce fichier accompagne une notice de démonstration. Son contenu est une ' +
      'œuvre du domaine public, citée en fin de volume — il n’est pas l’ouvrage ' +
      'décrit par la notice.',
    { taille: 9.5, interligne: 13.5, couleur: GRIS, largeur: LARGEUR - 90, avant: 4 },
  );

  // Le QR, en bas de la page de titre.
  if (notice.publicUrl) {
    const png = await QRCode.toBuffer(notice.publicUrl, {
      type: 'png', errorCorrectionLevel: 'M', margin: 0, width: 512,
    });
    const img = await doc.embedPng(png);
    const cote = 92;
    page.drawImage(img, { x: MARGE, y: 96, width: cote, height: cote });
    page.drawText(pourWinAnsi('Cette notice dans le catalogue :'), {
      x: MARGE + cote + 14, y: 96 + cote - 14, size: 9.5, font: sansSerif, color: ENCRE,
    });
    for (const [i, l] of decouper(pourWinAnsi(notice.publicUrl), sansSerif, 8.5, LARGEUR - cote - 14).entries()) {
      page.drawText(l, { x: MARGE + cote + 14, y: 96 + cote - 30 - i * 11, size: 8.5, font: sansSerif, color: GRIS });
    }
  }

  // ── LE CORPS ─────────────────────────────────────────────────────────────
  nouvellePage();
  const paragraphes = oeuvre.texte.split('\n').map((p) => p.trim()).filter(Boolean);
  // 8 à 20 pages : on pose des chapitres jusqu'à remplir au moins sept pages de
  // corps, puis on s'arrête au paragraphe suivant.
  const MIN_PAGES_CORPS = 7;
  const MAX_PAGES_CORPS = 18;
  let chapitre = 0;
  let i = 0;
  while (i < paragraphes.length && numero < MAX_PAGES_CORPS) {
    chapitre += 1;
    reserver(70);
    y -= 14;
    ecrire(`Chapitre ${chapitre}`, { font: gras, taille: 14, interligne: 19, couleur: VERT, apres: 6 });
    const fin = Math.min(paragraphes.length, i + 4 + (g % 3));
    for (; i < fin; i += 1) {
      ecrire(paragraphes[i], { alinea: 16, apres: 6 });
    }
    // ⚠ UN ORNEMENT POUR UNE PARTIE DES DOCUMENTS, pas pour tous : un fonds où
    // chaque ouvrage porte le même tableau ne ressemble pas à un fonds.
    if (chapitre === 2 && g % 3 === 0) tableau();
    if (chapitre === 2 && g % 3 === 1) schema();
    if (i >= paragraphes.length && numero < MIN_PAGES_CORPS) i = 0; // on reprend
  }

  function tableau() {
    reserver(130);
    y -= 16;
    ecrire('Tableau — relevé', { font: gras, taille: 11.5, interligne: 16, couleur: VERT, apres: 6 });
    const colonnes = ['Rubrique', 'Première série', 'Seconde série'];
    const rangees = [
      ['Observations', '128', '144'],
      ['Moyenne', '12,4', '13,1'],
      ['Écart constaté', '0,8', '0,6'],
    ];
    const largeurCol = LARGEUR / colonnes.length;
    const hauteur = 20;
    reserver(hauteur * (rangees.length + 1) + 10);
    page.drawRectangle({ x: MARGE, y: y - hauteur, width: LARGEUR, height: hauteur, color: rgb(0.953, 0.969, 0.957) });
    colonnes.forEach((c, k) => {
      page.drawText(pourWinAnsi(c), { x: MARGE + k * largeurCol + 6, y: y - 14, size: 9.5, font: gras, color: VERT });
    });
    y -= hauteur;
    for (const r of rangees) {
      r.forEach((c, k) => {
        page.drawText(pourWinAnsi(c), { x: MARGE + k * largeurCol + 6, y: y - 14, size: 9.5, font: normale, color: ENCRE });
      });
      y -= hauteur;
      page.drawLine({ start: { x: MARGE, y }, end: { x: L - MARGE, y }, thickness: 0.4, color: FILET });
    }
    y -= 12;
  }

  function schema() {
    reserver(150);
    y -= 16;
    ecrire('Figure — enchaînement', { font: gras, taille: 11.5, interligne: 16, couleur: VERT, apres: 8 });
    const etapes = ['Observation', 'Hypothèse', 'Expérience', 'Conclusion'];
    const ecart = 20;
    const largeur = (LARGEUR - (etapes.length - 1) * ecart) / etapes.length;
    const hauteur = 46;
    reserver(hauteur + 20);
    etapes.forEach((e, k) => {
      const x = MARGE + k * (largeur + ecart);
      page.drawRectangle({
        x, y: y - hauteur, width: largeur, height: hauteur,
        borderColor: VERT, borderWidth: 1, color: rgb(0.973, 0.98, 0.976),
      });
      const t = pourWinAnsi(e);
      page.drawText(t, {
        x: x + (largeur - sansSerif.widthOfTextAtSize(t, 9)) / 2,
        y: y - hauteur / 2 - 3, size: 9, font: sansSerif, color: VERT,
      });
      if (k < etapes.length - 1) {
        const x1 = x + largeur + 3;
        const x2 = x + largeur + ecart - 3;
        const yy = y - hauteur / 2;
        page.drawLine({ start: { x: x1, y: yy }, end: { x: x2 - 1, y: yy }, thickness: 1, color: VERT });
        page.drawLine({ start: { x: x2 - 5, y: yy + 3 }, end: { x: x2, y: yy }, thickness: 1, color: VERT });
        page.drawLine({ start: { x: x2 - 5, y: yy - 3 }, end: { x: x2, y: yy }, thickness: 1, color: VERT });
      }
    });
    y -= hauteur + 16;
  }

  // ── PAGE DE CRÉDITS ──────────────────────────────────────────────────────
  nouvellePage();
  ecrire('Crédits et provenance du texte', { font: gras, taille: 17, interligne: 23, couleur: VERT, apres: 10 });
  ecrire(
    'Le texte reproduit dans ce document n’est pas l’ouvrage décrit par la ' +
      'notice. C’est une œuvre du domaine public, employée pour donner à un ' +
      'document de démonstration le volume et l’apparence d’un vrai document.',
    { apres: 12 },
  );
  for (const [etiquette, valeur] of [
    ['Œuvre', oeuvre.oeuvre],
    ['Auteur', oeuvre.auteur],
    ['Statut', oeuvre.statut],
    ['Source', oeuvre.source],
  ]) {
    if (!valeur) continue;
    reserver(18);
    y -= 16;
    page.drawText(pourWinAnsi(`${etiquette} :`), { x: MARGE, y, size: 10, font: gras, color: ENCRE });
    for (const [k, l] of decouper(pourWinAnsi(valeur), normale, 10, LARGEUR - 78).entries()) {
      if (k > 0) { reserver(14); y -= 14; }
      page.drawText(l, { x: MARGE + 78, y, size: 10, font: normale, color: ENCRE });
    }
  }
  y -= 22;
  ecrire(
    'La transcription provient de Wikisource, diffusée sous licence CC BY-SA. ' +
      'L’œuvre elle-même appartient au domaine public : son auteur est mort il ' +
      'y a plus de soixante-dix ans.',
    { taille: 9.5, interligne: 13.5, couleur: GRIS },
  );
  y -= 16;
  ecrire(
    'Gafeso est un logiciel libre publié sous licence AGPL-3.0 par ' +
      'ResurgiTech SARL, Ouagadougou, Burkina Faso.',
    { taille: 9.5, interligne: 13.5, couleur: GRIS },
  );
  pied(page, numero);

  return { octets: await doc.save({ useObjectStreams: false }), pages: doc.getPageCount(), oeuvre };
}

export { engendrer as engendrerDocumentDemo, corpus };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const notice = JSON.parse(process.env.GAFESO_DEMO_NOTICE ?? '{}');
  const { octets, pages, oeuvre } = await engendrer(notice);
  const sortie = resolve(process.argv[2] ?? 'document-demo.pdf');
  writeFileSync(sortie, octets);
  process.stdout.write(`${sortie}\n  ${pages} pages, ${octets.length} octets — « ${oeuvre.oeuvre} »\n`);
}
