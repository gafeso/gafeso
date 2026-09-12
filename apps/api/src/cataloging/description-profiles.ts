/**
 * Profils de description d'une notice (couche 2 de docs/architecture-notice.md).
 *
 * Un profil dit quelles cases la notice a le droit de remplir et selon quel
 * écran de saisie. Il ne dit RIEN de ce qui est cherchable : un champ sorti du
 * noyau reste indexé (voir `RecordSearchDoc`, search/search-engine.ts).
 *
 * String validé côté serveur plutôt qu'enum Postgres, même idiome que
 * `recordType` et CONTRIBUTOR_ROLES : extensible sans migration, et le
 * sync-schema tenant ne synchronise pas les colonnes enum
 * (tenancy/tenant-schema.ts, buildAddMissingColumnsStatements).
 *
 * ⚠ La colonne `biblio_records.profile` existe (lot 1, migration
 * `notice_gafeso_marc_facultatif`) mais ne pilote encore AUCUN comportement :
 * ni saisie, ni validation, ni exposition. Le câblage est la phase C.
 */
export const DESCRIPTION_PROFILES = [
  /** Livres, périodiques, le fonds classique. Profil par défaut de toute notice. */
  'bibliographique',
  /**
   * Thèses, mémoires, travaux soutenus — métadonnées de soutenance.
   *
   * ⚠ DÉCISION DU 11 SEPTEMBRE 2026 : les ARTICLES et RAPPORTS
   * (`recordType = 'publication'`, 42 notices au fonds de démonstration)
   * restent **bibliographiques**. Motif : un article ou un rapport n'a ni
   * directeur, ni jury, ni soutenance — tous les champs du profil académique
   * lui seraient vides, et un profil dont les champs propres sont vides ne
   * décrit rien.
   *
   * Le jour où une bibliothèque veut décrire des actes de colloque avec comité
   * de lecture, ce sera un TROISIÈME profil, pas un élargissement de celui-ci.
   * Élargir le second obligerait à rendre ses champs facultatifs, et un profil
   * dont tous les champs sont facultatifs ne dit plus quoi saisir.
   */
  'academique',
] as const;

export type DescriptionProfile = (typeof DESCRIPTION_PROFILES)[number];

/** Profil posé sur une notice dont rien n'indique le contraire. */
export const DEFAULT_DESCRIPTION_PROFILE: DescriptionProfile = 'bibliographique';

/**
 * Les types de document qui relèvent d'une SOUTENANCE — donc du profil
 * académique.
 *
 * ⚠ SOURCE UNIQUE, ET C'EST LE POINT. Cette liste sert à DEUX règles : exiger
 * l'université de soutenance à l'écriture (`requireDefenseFields`, cataloging)
 * et déduire le profil de la notice (`profilPourTypeDeNotice`). Les deux ne
 * peuvent donc pas diverger — un type qui exige des champs de soutenance est un
 * type académique par construction, pas par coïncidence.
 *
 * Elle vit ici, avec le vocabulaire des profils, et non dans le service, pour
 * qu'aucun des deux consommateurs n'ait à la recopier. C'est la classe de
 * défaut du §2 du relevé : un même vocabulaire en plusieurs endroits qui ne se
 * parlent pas.
 */
export const DEFENSE_RECORD_TYPES = [
  'these',
  'memoire',
  'licence',
  'master',
  'these_unique',
] as const;

/**
 * ── LE VOCABULAIRE DES TYPES DE NOTICE, FERMÉ (backlog n°22) ───────────────
 *
 * ⚠ IL ÉTAIT OUVERT, ET LA MESURE A MONTRÉ CE QUE ÇA COÛTAIT. `recordType`
 * était validé par `@IsString()` : n'importe quelle chaîne entrait en base.
 * Un vocabulaire qu'on n'applique pas n'est pas un vocabulaire, c'est un
 * commentaire.
 *
 * ⚠ ET LE DÉFAUT LE PLUS PARLANT ÉTAIT LA VALEUR PAR DÉFAUT ELLE-MÊME.
 * `DEFAULT_RECORD_TYPE` valait `'book'` — relevé sur la base de développement
 * le 12 septembre 2026 : sur 8 352 notices réparties en quatre valeurs
 * (`ouvrage` 3 437, `memoire` 2 399, `these` 1 312, `publication` 1 204),
 * `'book'` n'apparaît PAS UNE FOIS. Le chemin n'est pourtant pas mort : il se
 * prend dès qu'une notice est créée sans type. Une bibliothécaire qui saisit
 * un livre sans choisir son type aurait donc fabriqué une CINQUIÈME valeur, en
 * anglais, à côté d'`ouvrage` — et une facette de plus dans l'OPAC, sans que
 * rien ne le signale.
 *
 * Le défaut par défaut est donc `'ouvrage'` : la valeur que 3 437 notices
 * portent déjà pour ce cas, dans la même langue que le reste du vocabulaire.
 *
 * ⚠ CE QUI ENTRE DANS LA LISTE ET POURQUOI. Les quatre valeurs RÉELLES, plus
 * les trois types de soutenance déclarés dans `DEFENSE_RECORD_TYPES` qui
 * n'ont encore aucune notice (`licence`, `master`, `these_unique`). Fermer sur
 * les seules valeurs observées interdirait de cataloguer le premier mémoire de
 * licence — on ferme sur ce que le produit sait décrire, pas sur ce qu'il a
 * déjà décrit.
 */
export const RECORD_TYPES = [
  /** Le fonds classique — livres, manuels, usuels. Le défaut. */
  'ouvrage',
  /** Articles, rapports, actes. Bibliographique : ni jury, ni soutenance. */
  'publication',
  // Les types de soutenance — `DEFENSE_RECORD_TYPES` en est le sous-ensemble,
  // et un test le vérifie plutôt que de le supposer.
  'these',
  'memoire',
  'licence',
  'master',
  'these_unique',
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

/**
 * Le type posé sur une notice dont rien n'indique le type.
 *
 * ⚠ Il était écrit en dur à TROIS endroits du service (création, import ×2).
 * Même motif que la liste ci-dessus : un vocabulaire répété est un vocabulaire
 * qui divergera.
 */
export const DEFAULT_RECORD_TYPE: RecordType = 'ouvrage';

/** Le type est-il du vocabulaire ? Une seule définition, trois portes. */
export function estUnTypeDeNotice(valeur: string | null | undefined): valeur is RecordType {
  return !!valeur && (RECORD_TYPES as readonly string[]).includes(valeur.trim());
}
