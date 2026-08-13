#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// Dérive les images de marque des applications depuis assets/marque/.
//
//   node scripts/generer-marque.mjs
//
// Produit :
//   · apps/web/app/icon.png        — favicon (convention Next.js App Router)
//   · apps/web/app/apple-icon.png  — icône d'écran d'accueil iOS
//   · apps/web/public/marque/gafeso_horizontal.svg — copie servie à l'en-tête
//   · apps/api/src/tenancy/marque-logo.ts — logo horizontal, en base64
//
// POURQUOI UN BADGE ET NON LE LOGO SUR FOND TRANSPARENT. assets/marque livre
// bien des favicons prêts à l'emploi, mais à fond transparent : leur toit vert
// #1B5E3F se pose alors sur l'onglet, dont le gris sombre du mode nuit
// (#202124) est presque aussi foncé. L'onglet est le SEUL endroit où l'on ne
// choisit pas le fond. Un badge vert plein règle la question une fois pour
// toutes, et donne au passage le même objet que l'icône du téléphone — c'est
// la même application, elle doit se reconnaître d'un support à l'autre.
//
// Le toit passe donc en blanc ici aussi : sur son propre vert il disparaîtrait
// (voir gafeso-mobile/scripts/generer-icones.mjs, même piège).
// ═════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARQUE = join(RACINE, 'assets/marque');
const WEB = join(RACINE, 'apps/web');

// Cercle englobant minimal de l'artwork simplifié, en unités du viewBox 840×800.
const ART = { cx: 420, cy: 393.6, d: 717.2 };
const VERT = '#1B5E3F';

const source = readFileSync(join(MARQUE, 'gafeso_icone_simplifiee.svg'), 'utf8');
const corps = source.match(/<g transform="translate\(0,0\) scale\(1\)">([\s\S]*?)<\/g>/)?.[1];
if (!corps) {
  console.error('✖ Le SVG source n’a plus la forme attendue — génération interrompue.');
  process.exit(1);
}

const marque = corps
  .replace('fill="#1B5E3F"', 'fill="#FFFFFF"') // toit : blanc sur le vert
  .replace('stroke="#FFFFFF"', `stroke="${VERT}"`); // filet du livre

/** Badge carré de `n` px : aplat vert (coins `rayon`) et marque centrée. */
function badge(n, rayon) {
  const part = 0.72; // pas de masque système ici : on remplit plus que sur Android
  const s = (part * n) / ART.d;
  const tx = n / 2 - ART.cx * s;
  const ty = n / 2 - ART.cy * s;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}">` +
      `<rect width="${n}" height="${n}" rx="${rayon}" fill="${VERT}"/>` +
      `<g transform="translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${s.toFixed(6)})">${marque}</g>` +
      `</svg>`,
  );
}

const rendu = (svg, n) => sharp(svg, { density: 384 }).resize(n, n).png({ compressionLevel: 9 }).toBuffer();

// Favicon : coins arrondis, c'est nous qui décidons de la forme dans l'onglet.
await sharp(await rendu(badge(192, 192 * 0.22), 192)).toFile(join(WEB, 'app/icon.png'));

// iOS applique SON masque : on livre un carré plein, sinon les coins arrondis
// se cumulent et laissent un liseré.
await sharp(await rendu(badge(180, 0), 180)).toFile(join(WEB, 'app/apple-icon.png'));

// L'en-tête consomme le SVG tel quel — la marge intégrée au fichier EST la zone
// de respiration exigée par USAGE.md, on ne la recadre pas.
mkdirSync(join(WEB, 'public/marque'), { recursive: true });
copyFileSync(join(MARQUE, 'gafeso_horizontal.svg'), join(WEB, 'public/marque/gafeso_horizontal.svg'));

// ── Logo de l'affiche QR (API) ───────────────────────────────────────────
// EN BASE64 DANS UN MODULE TS, ET NON EN FICHIER LU AU DÉMARRAGE. L'API se
// construit par `turbo prune` puis `nest build`, qui ne recopie que le
// JavaScript compilé : un PNG posé à côté de la source resterait dans l'image
// de build et manquerait à l'exécution. La panne n'apparaîtrait qu'en
// production, à la première affiche imprimée — longtemps après le commit.
// Un module TypeScript, lui, est compilé comme le reste et ne peut pas se
// perdre en chemin.
//
// pdf-lib n'embarque pas de SVG : il faut un raster. 560 px pour ~110 pt à
// l'impression, soit environ 360 dpi — au-delà on alourdit le PDF sans que
// l'œil y gagne quoi que ce soit.
const logoPng = await sharp(join(MARQUE, 'gafeso_horizontal.svg'), { density: 384 })
  .resize(560)
  .png({ compressionLevel: 9 })
  .toBuffer();

const module = `// ⚠ FICHIER GÉNÉRÉ — ne pas modifier à la main.
// Produit par scripts/generer-marque.mjs depuis assets/marque/gafeso_horizontal.svg.
// Voir ce script pour la raison du base64 plutôt que d'un fichier lu au démarrage.

/** Logo horizontal Gafeso, PNG ${560}×${Math.round(560 / (1600 / 700))} px, encodé en base64. */
export const LOGO_HORIZONTAL_PNG = Buffer.from(
  '${logoPng.toString('base64')}',
  'base64',
);
`;
writeFileSync(join(RACINE, 'apps/api/src/tenancy/marque-logo.ts'), module);

console.log(
  `✔ icon.png, apple-icon.png, public/marque/gafeso_horizontal.svg, marque-logo.ts (${Math.round(logoPng.length / 1024)} Kio)`,
);
