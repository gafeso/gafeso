// Libellés français de l'interface.
//
// ⚠ TOUT TEXTE AFFICHÉ À L'UTILISATEUR PASSE PAR ICI, jamais par une chaîne
// écrite dans un composant (convention de CLAUDE.md, 10 septembre 2026). Un
// seul fichier français aujourd'hui : l'internationalisation viendra plus tard,
// ce qui compte maintenant est que les textes soient déjà sortis du code.
//
// ⚠ S'APPLIQUE AU NEUF. Ce fichier est amorcé avec les textes introduits le
// 10 septembre 2026, pendant qu'ils étaient encore neufs — c'était le seul
// moment où l'extraction était gratuite. Les écrans antérieurs gardent leurs
// chaînes en place : les reprendre est un chantier à part, qui coûte plus qu'il
// ne rapporte tant qu'aucune seconde langue n'existe.
//
// ── STRUCTURE, et c'est elle qui fixe la convention pour la suite ──────────
// PAR ÉCRAN OU PAR DOMAINE, jamais à plat. Un fichier de libellés à plat
// devient illisible à deux cents entrées, et personne ne le restructure
// ensuite : le coût de la mise à plat est payé une fois, celui du désordre à
// chaque lecture. Une clé se lit donc `LIBELLES.importNotices.titre`, et
// l'écran qu'elle sert se déduit de son chemin.
//
// Les textes à trou sont des FONCTIONS, pas des concaténations : une langue qui
// place ses mots autrement (« Bild 2 von 3 ») n'a rien à recomposer, elle
// réécrit la fonction.

export const LIBELLES = {
  /**
   * Textes partagés par plusieurs écrans. Un DOMAINE, pas un fourre-tout : il
   * n'accueille que ce qui serait rigoureusement identique partout.
   *
   * ⚠ `chargement` existe pour une raison précise. Une liste qui démarre à `[]`
   * ne distingue pas « pas encore chargé » de « vide », et l'écran affirme donc
   * « Aucun auteur » AVANT d'avoir la réponse. C'est la faute documentée dans
   * CLAUDE.md — une non-réponse écrite comme un fait — et elle ne dure 250 ms
   * qu'en local : sur le réseau d'un campus, elle se lit.
   */
  commun: {
    chargement: 'Chargement…',
  },

  /** Barre applicative, présente sur tous les écrans. */
  entete: {
    /** Porte d'entrée vers l'espace du personnel, depuis les pages publiques. */
    espaceProfessionnel: 'Espace professionnel',
    /** Bouton d'ouverture du menu replié (sous md). Annoncé, donc traduisible. */
    menu: 'Menu',
  },

  /**
   * Les quatre piliers de la vitrine.
   *
   * ⚠ TEXTE FIXE, identique pour tous les établissements — il décrit ce que la
   * bibliothèque OFFRE grâce à Gafeso, pas l'établissement lui-même. Ce n'est
   * donc pas du contenu de tenant : le rendre configurable inventerait un
   * modèle de données que l'API n'a pas, et la maquette le donne en dur.
   */
  piliers: [
    { titre: 'Lecture hors connexion', texte: 'Téléchargez sur le campus, lisez sans réseau.' },
    { titre: 'Souveraineté des données', texte: 'Elles restent chez l’établissement.' },
    { titre: 'Standards ouverts', texte: 'MARC, OAI-PMH, SRU.' },
    { titre: 'Journal d’audit', texte: 'Traçabilité des accès et des actions.' },
  ],

  /** Recherche dans le catalogue — section propre depuis la refonte. */
  recherche: {
    titre: 'Rechercher dans le catalogue',
    sousTitre: 'Un livre, une thèse, un mémoire ou un document numérique.',
    placeholder: 'Titre, auteur, sujet, ISBN…',
    champAccessible: 'Rechercher dans le catalogue',
    bouton: 'Rechercher',
    /**
     * Option « pas de filtre ». Les autres options sont construites à partir de
     * lib/record-types.ts : ce sont des VALEURS D'API, elles n'ont rien à faire
     * dans un fichier de textes — les mêlerait, on traduirait un contrat.
     */
    tousLesTypes: 'Tous',
    /**
     * Libellés des regroupements de lib/record-types.ts, par clé. Les VALEURS
     * (recordType=a,b) vivent là-bas : ce sont des contrats, pas des textes.
     */
    groupes: {
      livres: 'Livres',
      travaux: 'Thèses et mémoires',
      publications: 'Publications',
    },
    filtreAccessible: 'Filtrer par type de document',
  },

  /**
   * Pied de page.
   *
   * ⚠ Il est celui de L'ÉTABLISSEMENT, pas de Gafeso : le nom de
   * l'établissement en premier, Gafeso en signature discrète. Et aucun lien
   * vers une page qui n'existe pas — la maquette en proposait plusieurs
   * (« Application mobile », « À propos de Gafeso », « Mentions légales »,
   * « Politique de confidentialité ») : elles n'ont pas de destination, donc
   * pas de lien. Un lien mort dit à l'utilisateur qu'il a mal cliqué.
   */
  pied: {
    bibliotheque: 'LA BIBLIOTHÈQUE',
    catalogue: 'Catalogue',
    constellation: 'Constellation',
    horaires: 'Horaires et accès',
    services: 'SERVICES',
    creerCompte: 'Créer un compte lecteur',
    contact: 'Contact',
    campus: 'Campus',
    ressources: 'Ressources',
    /** Signature Gafeso — discrète, sous le copyright de l'établissement. */
    signature: 'Propulsé par Gafeso, logiciel libre sous licence AGPL-3.0',
  },

  /**
   * Valeurs par défaut du PRODUIT — affichées quand l'établissement n'a rien
   * saisi, pour qu'une bibliothèque qui ne configure rien obtienne une page
   * correcte plutôt qu'une page vide.
   *
   * ⚠ AFFICHAGE SEULEMENT, JAMAIS PERSISTÉ. Un défaut enregistré deviendrait
   * le texte de l'établissement sans qu'il l'ait écrit — et il le retrouverait
   * un jour dans son formulaire, sans savoir d'où il vient. Dans
   * /admin/accueil, ces textes apparaissent en indication de saisie
   * (placeholder), pas en valeur.
   *
   * ⚠ SEULS LES TEXTES VRAIS POUR TOUTE BIBLIOTHÈQUE. Rien de propre à
   * l'établissement n'a de défaut — ni nom, ni contact, ni adresse, ni image.
   * Absent plutôt que faux : un contact inventé sur une page publique est une
   * adresse où personne ne répond. Et aucun chiffre : « plus de 10 000
   * références » serait une affirmation, pas un défaut.
   */
  defauts: {
    accroche: 'Le savoir, à portée de main',
    presentation:
      'Cherchez, empruntez et lisez les ressources de votre bibliothèque, sur place comme hors connexion.',
    indiceRecherche: 'Titre, auteur, sujet ou ISBN — la recherche porte sur tout le catalogue.',
  },

  /** Écran d'administration : bandeau de la page d'accueil. */
  adminBandeau: {
    titre: 'Bandeau de la page d’accueil',
    /** ⚠ Doit être ÉCRIT, pas deviné : l'ordre décide de ce que voit le mobile. */
    ordreCompte:
      'L’ordre compte : la PREMIÈRE diapositive est la seule affichée sur téléphone. Les suivantes ne s’affichent que sur grand écran.',
    limite: (max: number) =>
      `${max} diapositives au maximum. Au-delà, la page s’alourdit sans que personne ne les regarde.`,
    limiteAtteinte: (max: number) => `Limite de ${max} diapositives atteinte.`,
    ajouter: 'Ajouter une diapositive',
    diapositive: (rang: number) => `Diapositive ${rang}`,
    premiereMobile: 'affichée sur téléphone',
    image: 'Image',
    imageObligatoire: 'Une diapositive sans image ne s’affiche pas.',
    titreChamp: 'Titre (facultatif)',
    surtitreChamp: 'Sur-titre (facultatif)',
    monter: 'Monter',
    descendre: 'Descendre',
    retirer: 'Retirer',
    /** Reprise d'une configuration à image unique. */
    ancienneTitre: 'Ancienne image unique',
    ancienneExplication:
      'Cet établissement a été configuré avant les diapositives multiples. Son image s’affiche toujours, reconstruite automatiquement.',
    ancienneReprendre: 'Reprendre cette image comme première diapositive',
    ancienneInactiveTitre: 'Ancienne image unique, sans effet',
    ancienneInactive:
      'Une ancienne image unique reste enregistrée. Elle ne s’affiche plus tant que la liste ci-dessus contient au moins une diapositive. Elle réapparaîtrait si vous retiriez toutes les diapositives.',
    ancienneSupprimer: 'Supprimer l’ancienne image',
  },

  /** Chiffres du fonds — une tuile n'apparaît que si son chiffre est significatif. */
  chiffres: {
    documents: 'documents au catalogue',
    lecteurs: 'lecteurs inscrits',
    documentsNumeriques: 'documents numériques',
    lecturesHorsLigne: 'lectures hors connexion',
  },

  /**
   * Notices à découvrir.
   *
   * ⚠ LE TITRE NE DIT PAS « Dernières acquisitions », et c'est délibéré. Le tri
   * servi par l'API reflète l'ORDRE D'ÉCRITURE EN BASE, pas une date
   * d'acquisition — une notice saisie aujourd'hui pour un ouvrage acquis en
   * 2019 remonterait en tête. « Dernières acquisitions » serait donc une
   * affirmation fausse, du même genre que celles que cet écran corrige
   * ailleurs. Précision du lot backend, 10 septembre 2026.
   */
  acquisitions: {
    titre: 'À découvrir dans le catalogue',
    voirTout: 'Voir tout le catalogue →',
    /** Repli de vignette : la notice n'a pas de couverture. */
    sansCouverture: 'Sans couverture',
    /** Ligne « auteur · année », l'un ou l'autre pouvant manquer. */
    auteurEtAnnee: (auteur: string | null, annee: number | null) =>
      [auteur, annee ? String(annee) : null].filter(Boolean).join(' · '),
  },

  /** Vitrine publique de l'établissement. */
  accueil: {
    /** Affiché quand l'API n'a pas répondu — surtout PAS quand le catalogue est vide. */
    catalogueIndisponibleTitre: 'Catalogue momentanément indisponible',
    catalogueIndisponibleTexte:
      'La répartition du catalogue n’a pas pu être chargée. Le catalogue lui-même reste consultable.',
    ouvrirCatalogue: 'Ouvrir le catalogue →',
    /** Actions du bandeau, sur la première diapositive seulement. */
    rechercherDocument: 'Rechercher un document',
    creerCompte: 'Créer un compte lecteur',
  },

  /** Bandeau à diapositives de la vitrine. */
  bandeau: {
    /** Groupe des points de navigation. */
    /** Rôle du carrousel, annoncé aux lecteurs d'écran. */
    region: 'Présentation',
    choisirImage: 'Choisir une image',
    precedente: 'Diapositive précédente',
    suivante: 'Diapositive suivante',
    /** Nom accessible d'un point. Fonction : l'ordre des mots varie d'une langue à l'autre. */
    imageSur: (rang: number, total: number) => `Image ${rang} sur ${total}`,
  },

  /**
   * Catalogue public — l'état VIDE, qui a deux causes et ne s'écrit pas pareil.
   *
   * ⚠ « aucune notice ne correspond » est une réponse LÉGITIME : une recherche
   * qui ne trouve rien est une recherche qui a fonctionné. « la valeur demandée
   * n'existe nulle part dans ce catalogue » est autre chose — une URL partagée
   * portant un type périmé affichait un catalogue vide, sans un mot, et le
   * lecteur en concluait que la bibliothèque n'avait rien. L'API distingue
   * désormais les deux (champ `filtresInconnus`) ; l'écran doit les écrire
   * différemment, sinon la distinction ne sert à personne.
   */
  opac: {
    aucunResultat: 'Aucun résultat',
    /** Vide légitime : la recherche a fonctionné, elle n'a rien trouvé. */
    aucuneNoticeNeCorrespond: 'Aucune notice ne correspond à cette recherche.',
    /** Vide EXPLIQUÉ : au moins une valeur demandée n'existe pas dans ce fonds. */
    filtreInconnuTitre: (nombre: number) =>
      nombre > 1
        ? 'Ces filtres n’existent pas dans ce catalogue'
        : 'Ce filtre n’existe pas dans ce catalogue',
    filtreInconnuTexte:
      'Le résultat est vide à cause de ce filtre, pas parce que le catalogue l’est.',
    filtreInconnuLigne: (champ: string, valeur: string) => `${champ} : « ${valeur} »`,
    /**
     * Noms lisibles des champs de filtre. Les CLÉS sont celles de l'API
     * (`recordType`, `publishYear`) : elles ne se traduisent pas, elles se
     * traduisent EN — c'est tout l'objet de cette table.
     */
    champs: {
      recordType: 'Type de document',
      category: 'Domaine',
      language: 'Langue',
      publishYear: 'Année',
    },
    /**
     * ⚠ Sans cette sortie, l'écran est un cul-de-sac. À zéro résultat, les
     * facettes rendues par le moteur sont VIDES — les pastilles de filtre
     * disparaissent donc au moment précis où il faudrait pouvoir les décocher,
     * et il ne reste au lecteur qu'à modifier l'URL à la main.
     */
    filtresActifs: 'Filtres actifs',
    /**
     * Parcours des documents numériques — servi par /opac/parcourir.
     *
     * ⚠ PARCOURIR N'EST PAS CHERCHER, et c'est pourquoi ce n'est pas une
     * option du filtre de type. L'API l'a délibérément sorti de /opac/search :
     * le filtre « a un fichier » se lit EN BASE, le moteur de recherche n'en
     * sait rien, et le post-filtrer rendrait les totaux faux. Le proposer dans
     * le menu déroulant de la recherche promettrait une recherche restreinte
     * aux documents numériques — que rien ne sait servir.
     */
    /**
     * Notice qui n'existe pas — la page rend un VRAI 404 depuis le
     * 11 septembre 2026 (backlog n° 7). Les identifiants de notices circulent
     * et ne changent jamais ; des liens vers des notices retirées existeront.
     */
    noticeIntrouvableTitre: 'Cette notice n’existe plus',
    noticeIntrouvableTexte:
      'Le document a peut-être été retiré du catalogue, ou le lien que vous avez suivi est ancien.',
    retourCatalogue: 'Retour au catalogue',
    parcourirNumeriques: 'Parcourir les documents numériques',
    parcoursNumeriques: 'Documents numériques',
    parcoursQuitter: 'Quitter le parcours',
    pageSur: (page: number, total: number) => `Page ${page} sur ${total}`,
    pagePrecedente: 'Page précédente',
    pageSuivante: 'Page suivante',
    /** Vide d'un PARCOURS : aucun filtre en cause, le fonds n'en contient pas. */
    aucunDocumentNumerique:
      'Aucun document numérique dans ce catalogue pour l’instant.',
    retirerFiltre: (champ: string, valeur: string) =>
      `Retirer le filtre ${champ} « ${valeur} »`,
    retirer: 'Retirer',
  },

  /**
   * Refus d'accès, par écran. Un refus NOMME la fonction manquante : sans elle,
   * l'utilisateur ne sait pas quoi demander à son administrateur.
   */
  refusDeDroit: {
    modules:
      'Vous n’avez pas la permission de gérer les modules (fonction « modules.gerer »).',
    reglesDePret:
      'Vous n’avez pas la permission de modifier les règles de prêt (fonction « etablissement.regles »).',
    adherents:
      'Vous n’avez pas la permission de gérer les adhérents (fonction « adherents.gerer »).',
  },

  /**
   * Adhérents (back-office) — écran neuf du 10 septembre 2026, backlog n° 8.
   * Entièrement soumis à la convention : aucun texte n'est écrit dans l'écran.
   */
  /** Collections de documents. */
  collections: {
    /**
     * ⚠ UN ÉCHEC SE DIT. L'écriture précédente affichait « … » aussi bien
     * pendant le chargement qu'en cas d'échec : une panne s'écrivait comme un
     * chargement, et les points de suspension restaient là pour toujours.
     * Le cas arrive à un rôle portant `collections.gerer` sans
     * `catalogue.gerer`, depuis que la route du titre exige la seconde.
     */
    titreIndisponible: 'Titre indisponible',
  },

  /**
   * Modules — écran d'activation, P4-2. La maquette
   * `docs/maquettes/maquette-modules.html` fait foi pour les libellés.
   */
  modules: {
    titre: 'Modules',
    introduction:
      'Les modules ajoutent des fonctions à votre bibliothèque. En désactiver un retire ses écrans, sans jamais supprimer de données.',
    /** ⚠ Dit AVANT le geste, pas après : c'est ce qui lève l'inquiétude. */
    aucuneDonneeSupprimee: 'Aucune donnée n’est supprimée.',
    actif: 'Activé',
    inactif: 'Désactivé',
    activer: (libelle: string) => `Activer ${libelle}`,
    desactiver: (libelle: string) => `Désactiver ${libelle}`,
    /** ⚠ La confirmation NOMME le module et LISTE ce qui disparaît. */
    confirmerTitre: (libelle: string) => `Désactiver ${libelle} ?`,
    confirmerEcrans: 'Ces écrans disparaîtront :',
    /**
     * ⚠ Quand aucun écran n'est rattaché, on le DIT plutôt que d'afficher une
     * liste vide — « rien ne disparaît » et « on ne sait pas ce qui disparaît »
     * ne sont pas la même information.
     */
    confirmerSansEcrans:
      'Aucun écran de l’espace professionnel ne dépend de ce module ; ses routes cesseront néanmoins de répondre.',
    confirmer: 'Désactiver',
    annuler: 'Annuler',
    chargementImpossible: 'Chargement des modules impossible.',
    aucunModule: 'Aucun module déclaré.',
    /**
     * ⚠ LA PHRASE REDEVIENT DU FRONT — backlog n° 14 refermé. L'API rend
     * désormais un code et les modules en cause ; elle garde la RÈGLE, on garde
     * le TEXTE. C'est ce qui rend une seconde langue possible : il n'y a plus
     * un seul texte visible composé ailleurs.
     */
    /**
     * ⚠ Refus d'un écran dont le module est éteint, atteint par son adresse.
     * Il DIT que rien n'est perdu : sans cela, un administrateur qui retrouve
     * un vieux signet croirait la fonction supprimée.
     */
    ecranModuleInactif:
      'Cette fonction appartient à un module désactivé pour votre établissement. Aucune donnée n’a été supprimée : réactivez le module dans Administration · Modules pour la retrouver.',
    motifNoyau: 'Requis — ce module ne se désactive pas.',
    motifNecessite: (modules: string) => `Nécessite : ${modules} (désactivé).`,
    motifRequisPar: (modules: string) => `Requis par : ${modules}.`,
  },

  /** Règles de prêt — écran né de la scission de /admin/parametres (dette n° 2). */
  /**
   * Amendes — P4-4, moitié front.
   *
   * ⚠ ÉTEINDRE LE MODULE N'EFFACE PAS LA DETTE. Le backend conserve les amendes
   * déjà constatées et cesse seulement de les accumuler — mesuré côté API : 61
   * prêts et 21 900 FCFA identiques avant et après extinction, le tarif
   * applicable tombant à zéro sans qu'aucun montant passé ne bouge. L'écran doit
   * dire la même chose : faire disparaître le montant dû avec le module
   * ressemblerait à une remise de dette, et cette information n'est lisible
   * nulle part ailleurs dans l'interface.
   *
   * ⚠ D'où le partage en deux. Ce qui DISPARAÎT est la fonction du module — le
   * calcul en cours, le détail « en cours sur les retards », l'encaissement. Ce
   * qui RESTE est le montant dû, accompagné de la phrase qui explique pourquoi
   * il ne bouge plus. Sans cette phrase, un montant figé à côté de seize prêts
   * en retard se lit comme un calcul en panne.
   */
  amendes: {
    /** ⚠ « dues », pas « Amendes » : le montant ne s'accroît plus, il est arrêté. */
    dues: (montant: string) => `Amendes dues : ${montant}`,
    /**
     * ⚠ INFORMATION, PAS ALERTE. L'extinction est un choix de l'école ; la
     * signaler sur le ton de l'anomalie qualifierait d'erreur un réglage qu'on
     * vient de rendre possible.
     */
    conservees:
      'Module Amendes éteint : les amendes déjà dues sont conservées, elles cessent seulement de s’accumuler.',
    /**
     * ⚠ Trois cas au retour, pas deux. Brancher sur le MONTANT faisait écrire
     * « Rendu dans les délais » à un retour de onze jours de retard dès que le
     * tarif valait zéro — module éteint, ou catégorie sans amende. Le retard
     * appartient à la CIRCULATION, qui est du noyau : il reste vrai et reste dit.
     */
    retourDansLesDelais: 'Rendu dans les délais, aucune amende.',
    retourEnRetard: (jours: number, montant: string) =>
      `Retard de ${jours} jour${jours > 1 ? 's' : ''} — amende à encaisser : ${montant}.`,
    retourEnRetardSansAmende: (jours: number) =>
      `Retard de ${jours} jour${jours > 1 ? 's' : ''} — aucune amende à encaisser.`,
  },

  /**
   * Statistiques — le bloc « Rappels envoyés » et le module `rappels`.
   *
   * ⚠ MÊME PARTAGE QUE POUR LES AMENDES, et pour la même raison. Ce qui part est
   * la FONCTION du module : le décompte d'une période pendant laquelle plus rien
   * n'est envoyé. Ce qui reste est l'HISTOIRE : les rappels déjà partis sont des
   * faits, et l'API les conserve (`GET /stats` n'est pas gardée par le module —
   * vérifié, aucun `@ModuleRequis('rappels')` dans `apps/api`).
   *
   * ⚠ Et « Aucun rappel sur la période », module éteint, est une NON-RÉPONSE
   * ÉCRITE COMME UN FAIT : elle dit que le système a compté et n'a rien trouvé,
   * quand il ne compte plus. Dans ce cas le bloc ne s'affiche pas du tout.
   */
  statistiques: {
    rappelsEteints:
      'Module Rappels éteint : plus aucun envoi. Les rappels ci-dessous ont été envoyés avant l’extinction.',
  },

  reglesDePret: {
    titre: 'Règles de prêt',
    introduction:
      'Durée d’un prêt, nombre de renouvellements, plafond d’emprunts et amende journalière, par catégorie d’adhérent et par type de document.',
  },

  adherents: {
    titre: 'Adhérents',
    introduction:
      'Les lecteurs inscrits à la bibliothèque. Une carte porte un code-barres, une catégorie qui décide des règles de prêt, et une date de fin de validité.',
    /**
     * ⚠ « par code-barres », et pas « par nom ». L'API ne cherche QUE le
     * code-barres (`barcode: { contains: q }`) : promettre le nom donnerait un
     * champ qui ne trouve pas ce qu'il annonce. Le besoin est signalé côté API ;
     * tant qu'il n'est pas servi, le libellé dit ce que le champ fait vraiment.
     */
    rechercher: 'Rechercher un adhérent',
    rechercheAccessible: 'Rechercher un adhérent par nom ou par code-barres',
    /**
     * ⚠ L'ANNONCE A CHANGÉ LE 11 SEPTEMBRE, et seulement parce que l'API a
     * changé. Elle disait « par code-barres » tant que `q` ne cherchait que
     * lui : promettre le nom aurait donné un champ qui ne trouve pas ce qu'il
     * annonce. Elle couvre maintenant code-barres, prénom, nom et e-mail.
     */
    indiceRecherche: 'Nom, prénom, e-mail ou code-barres.',
    effacerRecherche: 'Effacer la recherche',
    compte: (total: number) => `${total} adhérent${total > 1 ? 's' : ''}`,
    /** ⚠ Neutre : aucune invitation à agir. Voir la leçon du 10 septembre. */
    aucun: 'Aucun adhérent.',
    aucunPourCetteRecherche: 'Aucun adhérent ne correspond à cette recherche.',
    pageSur: (page: number, total: number) => `Page ${page} sur ${total}`,
    pagePrecedente: 'Page précédente',
    pageSuivante: 'Page suivante',

    colonneNom: 'Nom',
    colonneCodeBarres: 'Code-barres',
    colonneCategorie: 'Catégorie',
    colonneValidite: 'Carte valable jusqu’au',
    /**
     * ⚠ FONCTION, pas concaténation. La première rédaction composait
     * `` ` · ${colonneValidite} ${date}` `` dans l'écran : une langue qui place
     * ses mots autrement n'aurait rien eu à réécrire, elle aurait dû retoucher
     * du JSX. Trouvé par le test qui refuse les phrases écrites en dur.
     */
    validiteJusquau: (date: string) => `carte valable jusqu’au ${date}`,
    ouvrir: 'Ouvrir',
    retourListe: '← Tous les adhérents',

    /**
     * ⚠ Le nom vient du COMPTE lié, jamais de l'adhérent lui-même : `Patron` ne
     * porte pas de nom (backlog n° 10). Une carte sans compte n'a donc rien à
     * afficher, et l'écran le DIT au lieu de laisser une case vide.
     */
    sansNom: 'Carte sans nom',
    /**
     * Ne concerne plus que les cartes créées AVANT A2 : elles n'ont ni nom
     * propre ni compte, et rien ne peut les nommer rétroactivement.
     */
    sansNomExplication:
      'Cette carte a été créée avant que les adhérents portent leur propre nom, et aucun compte ne lui est lié. Renseignez le nom du lecteur pour la compléter.',
    /**
     * ⚠ INFORMATION, PAS AVERTISSEMENT — gris, sans ton d'alerte et sans verbe
     * d'action. Le désaccord est souvent le résultat VOULU d'une correction :
     * nom d'épouse, orthographe rectifiée, prénom d'usage. Le signaler comme une
     * faute qualifierait d'erreur le travail qu'on vient de rendre possible, et
     * pousserait à défaire une correction délibérée.
     */
    compteLie: (nom: string) => `Compte lié : ${nom}`,
    sansValidite: 'Sans date de fin',

    inscrire: 'Inscrire un adhérent',
    inscrireTitre: 'Nouvel adhérent',
    modifierTitre: 'Modifier la carte',
    champCodeBarres: 'Code-barres de la carte',
    champCategorie: 'Catégorie',
    champValidite: 'Fin de validité (facultatif)',
    indiceCategorie:
      'La catégorie décide des règles de prêt (durée, plafond, amende). Elle est enregistrée en minuscules.',
    champPrenom: 'Prénom',
    champNom: 'Nom',
    /**
     * ⚠ LA RÈGLE CONDITIONNELLE SE LIT, elle ne se découvre pas par un refus.
     * L'API exige un nom OU un compte lié. Laisser la 400 l'apprendre à la
     * bibliothécaire, c'est l'envoyer chercher ce qu'elle a mal fait alors que
     * la règle n'était écrite nulle part.
     *
     * ⚠ L'avertissement « Cette carte n'aura pas de nom » vivait ici jusqu'au
     * 11 septembre 2026. Il a disparu avec son objet : la carte porte désormais
     * son propre nom (A2). Un avertissement qu'on oublie de retirer devient un
     * mensonge qui inquiète.
     */
    nomOuCompte:
      'Le prénom et le nom sont attendus, sauf si vous liez la carte à un compte existant — le nom en est alors recopié.',
    enregistrer: 'Enregistrer',
    enregistrementEnCours: 'Enregistrement…',
    annuler: 'Annuler',
    inscrit: (codeBarres: string) => `Adhérent ${codeBarres} inscrit.`,
    modifie: 'Carte modifiée.',
    chargementImpossible: 'Chargement impossible.',
    ficheIntrouvable: 'Adhérent introuvable.',

    pretsEnCours: 'Prêts en cours',
    historique: 'Historique des prêts',
    /** ⚠ N'APPARAÎT QUE S'IL Y A UNE RÉPONSE : un vide affirmé trop tôt est une faute. */
    aucunHistorique: 'Aucun prêt rendu pour l’instant.',
    historiqueCompte: (total: number) => `${total} prêt${total > 1 ? 's' : ''} rendu${total > 1 ? 's' : ''}`,
    renduLe: (date: string) => `rendu le ${date}`,
    empruntéLe: (date: string) => `emprunté le ${date}`,
    renduEnRetard: (jours: number) => `rendu avec ${jours} jour${jours > 1 ? 's' : ''} de retard`,
    /** Nom accessible du lien vers la notice — annoncé, donc traduisible. */
    ouvrirLaNotice: (titre: string) => `Ouvrir la notice « ${titre} »`,
    aucunPret: 'Aucun prêt en cours.',
    echeanceLe: (date: string) => `à rendre le ${date}`,
    enRetard: (jours: number) => `en retard de ${jours} jour${jours > 1 ? 's' : ''}`,
    amendeCourue: (montant: string) => `amende courue : ${montant}`,
    reservations: 'Réservations',
    aucuneReservation: 'Aucune réservation active.',
    amendes: 'Amendes',
    amendesConstatees: 'constatées aux retours passés',
    amendesCourantes: 'courant sur les retards en cours',

    /**
     * ⚠ La suppression n'est possible que pour un adhérent qui n'a JAMAIS
     * emprunté. La clé étrangère est en RESTRICT et l'API refuse dès qu'un
     * prêt existe, même rendu — l'historique de prêt d'une bibliothèque ne
     * s'efface pas par effet de bord. Les deux cas sont dits SÉPARÉMENT :
     * un prêt en cours est une action à mener, un historique est définitif.
     */
    supprimer: 'Supprimer la carte',
    supprimerConfirmation: (qui: string) =>
      `Supprimer définitivement la carte de ${qui} ?`,
    supprimerConfirmer: 'Supprimer définitivement',
    /**
     * ⚠ NOMME les documents, ne les compte pas. « 2 prêts en cours » oblige la
     * bibliothécaire à aller chercher lesquels ; les titres lui disent quoi
     * réclamer, et c'est le geste suivant.
     */
    supprimerRefusPrets: (titres: string[]) =>
      `Suppression impossible : ${titres.length} prêt${titres.length > 1 ? 's' : ''} en cours — ${titres.join(', ')}. Enregistrez le retour au guichet, puis recommencez.`,
    /** Repli quand la situation de circulation n'a pas répondu : on compte, faute de mieux. */
    supprimerRefusPretsSansDetail: (n: number) =>
      `Suppression impossible : ${n} prêt${n > 1 ? 's' : ''} en cours. Enregistrez le retour au guichet, puis recommencez.`,
    supprimerRefusReservations: (n: number) =>
      `Suppression impossible : ${n} réservation${n > 1 ? 's' : ''} active${n > 1 ? 's' : ''}. Annulez-la au guichet, puis recommencez.`,
    supprimerRefusHistorique:
      'Suppression impossible : cet adhérent a déjà emprunté. L’historique de prêt est conservé, et une carte qui y est rattachée ne peut plus être supprimée.',
    supprimee: 'Carte supprimée.',
  },

  /** Registre des notices (back-office). */
  catalogue: {
    /** Tant que le chargement n'a pas abouti, on ne dit PAS un nombre. */
    chargementEnCours: 'Chargement du catalogue…',
    compteIndisponible: 'Nombre de notices indisponible : le chargement a échoué.',
    /** Un zéro affiché ici est une information, pas un défaut de chargement. */
    compteNotices: (total: number) => `${total} notice(s)`,
    /**
     * ⚠ LA TRONCATURE SE DIT. L'écran demande cent notices et n'en affiche pas
     * davantage ; il en annonçait 352 sans préciser lesquelles étaient à
     * l'écran. Un total juste au-dessus d'une liste incomplète est une
     * affirmation vraie qui en laisse croire une fausse.
     *
     * ⚠ Elle ne se voyait pas sur le fonds de démonstration : le plus gros
     * domaine compte 48 notices, donc filtrer ramenait toujours moins de cent.
     * C'est une coïncidence des DONNÉES, pas une propriété de l'écran — et elle
     * disparaîtra chez le premier client dont un domaine dépasse cent.
     */
    compteTronque: (affichees: number, total: number) =>
      `${affichees} notices affichées sur ${total}`,
    rechercher: 'Rechercher une notice',
    rechercheAccessible: 'Rechercher une notice par titre, auteur, ISBN ou éditeur',
    effacerRecherche: 'Effacer la recherche',
    /**
     * ⚠ LIMITE DITE À L'ÉCRAN, parce qu'elle surprend. `ILIKE` ne franchit pas
     * les accents : « region » ne trouve pas « région », et 268 des 352 titres
     * du fonds en portent au moins un. Une recherche qui ne trouve pas ce qu'on
     * sait présent fait douter du catalogue, pas de la requête — à moins qu'on
     * ne l'ait prévenu. Correctif backend prévu après P3.
     */
    rechercheIndice:
      'Titre, complément de titre, auteur, ISBN ou éditeur. Les accents comptent : « region » ne trouve pas « région ».',
    aucunPourCetteRecherche: 'Aucune notice ne correspond à cette recherche.',
    pageSur: (page: number, total: number) => `Page ${page} sur ${total}`,
    pagePrecedente: 'Page précédente',
    pageSuivante: 'Page suivante',
  },

  /** Outils · Import de notices — écran extrait le 9 septembre 2026. */
  importNotices: {
    titre: 'Import de notices',
    introduction:
      'Chargez un fichier MARC (ISO 2709, extension .mrc) issu d’un autre catalogue. Les notices sont ajoutées au catalogue ; le compte rendu détaille ce qui a été repris et ce qui ne l’a pas été.',
    fichierAImporter: 'Fichier à importer',
    formatMarc: 'Format MARC',
    importerUnFichier: 'Importer un fichier MARC',
    /** Compte rendu : les TROIS cas restent séparés, les fondre serait un silence. */
    compteRenduTitre: 'Compte rendu de l’import',
    masquer: 'Masquer',
    domaines: 'Domaines',
    casReconnus: 'Reconnus et repris',
    casAbsents: 'Absents de la source',
    casInconnus: 'Non reconnus, laissés vides',
    valeursNonReconnues: 'Valeurs non reconnues',
    valeursNonReconnuesTexte:
      'Ces notices sont bien importées : seul leur domaine est resté vide, et la valeur d’origine est conservée dans les métadonnées du fichier — rien n’est perdu. À vous de décider : créer le domaine dans',
    valeursNonReconnuesSuite: ', ou rattacher ces notices à un domaine existant.',
    /** Accord en nombre : porté par l'écran, pas par l'API. */
    occurrences: (n: number) => `${n} notice${n > 1 ? 's' : ''}`,
    importReussi: (importees: number, ignorees: number) =>
      `Import MARC : ${importees} notice(s) importée(s), ${ignorees} ignorée(s).`,
    importRefuse: 'Import refusé.',
    importImpossible: 'Import impossible.',
    noticesImportees: (n: number) => `${n} notice(s) importée(s)`,
    ignoreesSansTitre: (n: number) => ` · ${n} ignorée(s), sans titre`,
  },
} as const;
