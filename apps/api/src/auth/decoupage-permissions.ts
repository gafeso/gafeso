/**
 * Découpage des permissions — la table de correspondance, et rien d'autre.
 *
 * LE DÉFAUT CORRIGÉ. `etablissement.gerer` commandait SIX écrans — rappels,
 * statistiques, réglages, page d'accueil, interopérabilité et JOURNAL D'AUDIT —
 * sous le libellé affiché « Modifier l'identité visuelle de l'école ». Qui
 * cochait cette case pour laisser quelqu'un changer un logo lui ouvrait le
 * journal d'audit. L'écran des rôles affirmait quelque chose de faux : c'est
 * une élévation de privilège par étiquette.
 *
 * ⚠ CE LOT NE DÉPLACE PERSONNE. Il pose les nouvelles permissions et transfère
 * les attributions existantes À L'IDENTIQUE : personne ne perd un accès qu'il
 * avait, personne n'en gagne un. Les élargissements prévus au bénéfice du
 * Bibliothécaire sont une décision de COMPOSITION DES RÔLES, prise à part —
 * trois d'entre eux repliaient en réalité le rôle Gestionnaire sur le
 * Bibliothécaire, et `functionsForLegacyRole` étant fail-closed, y toucher ici
 * aurait risqué de faire PERDRE toutes ses fonctions à un compte MANAGER non
 * réaffecté.
 *
 * ⚠ LA CONDITION QUI REND CE TRANSFERT POSSIBLE, et qui a coûté deux
 * corrections de la table cible : une permission nouvelle ne doit être
 * l'image que d'UNE SEULE permission actuelle. Si deux anciennes permissions
 * détenues par des populations différentes visaient la même nouvelle, poser
 * cette nouvelle ferait forcément gagner l'une ou perdre l'autre — jamais ni
 * l'un ni l'autre.
 *
 * Deux cas l'ont montré :
 *  - `outils.utiliser` visait import de notices + récolement (venant de
 *    `catalogue.gerer`) ET import des étudiants (venant de
 *    `etudiants.importer`). Scindé en `outils.catalogue` / `outils.lecteurs`.
 *  - `lecteurs.gerer` aurait pu absorber `adherents.gerer` en plus de
 *    `classes.gerer` : mêmes populations disjointes, même faute. Il ne reçoit
 *    donc QUE `classes.gerer`, et `adherents.gerer` ne bouge pas.
 *
 * L'invariant est vérifié par un test, pas par relecture : voir
 * `decoupage-permissions.spec.ts`.
 */

import { FONCTIONS } from './functions';

/**
 * Composition des rôles système AVANT le découpage.
 *
 * Conservée telle quelle : c'est la référence contre laquelle le test prouve
 * que personne ne perd ni ne gagne, et c'est ce que la migration SQL retrouve
 * en base sur les établissements déjà provisionnés.
 */
export const FONCTIONS_SYSTEME_AVANT_DECOUPAGE: Record<string, string[]> = {
  Étudiant: [],
  Bibliothécaire: ['document.lire', 'catalogue.gerer', 'circulation.gerer', 'adherents.gerer'],
  Gestionnaire: [
    'document.lire',
    'etudiants.importer',
    'comptes.voir',
    'comptes.activer',
    'classes.gerer',
  ],
  Acquisitions: ['document.lire'],
  // L'Administrateur portait TOUTES les fonctions, et les porte toujours
  // toutes : sa ligne se vérifie par ce fait, pas par une liste figée qui
  // divergerait au prochain ajout.
};

/**
 * ANCIENNE fonction → NOUVELLE(S). Une entrée par permission qui change.
 *
 * Les permissions absentes de cette table ne changent pas : `document.lire`,
 * `document.telecharger`, `catalogue.gerer` (qui reste, tout en essaimant),
 * `adherents.gerer`, `comptes.activer`, `comptes.gerer`, `collections.gerer`.
 */
export const DECOUPAGE: Record<string, string[]> = {
  // Le point de bascule : six écrans sous un libellé qui en annonçait un.
  'etablissement.gerer': [
    FONCTIONS.ETABLISSEMENT_APPARENCE, // identité visuelle, page d'accueil, QR
    FONCTIONS.ETABLISSEMENT_REGLES, // règles de prêt
    FONCTIONS.DIFFUSION_GERER, // interopérabilité
    FONCTIONS.STATISTIQUES_VOIR, // statistiques
    FONCTIONS.SECURITE_AUDIT, // journal d'audit
    FONCTIONS.CIRCULATION_RETARDS, // rappels et retards
  ],
  // Le catalogue garde son nom ET essaime vers les outils qui en dépendent.
  // Une seule origine, donc aucune population nouvelle.
  'catalogue.gerer': [FONCTIONS.CATALOGUE_GERER, FONCTIONS.OUTILS_CATALOGUE],
  'etudiants.importer': [FONCTIONS.OUTILS_LECTEURS],
  'comptes.voir': [FONCTIONS.LECTEURS_VOIR],
  'classes.gerer': [FONCTIONS.LECTEURS_GERER],
  'circulation.gerer': [FONCTIONS.CIRCULATION_FAIRE],
  'roles.gerer': [FONCTIONS.SECURITE_ROLES],
};

/**
 * Applique le découpage à une liste de fonctions. Idempotente : une liste déjà
 * découpée la traverse sans changer — la migration peut donc être rejouée, et
 * un établissement provisionné APRÈS le changement n'est pas abîmé par un
 * second passage.
 */
export function fonctionsApresDecoupage(anciennes: string[]): string[] {
  const sortie = new Set<string>();
  for (const f of anciennes) {
    for (const n of DECOUPAGE[f] ?? [f]) sortie.add(n);
  }
  return [...sortie];
}
