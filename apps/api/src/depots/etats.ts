/**
 * LES ÉTATS D'UN DÉPÔT, et qui les fait changer. P6-2.
 *
 * ```
 *   brouillon ──soumettre──▶ soumis ──valider──▶ valide ──cataloguer──▶ (notice)
 *   (étudiant)      ▲        (étudiant)          (directeur)   (bibliothécaire)
 *                   │            │
 *                   │            └──refuser──▶ refuse  (motif, jamais effacé)
 *                   │            │
 *                   └──retirer───┘  (le DÉPOSANT reprend la main)
 *
 * ⚠ Et hors machine à états : le BIBLIOTHÉCAIRE peut RÉATTRIBUER un dépôt
 * soumis à un autre directeur — le dépôt reste `soumis`, seul son directeur
 * change.
 * ```
 *
 * ⚠ QUATRE ÉTATS, ET `recordId` N'EN EST PAS UN CINQUIÈME.
 *
 * Le directeur valide le CONTENU ; le bibliothécaire complète la DESCRIPTION et
 * c'est lui qui crée la notice (décision du 12 septembre : un étudiant n'a pas à
 * fournir trois mots-clés, c'est du catalogage et il les choisirait mal).
 *
 * On pourrait en tirer un état `valide_non_catalogue`. Ce serait une faute :
 * « le directeur a-t-il validé ? » et « la notice existe-t-elle ? » sont deux
 * questions sur deux AXES. Les fondre dans un enum obligerait à inventer un
 * état par combinaison, et le jour où un catalogage se défait, l'enum mentirait
 * alors que `recordId` dirait vrai.
 *
 * ⚠ MAIS LA DÉRIVATION SE NOMME UNE SEULE FOIS. Un `status === 'valide' &&
 * recordId === null` recopié dans cinq requêtes est exactement la forme qui
 * dérive : c'est `enAttenteDeCatalogage` ci-dessous, et rien d'autre.
 */

export const ETATS_DEPOT = ['brouillon', 'soumis', 'valide', 'refuse'] as const;
export type EtatDepot = (typeof ETATS_DEPOT)[number];

/**
 * État d'un dépôt qui vient d'être créé.
 *
 * ⚠ Il est aussi le DÉFAUT de la colonne `status` en base. `etats.spec.ts`
 * relit le SQL de la migration pour vérifier qu'ils s'accordent — deux
 * endroits, une seule valeur, et la divergence impossible en silence.
 */
export const ETAT_INITIAL: EtatDepot = 'brouillon';

/** Qui agit, pour que le refus puisse le dire. */
export type ActeurDepot = 'deposant' | 'directeur' | 'bibliothecaire';

interface Transition {
  de: EtatDepot;
  vers: EtatDepot;
  par: ActeurDepot;
  /** Verbe, pour les messages. */
  geste: string;
}

/**
 * Les transitions PERMISES, et elles seules. Toute autre est refusée.
 *
 * ⚠ AUCUN RETOUR EN ARRIÈRE depuis `refuse`. Un dépôt refusé reste refusé, avec
 * son motif : le rouvrir effacerait la décision d'un directeur. Un étudiant qui
 * veut redéposer crée un NOUVEAU dépôt — et les deux restent, ce qui est
 * précisément ce qu'on veut voir.
 */
export const TRANSITIONS: Transition[] = [
  { de: 'brouillon', vers: 'soumis', par: 'deposant', geste: 'soumettre' },
  { de: 'soumis', vers: 'valide', par: 'directeur', geste: 'valider' },
  { de: 'soumis', vers: 'refuse', par: 'directeur', geste: 'refuser' },
  // ⚠ LA SORTIE QUI MANQUAIT, ET C'ÉTAIT UN DÉFAUT DE CONCEPTION.
  //
  // `soumis` avait deux sorties, toutes deux réservées au DIRECTEUR DÉSIGNÉ —
  // et `PATCH :id/directeur` refusait tout ce qui n'est pas un brouillon. Si
  // ce directeur perdait `depot.valider` — rôle changé, compte désactivé,
  // départ de l'établissement — le dépôt n'avait PLUS AUCUNE SORTIE. Le
  // déposant ne pouvait pas le retirer, personne ne pouvait réattribuer, et
  // l'étudiant lisait « en attente de votre directeur » pour toujours.
  //
  // ⚠ C'était le SEUL état du circuit dont la sortie dépendait de QUELQU'UN
  // D'AUTRE. Un cas rare qui n'a aucune sortie n'est pas rare pour celui qui
  // le vit — et un enseignant qui part est ordinaire dans une université.
  { de: 'soumis', vers: 'brouillon', par: 'deposant', geste: 'retirer' },
];

/**
 * La transition est-elle permise ? Rend `null` si oui, le message FRANÇAIS du
 * refus sinon.
 *
 * ⚠ LE REFUS DIT L'ÉTAT COURANT. « Transition invalide » enverrait chercher une
 * erreur de saisie ; « ce dépôt est déjà validé » se comprend.
 */
export function refusDeTransition(
  courant: EtatDepot,
  vers: EtatDepot,
  par: ActeurDepot,
): string | null {
  const permise = TRANSITIONS.find((t) => t.de === courant && t.vers === vers);
  if (!permise) {
    const possibles = TRANSITIONS.filter((t) => t.de === courant).map((t) => t.geste);
    return possibles.length > 0
      ? `Ce dépôt est « ${courant} » : seul ${possibles.join(' ou ')} est possible.`
      : `Ce dépôt est « ${courant} » et n'accepte plus aucun changement.`;
  }
  if (permise.par !== par) {
    return `Seul le ${permise.par === 'deposant' ? 'déposant' : permise.par} peut ${permise.geste} ce dépôt.`;
  }
  return null;
}

/** Un dépôt validé dont la notice n'existe pas encore : le travail du bibliothécaire. */
export function enAttenteDeCatalogage(depot: {
  status: string;
  recordId: string | null;
}): boolean {
  return depot.status === 'valide' && depot.recordId === null;
}

/**
 * ⚠ UN DÉPÔT N'EST JAMAIS PUBLIC, QUEL QUE SOIT SON ÉTAT.
 *
 * C'est la propriété la plus coûteuse de la phase si elle se perd : un dépôt
 * non validé qui sort en OAI est archivé par un tiers, et c'est irrattrapable.
 *
 * Elle est garantie par CONSTRUCTION, et c'est mieux qu'une garde : `deposits`
 * est une table DISTINCTE, et l'OPAC comme l'entrepôt OAI ne lisent que
 * `biblio_records`. Il n'y a donc rien à filtrer — il n'y a rien à voir. Ce
 * qui devient public, c'est la NOTICE créée au catalogage, et elle seule.
 *
 * `jamais-public.spec.ts` porte l'invariant : aucun fichier d'`opac`, d'`oai`
 * ou de `tenancy` ne mentionne `deposit`. Un garde négatif, mais qui tombe le
 * jour où quelqu'un « enrichit » l'OPAC des dépôts en cours.
 */
export const TABLES_JAMAIS_PUBLIQUES = ['deposits'] as const;
