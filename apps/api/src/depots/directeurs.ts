import { AccountStatus, UserRole } from '@prisma/client';
import {
  FONCTIONS,
  ROLES_SYSTEME,
  SELECTION_DES_FONCTIONS,
  fonctionsEffectives,
  type CompteResoluble,
} from '../auth/functions';

/**
 * QUI PEUT DIRIGER UN DÉPÔT — une décision, deux portes, et la même des deux
 * côtés.
 *
 * ⚠ LE DÉFAUT QUE CE FICHIER FERME. `exigerDirecteur` vérifiait que le compte
 * désigné EXISTE. Un dépôt adressé à un camarade était donc accepté, et il
 * restait « soumis » pour toujours : invisible de son destinataire, qui n'a pas
 * `depot.valider` et ne le voit dans aucune liste ; invisible du
 * bibliothécaire, qui ne voit que les dépôts VALIDÉS ; et l'étudiant attendait
 * une réponse que personne n'était en mesure de donner.
 *
 * Rien n'échouait, rien ne se passait. C'est le faux silencieux appliqué à un
 * CIRCUIT — et sa gravité est celle qu'on a nommée hier : il ne trompe pas
 * seulement, il IMMOBILISE. L'étudiant n'a aucun recours, parce qu'il n'a aucun
 * moyen d'apprendre que son dépôt est mort.
 *
 * ⚠ ET C'EST EXACTEMENT LA STRUCTURE « DEUX PORTES » du 12 septembre : une
 * propriété défendue par une décision, et une REQUÊTE qui pré-filtre en amont.
 * Ici les deux existent pour de bon — la garde à la désignation, la liste que
 * le menu déroulant affiche. Si elles divergent, le produit PROPOSE quelqu'un
 * qu'il REFUSE ensuite, ce qui est pire que les deux erreurs séparées : la
 * personne ne peut pas croire qu'elle s'est trompée, l'écran vient de le lui
 * proposer.
 *
 * D'où la forme retenue : le pré-filtre RÉDUIT, il ne décide pas. La décision
 * (`peutDirigerUnDepot`) repasse sur ce que la requête a rendu — donc une
 * erreur de `where` ne peut que faire manquer quelqu'un, jamais en ajouter un.
 */

/** La fonction qui FAIT un directeur. Il n'y en a pas d'autre définition. */
export const FONCTION_DU_DIRECTEUR: string = FONCTIONS.DEPOT_VALIDER;

/**
 * LA DÉCISION, pure — et la seule.
 *
 * Elle ne connaît ni les dépôts, ni les requêtes : elle reçoit un compte résolu
 * et se prononce. Un compte suspendu ou en attente ne porte aucune fonction
 * (fail-closed de `fonctionsEffectives`), donc ne dirige rien : un enseignant
 * suspendu ne doit pas rester dans le menu.
 */
export function peutDirigerUnDepot(compte: CompteResoluble | null | undefined): boolean {
  return fonctionsEffectives(compte).includes(FONCTION_DU_DIRECTEUR);
}

/**
 * Les rôles HÉRITÉS dont le repli porte la fonction — CALCULÉS, jamais listés.
 *
 * ⚠ Écrire `[UserRole.ADMIN]` serait une copie : vraie aujourd'hui, fausse le
 * jour où un rôle système gagne la fonction. Le pré-filtre serait alors plus
 * étroit que la décision, et quelqu'un d'éligible disparaîtrait du menu sans
 * que rien ne le signale.
 */
export const ROLES_HERITES_DIRECTEURS: UserRole[] = ROLES_SYSTEME.filter((r) =>
  (r.functions as readonly string[]).includes(FONCTION_DU_DIRECTEUR),
).map((r) => r.legacyRole);

/**
 * LE PRÉ-FILTRE SQL. Il réduit, il ne conclut pas.
 *
 * Deux branches, et elles suivent `fonctionsEffectives` ligne à ligne :
 *  · un rôle dynamique assigné → ce sont SES fonctions qui comptent ;
 *  · aucun rôle dynamique (`roleId: null`) → repli sur l'enum.
 *
 * ⚠ La seconde branche exige `roleId: null` et pas seulement le bon enum : un
 * compte ADMIN à qui l'école a donné un rôle dynamique restreint ne porte PLUS
 * les fonctions de l'enum. Sans ce `roleId: null`, la requête le proposerait et
 * la décision le refuserait — et ce serait un `OR` qui ouvre, pas un qui filtre.
 */

/** Branche 1 : un rôle dynamique est assigné, ce sont SES fonctions qui comptent. */
export const CANDIDAT_PAR_ROLE_DYNAMIQUE = {
  customRole: { functions: { has: FONCTION_DU_DIRECTEUR } },
};

/**
 * Branche 2 : aucun rôle dynamique, repli sur l'enum.
 *
 * ⚠ `roleId: null` n'est pas décoratif. Un compte ADMIN à qui l'école a donné
 * un rôle dynamique restreint ne porte PLUS les fonctions de l'enum. Sans cette
 * condition, la requête le proposerait et la décision le refuserait — un `OR`
 * qui ouvre au lieu de filtrer.
 */
export const CANDIDAT_PAR_ROLE_HERITE = {
  roleId: null,
  role: { in: ROLES_HERITES_DIRECTEURS },
};

export const OU_CANDIDAT_DIRECTEUR = {
  status: AccountStatus.ACTIVE,
  OR: [CANDIDAT_PAR_ROLE_DYNAMIQUE, CANDIDAT_PAR_ROLE_HERITE],
};

/**
 * Ce que la liste charge : l'identité affichable, plus ce qu'il faut pour
 * DÉCIDER. Pas un champ de plus.
 */
export const SELECTION_CANDIDAT_DIRECTEUR = {
  id: true,
  firstName: true,
  lastName: true,
  ...SELECTION_DES_FONCTIONS,
} as const;

/** Ce qui SORT — identifiant et nom affichable, et rien d'autre. */
export interface DirecteurDesignable {
  id: string;
  nom: string;
}

/**
 * La projection finale.
 *
 * ⚠ ELLE EST LA DERNIÈRE DÉFENSE, et c'est pour ça qu'elle est une fonction
 * nommée plutôt qu'un `.map` inline : ce qu'on affiche à un étudiant, ce n'est
 * pas « un compte », c'est « quelqu'un à qui adresser son mémoire ». Le
 * courriel, le matricule, le statut, le rôle et la classe du personnel ne le
 * regardent pas. Un `select` élargi par distraction ne doit rien pouvoir
 * ajouter ici.
 */
export function versDirecteurDesignable(compte: {
  id: string;
  firstName: string;
  lastName: string;
}): DirecteurDesignable {
  return { id: compte.id, nom: `${compte.firstName} ${compte.lastName}`.trim() };
}
