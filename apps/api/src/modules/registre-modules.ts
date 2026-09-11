/**
 * LE REGISTRE DES MODULES — la déclaration, en CODE.
 *
 * C'est du vocabulaire, pas de la donnée : la liste des modules, leurs
 * libellés, leurs dépendances et leur caractère noyau vivent ici. Seul l'ÉTAT
 * D'ACTIVATION est en base, et il est par établissement.
 *
 * ⚠ AUCUN MODULE INERTE N'EST DÉCLARÉ. Les cinq modules annoncés par
 * `architecture-cible-gafeso.md` §5 pour les phases P5 à P8 (`depot`,
 * `moissonnage`, `identifiants`, `statistiques`, `lecture-hors-ligne`) ne
 * figurent PAS ici : les déclarer afficherait dans l'écran d'activation des
 * interrupteurs qui n'éteignent rien. C'est le refus d'inertie, et il vaut
 * aussi pour un registre — surtout pour un registre, dont tout l'objet est de
 * dire ce qui est réellement activable.
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
  interoperabilite: [
    'oai/oai.controller.ts :: Get',
    'oai/oai.controller.ts :: Post',
    'sru/sru.controller.ts :: Get lookup',
  ],
  rappels: [],
};
