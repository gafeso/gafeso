/**
 * LE REGISTRE DES MODULES — la déclaration, en CODE.
 *
 * C'est du vocabulaire, pas de la donnée : la liste des modules, leurs
 * libellés, leurs dépendances et leur caractère noyau vivent ici. Seul l'ÉTAT
 * D'ACTIVATION est en base, et il est par établissement.
 *
 * ⚠ AUCUN MODULE INERTE N'EST DÉCLARÉ. Les modules annoncés par
 * `architecture-cible-gafeso.md` §5 pour les phases à venir (`moissonnage`,
 * `identifiants`, `statistiques`, `lecture-hors-ligne`) ne figurent PAS ici :
 * les déclarer afficherait dans l'écran d'activation des interrupteurs qui
 * n'éteignent rien. C'est le refus d'inertie, et il vaut aussi pour un
 * registre — surtout pour un registre, dont tout l'objet est de dire ce qui est
 * réellement activable.
 *
 * ⚠ `depot` FIGURAIT DANS CETTE LISTE, ET CE N'EST PLUS VRAI depuis P6. La
 * phrase ci-dessus le citait comme exemple de module inerte ; le circuit de
 * dépôt existe maintenant — douze routes, un écran « Mon dépôt », un
 * chiffrement à l'ingestion. C'est « qu'est-ce qui reste écrit sans plus être
 * vrai ? » appliqué au registre lui-même : la règle était juste, son exemple
 * avait cessé de l'être.
 */

/**
 * Un endroit qui perd quelque chose quand le module s'éteint.
 *
 * `chemin` est le chemin de la page dans `apps/web/app` — VÉRIFIABLE. `quoi`
 * décrit ce qui disparaît de cette page-là.
 */
export interface EcranDuModule {
  chemin: string;
  quoi: string;
}

/** Ce qu'un module désactivé doit faire disparaître, côté écrans. */
export interface ModuleDeclare {
  id: string;
  libelle: string;
  description: string;
  /** Modules dont celui-ci a besoin. Un module noyau est toujours actif. */
  dependances: readonly string[];
  /** Noyau : visible, VERROUILLÉ, jamais désactivable (décision 4). */
  noyau: boolean;
  /**
   * Ce qui disparaît quand il est éteint — la confirmation le LISTE (P4-2), et
   * c'est ce qui rend la conséquence lisible avant le clic.
   *
   * ⚠ STRUCTURÉ, ET PLUS EN PROSE. C'est la DEUXIÈME fois que cette
   * déclaration promettait faux : d'abord un « écran Amendes » qui n'a jamais
   * existé (les amendes s'affichent DANS le guichet), puis un
   * « Administration · Tarifs d'amendes » qui n'existe pas non plus — pendant
   * que la fiche d'adhérent, qui perd réellement sa section, n'était pas
   * déclarée.
   *
   * Une phrase française n'est pas vérifiable ; un CHEMIN de page l'est. Le
   * garde-fou `ecrans-declares.spec.ts` exige donc que chaque `chemin` existe
   * dans `apps/web`, et que toute page parlant du module soit déclarée. Une
   * relecture ne suffisait pas — elle a échoué deux fois.
   *
   * La phrase affichée est COMPOSÉE par le service à partir de cette
   * structure : le contrat de `GET /modules` reste `string[]`, et il n'y a
   * qu'une source.
   */
  ecrans: readonly EcranDuModule[];
  /**
   * Mot qui identifie ce module dans les pages du front — sert au sens INVERSE
   * du garde-fou : une page qui en parle sans être déclarée est un oubli.
   */
  motifEcrans: string;
}

export const MODULES: readonly ModuleDeclare[] = [
  // ── Noyau : visible et verrouillé, pas caché (décision 4) ────────────────
  {
    id: 'authentification',
    libelle: 'Authentification',
    description: 'Connexion, comptes, rôles et droits.',
    dependances: [],
    noyau: true,
    ecrans: [],
    motifEcrans: '',
  },
  {
    id: 'usagers',
    libelle: 'Usagers',
    description: 'Adhérents, classes, inscriptions.',
    dependances: [],
    noyau: true,
    ecrans: [],
    motifEcrans: '',
  },
  {
    id: 'catalogue',
    libelle: 'Catalogue',
    description: 'Notices, exemplaires, recherche publique.',
    dependances: [],
    noyau: true,
    ecrans: [],
    motifEcrans: '',
  },
  {
    id: 'circulation',
    libelle: 'Circulation',
    description: 'Prêts, retours, réservations.',
    dependances: [],
    noyau: true,
    ecrans: [],
    motifEcrans: '',
  },
  {
    id: 'administration',
    libelle: 'Administration',
    description: 'Identité de l’établissement, journal d’audit, outils.',
    dependances: [],
    noyau: true,
    ecrans: [],
    motifEcrans: '',
  },

  // ── Activables (décision 3 : on se prouve sur du réel) ───────────────────
  {
    id: 'amendes',
    libelle: 'Amendes',
    description:
      'Calcul et encaissement des amendes de retard. Éteint, les amendes déjà ' +
      'dues sont conservées : elles cessent seulement de s’accumuler.',
    dependances: ['circulation'],
    noyau: false,
    ecrans: [
      { chemin: 'guichet', quoi: 'la section Amendes (le guichet, lui, reste)' },
      { chemin: 'admin/adherents/[id]', quoi: 'la section Amendes de la fiche d’adhérent' },
      /*
       * ⚠ LE PREMIER ÉCRAN ENTIER QUE CE MODULE GOUVERNE — ajouté le
       * 22 septembre 2026 par la session FRONT, dans un fichier qui n'est pas
       * le sien, parce que son lot a rendu ce garde rouge et qu'un `main`
       * rouge bloque tout le monde. Signalé en passation le même jour.
       *
       * `/admin/regles-de-circulation` (dette front n° 15) appelle les quatre
       * routes `/circulation/rules`, qui portent toutes
       * `@ModuleRequis('amendes')`. L'entrée de menu porte donc le module :
       * sans ça, elle mènerait à un écran que l'API refuse.
       *
       * ⚠ ET LE COUPLAGE EST DISCUTABLE, c'est le fond de la passation :
       * `CirculationRule` porte aussi `loanPeriodDays`, `maxCheckouts` et
       * `maxRenewals`, qui n'ont rien à voir avec les amendes. Une école qui
       * éteint ce module perd le réglage de ses DURÉES DE PRÊT. Le jour où les
       * routes se découplent, cette ligne et le `module` de l'entrée changent
       * ensemble.
       */
      {
        chemin: 'admin/regles-de-circulation',
        quoi: 'l’écran Règles de prêt (durées, plafonds et amende par catégorie)',
      },
    ],
    motifEcrans: '\\bamendes?\\b',
  },
  {
    id: 'interoperabilite',
    libelle: 'Interopérabilité',
    description:
      'Exposition du catalogue vers l’extérieur : entrepôt OAI-PMH, SRU. ' +
      'Éteint, l’entrepôt REFUSE explicitement — il ne disparaît pas et ne ' +
      'rend pas un jeu vide.',
    dependances: ['catalogue'],
    noyau: false,
    ecrans: [{ chemin: 'admin/interoperabilite', quoi: 'l’écran Interopérabilité' }],
    motifEcrans: '\\binterop',
  },
  {
    id: 'depot',
    libelle: 'Dépôt',
    description:
      'Dépôt des mémoires et thèses par les étudiants, validation par le ' +
      'directeur, catalogage par la bibliothèque. Éteint, les dépôts déjà ' +
      'faits et leurs documents sont CONSERVÉS : seules les routes du circuit ' +
      'refusent.',
    // Un dépôt validé finit en NOTICE : sans catalogue, le circuit n'a pas de
    // sortie. `catalogue` est noyau, donc la dépendance ne verrouille rien —
    // elle dit le lien, et elle vaudra le jour où quelqu'un voudra l'éteindre.
    dependances: ['catalogue'],
    noyau: false,
    ecrans: [
      { chemin: 'mon-depot', quoi: 'l’écran Mon dépôt (l’étudiant)' },
      { chemin: 'depots-a-valider', quoi: 'l’écran Dépôts à valider (le directeur)' },
      { chemin: 'admin/depots-soumis', quoi: 'l’écran Dépôts en attente' },
      { chemin: 'admin/depots-a-cataloguer', quoi: 'l’écran Dépôts à cataloguer' },
      {
        chemin: 'admin/roles',
        // ⚠ L'écran RESTE ; c'est son avertissement qui tombe. Signaler que
        // « personne ne peut valider un dépôt » dans une école qui n'a pas
        // ouvert le dépôt est du bruit — et le bruit use ce qui doit être lu le
        // jour où il compte.
        quoi: 'l’avertissement « personne ne peut valider un dépôt »',
      },
    ],
    /**
     * ⚠ LE MOTIF NE PEUT PAS ÊTRE `\bdépôts?\b`, ET C'EST MESURÉ. Ce mot
     * apparaît sur `admin/interoperabilite` dans « migration, **dépôt légal**,
     * partage avec une autre bibliothèque » — un tout autre sens. Le garde
     * aurait exigé de déclarer l'écran d'interopérabilité comme perdant quelque
     * chose quand le dépôt s'éteint, ce qui est faux. Un garde qui crie à tort
     * se fait désactiver.
     *
     * ⚠ SA BORNE, RÉÉCRITE LE 14 SEPTEMBRE 2026. Elle disait « il nomme les
     * trois écrans du circuit, dont deux n'existent pas encore ». Les quatre
     * existent désormais, et le circuit en compte QUATRE, pas trois : les
     * « Dépôts en attente » du personnel manquaient à l'appel.
     *
     * Le motif porte sur les ROUTES plutôt que sur les mots français, parce que
     * les textes vivent dans `lib/libelles.ts` : une page n'en contient que des
     * identifiants. Une page qui parlerait du dépôt sans employer ces chemins
     * resterait invisible au sens inverse du garde — un garde approximatif qui
     * dit qu'il l'est vaut mieux qu'un garde qu'on croit complet.
     */
    /**
     * ⚠ UN MOTIF QUI ÉNUMÈRE DES NOMS D'ÉCRANS SE PÉRIME AU PREMIER RENOMMAGE,
     * et celui-ci l'avait déjà fait une fois : il cherchait « dépôts à
     * valider » quand l'écran s'appelait « Dépôts en attente », et ne voyait
     * donc que deux pages sur six. Le rallonger à chaque écran neuf est la
     * forme qui échoue toujours — il suffit d'en oublier un.
     *
     * ⚠ IL NE POUVAIT PAS ÊTRE `\bdépôts?\b` TANT QUE LE GARDE LISAIT LE CODE :
     * ce mot apparaît sur `admin/interoperabilite` dans « migration, **dépôt
     * légal**, partage avec une autre bibliothèque », et dans des IDENTIFIANTS
     * — `interface Depot`, `depot.valider`, `https://depot.exemple.bf`. Un
     * garde qui crie à tort se fait désactiver.
     *
     * La forme retenue lève les deux d'un coup : elle exige **un accent**, ce
     * qu'aucun identifiant TypeScript ne porte, et elle écarte le seul homonyme
     * réel. Mesurée sur les 60 pages du front : elle ramène les six écrans du
     * circuit, et rien d'autre. Un écran renommé demain reste couvert.
     */
    motifEcrans: '(?:dép[ôo]t|depôt)s?(?! l[ée]gal)',
  },
  {
    id: 'statistiques',
    libelle: 'Statistiques',
    description:
      'Tableau de bord d’activité et rapport annuel de l’établissement. ' +
      'Éteint, les chiffres ne sont plus CONSULTABLES — mais l’usage des ' +
      'documents continue d’être compté, pour que le jour où l’on rallume, ' +
      'l’année ne soit pas trouée.',
    // Tout ce qu'il agrège vient du catalogue et de la circulation. Les deux
    // sont noyau : la dépendance ne verrouille rien, elle dit le lien.
    dependances: ['catalogue', 'circulation'],
    noyau: false,
    ecrans: [
      { chemin: 'admin/statistiques', quoi: 'l’écran Statistiques (tableau de bord)' },
      // ⚠ AJOUTÉ LE 15 SEPTEMBRE 2026, et c'est le garde qui l'a exigé — pas une
      // relecture. L'écran du rapport annuel appelle `/stats/`, donc il tombe
      // sous le motif du module ; sans cette ligne, la boîte de confirmation
      // annonçait la disparition d'UN écran quand DEUX partaient.
      //
      // C'est le défaut exact de `depot`, trouvé la veille : un module déclaré
      // qui ne nomme pas tout ce qu'il éteint. La différence est qu'ici le
      // garde avait déjà son motif, donc il a parlé tout de suite.
      {
        chemin: 'admin/rapport-annuel',
        quoi: 'le rapport annuel remis à l’université',
      },
    ],
    /**
     * ⚠ PAS `\bstatistiques?\b`, ET C'EST MESURÉ. Le mot apparaît dans des
     * libellés d'AUTRES écrans — la fiche d'adhérent parle de « statistiques
     * de prêt », les rappels d'un compte rendu. Exiger de les déclarer serait
     * faux, et un garde qui crie à tort se fait désactiver.
     *
     * Le signal retenu est MÉCANIQUE, comme pour le moissonnage : nos écrans
     * emploient le paquet de libellés dédié, et appellent `/stats`.
     *
     * ⚠ SA BORNE, ÉCRITE : un écran qui parlerait des statistiques sans
     * employer ce paquet ni appeler ces routes resterait invisible. C'est
     * étroit — un écran du module emploie ses libellés par construction.
     */
    motifEcrans: 'LIBELLES\\.statistiques\\b|/stats/',
  },
  {
    id: 'moissonnage',
    libelle: 'Moissonnage',
    description:
      'Récupération automatique de notices depuis des entrepôts OAI-PMH ' +
      'extérieurs. Éteint, plus aucune récolte ; les notices déjà moissonnées ' +
      'et les comptes rendus des récoltes passées sont CONSERVÉS.',
    // Une notice moissonnée entre au catalogue : sans catalogue, la récolte n'a
    // pas de destination. `catalogue` est noyau, donc la dépendance ne verrouille
    // rien — elle dit le lien, et elle vaudra le jour où quelqu'un voudra
    // l'éteindre.
    dependances: ['catalogue'],
    noyau: false,
    ecrans: [
      { chemin: 'admin/moissonnage', quoi: 'l’écran Moissonnage' },
      { chemin: 'admin/moissonnage/[id]', quoi: 'le détail d’un entrepôt et ses comptes rendus' },
    ],
    /**
     * ⚠ LE MOTIF NE PEUT PAS ÊTRE `moissonnage`, ET C'EST MESURÉ. Le mot apparaît
     * une fois sur `admin/interoperabilite` — « Le moissonnage se fait par… » —
     * dans l'AUTRE sens : cet écran décrit comment des tiers moissonnent NOTRE
     * entrepôt, pas comment nous moissonnons les leurs. Le garde aurait exigé de
     * déclarer l'interopérabilité comme perdant quelque chose quand le
     * moissonnage s'éteint, ce qui est faux. Un garde qui crie à tort se fait
     * désactiver.
     *
     * Le motif porte donc sur la ROUTE — `moissonnage/`, présent six fois sur
     * l'écran de liste et deux fois sur le détail, ZÉRO fois sur
     * l'interopérabilité. Mesuré avant d'être écrit.
     *
     * ⚠ SA BORNE : une page qui appellerait le moissonnage sans employer ce
     * préfixe resterait invisible au garde. Approximatif et qui le dit.
     */
    motifEcrans: 'moissonnage/',
  },
  {
    id: 'rappels',
    libelle: 'Rappels',
    description:
      'Courriels d’échéance et de retard aux adhérents. Éteint, plus aucun ' +
      'envoi automatique ; l’historique des rappels déjà envoyés est conservé.',
    dependances: ['circulation'],
    noyau: false,
    ecrans: [
      { chemin: 'admin/rappels', quoi: 'l’écran Rappels' },
      {
        chemin: 'admin/statistiques',
        quoi: 'le bloc « Rappels envoyés » des statistiques',
      },
    ],
    // ⚠ FRONTIÈRE DE MOT, et ce n'est pas une coquetterie : `rappel` seul
    // attrapait « on rappelle donc ici le titre » sur la page d'accueil — le
    // VERBE, pas le nom. Un garde qui crie à tort se fait désactiver.
    motifEcrans: '\\brappels?\\b',
  },
];

export const MODULES_PAR_ID = new Map(MODULES.map((m) => [m.id, m]));

/** Identifiants des modules noyau — jamais désactivables. */
export const MODULES_NOYAU = MODULES.filter((m) => m.noyau).map((m) => m.id);

/** Identifiants des modules réellement activables. */
export const MODULES_ACTIVABLES = MODULES.filter((m) => !m.noyau).map((m) => m.id);

/**
 * Modules qui DÉPENDENT de `id` — sert au verrouillage (décision 6 : un module
 * dont un autre dépend n'est pas cliquable, la ligne dit par qui).
 */
export function dependantsDe(id: string): string[] {
  return MODULES.filter((m) => m.dependances.includes(id)).map((m) => m.id);
}

/**
 * LES ROUTES DE CHAQUE MODULE ACTIVABLE — ce que le garde-fou vérifie.
 *
 * Clé : `fichier relatif à src/ :: VERBE chemin`, le même format que
 * l'inventaire de `gardes-declarees.spec.ts`. Toute route listée ici DOIT
 * porter `@ModuleRequis(<module>)`, et toute route d'un contrôleur listé ici
 * doit être listée — sinon une route du module resterait joignable module
 * éteint.
 *
 * ⚠ `amendes` N'A AUCUNE ROUTE EXCLUSIVE DE CALCUL, et c'est la trouvaille du
 * lot. Les amendes se calculent DANS la circulation (`POST /circulation/return`),
 * qui est du noyau : la garder refuserait de rendre un livre dans une école
 * ayant éteint les amendes. Seuls les TARIFS sont des routes du module ; le
 * calcul, lui, se règle par une branche — l'amende vaut zéro, le retour se fait.
 */
export const ROUTES_PAR_MODULE: Record<string, readonly string[]> = {
  amendes: [
    'circulation/circulation.controller.ts :: Post rules',
    'circulation/circulation.controller.ts :: Get rules',
    'circulation/circulation.controller.ts :: Patch rules/:id',
    'circulation/circulation.controller.ts :: Delete rules/:id',
  ],
  // ⚠ LES SEPT ROUTES DU MOISSONNAGE, et la garde est posée sur la CLASSE : une
  // huitième écrite demain l'hérite. Elles sont listées ici quand même — c'est
  // ce compte exact qui oblige à revenir le jour où l'une change de nom.
  // ⚠ `rappels` DÉCLARAIT UNE LISTE VIDE, et le commentaire disait que son
  // extinction n'agissait que sur le PLANIFICATEUR. C'était faux : cinq routes
  // existent, dont `POST run` qui envoie des courriels à tous les adhérents en
  // retard. Une école qui avait éteint les rappels les recevait quand même dès
  // qu'on cliquait. Mesuré et corrigé le 15 septembre 2026.
  rappels: [
    'reminders/reminders.controller.ts :: Get settings',
    'reminders/reminders.controller.ts :: Patch settings',
    'reminders/reminders.controller.ts :: Get log',
    'reminders/reminders.controller.ts :: Post preview',
    'reminders/reminders.controller.ts :: Post run',
  ],
  statistiques: [
    'stats/stats.controller.ts :: Get dashboard',
    'stats/stats.controller.ts :: Get rapport-annuel',
    'stats/stats.controller.ts :: Get export',
    'stats/stats.controller.ts :: Get report',
  ],
  moissonnage: [
    'moissonnage/moissonnage.controller.ts :: Get sources',
    'moissonnage/moissonnage.controller.ts :: Post sources',
    'moissonnage/moissonnage.controller.ts :: Patch sources/:id',
    'moissonnage/moissonnage.controller.ts :: Delete sources/:id',
    'moissonnage/moissonnage.controller.ts :: Post sources/:id/executer',
    'moissonnage/moissonnage.controller.ts :: Get sources/:id/executions',
    'moissonnage/moissonnage.controller.ts :: Get sources/:id/collisions',
  ],
  interoperabilite: [
    'oai/oai.controller.ts :: Get',
    'oai/oai.controller.ts :: Post',
    'sru/sru.controller.ts :: Get lookup',
  ],
  // ⚠ LES QUINZE ROUTES DU CIRCUIT, et la garde est posée sur la CLASSE : une
  // seizième écrite demain l'hérite.
  //
  // ⚠ CETTE LISTE EN A ANNONCÉ DOUZE PENDANT TROIS JOURS, et le garde inverse
  // ne pouvait pas le dire : il ne lisait que les `@ModuleRequis` posés sur une
  // MÉTHODE, jamais celui de la CLASSE. Trois routes ajoutées après coup —
  // `:id/retirer`, `soumis`, `:id/reattribuer` — refusaient correctement sans
  // que rien ne l'atteste. Corrigé le 15 septembre 2026. Elles sont listées ici quand même —
  // c'est ce compte exact qui oblige à revenir le jour où l'une change de nom.
  depot: [
    'depots/depots.controller.ts :: Post',
    'depots/depots.controller.ts :: Get directeurs',
    'depots/depots.controller.ts :: Patch :id/directeur',
    'depots/depots.controller.ts :: Get mes-depots',
    'depots/depots.controller.ts :: Post :id/document',
    'depots/depots.controller.ts :: Post :id/soumettre',
    'depots/depots.controller.ts :: Post :id/retirer',
    'depots/depots.controller.ts :: Get soumis',
    'depots/depots.controller.ts :: Post :id/reattribuer',
    'depots/depots.controller.ts :: Get :id/document',
    'depots/depots.controller.ts :: Get a-valider',
    'depots/depots.controller.ts :: Post :id/valider',
    'depots/depots.controller.ts :: Post :id/refuser',
    'depots/depots.controller.ts :: Get a-cataloguer',
    'depots/depots.controller.ts :: Post :id/notice',
  ],
};
