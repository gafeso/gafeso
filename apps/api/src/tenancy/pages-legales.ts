/**
 * LES PAGES LÉGALES D'UNE ÉCOLE — mentions légales et confidentialité.
 *
 * ## Pourquoi elles sont rédigées PAR L'ÉCOLE
 *
 * Sur l'instance de l'Université d'Exemple, l'éditeur et le responsable du
 * traitement sont **l'UO, pas ResurgiTech**. Un texte en dur signé ResurgiTech
 * sur le site d'un client serait FAUX — légalement, pas cosmétiquement. Ces
 * pages suivent donc le même mécanisme que l'accueil : du contenu par école,
 * avec un modèle que l'établissement complète.
 *
 * ## ⚠ POURQUOI UNE COLONNE SÉPARÉE DE `homepageContent`
 *
 * Motif du front, et il est juste : `normalizeHomeContent` devrait sinon
 * connaître des pages qui ne sont pas de l'accueil. « Deux choses dans une
 * colonne finit par faire décider à l'une pour l'autre. »
 *
 * ## 🔴 ET LE POINT QUE LE CONTRAT NE DISAIT PAS : `GET /tenancy/home` EST PUBLIQUE
 *
 * Elle est déclarée « contenu de la vitrine publique » dans l'inventaire des
 * routes sans fonction. Servir `pagesLegales` tel quel y publierait donc les
 * BROUILLONS d'une bibliothécaire — un texte juridique à demi rédigé, lisible de
 * tout l'internet, sous le nom de l'établissement.
 *
 * ⚠ C'est la forme fautive que ce lot appelle, et elle est invisible : la
 * colonne est servie, le front n'affiche que ce qu'il veut, et personne ne
 * regarde la réponse brute. Mais la réponse SORT de l'application — donc
 * « quand une non-réponse se traduit en quelque chose qui QUITTE
 * l'application », la distinction cesse d'être une élégance.
 *
 * `pourLePublic` ne rend donc QUE les pages dont `publieeLe` est posé. Un
 * brouillon est indiscernable d'une page jamais écrite, vu du dehors — ce qui
 * est exactement la propriété voulue.
 *
 * ⚠ Et la règle « un modèle NON COMPLÉTÉ ne se publie pas » reste tranchée côté
 * FRONT, à la rédaction. Celle-ci est son filet côté API : deux portes pour une
 * propriété qui, si elle casse, se lit de l'extérieur.
 */

/** Une page légale telle qu'elle est stockée. */
export interface PageLegale {
  /** Les blocs du modèle, par identifiant. Le front décide de leur ordre. */
  readonly blocs: Record<string, string>;
  /** ISO 8601, ou `null` : non publiée — donc un BROUILLON. */
  readonly publieeLe: string | null;
}

export interface PagesLegales {
  readonly mentions: PageLegale;
  readonly confidentialite: PageLegale;
}

const PAGE_VIDE: PageLegale = { blocs: {}, publieeLe: null };
export const PAGES_LEGALES_VIDES: PagesLegales = {
  mentions: PAGE_VIDE,
  confidentialite: PAGE_VIDE,
};

/** Les deux pages, nommées une seule fois — rien ne les recopie. */
export const CLES_PAGES = ['mentions', 'confidentialite'] as const;
export type ClePage = (typeof CLES_PAGES)[number];

/**
 * ⚠ BORNES MESURÉES, et elles sont assumées : un texte juridique est long, mais
 * `GET /tenancy/home` est une réponse de page d'accueil. 40 ko par page et 40
 * blocs laissent très largement la place à des mentions complètes, et empêchent
 * qu'une colonne `Json` sans borne fasse grossir une réponse publique.
 */
export const MAX_BLOCS = 40;
export const MAX_LONGUEUR_BLOC = 40_000;

function chaine(valeur: unknown): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

/** Une date ISO valide, ou `null`. Jamais une chaîne arbitraire. */
function dateIso(valeur: unknown): string | null {
  const brut = chaine(valeur);
  if (brut === null) return null;
  const d = new Date(brut);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normaliserBlocs(valeur: unknown): Record<string, string> {
  if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) return {};
  const entrees = Object.entries(valeur as Record<string, unknown>)
    .map(([cle, v]) => [cle.trim(), chaine(v)] as const)
    .filter((e): e is readonly [string, string] => e[0].length > 0 && e[1] !== null)
    // ⚠ NFC à la frontière : ces textes arrivent d'un copier-coller depuis un
    // PDF ou un traitement de texte, donc d'un tiers. « Ouédraogo » décomposé et
    // composé s'affichent au pixel près et ne sont pas égaux.
    .map(([cle, v]) => [cle, v.normalize('NFC').slice(0, MAX_LONGUEUR_BLOC)] as const)
    .slice(0, MAX_BLOCS);
  return Object.fromEntries(entrees);
}

function normaliserPage(valeur: unknown): PageLegale {
  if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) return PAGE_VIDE;
  const v = valeur as Record<string, unknown>;
  return { blocs: normaliserBlocs(v.blocs), publieeLe: dateIso(v.publieeLe) };
}

/** Ce que la colonne porte, mis en forme — brouillons COMPRIS. */
export function normaliserPagesLegales(stocke: unknown): PagesLegales {
  if (stocke === null || typeof stocke !== 'object' || Array.isArray(stocke)) {
    return PAGES_LEGALES_VIDES;
  }
  const v = stocke as Record<string, unknown>;
  return {
    mentions: normaliserPage(v.mentions),
    confidentialite: normaliserPage(v.confidentialite),
  };
}

/** Ce qu'on accepte d'un formulaire d'administration — remplacement complet. */
export function assainirPagesLegalesEnEntree(entree: unknown): PagesLegales {
  return normaliserPagesLegales(entree);
}

/**
 * 🔴 CE QUE LA ROUTE PUBLIQUE REND : les pages PUBLIÉES, et elles seules.
 *
 * Une page sans `publieeLe` sort avec `blocs: {}` — donc indiscernable, vu du
 * dehors, d'une page jamais rédigée. Et `publieeLe` reste `null`, pour que le
 * front sache dire « cette page n'est pas disponible » plutôt que d'afficher un
 * cadre vide.
 */
export function pourLePublic(pages: PagesLegales): PagesLegales {
  const filtrer = (p: PageLegale): PageLegale =>
    p.publieeLe === null ? PAGE_VIDE : p;
  return {
    mentions: filtrer(pages.mentions),
    confidentialite: filtrer(pages.confidentialite),
  };
}
