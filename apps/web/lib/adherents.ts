// Adhérents — contrat de l'API et petites conversions d'affichage.
//
// ⚠ Le type vient de ce que l'API rend RÉELLEMENT, mesuré sur /docs-json et sur
// apps/api/src/patrons le 10 septembre 2026 — pas de ce qu'on aimerait qu'elle
// rende. Les manques connus sont écrits ici pour que le prochain lecteur ne les
// redécouvre pas :
//   — `Patron` ne porte NI prénom NI nom : ils viennent du compte lié, quand il
//     y en a un (backlog n° 10) ;
//
// ⚠ TROIS MANQUES SIGNALÉS LE 10 SEPTEMBRE ONT ÉTÉ SERVIS LE 11 (lot backend
// 2695ca2), et ce commentaire les garde pour mémoire plutôt que de faire comme
// s'ils n'avaient jamais existé :
//   — la recherche `q` ne portait QUE sur le code-barres ; elle couvre
//     désormais code-barres, prénom, nom et e-mail, insensible à la casse ;
//   — aucune route ne rendait l'HISTORIQUE de prêt d'un adhérent ;
//     `GET /patrons/:id/loans` le rend, paginé ;
//   — la situation de circulation ne rendait pas le `recordId`, donc aucun lien
//     vers la notice n'était constructible ; il y est.
//
// Reste dû : `Patron` ne porte toujours pas de nom (backlog n° 10).

export interface CompteLie {
  firstName: string;
  lastName: string;
  email: string;
}

export interface Adherent {
  id: string;
  /** ⚠ Le nom appartient à la CARTE depuis A2 — il n'est plus emprunté au compte. */
  firstName: string | null;
  lastName: string | null;
  barcode: string;
  category: string;
  userId: string | null;
  registrationDate: string;
  expiryDate: string | null;
  user: CompteLie | null;
}

export interface PageAdherents {
  total: number;
  page: number;
  totalPages: number;
  patrons: Adherent[];
}

/** Fiche : l'adhérent, plus deux compteurs calculés par l'API. */
export interface FicheAdherent extends Adherent {
  openCheckouts: number;
  activeHolds: number;
  /**
   * Le nom de la carte diffère de celui du compte lié.
   *
   * ⚠ C'est un SIGNAL, pas une anomalie. Le nom est recopié du compte à la
   * liaison puis appartient à la carte : la bibliothécaire peut le corriger, et
   * le compte peut changer de son côté. Un désaccord est donc souvent le
   * résultat VOULU d'un geste — nom d'épouse, orthographe rectifiée, prénom
   * d'usage. L'API le dit et ne décide rien ; l'écran l'affiche en information,
   * jamais en avertissement.
   */
  nomsDivergents: boolean;
}

/** Un prêt EN COURS, tel que /circulation/patrons/:id le rend. */
export interface PretEnCours {
  checkoutId: string;
  /** Depuis le 11 septembre 2026 : c'est lui qui rend le titre cliquable. */
  recordId: string;
  title: string;
  itemBarcode: string;
  dueDate: string;
  renewals: number;
  overdue: boolean;
  accruedFineXof: number;
}

/** Une ligne d'historique : un prêt RENDU. */
export interface PretRendu {
  checkoutId: string;
  recordId: string;
  title: string;
  itemBarcode: string;
  checkoutDate: string;
  dueDate: string;
  returnDate: string;
}

/**
 * `GET /patrons/:id/loans` — prêts en cours ET historique paginé.
 *
 * ⚠ On n'en lit QUE `history` : les prêts en cours viennent de
 * /circulation/patrons/:id, seul endroit où l'amende courue est calculée avec
 * les règles de circulation. La recalculer ici inventerait un chiffre.
 */
export interface PretsDAdherent {
  current: PretEnCours[];
  history: { entries: PretRendu[]; total: number; page: number; totalPages: number };
  counters: { current: number; overdue: number };
}

/** Combien de lignes d'historique par page. */
export const HISTORIQUE_PAR_PAGE = 10;

export interface ReservationActive {
  holdId?: string;
  id?: string;
  title?: string;
  status?: string;
}

export interface SituationAdherent {
  patron: { id: string; barcode: string; category: string };
  checkouts: PretEnCours[];
  holds: ReservationActive[];
  fines: { recordedXof: number; accruingXof: number; totalXof: number };
}

/** Combien d'adhérents par page. Le maximum accepté par l'API est 100. */
export const PAR_PAGE = 20;

/**
 * Nom affichable d'un adhérent, ou `null` s'il n'y en a pas.
 *
 * ⚠ Rend `null` PLUTÔT qu'une chaîne vide ou le code-barres : c'est à l'écran
 * de décider quoi dire d'une carte anonyme, et il doit pouvoir le distinguer
 * d'un nom. Un repli silencieux sur le code-barres ferait passer un manque
 * pour une donnée.
 */
export function nomAffichable(adherent: {
  firstName?: string | null;
  lastName?: string | null;
  user: CompteLie | null;
}): string | null {
  // ⚠ ORDRE : la carte d'abord, le compte ensuite. Le nom appartient à la carte
  // depuis A2 ; le compte n'est plus qu'un repli pour les cartes créées avant,
  // qui n'ont pas de nom propre. Inverser l'ordre ferait réapparaître le nom du
  // compte par-dessus une correction délibérée de la bibliothécaire.
  const propre = `${adherent.firstName ?? ''} ${adherent.lastName ?? ''}`.trim();
  if (propre !== '') return propre;
  const u = adherent.user;
  if (!u) return null;
  const emprunte = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  // ⚠ `null` PLUTÔT QU'UN REPLI sur le code-barres : les cartes créées avant la
  // migration n'ont pas de nom, et l'écran doit distinguer une ABSENCE d'une
  // chaîne vide. C'est à lui de décider quoi en dire.
  return emprunte === '' ? null : emprunte;
}

/** Nom du compte lié, pour l'afficher quand il diffère de celui de la carte. */
export function nomDuCompte(adherent: { user: CompteLie | null }): string | null {
  const u = adherent.user;
  if (!u) return null;
  const nom = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return nom === '' ? null : nom;
}

/** Jours de retard d'un prêt, 0 s'il est à l'heure. Borne basse à 0. */
export function joursDeRetard(echeance: string, maintenant: Date = new Date()): number {
  const jour = 24 * 60 * 60 * 1000;
  const ecart = maintenant.getTime() - new Date(echeance).getTime();
  return ecart <= 0 ? 0 : Math.floor(ecart / jour);
}

const FCFA = new Intl.NumberFormat('fr-FR');
export const francs = (montant: number) => `${FCFA.format(montant)} FCFA`;

export const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso));
