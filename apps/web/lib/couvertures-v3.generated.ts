/* ⚠⚠ FICHIER ENGENDRÉ — ne pas éditer à la main.
 *
 * Produit par `apps/web/scripts/deriver-couvertures-v3.mjs` depuis
 * `docs/couvertures/source/`. `couvertures-v3-engendre.spec.ts` REFUSE quand
 * ce fichier ne correspond plus à la source : une couverture périmée ne se voit
 * pas, elle s'affiche.
 *
 * Le logo officiel n'est PAS ici : il est servi une seule fois depuis
 * `/couvertures/logo.svg` — il pesait 9 670 octets dans CHACUN des huit
 * gabarits d'origine, soit 92 % du plus léger.
 */

/** Les cotes du maître : 500 × 700, ratio 5:7. */
export const CANEVAS = {"width":500,"height":700,"ratio":0.7142857143} as const;

/** Les positions de TEXTE, telles que la source les donne. */
export const POSITIONS = {
  "safeArea": {
    "left": 34,
    "right": 34,
    "top": 21,
    "bottom": 38
  },
  "logo": {
    "source": "logo_gafeso_officiel_blanc_horizontal.svg",
    "x": 34,
    "y": 21,
    "width": 122,
    "height": 54,
    "preserve_aspect_ratio": true,
    "color": "#FFFFFF",
    "geometry": "exact official supplied logo; recolored only"
  },
  "type": {
    "x": 34,
    "y": 103,
    "font_family": "Poppins",
    "font_size_px": 15,
    "font_weight": 700,
    "line_height_px": 18,
    "letter_spacing_px": 1.5,
    "color": "#FFFFFF",
    "max_width_px": 432,
    "max_lines": 2
  },
  "title": {
    "x": 34,
    "y_by_line_count": {
      "1": 467,
      "2": 425,
      "3": 390,
      "4": 348
    },
    "font_family": "Poppins",
    "font_size_px": 33,
    "font_weight": 700,
    "line_height_px": 42,
    "color": "#FFFFFF",
    "max_width_px": 432,
    "max_lines": 4,
    "minimum_font_size_px": 30,
    "overflow_rule": "ellipsis after 4 lines; optional progressive shrink to 30px"
  },
  "accentRule": {
    "x": 34,
    "y": 548,
    "width": 58,
    "height": 5,
    "radius": 2.5,
    "color": "#E07A2B"
  },
  "author": {
    "x": 34,
    "y": 590,
    "font_family": "Source Sans 3",
    "font_size_px": 15,
    "font_weight": 600,
    "line_height_px": 19,
    "color": "#FFFFFF",
    "max_width_px": 432,
    "max_lines": 1
  },
  "year": {
    "x": 34,
    "y": 614,
    "font_family": "Source Sans 3",
    "font_size_px": 15,
    "font_weight": 400,
    "line_height_px": 19,
    "color": "#FFFFFF",
    "max_width_px": 432,
    "max_lines": 1
  },
  "establishment": {
    "x": 34,
    "y": 662,
    "font_family": "Source Sans 3",
    "font_size_px": 12,
    "font_weight": 700,
    "line_height_px": 15,
    "letter_spacing_px": 0.8,
    "color": "#FFFFFF",
    "max_width_px": 432,
    "max_lines": 2
  }
} as const;

/** La palette des domaines, avec son contraste mesuré sur blanc. */
export const PALETTE = [
  {
    "domain": "Sciences naturelles",
    "hex": "#1E5A3C",
    "contrast_white": 8.13
  },
  {
    "domain": "Sciences de l’ingénieur",
    "hex": "#154D87",
    "contrast_white": 8.59
  },
  {
    "domain": "Sciences humaines",
    "hex": "#6A3D86",
    "contrast_white": 8
  },
  {
    "domain": "Droit",
    "hex": "#8A4A00",
    "contrast_white": 6.86
  },
  {
    "domain": "Santé / médecine",
    "hex": "#A3202E",
    "contrast_white": 7.49
  },
  {
    "domain": "Informatique",
    "hex": "#00616B",
    "contrast_white": 7.19
  },
  {
    "domain": "Économie / gestion",
    "hex": "#8A4F0F",
    "contrast_white": 6.55
  },
  {
    "domain": "Lettres",
    "hex": "#8A1F55",
    "contrast_white": 8.72
  },
  {
    "domain": "Gestion publique",
    "hex": "#3D4A54",
    "contrast_white": 9.11
  },
  {
    "domain": "Environnement",
    "hex": "#3A6B16",
    "contrast_white": 6.37
  }
] as const;

/** Les bornes de variation, semées par le titre. */
export const VARIATION = {"position_px":"±10","scale":"92–108%","rotation":"−4° à +4°","elements":"5–8","opacity":"10–19%","seed":"SHA-256 du titre normalisé"} as const;

export type IdGabarit = "these" | "memoire" | "rapport_stage" | "rapport" | "actes" | "manuel" | "article" | "guide";

/** Les huit types, leur libellé de couverture et leur motif. */
export const GABARITS: ReadonlyArray<{
  readonly id: IdGabarit;
  readonly type: string;
  readonly motif: string;
}> = [
  {
    "id": "these",
    "type": "THÈSE DE DOCTORAT",
    "motif": "arcs"
  },
  {
    "id": "memoire",
    "type": "MÉMOIRE DE MASTER",
    "motif": "folds"
  },
  {
    "id": "rapport_stage",
    "type": "RAPPORT DE STAGE",
    "motif": "architecture"
  },
  {
    "id": "rapport",
    "type": "RAPPORT",
    "motif": "bars"
  },
  {
    "id": "actes",
    "type": "ACTES DE COLLOQUE",
    "motif": "dotmap"
  },
  {
    "id": "manuel",
    "type": "MANUEL / COURS",
    "motif": "pages"
  },
  {
    "id": "article",
    "type": "ARTICLE SCIENTIFIQUE",
    "motif": "network"
  },
  {
    "id": "guide",
    "type": "GUIDE",
    "motif": "leaves"
  }
] as const;

/**
 * ⭐ `coverDomain` → teinte. Onze clés, vocabulaire FERMÉ, lues dans §9.1 de
 * `docs/specification-couverture-composee.md`. Le texte est TOUJOURS blanc ;
 * le pire contraste vaut 6,37:1, au-delà du seuil AA.
 *
 * ⚠ `autre` partage la teinte d'`economie` et garde sa clé : une couleur est
 * un repère, une clé est une affirmation.
 */
export const TEINTE_DU_DOMAINE: Readonly<Record<string, string>> = {
  "sciences": "#1E5A3C",
  "medecine": "#A3202E",
  "droit": "#8A4A00",
  "informatique": "#00616B",
  "economie": "#3D4A54",
  "litterature": "#8A1F55",
  "langues": "#6A3D86",
  "philosophie": "#154D87",
  "histoire": "#3A6B16",
  "arts": "#2E3A8C",
  "autre": "#3D4A54"
};

/** ⭐ `recordType` → gabarit, et le repli pour ce qui est hors vocabulaire. */
export const GABARIT_DU_TYPE: Readonly<Record<string, string>> = {
  "these": "these",
  "memoire": "memoire",
  "publication": "article",
  "ouvrage": "manuel",
  "these_unique": "these",
  "licence": "memoire",
  "master": "memoire"
};
export const GABARIT_DE_REPLI = "manuel" as const;

/**
 * ⚠ QUATRE GABARITS SONT INATTEIGNABLES — un fait, pas un défaut. Le
 * fournisseur en livre huit ; le vocabulaire du produit n'en atteint que quatre.
 * Un compte EXACT le dit, pour qu'ils ne dorment pas en silence le jour où
 * `recordType` s'étendra.
 */
export const GABARITS_ATTEIGNABLES = ["article","manuel","memoire","these"] as const;

/**
 * La GÉOMÉTRIE NUE de chaque motif — sans couleur de fond, sans variation.
 * Les deux sont calculées au rendu : la couleur par DOMAINE, la variation par
 * le TITRE.
 */
export const MOTIFS: Readonly<Record<IdGabarit, string>> = {
  these: "<circle cx=\"410\" cy=\"95\" r=\"82\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"3\" /><circle cx=\"410\" cy=\"95\" r=\"127\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"4\" /><circle cx=\"410\" cy=\"95\" r=\"172\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"5\" /><circle cx=\"410\" cy=\"95\" r=\"217\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"3\" /><circle cx=\"410\" cy=\"95\" r=\"262\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"4\" />",
  memoire: "<polygon points=\"25,0 120,0 40,315 -25,315\" fill=\"#FFFFFF\" /><polygon points=\"87,0 182,0 102,315 37,315\" fill=\"#FFFFFF\" /><polygon points=\"149,0 244,0 164,315 99,315\" fill=\"#FFFFFF\" /><polygon points=\"211,0 306,0 226,315 161,315\" fill=\"#FFFFFF\" /><polygon points=\"273,0 368,0 288,315 223,315\" fill=\"#FFFFFF\" /><polygon points=\"335,0 430,0 350,315 285,315\" fill=\"#FFFFFF\" /><polygon points=\"397,0 492,0 412,315 347,315\" fill=\"#FFFFFF\" /><polygon points=\"459,0 554,0 474,315 409,315\" fill=\"#FFFFFF\" />",
  rapport_stage: "<polygon points=\"55,305 250,195 430,305 250,390\" fill=\"#FFFFFF\" /><polygon points=\"250,195 430,305 430,365 250,260\" fill=\"#FFFFFF\" /><rect x=\"305\" y=\"95\" width=\"17\" height=\"150\" fill=\"#FFFFFF\" /><rect x=\"330\" y=\"79\" width=\"17\" height=\"160\" fill=\"#FFFFFF\" /><rect x=\"355\" y=\"63\" width=\"17\" height=\"170\" fill=\"#FFFFFF\" /><rect x=\"380\" y=\"47\" width=\"17\" height=\"180\" fill=\"#FFFFFF\" />",
  rapport: "<rect x=\"290\" y=\"180\" width=\"16\" height=\"75\" fill=\"#FFFFFF\" /><rect x=\"314\" y=\"148\" width=\"16\" height=\"107\" fill=\"#FFFFFF\" /><rect x=\"338\" y=\"116\" width=\"16\" height=\"139\" fill=\"#FFFFFF\" /><rect x=\"362\" y=\"84\" width=\"16\" height=\"171\" fill=\"#FFFFFF\" /><rect x=\"386\" y=\"52\" width=\"16\" height=\"203\" fill=\"#FFFFFF\" /><rect x=\"410\" y=\"20\" width=\"16\" height=\"235\" fill=\"#FFFFFF\" /><circle cx=\"70\" cy=\"285\" r=\"130\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"3\" /><circle cx=\"70\" cy=\"285\" r=\"92\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"3\" />",
  actes: "<circle cx=\"291\" cy=\"60\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"313\" cy=\"60\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"335\" cy=\"60\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"357\" cy=\"60\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"269\" cy=\"82\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"291\" cy=\"82\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"313\" cy=\"82\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"335\" cy=\"82\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"357\" cy=\"82\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"379\" cy=\"82\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"247\" cy=\"104\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"269\" cy=\"104\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"291\" cy=\"104\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"313\" cy=\"104\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"335\" cy=\"104\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"357\" cy=\"104\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"379\" cy=\"104\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"401\" cy=\"104\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"247\" cy=\"126\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"269\" cy=\"126\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"291\" cy=\"126\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"313\" cy=\"126\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"335\" cy=\"126\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"357\" cy=\"126\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"379\" cy=\"126\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"401\" cy=\"126\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"247\" cy=\"148\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"269\" cy=\"148\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"291\" cy=\"148\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"313\" cy=\"148\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"335\" cy=\"148\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"357\" cy=\"148\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"379\" cy=\"148\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"401\" cy=\"148\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"247\" cy=\"170\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"269\" cy=\"170\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"291\" cy=\"170\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"313\" cy=\"170\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"335\" cy=\"170\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"357\" cy=\"170\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"379\" cy=\"170\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"401\" cy=\"170\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"269\" cy=\"192\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"291\" cy=\"192\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"313\" cy=\"192\" r=\"6\" fill=\"#FFFFFF\" /><circle cx=\"335\" cy=\"192\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"357\" cy=\"192\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"291\" cy=\"214\" r=\"7\" fill=\"#FFFFFF\" /><circle cx=\"313\" cy=\"214\" r=\"3\" fill=\"#FFFFFF\" /><circle cx=\"335\" cy=\"214\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"291\" cy=\"236\" r=\"4\" fill=\"#FFFFFF\" /><circle cx=\"313\" cy=\"236\" r=\"5\" fill=\"#FFFFFF\" /><circle cx=\"335\" cy=\"236\" r=\"6\" fill=\"#FFFFFF\" /><path d=\"M0 270 L175 100 L225 140 L40 325 Z\" fill=\"#FFFFFF\" />",
  manuel: "<path d=\"M0 248 C105 175 195 178 250 250 C305 178 395 175 500 248 L500 310 C392 248 310 250 250 320 C190 250 108 248 0 310 Z\" fill=\"#FFFFFF\" /><path d=\"M55 190 C130 140 205 160 250 215 C295 160 370 140 445 190\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"11\" /><circle cx=\"390\" cy=\"35\" r=\"130\" fill=\"#FFFFFF\" />",
  article: "<circle cx=\"330\" cy=\"55\" r=\"10\" fill=\"#FFFFFF\" /><line x1=\"330\" y1=\"55\" x2=\"380\" y2=\"115\" stroke=\"#FFFFFF\" stroke-width=\"3\" /><circle cx=\"380\" cy=\"115\" r=\"15\" fill=\"#FFFFFF\" /><line x1=\"380\" y1=\"115\" x2=\"315\" y2=\"160\" stroke=\"#FFFFFF\" stroke-width=\"3\" /><circle cx=\"315\" cy=\"160\" r=\"20\" fill=\"#FFFFFF\" /><line x1=\"315\" y1=\"160\" x2=\"420\" y2=\"190\" stroke=\"#FFFFFF\" stroke-width=\"3\" /><circle cx=\"420\" cy=\"190\" r=\"10\" fill=\"#FFFFFF\" /><line x1=\"420\" y1=\"190\" x2=\"350\" y2=\"245\" stroke=\"#FFFFFF\" stroke-width=\"3\" /><circle cx=\"350\" cy=\"245\" r=\"15\" fill=\"#FFFFFF\" /><line x1=\"350\" y1=\"245\" x2=\"465\" y2=\"260\" stroke=\"#FFFFFF\" stroke-width=\"3\" /><circle cx=\"465\" cy=\"260\" r=\"20\" fill=\"#FFFFFF\" /><line x1=\"465\" y1=\"260\" x2=\"265\" y2=\"220\" stroke=\"#FFFFFF\" stroke-width=\"3\" /><circle cx=\"265\" cy=\"220\" r=\"10\" fill=\"#FFFFFF\" /><circle cx=\"70\" cy=\"215\" r=\"58\" fill=\"#FFFFFF\" />",
  guide: "<path d=\"M340 320 C325 210 345 100 445 40 C455 160 420 260 340 320 Z\" fill=\"#FFFFFF\" /><path d=\"M315 320 C250 235 235 145 295 65 C340 160 345 245 315 320 Z\" fill=\"#FFFFFF\" /><path d=\"M285 320 C205 255 175 180 205 105 C270 180 300 250 285 320 Z\" fill=\"#FFFFFF\" /><path d=\"M325 318 C350 230 385 155 430 90\" stroke=\"#FFFFFF\" stroke-width=\"5\" fill=\"none\" />",
};
