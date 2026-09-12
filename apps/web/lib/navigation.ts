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
      { href: '/admin/catalogue', libelle: 'Notices', fonctions: ['catalogue.gerer'] },
      { href: '/admin/auteurs', libelle: 'Auteurs', fonctions: ['catalogue.gerer'] },
      // « Catégories » renommé « Domaines » : c'est le mot du métier, et c'est
      // déjà celui de l'API et du compte rendu d'import. La ROUTE ne bouge pas
      // (/admin/categories) — donc aucun lien en circulation ne casse.
      { href: '/admin/categories', libelle: 'Domaines', fonctions: ['catalogue.gerer'] },
      { href: '/admin/collections', libelle: 'Collections', fonctions: ['collections.gerer'] },
      // ⚠ Le dernier maillon du circuit de dépôt. Sans cette entrée, un dépôt
      // validé par son directeur n'entre JAMAIS au catalogue : il reste dans
      // une table que rien n'expose. `catalogue.gerer` ouvre déjà les trois
      // entrées ci-dessus — aucun droit nouveau n'est accordé ici.
      { href: '/admin/depots-a-cataloguer', libelle: 'Dépôts à cataloguer', fonctions: ['catalogue.gerer'] },
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
      { href: '/admin/adherents', libelle: 'Adhérents', fonctions: ['adherents.gerer'] },
      { href: '/admin/comptes', libelle: 'Comptes', fonctions: ['lecteurs.voir'] },
      { href: '/admin/classes', libelle: 'Classes', fonctions: ['lecteurs.gerer'] },
    ],
  },
  {
    id: 'guichet',
    libelle: 'Guichet',
    entrees: [
      { href: '/guichet', libelle: 'Prêt et retour', fonctions: ['circulation.faire'] },
      {
        href: '/admin/rappels',
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
        libelle: 'Import de notices',
        fonctions: ['outils.catalogue'],
        groupe: 'Catalogue',
      },
      {
        href: '/admin/recolement',
        libelle: 'Récolement',
        fonctions: ['outils.catalogue'],
        groupe: 'Catalogue',
      },
      {
        href: '/admin/import-etudiants',
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
        libelle: 'Statistiques',
        fonctions: ['statistiques.voir'],
        // Porté par un module dans la cible — mais l'écran EXISTE et fonctionne.
        // Le masquer serait une régression, pas une réorganisation.
        modulePrevu: 'statistiques',
      },
    ],
  },
  {
    id: 'administration',
    libelle: 'Administration',
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
        libelle: 'Modules',
        fonctions: ['modules.gerer'],
        groupe: 'Établissement',
      },
      {
        href: '/admin/etablissement',
        libelle: 'Identité',
        fonctions: ['etablissement.apparence'],
        groupe: 'Établissement',
      },
      {
        href: '/admin/regles-de-pret',
        libelle: 'Règles de prêt',
        fonctions: ['etablissement.regles'],
        groupe: 'Établissement',
      },
      {
        href: '/admin/accueil',
        libelle: 'Page d’accueil',
        fonctions: ['etablissement.apparence'],
        groupe: 'Établissement',
      },
      {
        href: '/admin/interoperabilite',
        libelle: 'Interopérabilité',
        fonctions: ['diffusion.gerer'],
        groupe: 'Diffusion',
        module: 'interoperabilite',
      },
      {
        href: '/admin/roles',
        libelle: 'Rôles',
        fonctions: ['securite.roles'],
        groupe: 'Sécurité',
      },
      {
        href: '/admin/journal',
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
export function moduleDeLaRoute(pathname: string): string | undefined {
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
 * Première entrée atteignable — destination de /admin.
 * `null` si l'utilisateur n'a aucune entrée : à l'appelant de décider
 * (aujourd'hui, retour à l'accueil public).
 */
export function premiereEntreeAccessible(fonctions: string[]): string | null {
  return ongletsVisibles(fonctions)[0]?.entrees[0]?.href ?? null;
}
