#!/usr/bin/env node
/**
 * ENGENDRE LE GUIDE D'UTILISATION DE GAFESO EN PDF, depuis `docs/`.
 *
 * ## Pourquoi ce document-là
 *
 * Les captures du magasin ont besoin d'un document DENSE sur l'étagère mobile —
 * un PDF d'une page vide ne montre pas un lecteur, il montre un cadre blanc.
 *
 * ⚠ ET IL DOIT NOUS APPARTENIR. Un livre ou une thèse sous droits dans une
 * capture publiée sur une boutique d'applications est une republication sans
 * licence, quelle que soit la bonne foi. `docs/GUIDE-BIBLIOTHECAIRE.md` est
 * écrit par nous et publié sous AGPL-3.0 avec le reste du dépôt : c'est le seul
 * document dont nous pouvons disposer librement, et il a l'avantage d'être
 * VRAI — ce qu'on montre est le produit expliquant le produit.
 *
 * ## ⚠ AUCUNE DÉPENDANCE NOUVELLE
 *
 * `pdf-lib` est déjà au dépôt — c'est lui qui répare le xref à l'ingestion
 * hors-ligne. Un moteur de rendu Markdown complet serait une dépendance de
 * plus pour un besoin de capture d'écran ; le sous-ensemble rendu ici est celui
 * que le guide emploie réellement, mesuré : titres, paragraphes, listes,
 * tableaux, citations, blocs de code.
 *
 * ## ⭐ DÉTERMINISTE, ET C'EST UNE CONDITION, PAS UNE ÉLÉGANCE
 *
 * `comptes-de-recette.mjs` est idempotent. Si ce générateur produisait des
 * octets différents à chaque passage — ce que `pdf-lib` fait par défaut, en
 * posant la date de création courante — alors « le document est-il déjà là ? »
 * ne pourrait plus se répondre par son contenu. Les dates sont donc FIGÉES.
 *
 * Usage : node scripts/dev/engendrer-guide-pdf.mjs [chemin-de-sortie]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(RACINE, 'docs/GUIDE-BIBLIOTHECAIRE.md');

/** Le nom sous lequel le produit le connaîtra — c'est la clé d'idempotence. */
export const NOM_DU_FICHIER = 'gafeso-guide-utilisation.pdf';
export const TITRE_DE_LA_NOTICE = 'Gafeso — Guide d’utilisation';

// ── Mise en page ────────────────────────────────────────────────────────────
const L = 595.28; // A4
const H = 841.89;
const MARGE = 56;
const LARGEUR = L - 2 * MARGE;
const VERT = rgb(0.106, 0.369, 0.247); // #1B5E3F, le vert de marque
const ENCRE = rgb(0.12, 0.13, 0.15);
const GRIS = rgb(0.42, 0.44, 0.47);
const FILET = rgb(0.85, 0.86, 0.87);

/**
 * ⚠ `→` ET `↓` NE SONT PAS DANS WinAnsi — l'encodage des polices standard de
 * PDF. `pdf-lib` LÈVE dessus ; il ne les remplace pas en silence, ce qui est la
 * bonne manière d'échouer. Mesuré sur le guide : cinq caractères hors Latin-1,
 * dont trois (`—`, `…`, `œ`) que WinAnsi porte bien. Seuls ces deux-ci sont à
 * traduire, et on les traduit en TEXTE plutôt qu'en glyphe approchant : dans un
 * guide technique, « -> » se lit sans hésitation.
 */
const HORS_WINANSI = [
  [/→/g, '->'],
  [/↓/g, '|'],
  [/[─-╿]/g, '-'], // filets semi-graphiques, au cas où
  [/[←↑]/g, '<-'],
];

/** Tout ce qui n'est pas du texte : emoji, pictogrammes, étoiles de méthode. */
const PICTOGRAMMES =
  /[☀-➿⬀-⯿️\u{1F000}-\u{1FAFF}✔✘⚠]/gu;

function pourWinAnsi(texte) {
  let t = texte.replace(PICTOGRAMMES, '');
  for (const [motif, remplacement] of HORS_WINANSI) t = t.replace(motif, remplacement);
  // Espaces fines et insécables : WinAnsi a l'insécable (0xA0), pas la fine.
  return t.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
}

/** Retire le balisage en ligne : gras, code, liens. */
function sansBalisage(texte) {
  return texte
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

// ── Le document ─────────────────────────────────────────────────────────────
/**
 * ⭐ DEUX PASSES, ET LA RAISON EST UNE TABLE DES MATIÈRES HONNÊTE.
 *
 * Le `## Sommaire` du Markdown renvoie à des ancres HTML : dans un PDF il ne
 * veut rien dire. Son équivalent imprimé est une table avec des NUMÉROS DE
 * PAGE — et un numéro de page ne se connaît qu'après avoir mis en page.
 *
 * On construit donc une première fois pour RELEVER où tombe chaque titre, puis
 * une seconde en insérant la table. ⚠ Insérer une page DÉCALE tout ce qui
 * suit : la première passe est donc jouée en réservant déjà la place de la
 * table, et le relevé est juste du premier coup. Si la table débordait d'une
 * page, le compte serait faux — d'où l'assertion à la fin, qui le REFUSE au
 * lieu de livrer une table qui renvoie à côté.
 */
async function construire(sommaire) {
const doc = await PDFDocument.create();
const normale = await doc.embedFont(StandardFonts.Helvetica);
const gras = await doc.embedFont(StandardFonts.HelveticaBold);
const italique = await doc.embedFont(StandardFonts.HelveticaOblique);
const fixe = await doc.embedFont(StandardFonts.Courier);

// ⭐ FIGÉES. Voir l'en-tête : l'idempotence du script appelant en dépend.
const EPOQUE = new Date('2026-10-09T00:00:00.000Z');
doc.setTitle('Gafeso — Guide d’utilisation');
doc.setAuthor('ResurgiTech SARL');
doc.setSubject('Guide d’utilisation du SIGB Gafeso');
doc.setProducer('Gafeso');
doc.setCreator('Gafeso');
doc.setCreationDate(EPOQUE);
doc.setModificationDate(EPOQUE);

let page = doc.addPage([L, H]);
let y = 0;
let numero = 0;

function piedDePage(p, n) {
  if (n === 1) return; // la page de titre n'en porte pas
  p.drawLine({
    start: { x: MARGE, y: 46 },
    end: { x: L - MARGE, y: 46 },
    thickness: 0.5,
    color: FILET,
  });
  p.drawText(pourWinAnsi('Gafeso — Guide d’utilisation'), {
    x: MARGE,
    y: 32,
    size: 8,
    font: normale,
    color: GRIS,
  });
  const nn = String(n);
  p.drawText(nn, {
    x: L - MARGE - normale.widthOfTextAtSize(nn, 8),
    y: 32,
    size: 8,
    font: normale,
    color: GRIS,
  });
}

function nouvellePage() {
  piedDePage(page, numero);
  page = doc.addPage([L, H]);
  numero += 1;
  y = H - MARGE;
}

/** Place le curseur, en changeant de page si la hauteur demandée ne tient pas. */
function reserver(hauteur) {
  if (y - hauteur < 64) nouvellePage();
}

function decouper(texte, font, taille, largeur) {
  const mots = texte.split(' ');
  const lignes = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (font.widthOfTextAtSize(essai, taille) <= largeur) {
      courante = essai;
    } else {
      if (courante) lignes.push(courante);
      // Un mot plus long que la colonne : on le coupe plutôt que de déborder.
      if (font.widthOfTextAtSize(mot, taille) > largeur) {
        let reste = mot;
        while (font.widthOfTextAtSize(reste, taille) > largeur) {
          let i = reste.length;
          while (i > 1 && font.widthOfTextAtSize(reste.slice(0, i), taille) > largeur) i -= 1;
          lignes.push(reste.slice(0, i));
          reste = reste.slice(i);
        }
        courante = reste;
      } else {
        courante = mot;
      }
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

function ecrire(texte, { font = normale, taille = 10.5, interligne = 14.2, couleur = ENCRE, x = MARGE, largeur = LARGEUR, avant = 0, apres = 0 } = {}) {
  const propre = pourWinAnsi(texte);
  if (!propre) return;
  y -= avant;
  for (const ligne of decouper(propre, font, taille, largeur)) {
    reserver(interligne);
    y -= interligne;
    page.drawText(ligne, { x, y, size: taille, font, color: couleur });
  }
  y -= apres;
}

// ── Page de titre ───────────────────────────────────────────────────────────
numero = 1;
y = H - 200;
page.drawRectangle({ x: 0, y: H - 150, width: L, height: 150, color: VERT });
page.drawText('Gafeso', { x: MARGE, y: H - 92, size: 40, font: gras, color: rgb(1, 1, 1) });
page.drawText(pourWinAnsi('la maison des livres'), {
  x: MARGE + 4,
  y: H - 118,
  size: 12,
  font: italique,
  color: rgb(0.88, 0.93, 0.9),
});
y = H - 230;
ecrire('Guide d’utilisation', { font: gras, taille: 30, interligne: 36, couleur: VERT });
ecrire(
  'Catalogue, prêts, lecteurs et bibliothèque numérique — le guide du personnel.',
  { taille: 13, interligne: 19, couleur: GRIS, avant: 6 },
);
y -= 30;
page.drawLine({
  start: { x: MARGE, y },
  end: { x: MARGE + 120, y },
  thickness: 2,
  color: VERT,
});
y -= 26;
for (const l of [
  'Système intégré de gestion de bibliothèque',
  'ResurgiTech SARL — Ouagadougou, Burkina Faso',
  'Licence AGPL-3.0',
]) {
  ecrire(l, { taille: 10.5, interligne: 16, couleur: ENCRE });
}
y -= 24;
ecrire(
  'Ce guide est publié avec le logiciel, sous la même licence. Il peut être ' +
    'copié, imprimé et adapté par l’établissement qui l’utilise.',
  { taille: 9.5, interligne: 13.5, couleur: GRIS, largeur: LARGEUR - 80 },
);

// ── Les schémas ─────────────────────────────────────────────────────────────
/**
 * ⚠ DESSINÉS EN VECTEUR, pas en caractères semi-graphiques : WinAnsi n'a ni
 * flèche ni filet, et un schéma en « +--+ » se lit mal à l'écran d'un téléphone,
 * qui est précisément où ces captures seront regardées.
 */
function boite(x, largeur, titre, lignes, { hauteur = 54, teinte = VERT } = {}) {
  page.drawRectangle({
    x,
    y: y - hauteur,
    width: largeur,
    height: hauteur,
    borderColor: teinte,
    borderWidth: 1,
    color: rgb(0.973, 0.98, 0.976),
  });
  page.drawText(pourWinAnsi(titre), {
    x: x + 9,
    y: y - 18,
    size: 9.5,
    font: gras,
    color: teinte,
  });
  let yy = y - 32;
  for (const l of lignes) {
    for (const d of decouper(pourWinAnsi(l), normale, 8, largeur - 18)) {
      page.drawText(d, { x: x + 9, y: yy, size: 8, font: normale, color: GRIS });
      yy -= 10;
    }
  }
}

function fleche(x1, x2, yy) {
  // ⚠ LA POINTE DOIT ÊTRE PLUS COURTE QUE LA HAMPE, sinon la flèche se lit
  // comme un double chevron « >> » — constaté à la première épreuve, en
  // REGARDANT le rendu plutôt qu'en relisant le code. Une flèche est un signe
  // de direction ; deux chevrons sont un signe d'avance rapide.
  const pointe = 5;
  page.drawLine({ start: { x: x1, y: yy }, end: { x: x2 - 1, y: yy }, thickness: 1, color: VERT });
  page.drawLine({ start: { x: x2 - pointe, y: yy + 3 }, end: { x: x2, y: yy }, thickness: 1, color: VERT });
  page.drawLine({ start: { x: x2 - pointe, y: yy - 3 }, end: { x: x2, y: yy }, thickness: 1, color: VERT });
}

function schema(titre, legende, etapes) {
  reserver(150);
  y -= 24;
  ecrire(titre, { font: gras, taille: 12, interligne: 17, couleur: VERT });
  ecrire(legende, { taille: 9, interligne: 13, couleur: GRIS, apres: 10 });
  const n = etapes.length;
  const ecart = 24; // assez pour qu'une flèche ait une hampe lisible
  const largeur = (LARGEUR - (n - 1) * ecart) / n;
  const hauteur = 58;
  reserver(hauteur + 16);
  for (let i = 0; i < n; i += 1) {
    const x = MARGE + i * (largeur + ecart);
    boite(x, largeur, etapes[i][0], etapes[i].slice(1), { hauteur });
    if (i < n - 1) fleche(x + largeur + 2, x + largeur + ecart - 2, y - hauteur / 2);
  }
  y -= hauteur + 10;
}

// ── Rendu du Markdown ───────────────────────────────────────────────────────
const lignes = readFileSync(SOURCE, 'utf8').split('\n');
let dansCode = false;
let tableau = [];
let sauteSommaire = false;

function viderTampon() {
  if (!tampon.length) return;
  const texte = sansBalisage(tampon.join(' ').replace(/\s+/g, ' ')).trim();
  const quoi = tamponDe;
  tampon = [];
  tamponDe = null;
  if (!texte) return;
  if (quoi && quoi.type === 'puce') {
    reserver(14);
    // La puce se pose au MILIEU de la hauteur d'œil de la première ligne.
    page.drawCircle({ x: MARGE + 4, y: y - 11, size: 1.6, color: VERT });
    ecrire(texte, { x: MARGE + 14, largeur: LARGEUR - 14 });
    return;
  }
  if (quoi && quoi.type === 'numero') {
    reserver(14);
    // ⚠ MÊME LIGNE DE BASE que la première ligne du texte : `ecrire` descend
    // d'un interligne AVANT de dessiner, donc le numéro doit descendre d'autant.
    page.drawText(`${quoi.n}.`, { x: MARGE, y: y - 14.2, size: 10.5, font: gras, color: VERT });
    ecrire(texte, { x: MARGE + 18, largeur: LARGEUR - 18 });
    return;
  }
  ecrire(texte);
}

function viderTableau() {
  if (!tableau.length) return;
  const colonnes = tableau[0].length;
  const largeurCol = LARGEUR / colonnes;
  reserver(20);
  y -= 6;
  tableau.forEach((rangee, i) => {
    const haut = Math.max(
      ...rangee.map(
        (c) => decouper(pourWinAnsi(c), i === 0 ? gras : normale, 9, largeurCol - 10).length,
      ),
    );
    const hauteur = haut * 12 + 6;
    reserver(hauteur);
    if (i === 0) {
      page.drawRectangle({
        x: MARGE,
        y: y - hauteur,
        width: LARGEUR,
        height: hauteur,
        color: rgb(0.953, 0.969, 0.957),
      });
    }
    rangee.forEach((cellule, c) => {
      let yy = y - 14;
      for (const d of decouper(pourWinAnsi(cellule), i === 0 ? gras : normale, 9, largeurCol - 10)) {
        page.drawText(d, {
          x: MARGE + c * largeurCol + 5,
          y: yy,
          size: 9,
          font: i === 0 ? gras : normale,
          color: i === 0 ? VERT : ENCRE,
        });
        yy -= 12;
      }
    });
    y -= hauteur;
    page.drawLine({
      start: { x: MARGE, y },
      end: { x: L - MARGE, y },
      thickness: 0.5,
      color: FILET,
    });
  });
  y -= 10;
  tableau = [];
}

/** Le relevé des titres et de LEUR page — c'est tout l'objet de la passe 1. */
const titres = [];

/**
 * ⚠ LE MARKDOWN COUPE SES LIGNES À 80 COLONNES ; LE PDF A UNE AUTRE LARGEUR.
 *
 * Rendre chaque ligne source comme un paragraphe produisait des coupures au
 * milieu des phrases — « …autant d'exemplaires que vous possédez de / copies. »
 * — exactement là où l'auteur du Markdown avait appuyé sur Entrée, et nulle part
 * où un typographe l'aurait fait.
 *
 * Les lignes consécutives se REFONDENT donc en un paragraphe, qu'on remet en
 * page à la largeur réelle. C'est la règle du Markdown lui-même : une ligne
 * vide sépare deux paragraphes, un simple retour ne sépare rien.
 *
 * ⚠ Et la même chose vaut pour la SUITE d'une puce : une ligne qui suit un
 * « - » sans ligne vide appartient à cette puce, pas au corps du texte.
 */
let tampon = [];
let tamponDe = null; // 'texte' | { type: 'puce' } | { type: 'numero', n }

// ⚠ La page de la table est posée MAINTENANT, pleine ou vide, pour que la
// numérotation de la passe 1 soit déjà la bonne.
nouvellePage();
const pageDeLaTable = page;
const numeroDeLaTable = numero;

nouvellePage();

for (let i = 0; i < lignes.length; i += 1) {
  const brute = lignes[i];
  const ligne = brute.trimEnd();

  if (/^```/.test(ligne)) {
    viderTampon();
    viderTableau();
    dansCode = !dansCode;
    y -= dansCode ? 6 : 10;
    continue;
  }
  if (dansCode) {
    reserver(12);
    y -= 12;
    page.drawText(pourWinAnsi(ligne).slice(0, 92), {
      x: MARGE + 10,
      y,
      size: 8.5,
      font: fixe,
      color: rgb(0.2, 0.22, 0.25),
    });
    continue;
  }

  // ⚠ Le SOMMAIRE du Markdown renvoie à des ancres HTML : il ne veut rien dire
  // dans un PDF, où les numéros de page sont la table des matières.
  if (/^##\s+Sommaire/.test(ligne)) {
    sauteSommaire = true;
    continue;
  }
  if (sauteSommaire) {
    if (/^#{1,3}\s/.test(ligne)) sauteSommaire = false;
    else continue;
  }

  if (/^\|/.test(ligne)) {
    viderTampon();
    const cellules = ligne.split('|').slice(1, -1).map((c) => sansBalisage(c).trim());
    if (cellules.every((c) => /^:?-{2,}:?$/.test(c))) continue; // le séparateur
    tableau.push(cellules);
    continue;
  }
  viderTableau();

  if (!ligne.trim()) {
    viderTampon();
    y -= 7;
    continue;
  }

  // ⚠ Un filet horizontal Markdown (`---`) s'imprimait TEL QUEL. Il sépare, il
  // ne se lit pas : on le rend comme ce qu'il est.
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(ligne)) {
    viderTampon();
    reserver(16);
    y -= 10;
    page.drawLine({
      start: { x: MARGE + 150, y },
      end: { x: L - MARGE - 150, y },
      thickness: 0.6,
      color: FILET,
    });
    y -= 8;
    continue;
  }

  const h1 = /^#\s+(.*)$/.exec(ligne);
  const h2 = /^##\s+(.*)$/.exec(ligne);
  const h3 = /^###\s+(.*)$/.exec(ligne);
  if (h1 || h2 || h3) viderTampon();
  if (h1) {
    // Le titre du document : déjà sur la page de titre.
    continue;
  }
  if (h2) {
    reserver(60);
    titres.push({ niveau: 2, texte: sansBalisage(h2[1]), page: numero });
    y -= 20;
    page.drawLine({
      start: { x: MARGE, y: y + 4 },
      end: { x: L - MARGE, y: y + 4 },
      thickness: 1.2,
      color: VERT,
    });
    ecrire(sansBalisage(h2[1]), { font: gras, taille: 15, interligne: 20, couleur: VERT, apres: 4 });
    continue;
  }
  if (h3) {
    reserver(40);
    titres.push({ niveau: 3, texte: sansBalisage(h3[1]), page: numero });
    ecrire(sansBalisage(h3[1]), { font: gras, taille: 11.5, interligne: 16, couleur: ENCRE, avant: 10, apres: 2 });
    continue;
  }

  const puce = /^[-*]\s+(.*)$/.exec(ligne);
  if (puce) {
    viderTampon();
    tamponDe = { type: 'puce' };
    tampon = [puce[1]];
    continue;
  }
  const numerotee = /^(\d+)\.\s+(.*)$/.exec(ligne);
  if (numerotee) {
    viderTampon();
    tamponDe = { type: 'numero', n: numerotee[1] };
    tampon = [numerotee[2]];
    continue;
  }
  const citation = /^>\s?(.*)$/.exec(ligne);
  if (citation) {
    viderTampon();
    const avant = y;
    ecrire(sansBalisage(citation[1]), {
      font: italique,
      x: MARGE + 14,
      largeur: LARGEUR - 14,
      couleur: rgb(0.2, 0.3, 0.26),
    });
    page.drawLine({
      start: { x: MARGE + 3, y: avant - 2 },
      end: { x: MARGE + 3, y: y + 2 },
      thickness: 2,
      color: VERT,
    });
    continue;
  }

  // ⚠ Une ligne de texte INDENTÉE qui suit une puce en est la SUITE.
  if (tamponDe && /^\s{2,}/.test(brute)) {
    tampon.push(ligne.trim());
    continue;
  }
  if (tamponDe && tamponDe !== 'texte') viderTampon();
  tamponDe = tamponDe ?? 'texte';
  tampon.push(ligne.trim());
}
viderTampon();
viderTableau();

// ── Les trois schémas, à la fin : ce que le guide décrit, en image ──────────
//
// ⚠ PAS DE SAUT DE PAGE FORCÉ. Il en laissait une presque blanche — la ligne de
// clôture du guide s'y retrouvait seule, et une page quasi vide est exactement
// ce qu'on ne veut pas dans une capture d'écran. On RÉSERVE la hauteur du titre
// et du premier schéma : la page ne se tourne que si ça ne tient pas.
reserver(230);
y -= 18;
ecrire('Les trois chaînes de Gafeso', { font: gras, taille: 18, interligne: 24, couleur: VERT, apres: 4 });
ecrire(
  'Ces schémas résument les enchaînements décrits dans les chapitres précédents. ' +
    'Chacun se lit de gauche à droite : si une étape manque, celles qui suivent ' +
    'ne peuvent pas avoir lieu.',
  { taille: 10, interligne: 14, couleur: GRIS, apres: 6 },
);

schema(
  'Mettre un ouvrage entre les mains d’un lecteur',
  'Du catalogue au guichet. Un ouvrage sans exemplaire est visible et non empruntable.',
  [
    ['1. Notice', 'Titre, auteur, domaine', '3 mots-clés au minimum'],
    ['2. Exemplaire', 'Un code-barres par volume', 'C’est lui qu’on prête'],
    ['3. Lecteur', 'Carte au guichet', 'Classe pour l’accès'],
    ['4. Prêt', 'Scan carte + code-barres', 'Échéance automatique'],
  ],
);

schema(
  'Rendre un document numérique accessible',
  'La règle d’accès est un OU : la collection la plus large gagne.',
  [
    ['1. Fichier', 'PDF ou EPUB téléversé', 'Chiffré à l’ingestion'],
    ['2. Collection', 'Le document y est rattaché', 'Une ou plusieurs'],
    ['3. Règle', 'Quelles classes, quels paliers', 'Vide = personne'],
    ['4. Lecture', 'En ligne, sans téléchargement', 'URL signée, courte'],
  ],
);

schema(
  'Lire hors connexion, sur un téléphone',
  'Le droit est rejoué à l’émission : une licence est liée à un appareil et à une date.',
  [
    ['1. Droit', 'Classe ou abonnement', 'Vérifié au serveur'],
    ['2. Licence', 'Liée à l’appareil', 'Signée, avec échéance'],
    ['3. Appareil', 'Clé publique enregistrée', 'La clé ne sort pas'],
    ['4. Lecture', 'Sans réseau', 'Jusqu’à l’échéance'],
  ],
);

piedDePage(page, numero);

// ── La table des matières, sur la page qu'on lui avait réservée ─────────────
if (sommaire) {
  const sauvegarde = { page, y, numero };
  page = pageDeLaTable;
  numero = numeroDeLaTable;
  y = H - MARGE;
  ecrire('Sommaire', { font: gras, taille: 18, interligne: 24, couleur: VERT, apres: 10 });
  for (const t of sommaire) {
    const taille = t.niveau === 2 ? 10.5 : 9.5;
    const police = t.niveau === 2 ? gras : normale;
    const x = MARGE + (t.niveau === 2 ? 0 : 16);
    const n = String(t.page);
    const largeurNum = normale.widthOfTextAtSize(n, taille);
    const texte = pourWinAnsi(t.texte);
    const dispo = LARGEUR - (x - MARGE) - largeurNum - 14;
    const [premiere] = decouper(texte, police, taille, dispo);
    y -= t.niveau === 2 ? 17 : 13.5;
    page.drawText(premiere ?? texte, { x, y, size: taille, font: police, color: t.niveau === 2 ? VERT : ENCRE });
    // Les points de conduite : ce qui fait qu'un sommaire se lit à la règle.
    const finTexte = x + police.widthOfTextAtSize(premiere ?? texte, taille) + 4;
    const debutNum = L - MARGE - largeurNum - 4;
    if (debutNum > finTexte) {
      page.drawLine({
        start: { x: finTexte, y: y + 2.5 },
        end: { x: debutNum, y: y + 2.5 },
        thickness: 0.4,
        color: FILET,
        dashArray: [1, 2.5],
      });
    }
    page.drawText(n, { x: L - MARGE - largeurNum, y, size: taille, font: police, color: GRIS });
  }
  // ⭐ ET ON REFUSE si la table a débordé : les numéros relevés en passe 1
  // seraient alors tous décalés d'une page, et une table qui renvoie à côté est
  // pire qu'une absence de table.
  if (y < 56) {
    throw new Error(
      `La table des matières déborde de sa page (${sommaire.length} entrées). ` +
        'Les numéros relevés seraient faux d’une page. Réduisez le nombre de ' +
        'titres relevés, ou réservez DEUX pages en passe 1 (et comptez-les).',
    );
  }
  piedDePage(pageDeLaTable, numeroDeLaTable);
  page = sauvegarde.page;
  y = sauvegarde.y;
  numero = sauvegarde.numero;
}

return { doc, titres };
}

// ── Les deux passes ─────────────────────────────────────────────────────────
/**
 * Rend les OCTETS du guide, sans toucher au disque.
 *
 * ⚠ Exporté pour que `comptes-de-recette.mjs` n'ait pas à passer par un fichier
 * temporaire : un fichier intermédiaire est un état de plus à nettoyer, et un
 * nettoyage qui rate laisse derrière lui exactement le genre de chose que
 * personne ne va chercher.
 */
export async function engendrerGuidePdf() {
  const passe1 = await construire(null);
  const { doc: final } = await construire(passe1.titres);
  const octets = await final.save({ useObjectStreams: false });
  return { octets, pages: final.getPageCount(), entrees: passe1.titres.length };
}

// ── En ligne de commande ────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { octets, pages, entrees } = await engendrerGuidePdf();
  const sortie = process.argv[2]
    ? resolve(process.argv[2])
    : join(RACINE, 'docs/gafeso-guide-utilisation.pdf');
  writeFileSync(sortie, octets);
  process.stdout.write(`${sortie}\n  ${pages} pages, ${octets.length} octets, ${entrees} entrées au sommaire\n`);
}
