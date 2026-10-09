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

/* ─────────────────────────────────────────────────────────────────────────────
 * LE NUMÉRO DE VERSION — et pourquoi il n'est PAS dans `PagesLegales`
 *
 * `PATCH /tenancy/settings` fait un REMPLACEMENT COMPLET de `pagesLegales`.
 * Deux éditeurs qui ouvrent l'écran au même moment écrivaient donc l'un sur
 * l'autre, en silence : le second emportait une page PUBLIÉE que le premier
 * venait de rédiger, et aucune des deux personnes ne pouvait le savoir.
 *
 * ## ⚠ POURQUOI LE CONTENU ET LE JETON SONT DEUX TYPES SÉPARÉS
 *
 * Le jeton est la propriété du SERVEUR. Si `version` était un champ de
 * `PagesLegales`, il entrerait par le même chemin que le contenu — et un client
 * qui renvoie la charge qu'il a lue (ce que fait tout client correct) écrirait
 * sa propre version. Le compteur deviendrait client-contrôlé, donc le contrôle
 * se contournerait en renvoyant simplement le nombre attendu.
 *
 * ⭐ Et la séparation est GRATUITE : `normaliserPagesLegales` ne lit que
 * `mentions` et `confidentialite`, donc elle JETTE déjà toute clé `version`
 * arrivant de l'extérieur. Le stockage porte les trois clés ; le type du
 * contenu n'en porte que deux. C'est pour cela que `pourLePublic` reste
 * inchangée et que la charge de `GET /tenancy/home` ne bouge pas d'un octet.
 *
 * ## ⚠ ET IL N'Y A QU'UN SEUL JETON POUR LES DEUX PAGES
 *
 * Un jeton PAR PAGE serait plus confortable — deux éditeurs sur deux pages
 * différentes ne se gêneraient pas. Il serait FAUX : le `PATCH` remplace les
 * DEUX pages d'un coup, donc un conflit sur l'une emporte l'autre. Le jeton
 * couvre exactement l'unité que l'écriture remplace, jamais une sous-partie
 * qu'elle ne sait pas écrire séparément.
 * ───────────────────────────────────────────────────────────────────────────── */

/** Clé de stockage du jeton, nommée une seule fois. */
export const CLE_VERSION = 'version';

/**
 * Le jeton tel que la colonne le porte. **Zéro** quand il n'y en a pas —
 * colonne nulle, clé absente, ou valeur non numérique.
 *
 * ⚠ LE REPLI À ZÉRO N'EST PAS UNE COMMODITÉ : toute école existante a une
 * colonne SANS `version` (ce lot est postérieur aux pages légales). Si l'absence
 * ne valait pas un nombre, aucune de ces écoles ne pourrait plus écrire — le
 * contrôle de concurrence fermerait la fonction qu'il protège.
 *
 * ⚠ Et le cas « valeur non numérique » est gardé, pas supposé : la colonne est
 * un `Json` libre, et une version écrite à la main par un correctif SQL pourrait
 * y mettre une chaîne. Le prédicat SQL du service fait la MÊME discrimination
 * (`jsonb_typeof(… ) = 'number'`), sinon les deux divergeraient — et la
 * divergence ne se verrait qu'au premier conflit réel.
 */
export function versionDesPagesLegales(stocke: unknown): number {
  if (stocke === null || typeof stocke !== 'object' || Array.isArray(stocke)) return 0;
  const v = (stocke as Record<string, unknown>)[CLE_VERSION];
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Ce que la route d'administration rend : le contenu, ET le jeton. */
export interface EtatPagesLegales {
  readonly pagesLegales: PagesLegales;
  /** À renvoyer tel quel dans le `PATCH`. Un écart → 409, jamais un écrasement. */
  readonly version: number;
}

/** Lit la colonne et rend les deux moitiés — une seule définition, deux lecteurs. */
export function etatDesPagesLegales(stocke: unknown): EtatPagesLegales {
  return {
    pagesLegales: normaliserPagesLegales(stocke),
    version: versionDesPagesLegales(stocke),
  };
}

/**
 * ⭐⭐ LE PRÉDICAT DE CONCURRENCE, EXPORTÉ POUR POUVOIR ÊTRE MIS EN COURSE.
 *
 * Rend le nombre de lignes touchées : **1** si la version attendue était la
 * bonne, **0** sinon. L'appelant décide du 409 — cette fonction ne connaît pas
 * HTTP.
 *
 * ## ⚠ POURQUOI ELLE EST EXTRAITE PLUTÔT QU'EN LIGNE DANS LE SERVICE
 *
 * Mon premier contrôle négatif N'A PAS MORDU. J'avais remplacé la mise à jour
 * conditionnelle par un lire-vérifier-écrire — la forme qui ne protège de rien —
 * et les cinq cas sont restés VERTS.
 *
 * ⭐ La cause n'était ni le code ni le test : **deux appels lancés par
 * `Promise.allSettled` sur le même client ne se chevauchent pas forcément.**
 * Exécutés en séquence, les DEUX formes refusent la seconde écriture — parce
 * qu'elle porte la version N alors que la base est passée à N+1. Le cas
 * séquentiel ne DISCRIMINE donc pas, et c'est lui que mon test mesurait.
 *
 * C'est « le jeu d'essai n'atteint pas le chemin » : le code muté s'exécutait
 * bien, sur une situation qui ne contenait pas le cas.
 *
 * ## ⭐ CE QU'IL FAUT POUR DISCRIMINER : deux connexions et une BARRIÈRE
 *
 * La course dangereuse exige que les DEUX transactions aient passé leur lecture
 * AVANT que l'une écrive. Avec ce prédicat il n'y a pas de lecture : la seconde
 * `UPDATE` BLOQUE sur le verrou de ligne, puis PostgreSQL **réévalue son
 * `WHERE`** contre la ligne validée — la version n'y est plus N, zéro ligne.
 *
 * Avec un lire-vérifier-écrire, la seconde transaction lit la version AVANT le
 * commit de la première (`READ COMMITTED` lui montre l'ancienne), trouve
 * l'égalité, et écrit. **Deux réussites, une écriture perdue.**
 *
 * D'où l'extraction : le garde vivant appelle CETTE fonction sur deux
 * transactions tenues ouvertes, et la forme fautive y échoue.
 */
export async function appliquerSiVersion(
  tx: {
    $executeRaw(requete: TemplateStringsArray, ...valeurs: unknown[]): Promise<number>;
  },
  tenantId: string,
  pages: PagesLegales,
  versionAttendue: number,
): Promise<number> {
  const charge = JSON.stringify(pourLeStockage(pages, versionAttendue + 1));
  // ⚠ UNE SEULE INSTRUCTION. Le prédicat est DANS l'`UPDATE` : il n'y a aucune
  // fenêtre entre « vérifier » et « écrire », parce qu'il n'y a pas deux temps.
  //
  // ⚠ Et `jsonb_typeof(…) = 'number'` fait la MÊME discrimination que
  // `versionDesPagesLegales` — un `(… ->> 'version')::int` nu LÈVERAIT sur une
  // valeur non numérique, et les deux lectures du jeton doivent s'accorder.
  return tx.$executeRaw`
    UPDATE public.tenant_settings
       SET pages_legales = ${charge}::jsonb
     WHERE tenant_id = ${tenantId}
       AND COALESCE(
             CASE WHEN jsonb_typeof(pages_legales -> 'version') = 'number'
                  THEN (pages_legales ->> 'version')::int END,
             0) = ${versionAttendue}`;
}

/** Ce qu'on ÉCRIT : le contenu assaini plus le jeton suivant, posé par le serveur. */
export function pourLeStockage(
  pages: PagesLegales,
  versionSuivante: number,
): PagesLegales & { readonly version: number } {
  return { ...pages, [CLE_VERSION]: versionSuivante };
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
