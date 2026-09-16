// Navigation du personnel — DONNÉES SEULES, aucun composant, aucun JSX.
//
// Séparée des composants pour être testable en isolation : le contrôle négatif
// de la recette (« la recette échoue si on rétablit l'ancienne navigation »)
// n'est mécanisable que si la structure de la nav est une valeur qu'on peut
// examiner, et non un arbre de <Link> à parcourir dans un DOM rendu.
//
// Découpage repris de docs/maquettes/maquette-navigation-v2.html, qui fait foi
// pour la STRUCTURE et les LIBELLÉS. Métiers en haut, « Outils » pour les
// opérations ponctuelles, « Administration » réservée au paramétrage.
//
// ⚠ Le découpage des permissions est ARRIVÉ (API, 8 septembre 2026) : le champ
// `fonctions` porte les noms que `GET /auth/me/functions` renvoie réellement.
// Les anciens (`comptes.voir`, `classes.gerer`, `circulation.gerer`,
// `etudiants.importer`, `roles.gerer`, `etablissement.gerer`) n'existent plus
// côté API — les laisser ici ferait disparaître les entrées pour TOUT LE MONDE,
// administrateur compris, puisque le filtre est un `includes`.
//
// lib/permissions-cibles.ts reste : il ne porte plus des renommages à venir
// mais les ÉLARGISSEMENTS DE RÔLE encore en attente de décision.

export interface EntreeNav {
  /**
   * Module dont cette entrée dépend — P4-3. Absent = le noyau, toujours actif.
   *
   * ⚠ TROIS ENTRÉES SEULEMENT en portent un, et c'est mesuré sur le registre de
   * l'API : `amendes`, `interoperabilite` et `rappels` sont les seuls modules
   * non-noyau déclarés. Les autres écrans relèvent du noyau, qui ne se
   * désactive pas — leur en attribuer un serait inventer une dépendance.
   *
   * ⚠ Et `amendes` N'A PAS d'entrée de menu : les amendes s'affichent DANS le
   * guichet et DANS la fiche d'adhérent, écrans du noyau. Éteindre ce module
   * ne retire donc pas une entrée mais des blocs — c'est le lot P4-4, pas
   * celui-ci. Le dire ici évite qu'on croie l'avoir traité.
   */
  module?: string;
  /** Clé stable de l'entrée : les libellés bougent, les routes non. */
  href: string;
  libelle: string;
  /**
   * Fonctions dont il faut détenir AU MOINS UNE pour voir l'entrée.
   *
   * Une liste, et non une fonction unique, parce que `/admin/parametres` en
   * exige deux : l'écran porte à la fois l'apparence de l'établissement et ses
   * règles de prêt. C'est le signal qu'il doit être coupé en deux (dette n° 2
   * de docs/DEMARRER-FRONT.md) ; en attendant, qui détient l'une OU l'autre
   * doit pouvoir l'atteindre.
   *
   * L'API reste seule autorité sur l'action elle-même.
   */
  fonctions: string[];
  /** Sous-groupe dans la barre latérale (les « § » de la maquette). */
  groupe?: string;
  /**
   * Ce que l'écran permet de faire, en une phrase — pour une PAGE DE
   * RUBRIQUES, où un lien nu ne suffit pas.
   *
   * ⚠ Elle décrit l'EFFET, jamais le contenu de l'écran : « Allumer ou éteindre
   * les fonctions de l'école » plutôt que « Liste des modules ». C'est la
   * forme retenue par Koha sur sa page d'administration, et elle a une raison
   * — un paramétrage se cherche par ce qu'on veut obtenir, pas par le nom que
   * le logiciel a donné à son écran.
   */
  description?: string;
  /**
   * Module porteur prévu par la cible. PUREMENT DOCUMENTAIRE : aucun effet à
   * l'exécution tant que le registre de modules n'existe pas. On ne câble pas
   * une condition qui vaudrait « absent » par défaut — elle masquerait des
   * écrans qui marchent.
   */
  modulePrevu?: string;
}

export interface OngletNav {
  id: string;
  libelle: string;
  entrees: EntreeNav[];
  /**
   * PAGE D'INDEX de l'onglet, quand ses écrans se présentent en RUBRIQUES
   * plutôt qu'en barre latérale.
   *
   * ⚠ POURQUOI « Administration » en porte une. Le titre de la barre latérale
   * reprenait le libellé de l'onglet actif : « Administration » s'affichait
   * donc deux fois, l'une sous l'autre. Si un sous-menu répète le nom de son
   * parent, il y a un niveau de trop (Jean, 15 septembre 2026).
   *
   * ⚠ Et le paramétrage est le cas où une barre latérale sert le moins : sept
   * entrées muettes qu'on parcourt en devinant. Koha, vérifié dans son gabarit
   * source `admin-home.tt`, en fait une page à deux colonnes, sans barre
   * latérale, avec un titre par rubrique et des liens DÉCRITS.
   *
   * ⚠ CE QU'ON NE SUIT PAS DE KOHA : chez lui, Administration n'est même pas
   * un onglet de premier niveau (on y arrive par « More »). Sortir le
   * paramétrage de la barre de travail irait plus loin que ce qui a été
   * décidé — l'onglet reste.
   */
  pageDeRubriques?: string;
}

/**
 * Les onglets, dans l'ordre de la maquette.
 *
 * N'y figurent QUE les entrées qui ont un écran. Une entrée inerte est pire
 * qu'une entrée absente : elle promet un écran qui n'existe pas. Ce qui est
 * délibérément absent est listé plus bas dans ENTREES_ECARTEES — pour que rien
 * ne disparaisse en silence.
 */
export const NAVIGATION_PERSONNEL: OngletNav[] = [
  {
    id: 'catalogue',
    libelle: 'Catalogue',
    entrees: [
      {
        href: '/admin/catalogue',
        libelle: 'Notices',
        fonctions: ['catalogue.gerer'],
        description: 'Chercher, créer et corriger les notices du fonds.',
      },
      {
        href: '/admin/auteurs',
        libelle: 'Auteurs',
        fonctions: ['catalogue.gerer'],
        description: 'Le fichier d’autorité : fusionner les doublons, relier un compte à sa fiche.',
      },
      // « Catégories » renommé « Domaines » : c'est le mot du métier, et c'est
      // déjà celui de l'API et du compte rendu d'import. La ROUTE ne bouge pas
      // (/admin/categories) — donc aucun lien en circulation ne casse.
      {
        href: '/admin/categories',
        libelle: 'Domaines',
        fonctions: ['catalogue.gerer'],
        description: 'Les domaines qui classent le fonds et alimentent les facettes publiques.',
      },
      {
        href: '/admin/collections',
        libelle: 'Collections',
        fonctions: ['collections.gerer'],
        description: 'Regrouper des documents et décider QUI y accède, par classe ou par abonnement.',
      },
      // ⚠ Le dernier maillon du circuit de dépôt. Sans cette entrée, un dépôt
      // validé par son directeur n'entre JAMAIS au catalogue : il reste dans
      // une table que rien n'expose. `catalogue.gerer` ouvre déjà les trois
      // entrées ci-dessus — aucun droit nouveau n'est accordé ici.
      // ⚠ AVANT « à cataloguer » dans l'ordre du travail : ce qui ATTEND une
      // décision précède ce qui attend une notice. Même fonction, aucune porte
      // nouvelle — `catalogue.gerer` ouvre déjà les quatre entrées ci-dessus.
      // ⚠ TROIS FILES DE TRAVAIL, GROUPÉES — et la première vient de l'en-tête.
      //
      // « Dépôts à valider » était un lien de la barre du haut, à côté de « Mes
      // prêts » et « Mon compte ». Le critère qui l'en sort, posé le 15
      // septembre 2026 : si le titre commence par « Mon » ou « Mes », c'est la
      // personne ; si c'est une FILE D'ATTENTE, c'est le métier. Un directeur
      // n'y consulte pas SON dépôt, il traite ceux des autres — exactement
      // comme un bibliothécaire traite des retours.
      //
      // ⚠ ELLE N'OUVRE AUCUN DROIT NOUVEAU : `depot.valider` est la fonction
      // qu'elle exigeait déjà dans l'en-tête. Ce qui change est l'ENDROIT, pas
      // qui y accède. Un enseignant sans `catalogue.gerer` voit donc l'onglet
      // « Catalogue » avec cette seule entrée, et c'est correct : la barre
      // montre ce à quoi on a droit, jamais une carte du logiciel entier.
      {
        href: '/depots-a-valider',
        description: 'La file d’un directeur : accepter ou refuser les dépôts qu’il dirige.',
        libelle: 'Dépôts à valider',
        fonctions: ['depot.valider'],
        groupe: 'Dépôts',
        module: 'depot',
      },
      {
        href: '/admin/depots-soumis',
        description: 'Les dépôts validés par un directeur, en attente de catalogage.',
        libelle: 'Dépôts en attente',
        fonctions: ['catalogue.gerer'],
        groupe: 'Dépôts',
        module: 'depot',
      },
      {
        href: '/admin/depots-a-cataloguer',
        description: 'Transformer un dépôt validé en notice du catalogue.',
        libelle: 'Dépôts à cataloguer',
        fonctions: ['catalogue.gerer'],
        groupe: 'Dépôts',
        module: 'depot',
      },
    ],
  },
  {
    id: 'lecteurs',
    libelle: 'Lecteurs',
    entrees: [
      // Inscrire un lecteur n'est pas un acte d'administration : c'est le
      // travail quotidien d'une bibliothécaire. D'où la remontée en onglet.
      // ⚠ EN TÊTE de l'onglet : inscrire et retrouver un lecteur est le geste
      // quotidien ; « Comptes » et « Classes » relèvent de l'administration des
      // inscriptions. Et c'est la SEULE entrée de tout le menu qu'une
      // bibliothécaire peut voir ici — sans elle, l'onglet Lecteurs lui restait
      // entièrement fermé alors qu'elle détient `adherents.gerer` (backlog n° 8).
      {
        href: '/admin/adherents',
        libelle: 'Adhérents',
        fonctions: ['adherents.gerer'],
        description: 'Les cartes de lecteur : créer, prolonger, consulter prêts et amendes.',
      },
      {
        href: '/admin/comptes',
        libelle: 'Comptes',
        fonctions: ['lecteurs.voir'],
        description: 'Les comptes de l’école : activer une inscription, poser un rôle.',
      },
      {
        href: '/admin/classes',
        libelle: 'Classes',
        fonctions: ['lecteurs.gerer'],
        description: 'Les classes et leurs inscrits — le nom technique sert aux règles d’accès.',
      },
    ],
  },
  {
    id: 'guichet',
    libelle: 'Guichet',
    entrees: [
      {
        href: '/guichet',
        libelle: 'Prêt et retour',
        fonctions: ['circulation.faire'],
        description: 'Prêter, rendre, encaisser une amende — au code-barres.',
      },
      {
        href: '/admin/rappels',
        description: 'Les courriels de retard déjà partis, et leur réglage.',
        libelle: 'Rappels envoyés',
        fonctions: ['circulation.retards'],
        module: 'rappels',
      },
    ],
  },
  {
    id: 'outils',
    libelle: 'Outils',
    entrees: [
      {
        href: '/admin/outils/import-notices',
        description: 'Importer un lot de notices MARC ou CSV, avec compte rendu ligne à ligne.',
        libelle: 'Import de notices',
        fonctions: ['outils.catalogue'],
        groupe: 'Catalogue',
      },
      // ⚠ Sous OUTILS, pas sous Catalogue : `outils.catalogue` garde les outils
      // qui OPÈRENT sur le catalogue — import de notices, récolement — et c'est
      // la fonction que l'API exige ici. La ranger sous Catalogue lui donnerait
      // une place que sa garde ne suit pas.
      {
        href: '/admin/moissonnage',
        description: 'Récolter automatiquement des notices depuis des entrepôts OAI-PMH extérieurs.',
        libelle: 'Moissonnage',
        fonctions: ['outils.catalogue'],
        groupe: 'Catalogue',
        // ⚠ Le module est déclaré depuis le 14 septembre 2026, et le contrôleur
        // porte sa garde. Sans cette ligne, éteindre le moissonnage laissait
        // l'entrée et l'adresse ouvertes sur des routes que l'API refuse — une
        // interface qui ment sur ce qu'elle vient de faire.
        module: 'moissonnage',
      },
      {
        href: '/admin/recolement',
        description: 'L’inventaire au code-barres : ce qui manque, ce qui est mal rangé.',
        libelle: 'Récolement',
        fonctions: ['outils.catalogue'],
        groupe: 'Catalogue',
      },
      {
        href: '/admin/import-etudiants',
        description: 'Charger la liste des étudiants attendus — matricule, courriel, classe.',
        libelle: 'Import des étudiants',
        fonctions: ['outils.lecteurs'],
        groupe: 'Lecteurs',
      },
    ],
  },
  {
    id: 'statistiques',
    libelle: 'Statistiques',
    entrees: [
      {
        href: '/admin/statistiques',
        description: 'Le tableau de bord d’activité : prêts, lectures, retards.',
        libelle: 'Statistiques',
        fonctions: ['statistiques.voir'],
        // ⚠ `modulePrevu` EST DEVENU `module` le 15 septembre 2026 (P8-1). La
        // note disait « porté par un module dans la cible » — elle datait sa
        // propre péremption et a survécu à sa condition pendant toute une
        // phase. Le module est déclaré, ses trois routes sont gardées : le
        // champ d'attente n'a plus de raison d'être ici.
        module: 'statistiques',
      },
      {
        // ⚠ À CÔTÉ DES STATISTIQUES, ET PAS DEDANS. Le tableau de bord répond
        // « comment ça va » au quotidien ; le rapport annuel est un DOCUMENT
        // qu'une directrice remet à son université une fois par an. Les
        // confondre dans un seul écran ferait chercher un bilan d'année dans
        // une page de pilotage — et inversement.
        //
        // Même fonction et même module que son voisin : c'est la même donnée,
        // lue autrement.
        href: '/admin/rapport-annuel',
        description: 'Le bilan d’année remis à l’université, imprimable.',
        libelle: 'Rapport annuel',
        fonctions: ['statistiques.voir'],
        module: 'statistiques',
      },
    ],
  },
  {
    id: 'administration',
    libelle: 'Administration',
    pageDeRubriques: '/admin/administration',
    entrees: [
      // ⚠ DEUX ENTRÉES DEPUIS LE 11 SEPTEMBRE 2026, une par métier. L'ancienne
      // « Identité et réglages » en réclamait DEUX (`etablissement.apparence`
      // OU `etablissement.regles`) : le besoin de deux droits pour un écran
      // était le symptôme, pas le problème. Modifier un logo et fixer la durée
      // d'un prêt ne sont pas le même métier. Dette n° 2 levée ;
      // /admin/parametres redirige vers /admin/etablissement, parce que son
      // adresse a circulé et qu'un 404 dirait au lecteur qu'il s'est trompé.
      // ⚠ P4-2. `modules.gerer` n'est portée que par l'Administrateur : cette
      // entrée n'apparaît pour personne d'autre. Elle est placée avant
      // l'identité parce qu'activer un module DÉCIDE de ce que les autres
      // écrans montrent — c'est le réglage qui commande les réglages.
      {
        href: '/admin/modules',
        description: 'Allumer ou éteindre les fonctions de l’école.',
        libelle: 'Modules',
        fonctions: ['modules.gerer'],
        groupe: 'Établissement',
      },
      {
        href: '/admin/etablissement',
        description: 'Nom, logo, couleurs et coordonnées de l’établissement.',
        libelle: 'Identité',
        fonctions: ['etablissement.apparence'],
        groupe: 'Établissement',
      },
      {
        href: '/admin/regles-de-pret',
        description: 'Durées de prêt, quotas, renouvellements.',
        libelle: 'Règles de prêt',
        fonctions: ['etablissement.regles'],
        groupe: 'Établissement',
      },
      {
        href: '/admin/accueil',
        description: 'Textes et images de la page publique.',
        libelle: 'Page d’accueil',
        fonctions: ['etablissement.apparence'],
        groupe: 'Établissement',
      },
      {
        href: '/admin/interoperabilite',
        description: 'Ce que l’extérieur peut moissonner de votre catalogue.',
        libelle: 'Interopérabilité',
        fonctions: ['diffusion.gerer'],
        groupe: 'Diffusion',
        module: 'interoperabilite',
      },
      {
        href: '/admin/roles',
        description: 'Qui a le droit de faire quoi.',
        libelle: 'Rôles',
        fonctions: ['securite.roles'],
        groupe: 'Sécurité',
      },
      {
        href: '/admin/journal',
        description: 'Qui a fait quoi, et quand.',
        libelle: 'Journal d’audit',
        fonctions: ['securite.audit'],
        groupe: 'Sécurité',
      },
    ],
  },
];

/**
 * Ce que la maquette montre et que ce lot n'affiche PAS, avec la raison.
 *
 * Existe pour qu'aucune entrée ne disparaisse en silence : un lot qui réduit
 * la cible sans le dire se lit comme un lot qui l'a couverte.
 */
export const ENTREES_ECARTEES: { libelle: string; raison: string }[] = [
  { libelle: 'Cartes de lecteur', raison: "Aucun écran." },
  { libelle: 'Réservations', raison: "Onglet interne de /guichet, pas un écran." },
  {
    libelle: 'Amendes',
    // ⚠ Raison corrigée en P4-4 : elle disait « module absent », ce qui n'est
    // plus vrai — `amendes` est déclaré au registre et activable. Ce qui reste
    // vrai est qu'il n'a pas d'écran propre : il s'affiche DANS le guichet et
    // DANS la fiche d'adhérent, et l'éteindre y retire des blocs.
    raison:
      "Module déclaré au registre, mais sans écran propre : les amendes s'affichent dans /guichet et dans la fiche d'adhérent. L'éteindre y retire des blocs — P4-4.",
  },
  {
    libelle: 'Étiquettes et codes-barres',
    raison:
      "LabelsPanel est couplé à la sélection cochée du tableau du catalogue : l'extraire supprimerait cette portée ou demanderait de reconstruire une liste. Reste dans l'écran catalogue.",
  },
  { libelle: 'Modification par lot', raison: "Aucun écran." },
  { libelle: 'Sauvegardes', raison: "Aucun écran." },
  { libelle: 'Diagnostic', raison: "Aucun écran." },
  { libelle: 'Types de document', raison: "Aucun écran." },
  { libelle: 'Profils de description', raison: "Aucun écran." },
  { libelle: 'Sources moissonnées', raison: "Module absent, aucun écran." },
  { libelle: 'Identifiants', raison: "Module absent, aucun écran." },
  { libelle: 'Activer ou désactiver des modules', raison: "Hors périmètre : registre de modules." },
  { libelle: 'Onglet Dépôt', raison: "Module absent, aucun écran." },
  {
    libelle: 'Onglet Accueil',
    raison:
      "/admin ne rend rien : c'est un redirecteur vers la première section accessible. Un onglet qui renvoie ailleurs que sur lui-même ne serait jamais « courant ».",
  },
];

/** Onglets réellement visibles pour un jeu de fonctions donné. */
/**
 * @param modulesActifs identifiants des modules actifs, ou `null` tant qu'on ne
 * sait pas.
 *
 * ⚠ `null` LAISSE PASSER, et ce n'est pas un oubli. Tant que l'état des modules
 * n'est pas connu, masquer des entrées ferait clignoter le menu à chaque
 * chargement — et surtout ferait disparaître des écrans pour quelqu'un qui y a
 * droit, sur la foi d'une information qu'on n'a pas encore. Le verrouillage de
 * l'interface n'est de toute façon PAS ce qui protège : l'API refuse les routes
 * d'un module inactif, en le nommant (règle normative du brief P4). Cacher est
 * une politesse, refuser est la garantie.
 */
export function ongletsVisibles(
  fonctions: string[],
  modulesActifs: string[] | null = null,
): OngletNav[] {
  const moduleActif = (e: EntreeNav) =>
    !e.module || modulesActifs === null || modulesActifs.includes(e.module);
  return NAVIGATION_PERSONNEL.map((onglet) => ({
    ...onglet,
    // « au moins une » : voir le commentaire de EntreeNav.fonctions.
    entrees: onglet.entrees.filter(
      (e) => e.fonctions.some((f) => fonctions.includes(f)) && moduleActif(e),
    ),
  })).filter((onglet) => onglet.entrees.length > 0);
}

/**
 * Le module dont dépend la route donnée, s'il y en a un.
 *
 * ⚠ SERT À REFUSER UNE ADRESSE TAPÉE DIRECTEMENT. La règle normative de P4
 * exige que l'interface n'affiche « ni entrée de menu, ni bouton, ni écran
 * atteignable par son adresse ». Retirer l'entrée ne suffit donc pas : mesuré
 * en recette le 11 septembre 2026, `/admin/interoperabilite` s'affichait encore
 * normalement module éteint, et annonçait un entrepôt qui répond 403.
 */
/**
 * Routes qui dépendent d'un module SANS passer par le menu du personnel.
 *
 * ⚠ POURQUOI ELLES EXISTENT À PART. `NAVIGATION_PERSONNEL` ne décrit que la
 * coque du personnel. Le circuit de dépôt a deux écrans qui n'y sont pas :
 * `/mon-depot` appartient à l'ÉTUDIANT et `/depots-a-valider` au DIRECTEUR —
 * tous deux atteints depuis l'en-tête, pas depuis le menu.
 *
 * Sans cette table, éteindre le module `depot` laissait ces deux adresses
 * parfaitement accessibles, et leurs liens visibles. Mesuré le 14 septembre
 * 2026 : `moduleDeLaRoute` ne parcourait que le menu, donc elle rendait
 * `undefined` pour elles — et `undefined` veut dire « aucun module requis ».
 *
 * ⚠ `/mes-encadrements` N'EN FAIT PAS PARTIE, et c'est délibéré : il liste les
 * thèses déjà CATALOGUÉES qu'on a dirigées, en lisant le catalogue. Éteindre le
 * dépôt ferme le circuit, il n'efface pas ce qui en est sorti.
 */
export const ROUTES_HORS_MENU: Readonly<Record<string, string>> = {
  '/mon-depot': 'depot',
  // ⚠ `/depots-a-valider` N'EST PLUS ICI, et ce n'est pas un oubli : depuis le
  // 15 septembre 2026 elle est une ENTRÉE de la barre métier (onglet
  // Catalogue, groupe « Dépôts »), donc `moduleDeLaRoute` la trouve par le
  // menu, avec son `module: 'depot'`. La laisser aux deux endroits ferait deux
  // vérités à tenir — et c'est exactement ce que ce fichier reproche aux
  // vocabulaires recopiés.
};

export function moduleDeLaRoute(pathname: string): string | undefined {
  for (const [href, module] of Object.entries(ROUTES_HORS_MENU)) {
    if (pathname === href || pathname.startsWith(`${href}/`)) return module;
  }

  let gagnant: { module?: string; longueur: number } | undefined;
  for (const onglet of NAVIGATION_PERSONNEL) {
    for (const entree of onglet.entrees) {
      if (!pathname.startsWith(entree.href)) continue;
      if (!gagnant || entree.href.length > gagnant.longueur) {
        gagnant = { module: entree.module, longueur: entree.href.length };
      }
    }
  }
  return gagnant?.module;
}

/** L'onglet auquel appartient une route, pour marquer l'onglet courant. */
export function ongletDe(pathname: string): OngletNav | undefined {
  // ⚠ LA PAGE DE RUBRIQUES D'ABORD. Elle n'est pas une entrée — elle est
  // l'index de l'onglet. Sans ce passage, `/admin/administration` n'aurait
  // appartenu à aucun onglet : la coque du personnel ne se serait pas rendue,
  // et l'écran serait apparu nu, sans barre ni onglet actif.
  for (const onglet of NAVIGATION_PERSONNEL) {
    if (onglet.pageDeRubriques && pathname === onglet.pageDeRubriques) return onglet;
  }

  // Le plus long href gagne : /admin/catalogue ne doit pas rafler
  // /admin/catalogue/xxx au détriment d'une route plus précise.
  let gagnant: { onglet: OngletNav; longueur: number } | undefined;
  for (const onglet of NAVIGATION_PERSONNEL) {
    for (const e of onglet.entrees) {
      if (pathname === e.href || pathname.startsWith(`${e.href}/`)) {
        if (!gagnant || e.href.length > gagnant.longueur) {
          gagnant = { onglet, longueur: e.href.length };
        }
      }
    }
  }
  return gagnant?.onglet;
}

/**
 * Où mène le clic sur un onglet : sa page de RUBRIQUES quand il en a une, sa
 * première entrée sinon.
 *
 * ⚠ Une seule fonction pour les deux cas, délibérément : la barre d'onglets et
 * la porte d'entrée `/admin` doivent envoyer au MÊME endroit. Les laisser
 * décider chacune de son côté, c'est deux vérités à tenir — et l'une des deux
 * finira par envoyer quelqu'un sur un écran qu'il n'a pas choisi.
 */
export function destinationOnglet(onglet: OngletNav): string {
  return onglet.pageDeRubriques ?? onglet.entrees[0].href;
}

/**
 * Première entrée atteignable — destination de /admin.
 * `null` si l'utilisateur n'a aucune entrée : à l'appelant de décider
 * (aujourd'hui, retour à l'accueil public).
 */
export function premiereEntreeAccessible(fonctions: string[]): string | null {
  const premier = ongletsVisibles(fonctions)[0];
  return premier ? destinationOnglet(premier) : null;
}
