#!/usr/bin/env node
/**
 * ⭐⭐ DÉRIVE LES COUVERTURES v3 DEPUIS LEUR SOURCE — logo une fois, motifs à part.
 *
 * ## ⚠ CE QUE LA SOURCE EST VRAIMENT, mesuré avant d'écrire une ligne
 *
 * `docs/couvertures/source/*_sans_texte.svg` ne sont PAS des gabarits
 * paramétrables : ce sont **huit RENDUS**. Chacun porte, EN DUR,
 *
 * · une couleur de fond prise dans la palette des domaines — 7 couleurs
 *   distinctes pour 8 fichiers (`article` et `these` partagent `#154D87`) ;
 * · une variation déjà appliquée (`translate`, `rotate`, `scale`, `opacity`) ;
 * · **le logo officiel complet, 9 670 octets, répété dans les HUIT.**
 *
 * ⭐ Ce dernier chiffre décide de tout : le logo fait **92 % du plus léger des
 * huit**. Les motifs, eux, pèsent 421 à 2 759 octets — 6 923 pour les huit
 * réunis. « Chaque gabarit fait 10 à 13 Ko » est donc exact, et ce qui pèse
 * n'est pas le gabarit : c'est le logo huit fois.
 *
 * ## ⭐ CE QUE CE SCRIPT PRODUIT, et pourquoi cette découpe
 *
 * | Sortie | Où | Pourquoi |
 * |---|---|---|
 * | `logo.svg` | `public/couvertures/` | **une seule fois**, servi et mis en cache |
 * | les 8 MOTIFS, géométrie nue | un module TS engendré | la page n'émet que celui du type affiché |
 * | palette, positions, types | le même module | une seule source pour le site |
 *
 * ⚠ **La variation et la couleur sont RETIRÉES du motif**, délibérément. La
 * spécification les veut calculées : couleur par DOMAINE (le produit colore
 * ainsi depuis toujours), variation semée par le TITRE. Un fichier statique les
 * figerait — toutes les thèses auraient le même motif, et la couleur
 * désignerait le type au lieu du domaine.
 *
 * ## ⚠ POURQUOI UN MODULE TS ET PAS UN SPRITE EXTERNE
 *
 * Un `<use href="/couvertures/sprite.svg#these">` dépend du support des
 * références EXTERNES dans `<use>`, qui varie selon les navigateurs. Un motif
 * inline ne dépend de rien, coûte 421 à 2 759 octets, et accepte la variation
 * par `transform` — ce qu'un `<img>` n'accepte pas.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(ici, '../../../docs/couvertures/source');
const MODULE = resolve(ici, '../lib/couvertures-v3.generated.ts');

/** ⚠ Un refus NOMME ce qui manque et quoi faire — jamais « échec ». */
function refus(quoi) {
  console.error(`\n🔴 DÉRIVATION REFUSÉE — ${quoi}\n`);
  process.exit(1);
}

/**
 * ⭐⭐ LA SOURCE PEUT ÊTRE ABSENTE, ET CE N'EST PAS UNE PANNE.
 *
 * `docs/couvertures/source/` est RETENU de la publication jusqu'à la cession de
 * droits — le logo officiel et la planche viennent du fournisseur. Or ce script
 * est câblé dans `prebuild`.
 *
 * 🔴 Sans ce garde, `npm run build` REFUSERAIT dans tout clone public. Un test
 * rouge se voit ; un build cassé empêche d'installer. C'est « le garde vérifie
 * ce qui SORT, pas ce que le sorti EXIGE », appliqué à MON propre câblage.
 *
 * ⚠ Et il ne dégrade pas en silence : le module engendré est SUIVI par git,
 * donc il fait foi, et le script le DIT. Il ne refuse que si les deux manquent —
 * là, il n'y a rien à servir.
 */
const sourceLa = existsSync(SOURCE) && readdirSync(SOURCE).length > 0;
if (!sourceLa) {
  if (!existsSync(MODULE)) {
    refus(
      `ni ${SOURCE} ni le module engendré. Rien à dériver et rien à servir : ` +
        `ce clone ne peut pas construire les couvertures.`,
    );
  }
  /*
   * ⚠ LA FORMULATION EST CELLE DE JEAN, et le code de sortie est DIT. Le
   * backend a mesuré ma première version dans un clone sans la source : elle
   * levait un ENOENT obscur sur `gafeso-cover-spec-final.json`, parce que mon
   * garde venait APRÈS la lecture. Un message qui nomme un fichier interne à
   * quelqu'un qui ne l'aura jamais n'explique rien.
   */
  console.log(
    'ⓘ Les gabarits du fournisseur ne sont pas dans ce dépôt (droits non\n' +
      '  cédés) ; le module engendré publié reste utilisable.\n' +
      '  → Rien à dériver, rien à corriger. Code de sortie : 0 (succès).',
  );
  process.exit(0);
}

const spec = JSON.parse(readFileSync(resolve(SOURCE, 'gafeso-cover-spec-final.json'), 'utf-8'));
const positions = JSON.parse(readFileSync(resolve(SOURCE, 'positions-textes.json'), 'utf-8'));

/* ─────────────────────────── ① LE LOGO, UNE FOIS ─────────────────────────── */

/*
 * ⚠ Il est extrait d'UN fichier et vérifié IDENTIQUE dans les sept autres. Sans
 * ce contrôle, un logo divergent passerait et la couverture d'un type serait
 * seule à porter l'ancien tracé — invisible, parce que personne ne compare huit
 * images entre elles.
 */
const DEBUT_LOGO = '<svg x="34" y="21"';
let logo = null;
const motifs = {};
for (const t of spec.templates) {
  const chemin = resolve(SOURCE, `${t.id}_sans_texte.svg`);
  const brut = readFileSync(chemin, 'utf-8');

  const d = brut.indexOf(DEBUT_LOGO);
  if (d < 0) refus(`${t.id} : le logo ne commence pas par ${DEBUT_LOGO}`);
  const f = brut.indexOf('</svg>', d);
  if (f < 0) refus(`${t.id} : le logo n'est pas refermé`);
  const ce = brut.slice(d, f + '</svg>'.length);
  if (logo === null) logo = ce;
  else if (ce !== logo) refus(`${t.id} : son logo DIFFÈRE de celui des autres gabarits.`);

  /*
   * ⚠ LE MOTIF EST LA GÉOMÉTRIE NUE : on retient ce qu'il y a DANS le groupe
   * porteur de la variation, et on jette le groupe lui-même. La variation
   * revient au rendu, semée par le titre.
   */
  const g = brut.match(
    /<g transform="translate\([^"]*\)" opacity="[^"]*">([\s\S]*?)<\/g>\s*<\/g>/,
  );
  const g2 = g ?? brut.match(/<g transform="[^"]*" opacity="[^"]*">([\s\S]*?)<\/g>\s*<\/g>/);
  if (!g2) refus(`${t.id} : aucun groupe de variation trouvé — la source a changé de forme.`);
  const geometrie = g2[1].trim();
  if (!geometrie) refus(`${t.id} : le motif extrait est VIDE.`);
  motifs[t.id] = geometrie;
}

if (!logo) refus('aucun logo extrait.');

/**
 * 🔴 LE LOGO DU FOURNISSEUR NE SORT PAS — et ma première version le PUBLIAIT.
 *
 * Elle écrivait `apps/web/public/couvertures/logo.svg`, 9 694 octets du tracé
 * officiel. Or `public/` PART au dépôt public, pendant que
 * `docs/couvertures/source/` en est RETENU pour cette raison exacte : les
 * droits ne sont pas cédés.
 *
 * > ⚠ **La retenue était défaite par un autre chemin, avec les mêmes octets.**
 * > Une exclusion qui porte sur un DOSSIER ne protège pas un fichier qu'un
 * > script recopie ailleurs — c'est « une liste blanche échoue en silence »,
 * > prise par le bout qui fait SORTIR.
 *
 * ⭐ Ce qu'on fait à la place, et c'est réversible en une ligne : la couverture
 * emploie le logo DÉJÀ PUBLIC — `public/marque/gafeso_horizontal.svg`, dans le
 * dépôt depuis le 11 septembre 2026 — blanchi par un filtre CSS. Aucun octet
 * neuf ne part.
 *
 * ⚠ **La divergence est DÉCLARÉE, pas cachée** : ce n'est pas le même tracé que
 * celui du fournisseur (5 279 octets contre 9 670). Le jour de la cession, on
 * repasse à l'officiel — et c'est une ligne.
 */

/* ─────── ② LES DEUX TABLES, DÉRIVÉES DE LA SPÉCIFICATION PUBLIÉE ─────── */

/**
 * ⭐⭐ ELLES NE SE RECOPIENT PAS : elles sont LUES dans §9 de
 * `docs/specification-couverture-composee.md`, qui est le document d'autorité
 * (tranché par Jean le 12 octobre 2026) et qui, lui, EST publié.
 *
 * ⚠ Recopier onze hexadécimaux à la main serait « une chaîne recopiée » : le
 * jour où le design change une teinte, deux tables diraient deux choses et rien
 * ne le signalerait. Les témoins ci-dessous REFUSENT plutôt que de dégrader.
 *
 * ⚠ La palette du FOURNISSEUR (`gafeso-cover-spec-final.json`) n'est PAS cette
 * table : elle nomme dix libellés éditoriaux (« Lettres », « Gestion
 * publique »…) qui ne sont pas le vocabulaire du produit. Deux listes de dix qui
 * ne décrivent pas les mêmes objets — c'est §9 qui tranche, pas elle.
 */
const SPEC_MD = resolve(ici, '../../../docs/specification-couverture-composee.md');
const md = readFileSync(SPEC_MD, 'utf-8');

function sectionDe(titre) {
  const d = md.indexOf(titre);
  if (d < 0) refus(`§ « ${titre} » introuvable dans ${SPEC_MD}`);
  const f = md.indexOf('\n### ', d + titre.length);
  return md.slice(d, f < 0 ? undefined : f);
}

/* 9.1 — `coverDomain` → teinte. */
const teintes = {};
for (const [, cle, hex] of sectionDe('### 9.1').matchAll(
  /^\|\s*`([a-z]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/gm,
)) {
  teintes[cle] = hex.toUpperCase();
}
if (Object.keys(teintes).length !== 11) {
  refus(`§9.1 : ${Object.keys(teintes).length} teintes lues, 11 attendues (vocabulaire FERMÉ).`);
}
for (const obligatoire of ['autre', 'arts', 'histoire']) {
  if (!teintes[obligatoire]) refus(`§9.1 : la teinte de « ${obligatoire} » manque.`);
}
/*
 * ⚠ TÉMOIN D'ABSENCE sur la confusion PLAUSIBLE : `autre` et `economie`
 * partagent la teinte EXPRÈS, et leurs CLÉS doivent rester distinctes. Un
 * relevé qui les fondrait ferait affirmer à une notice hors vocabulaire qu'elle
 * relève de l'économie.
 */
if (teintes.autre !== teintes.economie) {
  refus("§9.1 : `autre` et `economie` ne partagent plus leur teinte — §9.1 a changé, relisez-la.");
}

/* 9.2 — `recordType` → gabarit, repli compris. */
const gabaritDuType = {};
let repli = null;
for (const ligne of sectionDe('### 9.2').split('\n')) {
  const m = ligne.match(/^\|\s*`([a-z_]+)`\s*\|\s*`([a-z_]+)`\s*\|/);
  if (m) gabaritDuType[m[1]] = m[2];
  const r = ligne.match(/^\|\s*\*hors vocabulaire\*\s*\|\s*`([a-z_]+)`\s*\|/);
  if (r) [, repli] = r;
}
if (Object.keys(gabaritDuType).length !== 7) {
  refus(`§9.2 : ${Object.keys(gabaritDuType).length} types mappés, 7 attendus.`);
}
if (!repli) refus('§9.2 : le repli « hors vocabulaire » est introuvable.');
/*
 * ⚠ LES TROIS SOUTENANCES, nommées : les y oublier mettrait « MANUEL / COURS »
 * sur un mémoire de master, par le repli.
 */
for (const [t, attendu] of [
  ['these_unique', 'these'],
  ['licence', 'memoire'],
  ['master', 'memoire'],
]) {
  if (gabaritDuType[t] !== attendu) {
    refus(`§9.2 : « ${t} » devrait rendre « ${attendu} », et rend « ${gabaritDuType[t]} ».`);
  }
}

/* ──────────────────── ③ LE MODULE, SOURCE UNIQUE DU SITE ─────────────────── */

const ligne = (x) => JSON.stringify(x);
const ts = `/* ⚠⚠ FICHIER ENGENDRÉ — ne pas éditer à la main.
 *
 * Produit par \`apps/web/scripts/deriver-couvertures-v3.mjs\` depuis
 * \`docs/couvertures/source/\`. \`couvertures-v3-engendre.spec.ts\` REFUSE quand
 * ce fichier ne correspond plus à la source : une couverture périmée ne se voit
 * pas, elle s'affiche.
 *
 * Le logo officiel n'est PAS ici : il est servi une seule fois depuis
 * \`/couvertures/logo.svg\` — il pesait 9 670 octets dans CHACUN des huit
 * gabarits d'origine, soit 92 % du plus léger.
 */

/** Les cotes du maître : 500 × 700, ratio 5:7. */
export const CANEVAS = ${ligne(positions.canvas)} as const;

/** Les positions de TEXTE, telles que la source les donne. */
export const POSITIONS = ${JSON.stringify(
  {
    safeArea: positions.safe_area,
    logo: positions.logo,
    type: positions.type,
    title: positions.title,
    accentRule: positions.accent_rule,
    author: positions.author,
    year: positions.year,
    establishment: positions.establishment,
  },
  null,
  2,
)} as const;

/** La palette des domaines, avec son contraste mesuré sur blanc. */
export const PALETTE = ${JSON.stringify(spec.palette, null, 2)} as const;

/** Les bornes de variation, semées par le titre. */
export const VARIATION = ${ligne(spec.variation)} as const;

export type IdGabarit = ${spec.templates.map((t) => ligne(t.id)).join(' | ')};

/** Les huit types, leur libellé de couverture et leur motif. */
export const GABARITS: ReadonlyArray<{
  readonly id: IdGabarit;
  readonly type: string;
  readonly motif: string;
}> = ${JSON.stringify(
  spec.templates.map((t) => ({ id: t.id, type: t.type, motif: t.motif })),
  null,
  2,
)} as const;

/**
 * ⭐ \`coverDomain\` → teinte. Onze clés, vocabulaire FERMÉ, lues dans §9.1 de
 * \`docs/specification-couverture-composee.md\`. Le texte est TOUJOURS blanc ;
 * le pire contraste vaut 6,37:1, au-delà du seuil AA.
 *
 * ⚠ \`autre\` partage la teinte d'\`economie\` et garde sa clé : une couleur est
 * un repère, une clé est une affirmation.
 */
export const TEINTE_DU_DOMAINE: Readonly<Record<string, string>> = ${JSON.stringify(teintes, null, 2)};

/** ⭐ \`recordType\` → gabarit, et le repli pour ce qui est hors vocabulaire. */
export const GABARIT_DU_TYPE: Readonly<Record<string, string>> = ${JSON.stringify(gabaritDuType, null, 2)};
export const GABARIT_DE_REPLI = ${JSON.stringify(repli)} as const;

/**
 * ⚠ QUATRE GABARITS SONT INATTEIGNABLES — un fait, pas un défaut. Le
 * fournisseur en livre huit ; le vocabulaire du produit n'en atteint que quatre.
 * Un compte EXACT le dit, pour qu'ils ne dorment pas en silence le jour où
 * \`recordType\` s'étendra.
 */
export const GABARITS_ATTEIGNABLES = ${JSON.stringify(
  [...new Set([...Object.values(gabaritDuType), repli])].sort(),
)} as const;

/**
 * La GÉOMÉTRIE NUE de chaque motif — sans couleur de fond, sans variation.
 * Les deux sont calculées au rendu : la couleur par DOMAINE, la variation par
 * le TITRE.
 */
export const MOTIFS: Readonly<Record<IdGabarit, string>> = {
${Object.entries(motifs)
  .map(([id, g]) => `  ${id}: ${ligne(g)},`)
  .join('\n')}
};
`;
writeFileSync(MODULE, ts, 'utf-8');

/* ───────────────────────────── ③ LES TÉMOINS ─────────────────────────────── */

const poidsMotifs = Object.values(motifs).reduce((n, g) => n + g.length, 0);
console.log(`✓ logo vérifié IDENTIQUE dans les 8 gabarits : ${logo.length} octets`);
console.log('  → NON publié (droits non cédés) : la couverture emploie');
console.log('    public/marque/gafeso_horizontal.svg, déjà public, blanchi en CSS');
console.log(`✓ ${Object.keys(motifs).length} motifs, géométrie nue : ${poidsMotifs} octets au total`);
for (const [id, g] of Object.entries(motifs)) console.log(`    ${id.padEnd(14)} ${g.length} o`);
console.log(
  `✓ §9 lue : ${Object.keys(teintes).length} teintes, ${Object.keys(gabaritDuType).length} types ` +
    `→ ${new Set(Object.values(gabaritDuType)).size} gabarits atteignables (repli « ${repli} »)`,
);
console.log(`✓ module engendré : lib/couvertures-v3.generated.ts (${ts.length} o)`);
if (Object.keys(motifs).length !== spec.templates.length) {
  refus(`${Object.keys(motifs).length} motifs pour ${spec.templates.length} types déclarés.`);
}
