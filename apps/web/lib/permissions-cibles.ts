// ════════════════════════════════════════════════════════════════════════════
// ⚠ À LIRE EN PREMIER — LE PIÈGE DE CETTE TABLE
// ════════════════════════════════════════════════════════════════════════════
// UN ÉLARGISSEMENT DE DROITS SE CACHE DERRIÈRE UNE LIGNE D'APPARENCE
// IDENTIQUE — et depuis le 8 septembre 2026, c'est le cas de TOUTES les
// lignes qui restent ouvertes.
//
// Le découpage des permissions est LIVRÉ côté API : `lecteurs.voir`,
// `circulation.retards`, `outils.catalogue`, `securite.audit`… existent, et
// lib/navigation.ts les exige déjà. Il n'y a donc plus un seul renommage en
// attente, et `actuelle` vaut `cible` partout.
//
// CE QUI RESTE N'EST PLUS UNE QUESTION DE NOMS, MAIS DE COMPOSITION DES RÔLES.
// Cinq écrans que la maquette destine au Bibliothécaire exigent une fonction
// que son rôle système ne porte pas. Le jour où on la lui donnera, cinq écrans
// s'ouvriront à lui — sans qu'une seule ligne de cette table change.
//
// ⚠ ET LA DÉCISION EST PRISE, LE 10 SEPTEMBRE 2026 : ces cinq élargissements
// sont REPORTÉS après le 17 septembre, le temps d'avoir vu une bibliothécaire
// réelle se servir du produit. Ce n'est plus une question en attente de
// réponse — inutile de la reposer. Elle est suivie au backlog backend n°5.
//
// DONC : ne relisez JAMAIS cette table en comparant `actuelle` et `cible`.
// Elles sont égales partout, et l'égalité ne prouve rien. Lisez le champ
// `nature` ; `elargissements()` en donne la liste complète.
// ════════════════════════════════════════════════════════════════════════════
//
// Correspondance des permissions par écran : ce que le code exige, et ce que
// la cible prévoit.
//
// ⚠ CE FICHIER N'A AUCUN EFFET À L'EXÉCUTION. Il documente, il ne filtre pas.
// Le filtrage vit dans lib/navigation.ts, et lui seul.
//
// Sources : cible = docs/maquettes/maquette-roles.html (document interne, non
// versionné) ; fonctions réelles = apps/api/src/auth/functions.ts.

/**
 * Nature du changement, du point de vue des PERSONNES — pas des identifiants.
 */
export type NatureChangement =
  /** Le rôle qui atteint l'écran aujourd'hui est celui que la cible prévoit. */
  | 'inchangee'
  /**
   * DES PERSONNES QUI N'Y ONT PAS ACCÈS L'OBTIENDRAIENT. À valider comme une
   * décision métier. Depuis le découpage, cela passe par la COMPOSITION DU
   * RÔLE, jamais par un changement de nom.
   */
  | 'elargissement';

export interface CorrespondancePermission {
  /**
   * Fonction(s) exigées aujourd'hui — MIROIR EXACT de `fonctions` dans
   * lib/navigation.ts. Une liste, et non une phrase : un test compare les deux
   * à l'identique, ce qu'une formulation en prose (« A OU B ») interdirait.
   */
  actuelle: string[];
  /** Fonction(s) prévues par la maquette. Égales à `actuelle` depuis le découpage. */
  cible: string | string[];
  nature: NatureChangement;
  /** Qui gagnerait l'accès. Obligatoire sur un élargissement, absent sinon. */
  gagnants?: string[];
  note?: string;
}

/**
 * ⚠ MÉTHODE, pour que le classement soit rejouable.
 *
 * Comparaison faite sur le Bibliothécaire — le seul rôle système présent dans
 * les deux jeux qui ne soit pas tout-puissant. Ses fonctions réelles au
 * 8 septembre 2026 (apps/api/src/auth/functions.ts) :
 *
 *   document.lire · catalogue.gerer · outils.catalogue · circulation.faire ·
 *   adherents.gerer
 *
 * Un écran est « élargissement » si la maquette le lui destine et qu'il ne
 * détient pas la fonction exigée. Les rôles que la cible introduit (Agent de
 * guichet, Catalogueur, Direction) sont hors comparaison : composer un rôle
 * neuf n'élargit rien pour les personnes en place.
 */
export const METHODE_COMPARAISON =
  'Rôle témoin : Bibliothécaire. Administrateur exclu (toutes fonctions).';

/** Indexée par `href` — clé stable, alors que les libellés bougent. */
export const PERMISSIONS_CIBLES: Record<string, CorrespondancePermission> = {
  // ── Catalogue ────────────────────────────────────────────────────────────
  '/admin/catalogue': { actuelle: ['catalogue.gerer'], cible: 'catalogue.gerer', nature: 'inchangee' },
  '/admin/auteurs': { actuelle: ['catalogue.gerer'], cible: 'catalogue.gerer', nature: 'inchangee' },
  '/admin/categories': { actuelle: ['catalogue.gerer'], cible: 'catalogue.gerer', nature: 'inchangee' },
  // ⚠ AUCUN ÉLARGISSEMENT. `catalogue.gerer` ouvre déjà Notices, Auteurs et
  // Domaines : cet écran ajoute une PORTE à une fonction que ses détenteurs ont
  // déjà, il n'en donne à personne de nouvelle. C'est le dernier maillon du
  // circuit de dépôt — sans lui, un dépôt validé n'entre jamais au catalogue.
  // Aucun élargissement : `catalogue.gerer` ouvre déjà Notices, Auteurs,
  // Domaines et « Dépôts à cataloguer ». Une porte de plus sur une fonction que
  // ses détenteurs ont déjà.
  // Aucun élargissement : `outils.catalogue` ouvre déjà l'import de notices et
  // le récolement. Une porte de plus sur une fonction déjà détenue.
  '/admin/moissonnage': {
    actuelle: ['outils.catalogue'],
    cible: 'outils.catalogue',
    nature: 'inchangee',
  },
  // ⚠ La file du DIRECTEUR, passée de l'en-tête à la barre métier le
  // 15 septembre 2026. Aucun droit ne change : `depot.valider` la commandait
  // déjà comme lien d'en-tête. C'est un DÉMÉNAGEMENT, et il est déclaré ici
  // parce que cette table couvre toute entrée de la barre — sans quoi le garde
  // « sans entrée morte » la signalerait comme non déclarée.
  '/depots-a-valider': {
    actuelle: ['depot.valider'],
    cible: 'depot.valider',
    nature: 'inchangee',
  },
  '/admin/depots-soumis': {
    actuelle: ['catalogue.gerer'],
    cible: 'catalogue.gerer',
    nature: 'inchangee',
  },
  '/admin/depots-a-cataloguer': {
    actuelle: ['catalogue.gerer'],
    cible: 'catalogue.gerer',
    nature: 'inchangee',
  },
  '/admin/collections': {
    actuelle: ['collections.gerer'],
    cible: 'collections.gerer',
    nature: 'elargissement',
    gagnants: ['Bibliothécaire'],
    note: "Même identifiant des deux côtés : seul l'Administrateur porte collections.gerer, la maquette la donne aussi au Bibliothécaire.",
  },

  // ── Lecteurs ─────────────────────────────────────────────────────────────
  // ⚠ INCHANGÉE, et il faut le dire précisément : personne ne GAGNE un droit.
  // `adherents.gerer` était déjà au rôle Bibliothécaire depuis le découpage du
  // 8 septembre ; ce qui manquait était la PORTE, pas la clé. L'écran livré le
  // 10 septembre (backlog n° 8) ouvre une fonction déjà détenue — c'est
  // l'inverse d'un élargissement, et le classer autrement ferait soumettre une
  // décision qui n'a pas lieu d'être.
  '/admin/adherents': {
    actuelle: ['adherents.gerer'],
    cible: 'adherents.gerer',
    nature: 'inchangee',
  },
  '/admin/comptes': {
    actuelle: ['lecteurs.voir'],
    cible: 'lecteurs.voir',
    nature: 'inchangee',
    note: "⚠ ACCORDÉ LE 14 SEPTEMBRE 2026, donc plus un élargissement en attente : le Bibliothécaire porte désormais lecteurs.voir. Motif et portée mesurée dans ELARGISSEMENTS_ACCORDES (apps/api). Une seule route, en LECTURE — activer un compte, y poser un rôle, importer ou gérer les classes gardent leurs propres fonctions, qu'il ne porte pas.",
  },
  '/admin/classes': {
    actuelle: ['lecteurs.gerer'],
    cible: 'lecteurs.gerer',
    nature: 'elargissement',
    gagnants: ['Bibliothécaire'],
  },

  // ── Guichet ──────────────────────────────────────────────────────────────
  '/guichet': { actuelle: ['circulation.faire'], cible: 'circulation.faire', nature: 'inchangee' },
  /**
   * ⚠ RÉTRÉCISSEMENT, ET IL SE DIT — c'est le seul de cette table. L'écran a
   * vécu quatre jours sous `circulation.faire` ; ses quatre routes exigent
   * `etablissement.regles` depuis le 26 septembre 2026. Le Bibliothécaire
   * perd donc l'accès, LECTURE COMPRISE.
   *
   * ⚠ Mesuré sur `ROLES_SYSTEME` plutôt que supposé : `etablissement.regles`
   * est portée par l'ADMINISTRATEUR SEUL — le Gestionnaire ne l'a pas non
   * plus. Un rétrécissement n'a pas à être soumis (rien ne s'expose), mais il
   * a à être ÉCRIT : c'est la catégorie où une erreur ne casse rien, elle
   * retire.
   *
   * ⚠ Et ce n'est pas un choix du front. Garder `circulation.faire` ici
   * laisserait au Bibliothécaire une entrée visible dont l'API refuse les
   * quatre routes — exactement le défaut que le protocole appelle « un bouton
   * sans effet ». On garde sur ce que la route demande, jamais sur ce qu'on
   * trouverait plus généreux.
   */
  '/admin/regles-de-circulation': {
    actuelle: ['etablissement.regles'],
    cible: 'etablissement.regles',
    // ⚠ `inchangee` reste le mot juste, et il faut le dire pour qu'on ne le
    // corrige pas de travers : la nature qualifie l'écart entre `actuelle` et
    // `cible` DANS CETTE TABLE, pas l'histoire de l'écran. Les deux valeurent
    // `etablissement.regles`, donc la migration ne déplace rien. Le
    // vocabulaire ne connaît que `inchangee` et `elargissement` — un
    // rétrécissement n'a pas de mot ici, et c'est volontaire : seul ce qui
    // EXPOSE doit être soumis. Il est écrit dans la note.
    nature: 'inchangee',
    // ⚠ PAS de `gagnants: []` — le garde exige l'ABSENCE de la clé quand rien
    // n'est élargi, et il a raison : un tableau vide se lit comme « on a
    // regardé et il n'y en a pas », alors qu'ici la question ne se pose pas.
    note: "Écran neuf du 22 septembre 2026 (dette n° 15), passé de Guichet à Administration le 26 septembre. ⚠ RÉTRÉCISSEMENT : ses quatre routes /circulation/rules exigeaient circulation.faire, elles exigent etablissement.regles depuis le découplage du module amendes — le Bibliothécaire perd l'écran, lecture comprise (etablissement.regles est portée par l'Administrateur seul, mesuré sur ROLES_SYSTEME). Motif du découplage : trois des quatre champs (durée, plafond de prêts, plafond de renouvellements) n'ont rien à voir avec les amendes et le service les lit directement — une école qui éteignait le module voyait ses durées appliquées et leur réglage inatteignable.",
  },
  '/admin/rappels': {
    actuelle: ['circulation.retards'],
    cible: 'circulation.retards',
    nature: 'elargissement',
    gagnants: ['Bibliothécaire'],
    note: "⚠ ACCORDÉ LE 15 SEPTEMBRE 2026 : le Bibliothécaire porte désormais circulation.retards — la LECTURE seule. La fonction a été SCINDÉE pour le rendre possible : elle gardait aussi POST /reminders/run (un courriel à TOUS les adhérents en retard) et PATCH settings (le texte qui partira). Ces deux-là exigent en plus rappels.envoyer, que seul l'Administrateur porte. Notre fonction était plus large que son modèle : overdues_report de Koha est un droit de LECTURE. Motif et portée mesurée dans ELARGISSEMENTS_ACCORDES (apps/api).",
  },

  // ── Outils ───────────────────────────────────────────────────────────────
  '/admin/outils/import-notices': {
    actuelle: ['outils.catalogue'],
    cible: 'outils.catalogue',
    nature: 'inchangee',
  },
  '/admin/recolement': { actuelle: ['outils.catalogue'], cible: 'outils.catalogue', nature: 'inchangee' },
  '/admin/import-etudiants': {
    actuelle: ['outils.lecteurs'],
    cible: 'outils.lecteurs',
    nature: 'elargissement',
    gagnants: ['Bibliothécaire'],
    note: "L'ÉLARGISSEMENT ENCORE BLOQUÉ. L'API a scindé les outils en outils.catalogue et outils.lecteurs ; le Bibliothécaire ne porte que le premier. La maquette lui destinait les imports dans leur ensemble — importer la liste des étudiants attendus reste donc hors de sa portée tant que ce n'est pas tranché.",
  },

  // ── Pilotage ─────────────────────────────────────────────────────────────
  '/admin/statistiques': {
    actuelle: ['statistiques.voir'],
    cible: 'statistiques.voir',
    nature: 'inchangee',
    note: "Écran porté par le module « statistiques » dans la cible, mais GARDÉ VISIBLE : il existe et fonctionne, le masquer serait une régression. La maquette le destine au rôle Direction, que la cible introduit — donc aucun élargissement pour les rôles en place.",
  },  '/admin/rapport-annuel': {
    actuelle: ['statistiques.voir'],
    cible: 'statistiques.voir',
    nature: 'inchangee',
    note: "Écran neuf (P8-3, 15 septembre 2026). Même fonction et même module que le tableau de bord : c'est la même donnée, lue autrement. Aucun élargissement — `statistiques.voir` n'est porté que par l'Administrateur, avant comme après.",
  },


  // ── Paramétrage ──────────────────────────────────────────────────────────
  // ⚠ L'ENTRÉE À DEUX PERMISSIONS A DISPARU le 11 septembre 2026, et c'est la
  // dette n° 2 qui se referme : un écran qui en réclamait deux est devenu deux
  // écrans qui en réclament une chacun. Personne ne gagne ni ne perd un droit —
  // les mêmes personnes atteignent les mêmes fonctions, par deux portes.
  // Écran né avec la fonction : personne ne l'atteignait avant, personne ne
  // perd rien. `modules.gerer` n'est portée que par l'Administrateur.
  '/admin/modules': {
    actuelle: ['modules.gerer'],
    cible: 'modules.gerer',
    nature: 'inchangee',
  },
  '/admin/etablissement': {
    actuelle: ['etablissement.apparence'],
    cible: 'etablissement.apparence',
    nature: 'inchangee',
  },
  '/admin/regles-de-pret': {
    actuelle: ['etablissement.regles'],
    cible: 'etablissement.regles',
    nature: 'inchangee',
  },
  '/admin/accueil': {
    actuelle: ['etablissement.apparence'],
    cible: 'etablissement.apparence',
    nature: 'inchangee',
  },
  '/admin/interoperabilite': {
    actuelle: ['diffusion.gerer'],
    cible: 'diffusion.gerer',
    nature: 'inchangee',
  },

  // ── Sécurité ─────────────────────────────────────────────────────────────
  '/admin/roles': { actuelle: ['securite.roles'], cible: 'securite.roles', nature: 'inchangee' },
  '/admin/journal': { actuelle: ['securite.audit'], cible: 'securite.audit', nature: 'inchangee' },
};

/**
 * `etablissement.gerer` commandait à lui seul SIX entrées — rappels,
 * statistiques, réglages, page d'accueil, interopérabilité, journal d'audit.
 * Il n'existe plus : l'API l'a éclaté. Conservé ici comme repère historique,
 * parce que c'est le défaut qui a motivé tout le chantier.
 */
export const PERMISSION_HISTORIQUE_SURCHARGEE = 'etablissement.gerer';

/** Les écrans qui s'ouvriraient à de nouvelles personnes. À décider, pas à appliquer. */
export function elargissements(): [string, CorrespondancePermission][] {
  return Object.entries(PERMISSIONS_CIBLES).filter(([, c]) => c.nature === 'elargissement');
}
