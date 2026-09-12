import { NoeudCollection, PROFONDEUR_MAX } from './hierarchie';

/**
 * LA PROPAGATION EXPLICITE DES RÈGLES D'ACCÈS — le compensateur du
 * non-héritage. P6-1 bis, 12 septembre 2026.
 *
 * ## Pourquoi elle existe
 *
 * Les règles d'accès ne s'héritent PAS dans la hiérarchie (décision écrite en
 * tête d'`access-control.matching.ts`) : une sous-collection neuve n'autorise
 * personne, et la règle d'une faculté n'ouvre pas ses départements. C'est la
 * bonne décision — le danger de l'héritage est DIFFÉRÉ, il se manifeste sur une
 * sous-collection créée six mois plus tard que personne ne réexamine.
 *
 * Mais une décision dont le coût n'est pas payé se fait défaire par le premier
 * qui trouve ça lourd. Sans cette action, une règle doit être posée à la main
 * sur chaque collection d'un arbre.
 *
 * ## Ce qui la distingue de l'héritage, et c'est TOUT le propos
 *
 * L'héritage est un ÉTAT implicite : il s'applique à ce qui existera demain,
 * sans geste ni trace. La propagation est un ÉVÉNEMENT : elle ÉCRIT les règles,
 * une fois, sur des collections nommées, à une date, par quelqu'un, et elle
 * laisse une entrée d'audit. Une collection créée après n'est pas touchée.
 *
 * ⚠ Conséquence à assumer : modifier ensuite la règle du parent ne redescend
 * pas. Il faut repropager. C'est l'inconvénient du non-héritage, et il SE VOIT.
 */

/** Une règle telle qu'elle compte pour la propagation (l'identité, pas l'id). */
export interface RegleComparable {
  collectionId: string;
  tenantId: string;
  className: string | null;
  subscriptionTier: string | null;
}

/** Empreinte d'une règle SANS sa collection : deux règles identiques la partagent. */
export function empreinteDeRegle(r: RegleComparable): string {
  return JSON.stringify([r.tenantId, r.className, r.subscriptionTier]);
}

/** Ce qui arriverait à une collection descendante. */
export interface DestinationPropagation {
  collectionId: string;
  nom: string;
  /** Règles qui lui seraient AJOUTÉES (identité, sans id). */
  aAjouter: Omit<RegleComparable, 'collectionId'>[];
  /** Règles qu'elle porte DÉJÀ à l'identique — rien ne sera écrit pour elles. */
  dejaPresentes: number;
}

/** Une descendante ÉCARTÉE, avec son motif — jamais en silence. */
export interface Ecartee {
  collectionId: string;
  nom: string;
  motif: string;
}

export interface PlanDePropagation {
  /** Règles de la collection source qui seront propagées. */
  reglesSource: Omit<RegleComparable, 'collectionId'>[];
  /** Sous-collections SANS règle propre : elles recevront. */
  destinations: DestinationPropagation[];
  /**
   * Sous-collections qui portent DÉJÀ leurs propres règles — ÉPARGNÉES.
   *
   * ⚠ TROISIÈME CAS, AJOUTÉ LE 12 SEPTEMBRE 2026 SUR DÉCISION, et ma première
   * écriture avait tort de ne pas le distinguer.
   *
   * Je croyais être à l'abri parce que la propagation n'ÉCRASE rien : les
   * règles d'accès sont un OU de permissions, et les anciennes survivent. Le
   * danger est plus retors que l'écrasement. Une sous-collection restreinte
   * exprès à M2_DROIT qui reçoit en plus L1_DROIT garde sa règle restrictive —
   * VISIBLE dans la liste, rassurante — et n'est plus restreinte du tout. La
   * restriction survit à l'écran et meurt en fait : un faux silencieux de
   * droits, pire qu'une perte, parce qu'une perte se voit.
   *
   * D'où l'épargne PAR DÉFAUT. Écraser ou ajouter à une collection déjà réglée
   * sera un second geste explicite, jamais un effet de bord du premier.
   */
  epargnees: Epargnee[];
  ecartees: Ecartee[];
  /** Nombre TOTAL de règles qui seront écrites. C'est le chiffre qui compte. */
  reglesAEcrire: number;
}

/** Une sous-collection épargnée parce qu'elle porte ses propres règles. */
export interface Epargnee {
  collectionId: string;
  nom: string;
  /** Combien de règles PROPRES elle porte (pour cette école). */
  reglesPropres: number;
  motif: string;
}

/** Descendantes de `racine`, tous niveaux (la profondeur est bornée à 3). */
function descendantes(noeuds: NoeudCollection[], racine: string): string[] {
  const sortie: string[] = [];
  let niveau = [racine];
  const vus = new Set<string>();
  // ⚠ Borne de boucle : la profondeur est garantie ≤ PROFONDEUR_MAX par le
  // trigger, mais ce calcul ne le SUPPOSE pas — un garde-fou qui peut pendre
  // sur une donnée reprise d'ailleurs ne protège rien.
  for (let i = 0; i < PROFONDEUR_MAX && niveau.length > 0; i++) {
    const suivant: string[] = [];
    for (const courant of niveau) {
      for (const enfant of noeuds.filter((n) => n.parentId === courant)) {
        if (vus.has(enfant.id)) continue;
        vus.add(enfant.id);
        sortie.push(enfant.id);
        suivant.push(enfant.id);
      }
    }
    niveau = suivant;
  }
  return sortie;
}

/**
 * Calcule ce que la propagation FERAIT — sans rien écrire.
 *
 * ⚠ C'EST LA MOITIÉ EXIGÉE DU LOT : l'action LISTE ce qu'elle va toucher avant
 * d'écrire. Un élargissement de droits qui s'applique sans être montré est ce
 * que ce dépôt passe son temps à corriger.
 */
export function planifierPropagation(args: {
  noeuds: (NoeudCollection & { nom: string; tenantId: string | null })[];
  regles: RegleComparable[];
  sourceId: string;
  tenantId: string;
}): PlanDePropagation {
  const { noeuds, regles, sourceId, tenantId } = args;

  const reglesSource = regles
    .filter((r) => r.collectionId === sourceId && r.tenantId === tenantId)
    .map(({ collectionId: _, ...identite }) => identite);

  const destinations: DestinationPropagation[] = [];
  const epargnees: Epargnee[] = [];
  const ecartees: Ecartee[] = [];

  for (const id of descendantes(noeuds, sourceId)) {
    const noeud = noeuds.find((n) => n.id === id);
    if (!noeud) continue;

    // ⚠ ISOLATION : une descendante d'une AUTRE école est écartée, pas touchée.
    // La hiérarchie vit dans la table publique `collections` ; rien n'empêche
    // structurellement qu'un arbre traverse deux écoles, et propager y
    // donnerait à l'école A un droit sur le contenu de l'école B. Écartée AVEC
    // SON MOTIF : une omission silencieuse ferait croire que la propagation a
    // couvert tout l'arbre.
    if (noeud.tenantId !== null && noeud.tenantId !== tenantId) {
      ecartees.push({
        collectionId: id,
        nom: noeud.nom,
        motif: 'appartient à un autre établissement',
      });
      continue;
    }

    // ⚠ « SES PROPRES RÈGLES » VEUT DIRE « POUR CETTE ÉCOLE ». Une collection
    // partagée peut porter les règles d'une AUTRE école : elles ne la rendent
    // pas épargnée pour celle-ci, qui n'y a encore rien décidé.
    const propres = regles.filter(
      (r) => r.collectionId === id && r.tenantId === tenantId,
    );

    if (propres.length > 0) {
      epargnees.push({
        collectionId: id,
        nom: noeud.nom,
        reglesPropres: propres.length,
        motif: 'porte déjà ses propres règles d’accès',
      });
      continue;
    }

    destinations.push({
      collectionId: id,
      nom: noeud.nom,
      aAjouter: reglesSource,
      // Conservé à zéro : une destination est, par définition, SANS règle
      // propre. Le champ reste pour ne pas casser un client qui le lit.
      dejaPresentes: 0,
    });
  }

  return {
    reglesSource,
    destinations,
    epargnees,
    ecartees,
    reglesAEcrire: destinations.reduce((t, d) => t + d.aAjouter.length, 0),
  };
}
