import { DEFENSE_RECORD_TYPES, RECORD_TYPES } from '../cataloging/description-profiles';

/**
 * ⭐⭐ LA COUVERTURE D'UNE NOTICE — le gabarit et le domaine, RÉSOLUS ICI.
 *
 * ## ⚠ POURQUOI LE SERVEUR RÉSOUT, et ne se contente pas de servir `category`
 *
 * `category` et `recordType` sont des valeurs de CATALOGUE : libres, parfois
 * vides, parfois hors vocabulaire (un import MARC apporte ce qu'il veut).
 * `coverDomain` et `coverTemplate` sont des valeurs RÉSOLUES : normalisation,
 * table, et repli déjà appliqués.
 *
 * Trois clients composent cette couverture — le web, le mobile, le générateur
 * de PDF. Leur laisser la normalisation et le repli, c'est **trois couvertures
 * possibles pour un même document**, et se reconnaître est la seule chose que
 * cette couverture doit faire. C'est la leçon de `hasDigital` / `offlineReady`,
 * appliquée au même endroit du même produit.
 *
 * ## ⭐ LA COULEUR EST UN REPÈRE, PAS UN CLASSEMENT — tranché par Jean le 12/10/2026
 *
 * J'avais écrit en §9 de la spécification que rattacher `philosophie` à un
 * libellé éditorial du fournisseur était une décision de métier. **Le cadrage
 * était faux** : on ne rattache pas une catégorie à un classement, on lui
 * attribue une TEINTE. Une teinte ne dit rien du contenu — elle sert à
 * retrouver un document d'un coup d'œil dans une étagère. La question ne se
 * posait donc pas.
 *
 * ⚠ Les teintes vivent dans `docs/specification-couverture-composee.md` §9 et
 * dans le module engendré du front. **Elles ne sont PAS ici** : l'API sert une
 * CLÉ, jamais un hexadécimal. Servir la couleur ferait du serveur le
 * propriétaire de la palette — un changement de design demanderait alors une
 * version d'API, et le mobile garde ses réponses en cache.
 */

/** Les domaines de couverture — vocabulaire FERMÉ, et `autre` en fait partie. */
export const COVER_DOMAINS = [
  'sciences',
  'medecine',
  'droit',
  'informatique',
  'economie',
  'litterature',
  'langues',
  'philosophie',
  'histoire',
  'arts',
  /**
   * ⭐ LE DOMAINE DE REPLI, et il est DISTINCT d'`economie` — alors qu'ils
   * partagent la même teinte `#3D4A54`.
   *
   * Jean a tranché « inconnue → #3D4A54 », qui est aussi la teinte d'`economie`.
   * Partager une COULEUR est sans conséquence : c'est un repère, et deux
   * domaines voisins dans une étagère ne trompent personne.
   *
   * ⚠ Partager la CLÉ ne l'est pas. Une notice hors vocabulaire rendue
   * `coverDomain: 'economie'` AFFIRMERAIT un classement que personne n'a posé —
   * et c'est la faute que ce dépôt nomme depuis le 16 septembre : « un fond de
   * domaine faux est pire qu'un fond neutre, il affirme ». D'où `autre`.
   */
  'autre',
] as const;

export type CoverDomain = (typeof COVER_DOMAINS)[number];

/** Les gabarits livrés par le fournisseur — vocabulaire FERMÉ. */
export const COVER_TEMPLATES = [
  'these',
  'memoire',
  'rapport_stage',
  'rapport',
  'actes',
  'manuel',
  'article',
  'guide',
] as const;

export type CoverTemplate = (typeof COVER_TEMPLATES)[number];

/** Le gabarit posé sur une notice dont le type est hors vocabulaire. */
export const COVER_TEMPLATE_DEFAUT: CoverTemplate = 'manuel';

/** Le domaine posé sur une notice dont la catégorie est hors vocabulaire. */
export const COVER_DOMAIN_DEFAUT: CoverDomain = 'autre';

/**
 * `recordType` → gabarit.
 *
 * ⚠ TYPÉE DANS LES DEUX SENS, et ce n'est pas décoratif : la clé est un
 * `RecordType` du vocabulaire du produit, la valeur un `CoverTemplate` du
 * fournisseur. Une valeur retirée de l'un ou de l'autre ne compile plus — « un
 * index est une chaîne recopiée qui ne se voit pas ; la forme juste TYPE ».
 */
const GABARIT_PAR_TYPE: Record<(typeof RECORD_TYPES)[number], CoverTemplate> = {
  // ── Les quatre tranchés par Jean le 12/10/2026
  these: 'these',
  memoire: 'memoire',
  publication: 'article',
  ouvrage: 'manuel',
  /**
   * ⚠ LES TROIS QUE LA DÉCISION NE NOMMAIT PAS, et le repli ne les couvre pas.
   *
   * `RECORD_TYPES` porte SEPT valeurs ; la décision en nommait quatre, plus un
   * repli pour « inconnu ». Or `licence`, `master` et `these_unique` ne sont pas
   * inconnues : elles sont DÉCLARÉES. Le repli ne leur est donc pas destiné, et
   * les y verser mettrait « MANUEL / COURS » sur un mémoire de master.
   *
   * ⭐ Le produit les classe DÉJÀ : les trois sont dans
   * `DEFENSE_RECORD_TYPES`, le sous-ensemble des soutenances. On lit cette
   * classification plutôt que d'en inventer une — `these_unique` est une thèse,
   * `licence` et `master` sont des mémoires. Un témoin le vérifie plutôt que de
   * le supposer.
   */
  these_unique: 'these',
  licence: 'memoire',
  master: 'memoire',
};

/**
 * `category` → domaine de couverture.
 *
 * ⚠ La clé est la catégorie NORMALISÉE (minuscules, détourée) — c'est la forme
 * dans laquelle `resolveCategory` de la cataloging rend le vocabulaire, et c'est
 * celle que §3.2 de la spécification emploie depuis toujours.
 */
const DOMAINE_PAR_CATEGORIE: Record<string, CoverDomain> = {
  sciences: 'sciences',
  medecine: 'medecine',
  droit: 'droit',
  informatique: 'informatique',
  economie: 'economie',
  litterature: 'litterature',
  langues: 'langues',
  philosophie: 'philosophie',
  histoire: 'histoire',
  arts: 'arts',
};

/**
 * ⚠ NFC À LA FRONTIÈRE, comme partout où un texte de tiers entre.
 *
 * `category` arrive d'un import MARC, d'un CSV ou d'un copier-coller : « droit »
 * peut y être décomposé. Sans normalisation, la même catégorie donnerait deux
 * domaines — c'est le défaut des fiches d'autorité dédoublées, descendu au
 * niveau du caractère, et il touche exactement les catégories accentuées.
 */
function normaliser(valeur: string | null | undefined): string {
  return (valeur ?? '').normalize('NFC').trim().toLowerCase();
}

/** Le domaine de couverture d'une notice — jamais `null`, jamais hors liste. */
export function domaineDeCouverture(category: string | null | undefined): CoverDomain {
  return DOMAINE_PAR_CATEGORIE[normaliser(category)] ?? COVER_DOMAIN_DEFAUT;
}

/** Le gabarit de couverture d'une notice — jamais `null`, jamais hors liste. */
export function gabaritDeCouverture(recordType: string | null | undefined): CoverTemplate {
  const t = normaliser(recordType) as (typeof RECORD_TYPES)[number];
  return GABARIT_PAR_TYPE[t] ?? COVER_TEMPLATE_DEFAUT;
}

/**
 * ⚠ EXPORTÉS POUR LES GARDES SEULEMENT — pas pour l'usage.
 *
 * Un garde qui recopierait ces tables comparerait une copie à une copie. Il les
 * lit donc ici, et il vérifie qu'elles couvrent les vocabulaires du produit.
 */
export const _TABLES_POUR_GARDES = {
  GABARIT_PAR_TYPE,
  DOMAINE_PAR_CATEGORIE,
  DEFENSE_RECORD_TYPES,
  RECORD_TYPES,
} as const;

/**
 * ⭐⭐ LES DEUX CHAMPS DE COUVERTURE D'UNE NOTICE — la SEULE façon de les poser.
 *
 * ## ⚠ POURQUOI UNE FONCTION ET PAS DEUX APPELS
 *
 * Quatre routes servent une notice affichable — `/opac/records/:id`,
 * `/opac/search`, `/reader/consultations`, `/reader/hors-ligne`. Écrire
 * `coverTemplate: gabarit(...)` et `coverDomain: domaine(...)` à quatre
 * endroits, c'est quatre occasions d'en oublier un, et c'est exactement ce qui
 * s'est produit : les trois dernières ne servaient NI l'un NI l'autre pendant
 * que la première les servait tous les deux. « Un contrat INÉGAL d'une route à
 * l'autre », comme le front l'a écrit du trio auteur/domaine/année.
 *
 * ⭐ Une seule fonction rend les DEUX ensemble : on ne peut plus en poser un et
 * oublier l'autre. Et `couverture-sur-toutes-les-routes.spec.ts` exige qu'elle
 * soit appelée partout où une notice affichable est servie.
 *
 * ⚠ Elle accepte une notice PARTIELLE — un résultat de recherche ne porte pas
 * les mêmes champs qu'une fiche. Ce dont elle a besoin se réduit à deux
 * chaînes, et les deux ont un repli : une notice sans `recordType` rend
 * `manuel`, une notice sans `category` rend `autre`.
 */
export function champsDeCouverture(notice: {
  recordType?: string | null;
  category?: string | null;
}): { coverTemplate: CoverTemplate; coverDomain: CoverDomain } {
  return {
    coverTemplate: gabaritDeCouverture(notice.recordType),
    coverDomain: domaineDeCouverture(notice.category),
  };
}
