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
    depot:
      'Le dépôt de documents n’est pas ouvert à votre compte (fonction « depot.deposer »).',
    encadrements:
      'Le suivi des encadrements n’est pas ouvert à votre compte (fonction « encadrements.voir »).',
    depotsAValider:
      'La validation des dépôts n’est pas ouverte à votre compte (fonction « depot.valider »).',
    aCataloguer:
      'Le catalogage des dépôts n’est pas ouvert à votre compte (fonction « catalogue.gerer »).',
  },

  /**
   * Adhérents (back-office) — écran neuf du 10 septembre 2026, backlog n° 8.
   * Entièrement soumis à la convention : aucun texte n'est écrit dans l'écran.
   */
  /**
   * « Mes encadrements » — P6-3, moitié front.
   *
   * ⚠ LE TEXTE QUI PORTE TOUT L'ÉCRAN est `ficheNonLiee`. L'API le dit dans la
   * description de sa propre route : « aucun encadrement » et « votre compte
   * n'est relié à aucune fiche d'auteur » sont DEUX choses. Un enseignant qui a
   * dirigé quinze thèses verrait sinon qu'il n'en a dirigé aucune — sur l'écran
   * qui sert à monter un dossier de promotion, et sans rien pouvoir y faire,
   * puisque le rattachement se pose au catalogage.
   */
  mesEncadrements: {
    titre: 'Mes encadrements',
    introduction:
      'Les mémoires et les thèses que vous avez dirigés, tels qu’ils sont enregistrés au catalogue.',
    /** ⚠ Aucun compte tant qu'on ne sait pas : voir la note du bloc. */
    chargement: 'Chargement de vos encadrements…',
    /** Ne s’affiche QUE si la fiche est rattachée — sinon c’est un faux. */
    aucun: 'Aucun mémoire ni aucune thèse ne vous est attribué comme directeur.',
    ficheNonLieeTitre: 'Votre compte n’est pas encore rattaché à votre fiche d’auteur',
    /**
     * ⚠ Un recours doit NOMMER à qui s’adresser. « Contactez le support » ou
     * « réessayez plus tard » ne sont pas des sorties : ici la personne ne peut
     * rien faire seule, le rattachement se pose au catalogage.
     */
    ficheNonLiee:
      'Vos encadrements existent peut-être déjà au catalogue : ils ne peuvent simplement pas ' +
      'vous être présentés tant que votre compte n’est pas relié à votre fiche d’auteur. ' +
      'Ce rattachement se fait au catalogage — demandez-le à la bibliothèque de votre établissement.',
    /** Le nom sous lequel le catalogue enregistre ses encadrements. */
    enregistreSous: (nom: string) => `Enregistrés sous le nom « ${nom} »`,
    colonneAnnee: 'Année',
    colonneEtudiant: 'Étudiant',
    colonneTitre: 'Titre',
    colonneType: 'Type',
    colonneUniversite: 'Université de soutenance',
    /** Une absence de donnée s’affiche comme une absence, jamais comme un vide. */
    nonRenseigne: 'Non renseigné',
    total: (n: number) => (n === 1 ? '1 encadrement' : `${n} encadrements`),
    /**
     * ⚠ L’export n’est PAS paginé, et le dire fait partie du texte : une pièce
     * justificative tronquée sans le dire serait un faux dans un dossier.
     */
    exportCsv: 'Télécharger la liste complète (CSV)',
    exportAide: 'Le fichier contient tous vos encadrements, pas seulement la page affichée.',
    pageSur: (page: number, total: number) => `Page ${page} sur ${total}`,
    pagePrecedente: 'Page précédente',
    pageSuivante: 'Page suivante',
    erreur: 'Vos encadrements n’ont pas pu être chargés.',
  },

  /**
   * « Dépôts à valider » — l'écran du DIRECTEUR, 12 septembre 2026.
   *
   * ⚠ POURQUOI IL EXISTE. Trois routes servaient déjà le directeur —
   * `GET /depots/a-valider`, `POST /depots/:id/valider`,
   * `POST /depots/:id/refuser` — et AUCUN écran ne les ouvrait. La recette du
   * circuit l'a montré : le mur du matin (« aucun directeur désignable ») était
   * tombé, et le circuit restait infranchissable un cran plus loin. Un étudiant
   * pouvait soumettre ; personne ne pouvait décider.
   *
   * ⚠ Et le garde `couverture-des-roles` ne pouvait pas le voir : il ne lit que
   * `ROLES_SYSTEME`. `depot.valider` n'est portée que par un rôle DYNAMIQUE —
   * donc hors de sa portée par construction.
   */
  depotsAValider: {
    titre: 'Dépôts à valider',
    introduction:
      'Les mémoires et les thèses dont vous êtes le directeur désigné, et qui attendent votre décision.',
    /** ⚠ Aucun compte tant qu'on ne sait pas : un « aucun dépôt » prématuré ferait partir. */
    chargement: 'Chargement des dépôts…',
    aucun: 'Aucun dépôt n’attend votre décision.',
    soumisLe: (date: string) => `Soumis le ${date}`,
    /**
     * ⚠ LIRE AVANT DE DÉCIDER. L'API le dit dans sa propre description : sans
     * cette route, « le circuit demandait à un directeur de valider un contenu
     * qu'il ne pouvait pas lire ». Le bouton doit donc exister, et en premier.
     */
    lire: 'Lire le document',
    sansDocument: 'Aucun document joint à ce dépôt.',
    echecLecture: 'Le document n’a pas pu être ouvert.',
    valider: 'Valider ce dépôt',
    /**
     * ⚠ Dit ce que la validation FAIT, et surtout ce qu'elle ne fait pas :
     * aucune notice n'est créée ici. Sans cette phrase, un directeur croit
     * avoir mis le document au catalogue, et s'étonne de ne pas l'y trouver.
     */
    validerSuite:
      'Validé. La notice reste à créer par la bibliothèque : ce n’est pas fait automatiquement.',
    refuser: 'Refuser',
    champMotif: 'Motif du refus',
    /**
     * ⚠ LE MOTIF EST LU PAR L'ÉTUDIANT, ET IL NE S'EFFACE JAMAIS. Le lui dire
     * ici est la seule occasion : une fois envoyé, il est à l'écran de
     * quelqu'un d'autre, et rien ne permet de le reprendre.
     */
    motifAide:
      'Ce motif sera lu par l’étudiant et restera attaché au dépôt. Dites ce qu’il faut corriger.',
    motifObligatoire: 'Un refus sans motif laisse redéposer la même chose : écrivez-en un.',
    refuserConfirmer: 'Envoyer le refus',
    annuler: 'Annuler',
    /**
     * ⚠ Aucune donnée n'est supprimée — l'API le garantit, l'écran le dit.
     *
     * ⚠ SCINDÉ LE 12 SEPTEMBRE 2026, quand le backend a livré la notification
     * du déposant. Avant, l'étudiant n'apprenait la décision qu'en revenant :
     * « l'étudiant voit votre motif » était donc exact. Maintenant un courriel
     * part — et il peut échouer. Dire « prévenu » sans le savoir serait le faux
     * qu'on a corrigé partout ailleurs ; ne rien dire laisserait le directeur
     * croire son étudiant informé.
     */
    refuseSuite:
      'Refus envoyé. Le dépôt et son document sont conservés, et votre motif reste attaché au dépôt.',
    /** Le courriel est parti : l'étudiant est prévenu sans avoir à revenir. */
    deposantPrevenu: 'Votre étudiant a été prévenu par courriel.',
    /**
     * ⚠ L'ÉCHEC DIT LA SORTIE EN MÊME TEMPS QUE L'ÉCHEC. Le directeur est le
     * seul à pouvoir relayer : lui dire « non parti » sans lui dire que la
     * décision est VISIBLE sur l'écran de l'étudiant le ferait douter du geste
     * entier, qui a pourtant abouti.
     */
    deposantNonPrevenu:
      'Votre étudiant n’a PAS pu être prévenu par courriel. La décision est bien enregistrée et ' +
      'il la verra en consultant « Mon dépôt » — mais tant qu’il n’y retourne pas, il ne sait rien. ' +
      'Dites-le-lui, ou signalez-le à votre bibliothèque.',
    echec: 'La décision n’a pas pu être enregistrée.',
  },

  /**
   * LA PORTE MANQUANTE DU CIRCUIT DE DÉPÔT — écran `/admin/roles`,
   * 12 septembre 2026. Décision de Jean, arbitrage A.
   *
   * ⚠ LE VRAI ÉTAT, ET IL EST PIRE QUE « LE CIRCUIT N'EST PAS OUVERT ».
   * `depot.deposer` est portée par le rôle SYSTÈME Étudiant, seedé dans CHAQUE
   * école. `depot.valider` n'est portée par AUCUN rôle système, délibérément —
   * « si personne ne peut valider, le circuit reste inerte plutôt qu'ouvert ».
   *
   * Conséquence : **toute école neuve est déjà à moitié ouverte.** Les étudiants
   * peuvent déposer partout, personne ne peut décider nulle part. Un dépôt
   * soumis reste alors à « soumis » sans sortie, et l'école en conclut que le
   * dépôt ne marche pas.
   *
   * ⚠ La condition d'affichage prévue au départ — « seulement si le module
   * `depot` est actif » — n'existe pas : il n'y a PAS de module `depot` au
   * registre, et les routes de dépôt ne portent aucune garde de module. Mesuré
   * avant d'écrire. Le bloc s'affiche donc dès qu'aucun rôle ne porte la
   * fonction, ce qui est exactement le cas à corriger.
   */
  /**
   * « Dépôts à cataloguer » — l'écran du BIBLIOTHÉCAIRE, dernier maillon du
   * circuit. 12 septembre 2026.
   *
   * ⚠ SANS LUI, UN DÉPÔT VALIDÉ N'ENTRE JAMAIS AU CATALOGUE. Le circuit
   * s'arrêtait à un pas de son but : l'étudiant dépose, le directeur valide, et
   * le document reste dans une table que rien n'expose.
   *
   * ⚠ ET LA NOTICE NE SE CRÉE PAS ICI, délibérément côté API :
   * `POST /cataloging/records` porte ses invariants — un auteur principal, trois
   * mots-clés — que le formulaire de dépôt ne fournit pas et n'a pas à fournir.
   * Créer la notice depuis le dépôt demanderait un TROISIÈME chemin d'écriture
   * aux règles plus souples, c'est-à-dire une porte ouverte sur ces invariants.
   *
   * L'écran doit donc rendre les DEUX temps lisibles — cataloguer par le chemin
   * normal, puis rattacher ici — sinon le bouton « rattacher » se lit comme
   * « créer », et son absence d'effet se lit comme une panne.
   */
  aCataloguer: {
    titre: 'Dépôts à cataloguer',
    introduction:
      'Les mémoires et les thèses validés par leur directeur, dont la notice reste à créer.',
    chargement: 'Chargement des dépôts…',
    aucun: 'Aucun dépôt validé n’attend d’être catalogué.',
    valideLe: (date: string) => `Validé le ${date}`,
    lire: 'Lire le document',
    sansDocument: 'Aucun document joint à ce dépôt.',
    /**
     * ⚠ DIT LES DEUX TEMPS, ET DANS L'ORDRE. Sans cette phrase, « Rattacher une
     * notice » se lit comme « créer la notice », et le bibliothécaire cherche
     * un formulaire qui n'existe pas ici.
     */
    marcheASuivre:
      'Catalogez ce document par le chemin habituel, puis revenez ici rattacher la notice créée. ' +
      'La notice n’est pas créée depuis cet écran : elle garde ses règles de saisie.',
    allerCataloguer: 'Ouvrir le catalogue',
    rattacher: 'Rattacher une notice',
    chercherNotice: 'Chercher la notice dans le catalogue',
    chercher: 'Chercher',
    /** ⚠ Ni « aucun résultat » ni la liste tant que la recherche n'a pas répondu. */
    rechercheEnCours: 'Recherche…',
    aucunResultat: 'Aucune notice ne correspond.',
    choisirCetteNotice: 'Rattacher celle-ci',
    annuler: 'Annuler',
    /** ⚠ Dit ce que le rattachement FAIT — le dépôt quitte cette liste. */
    rattachee: (titre: string) =>
      `Notice « ${titre} » rattachée : le dépôt quitte cette liste et son document est désormais au catalogue.`,
    echec: 'Le rattachement n’a pas pu être enregistré.',
    echecLecture: 'Le document n’a pas pu être ouvert.',
  },

  porteDuDepot: {
    titre: 'Personne ne peut valider un dépôt',
    /** Dit l'ASYMÉTRIE, pas « le circuit est fermé » — il est à moitié ouvert. */
    constat:
      'Vos étudiants peuvent déposer un mémoire ou une thèse : c’est ouvert par défaut. ' +
      'Mais aucun rôle de votre établissement ne porte la fonction qui permet de les ' +
      'valider ou de les refuser — un dépôt soumis resterait donc en attente sans réponse.',
    /**
     * ⚠ IL NOMME CE QUE LE RÔLE PORTERA. Un bouton « créer le rôle Enseignant »
     * qui pose des droits sans les dire est un élargissement en aveugle.
     */
    ceQueLeRolePortera: (fonction: string) =>
      `Le rôle proposé ne portera qu’une seule fonction : « ${fonction} » — voir et décider ` +
      `les dépôts dont on est le directeur désigné, jamais ceux d’un collègue.`,
    /** ⚠ Il PROPOSE, il ne crée pas : le formulaire s'ouvre pré-rempli. */
    proposer: 'Préparer ce rôle',
    apresProposition:
      'Le formulaire est pré-rempli : vérifiez le nom et les fonctions, ajoutez-en si vous le ' +
      'souhaitez, puis enregistrez. Rien n’est créé tant que vous n’avez pas enregistré.',
    /** Nom et description proposés — modifiables avant enregistrement. */
    nomPropose: 'Enseignant',
    descriptionProposee:
      'Dirige des mémoires et des thèses : valide ou refuse les dépôts dont il est le directeur désigné.',
  },

  /**
   * MES RÉSERVATIONS — l'échéance d'une mise de côté. 12 septembre 2026.
   *
   * ⚠ POURQUOI CE TEXTE EXISTE, et c'est « le silence qui coûte, pas l'échec ».
   * `GET /reader/holds` sert `expiryDate` DEPUIS TOUJOURS ; l'écran ne
   * l'affichait pas. Le lecteur lisait « Disponible — à retirer » sans aucune
   * date.
   *
   * Or la mise de côté a un délai, et le courriel qui l'annonce peut échouer
   * sans bruit — c'est un défaut mesuré côté API, pas une hypothèse. Un lecteur
   * non prévenu ne sait donc ni qu'un document l'attend, ni qu'il va le perdre.
   * L'écran est son SEUL recours, et il se taisait sur la moitié qui compte.
   *
   * ⚠ Trois états, pas deux : sans date servie, on n'invente pas d'échéance.
   */
  reservations: {
    aRetirerAvant: (date: string) => `À retirer avant le ${date}`,
    /** ⚠ Dit ce qui arrive si on ne vient pas — sinon la date n'est qu'un chiffre. */
    apresEcheance: 'Passé ce délai, le document repart à la personne suivante.',
  },

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
   * dire la même chose : faire disparaître le montant constaté avec le module
   * ressemblerait à une remise de dette, et cette information n'est lisible
   * nulle part ailleurs dans l'interface.
   *
   * ⚠ D'où le partage en deux. Ce qui DISPARAÎT est la fonction du module — le
   * calcul en cours, le détail « en cours sur les retards », l'encaissement. Ce
   * qui RESTE est le montant constaté, accompagné de la phrase qui explique pourquoi
   * il ne bouge plus. Sans cette phrase, un montant figé à côté de seize prêts
   * en retard se lit comme un calcul en panne.
   */
  amendes: {
    /**
     * ⚠ « CONSTATÉES (CUMUL) », ET PLUS « DUES ». Corrigé le 12 septembre 2026.
     *
     * `Checkout.fineAmount` n'est JAMAIS réduit : aucune route ne consigne un
     * encaissement. « Dues » affirmait donc un SOLDE — une somme qui décroît
     * quand on paie — là où le chiffre est un CUMUL de ce qui a été constaté.
     * Une bibliothécaire qui encaisse 2 950 FCFA revoit le même montant le
     * lendemain, et en conclut que son encaissement s'est perdu.
     *
     * C'est la même famille que le libellé du directeur : un mot exact sur son
     * objet — le montant existe bien — et faux sur ce qu'il DÉCRIT.
     */
    constatees: (montant: string) => `Amendes constatées (cumul) : ${montant}`,
    /**
     * ⚠ SANS CETTE PHRASE, LE MOT SEUL NE SUFFIT PAS. « Constatées (cumul) »
     * est exact mais opaque : il n'apprend rien à qui vient d'encaisser. Ce
     * bloc documente déjà qu'un montant figé « se lit comme un calcul en
     * panne » — c'est le même risque, déplacé du module éteint au paiement.
     *
     * Elle dit un FAIT du logiciel, pas une consigne de caisse : Gafeso ne sait
     * pas encore enregistrer un paiement, et l'ignorer ferait chercher un bogue.
     */
    aucunEncaissementEnregistre:
      'Gafeso n’enregistre pas encore les encaissements : ce cumul ne diminue pas quand un adhérent paie.',
    /**
     * ⚠ INFORMATION, PAS ALERTE. L'extinction est un choix de l'école ; la
     * signaler sur le ton de l'anomalie qualifierait d'erreur un réglage qu'on
     * vient de rendre possible.
     */
    conservees:
      'Module Amendes éteint : les amendes déjà constatées sont conservées, elles cessent seulement de s’accumuler.',
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
    /**
     * Le détail du guichet, jusqu'ici écrit en dur dans l'écran. Il sort du
     * code parce que ce lot en RÉÉCRIT le vocabulaire — pas au passage.
     */
    detailConstateEtCourant: (constate: string, courant: string) =>
      `Constatées (cumul) : ${constate} · en cours sur les retards : ${courant}`,
    /**
     * ⚠ `totalCourt` A VÉCU UNE HEURE. Je l'avais créé le 12 septembre 2026 en
     * sortant du code la chaîne « Amendes : … » du guichet — sans voir qu'elle
     * affichait `totalXof`, la somme d'un cumul historique et d'un encours du
     * jour. Sortir un texte du code ne le rend pas vrai ; j'avais déplacé un
     * nombre qui ne désigne rien, proprement.
     *
     * Remplacé par les deux grandeurs SÉPARÉES, qui sont les seules à avoir un
     * sens : ce qui est constaté, et ce qui court aujourd'hui.
     */
    courantSurRetards: (montant: string) => `Amendes en cours sur les retards : ${montant}`,
  },

  /**
   * LA PERTE D'UN DOCUMENT — P?, moitié front, 12 septembre 2026.
   *
   * ⚠ POURQUOI CE GESTE EXISTE. Le seul chemin pour clore un prêt était le
   * RETOUR : pour un document perdu, il fallait donc déclarer un retour qui
   * n'a pas eu lieu. Ce chemin remet l'exemplaire en circulation et prévient
   * le lecteur suivant que son document l'attend au guichet — un mensonge qui
   * se propage jusqu'à quelqu'un qui se déplace pour rien.
   */
  perte: {
    /** Sur la ligne d'un prêt EN COURS, dans la fiche d'adhérent. */
    declarer: 'Déclarer perdu',
    /**
     * ⚠ LA CONFIRMATION NOMME LE DOCUMENT. « Êtes-vous sûr ? » ne dit pas
     * lequel, et c'est précisément ce qu'il faut relire avant un geste qui
     * sort un exemplaire du fonds. Elle dit aussi les DEUX effets — l'état de
     * l'exemplaire et le sort de l'amende — parce qu'aucun des deux ne se
     * devine, et qu'aucun ne se défait.
     */
    confirmation: (titre: string, codeBarre: string) =>
      `Déclarer « ${titre} » (${codeBarre}) perdu ? L’exemplaire passe en « perdu » et ` +
      `sort du fonds : il ne pourra plus être prêté. L’amende est figée à son montant ` +
      `du jour. Ce geste ne s’annule pas.`,
    confirmer: 'Déclarer ce document perdu',
    faite: (titre: string) => `« ${titre} » est déclaré perdu.`,
    /**
     * ⚠ INFORMATION, PAS ALERTE — et c'est une décision, pas une nuance de ton.
     * Une file que plus aucun exemplaire ne peut servir n'est pas une anomalie :
     * c'est un état qu'un rachat résout, et la bibliothécaire est la seule à
     * pouvoir en décider. Le signaler sur le ton de l'erreur qualifierait de
     * faute un geste qu'on vient de rendre possible.
     *
     * ⚠ Et il dit que les réservations sont CONSERVÉES, parce que l'API a
     * tranché ainsi : signalées, jamais annulées — une réservation appartient
     * au lecteur, et la lui retirer serait décider à sa place.
     */
    fileNonServable: (n: number) =>
      n === 1
        ? 'Une réservation en attente ne peut plus être servie : aucun autre exemplaire de ' +
          'ce document ne circule. Elle est conservée — personne n’a perdu sa place.'
        : `${n} réservations en attente ne peuvent plus être servies : aucun autre ` +
          'exemplaire de ce document ne circule. Elles sont conservées — personne n’a ' +
          'perdu sa place.',
    /** Sur la liste des réservations du guichet. Même règle : dire, pas alarmer. */
    holdNonServable: 'Aucun exemplaire ne circule',
    echec: 'La perte n’a pas pu être déclarée.',
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
  /**
   * Textes d'accessibilité.
   *
   * ⚠ CE SONT DES TEXTES VISIBLES au sens de la convention du dépôt : un
   * `aria-label` annoncé à l'utilisateur est à traduire. La borne n'est pas
   * « visible / invisible » mais « ce qui double un texte déjà affiché » — et
   * aucun de ceux-ci n'en double un.
   */
  accessibilite: {
    /** ⚠ Premier élément focalisable de la page : il n'a de sens qu'en tête. */
    allerAuContenu: 'Aller au contenu',
    /** Les trois `nav` de la coque s'annonçaient « navigation » à l'identique. */
    navPrincipale: 'Navigation principale',
    navDeLaSection: (section: string) => `Navigation de la section ${section}`,
    ongletsDuGuichet: 'Opérations du guichet',
    navDepliee: 'Navigation principale, menu déplié',
  },

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
  /**
   * Index des auteurs.
   *
   * ⚠ CES LIBELLÉS EXISTENT PARCE QUE L'ÉCRAN NE DISAIT RIEN. Mesuré sur un
   * fonds de 8 000 notices : l'API rend **200 auteurs** par page et annonce
   * `total`, `page`, `totalPages` ; l'écran ne lisait que `authors`. Il
   * affichait donc 200 lignes sur 557, sans compteur et sans pagination — une
   * liste tronquée présentée comme complète. Qui cherche un auteur au-delà du
   * deux-centième ne le trouve pas, et rien ne lui dit qu'il manque quelque
   * chose.
   */
  /**
   * Santé de l'index de recherche — bloc de /admin/interoperabilite.
   *
   * ⚠ TROIS PIÈGES NOMMÉS PAR LA SESSION BACK, ET CHACUN A SA LIGNE ICI.
   *
   * 1. `indisponible` NE S'ÉCRIT JAMAIS « 0 sur 8 000 ». Le moteur ne répond
   *    pas : on ne SAIT pas combien il contient. Écrire zéro fabriquerait
   *    l'invitation à réindexer que toute la route existe pour éviter — et
   *    réindexer parce qu'on croit l'index vide alors qu'il est seulement
   *    injoignable, c'est le détruire pour de bon.
   * 2. L'ÉCART EST SIGNÉ, et les deux signes ne disent pas la même chose :
   *    positif, des notices manquent à l'index et sont invisibles à la
   *    recherche ; négatif, l'index porte des documents que la base n'a plus,
   *    donc des résultats qui mènent à une notice supprimée. Un « écart de 12 »
   *    sans son sens laisse choisir la mauvaise réparation.
   * 3. `dansIndex` vaut `null` quand le moteur est injoignable, jamais 0.
   */
  indexSante: {
    titre: 'Index de recherche',
    /** ⚠ Aucun nombre tant qu'on n'a pas la réponse : un compte est une affirmation. */
    chargement: 'Vérification de l’index…',
    aligne: (nombre: number) =>
      `Index aligné sur le catalogue : ${nombre} notice(s) en base, autant dans l’index.`,
    /** ⚠ Écart POSITIF : ce qui manque à l'index. */
    manquantes: (combien: number, enBase: number) =>
      `${combien} notice(s) absentes de l’index sur ${enBase} — elles ne ressortent pas dans la recherche. Une réindexation les y remet.`,
    /** ⚠ Écart NÉGATIF : ce que l'index porte en trop. */
    fantomes: (combien: number) =>
      `${combien} document(s) de l’index ne correspondent plus à une notice — des résultats de recherche mènent à une notice supprimée. Une réindexation les retire.`,
    /**
     * ⚠ NI CHIFFRE D'INDEX, NI INVITATION. On dit ce qu'on sait — le compte en
     * base — et on dit qu'on ne sait pas le reste.
     */
    indisponible: (enBase: number) =>
      `Le moteur de recherche ne répond pas : le contenu de l’index est inconnu. Le catalogue compte ${enBase} notice(s) en base. Rien ne dit que l’index soit vide, et il ne faut pas le reconstruire sur cette seule information.`,
    echec: 'État de l’index indisponible : la vérification a échoué.',

    /**
     * ⚠ LA CONFIRMATION DIT LE COÛT RÉEL, ET CE N'EST PAS LA DURÉE. Mesuré sur
     * le fonds d'échelle : 0,5 à 0,8 s pour 8 000 notices. Annoncer « un travail
     * long » serait faux ici, et une bibliothécaire qui attend une minute devant
     * une opération d'une seconde apprend à ne plus lire les avertissements.
     *
     * Ce qui coûte, c'est que `reindexAll` VIDE l'index avant de le
     * reconstruire : pendant l'opération, la recherche publique ne rend rien.
     * Et si elle échoue en chemin, l'index reste vide jusqu'à la suivante. C'est
     * ça qu'il faut savoir avant de cliquer, pas un nombre de secondes qui
     * dépend du serveur de l'école.
     */
    reindexer: 'Réindexer le catalogue',
    reindexerTitre: 'Réindexer tout le catalogue ?',
    reindexerCout: (notices: number) =>
      `L’index est d’abord VIDÉ, puis reconstruit à partir des ${notices} notice(s) de la base. Pendant l’opération, la recherche publique ne rend aucun résultat ; si elle échoue en chemin, l’index reste vide jusqu’à la prochaine.`,
    reindexerDonnees: 'Aucune notice n’est modifiée : l’index est reconstruit depuis la base, qui reste la source de vérité.',
    reindexerConfirmer: 'Réindexer',
    reindexerAnnuler: 'Annuler',
    reindexEnCours: 'Réindexation en cours…',
    reindexFait: (indexees: number) => `Réindexation terminée : ${indexees} notice(s) dans l’index.`,
    reindexEchec: 'La réindexation a échoué. L’index peut être incomplet — relancez-la.',
  },

  /**
   * Inscription publique — le sort de l'email de définition de mot de passe.
   *
   * ⚠ L'API REND CE SORT DEPUIS TOUJOURS, AVEC UN COMMENTAIRE QUI LE DIT :
   * « l'interface doit pouvoir dire la vérité ». L'écran public ne déclarait même
   * pas le champ et annonçait « un email vous a été envoyé » dans tous les cas.
   *
   * ⚠ ET LE PUBLIC N'A AUCUN RECOURS, contrairement à l'écran d'administration.
   * Un gestionnaire à qui l'envoi échoue voit le lien et le transmet. Un étudiant
   * qui lit « un email vous a été envoyé » alors que rien n'est parti attend une
   * messagerie muette — et le lien de définition de mot de passe est le SEUL
   * chemin vers son compte. Le faux ne le trompe pas seulement : il l'immobilise.
   */
  /**
   * Définition du mot de passe — l'écran au bout du lien reçu par courriel.
   *
   * ⚠ C'EST LE SEUL CHEMIN VERS LE COMPTE, et il n'a pas de libre-service : la
   * seule route qui régénère un lien est une route d'ADMINISTRATION. Quand
   * l'API répond « Lien invalide ou expiré. » — un lien de 24 h, un courriel lu
   * le lendemain —, l'écran affichait ce fait et rien d'autre. La personne
   * restait devant une porte close sans savoir qu'il fallait demander.
   *
   * ⚠ ET LA BRANCHE D'À CÔTÉ SAVAIT DÉJÀ LE DIRE. Le cas « jeton manquant dans
   * l'adresse » finit par « ou contactez le gestionnaire de votre
   * établissement ». Le cas « jeton refusé », lui, s'arrêtait au constat. Deux
   * portes du même écran, une seule indiquait la sortie.
   */
  motDePasse: {
    /** S'ajoute à TOUT échec : dans tous les cas, le recours est le même. */
    recours:
      'Si le problème persiste, demandez un nouveau lien au gestionnaire de votre établissement : il peut vous le transmettre directement.',
  },

  /**
   * « Mon dépôt » — l'espace de l'étudiant qui dépose un mémoire ou une thèse.
   *
   * ⚠ CET ÉCRAN EXISTE POUR QU'ON N'AIT PAS À REDÉPOSER. L'API le dit dans sa
   * propre description : « un étudiant qui dépose et n'entend plus rien
   * redéposera ». Le suivi n'est donc pas un confort, c'est ce qui empêche les
   * doublons — et un doublon de thèse, personne ne sait lequel est le bon.
   */
  monDepot: {
    titre: 'Mon dépôt',
    introduction:
      'Déposez votre mémoire ou votre thèse, puis suivez son avancement jusqu’à la validation.',
    /** ⚠ Aucun compte tant qu'on ne sait pas : un « aucun dépôt » prématuré ferait redéposer. */
    chargement: 'Chargement de vos dépôts…',
    aucun: 'Vous n’avez encore déposé aucun document.',
    echecDocument: 'Le document n’a pas pu être envoyé.',
    /** Les quatre états, dans les mots de l'étudiant et non ceux de la base. */
    etats: {
      brouillon: 'Brouillon',
      soumis: 'Soumis — en attente de votre directeur',
      valide: 'Validé par votre directeur',
      /**
       * ⚠ QUATRIÈME ÉTAT, TROUVÉ EN RECETTE LE 12 SEPTEMBRE 2026. La base n'en
       * connaît que quatre — `valide` couvre donc DEUX situations très
       * différentes pour le déposant : sa thèse attend le catalogage, ou elle
       * est AU CATALOGUE. `recordId` les distingue, et il était servi depuis
       * toujours sans que l'écran le déclare.
       *
       * Troisième « colonne servie que personne ne montre » de la journée, et
       * la plus tardive du circuit : c'est la dernière chose que l'étudiant
       * attend, et il ne l'apprenait jamais.
       */
      valideEtCatalogue: 'Au catalogue',
      refuse: 'Refusé',
    } as Record<string, string>,
    /**
     * ⚠ LE MOTIF D'UN REFUS NE S'EFFACE JAMAIS, et l'écran doit le montrer : un
     * refus sans sa raison laisse redéposer la même chose.
     */
    motifDuRefus: 'Motif du refus',
    /** ⚠ Dit ce qu'il FAUT faire, pas seulement que c'est fini. */
    refusSuite:
      'Ce dépôt reste refusé : sa décision n’est pas annulable. Corrigez votre document et créez un NOUVEAU dépôt — les deux resteront visibles.',
    fichier: 'Document',
    aucunFichier: 'Aucun document joint pour l’instant.',
    remplacerFichier: 'Remplacer le document',
    choisirFichier: 'Joindre le document (PDF ou EPUB)',
    /** ⚠ Dit POURQUOI on ne peut plus, pas seulement qu'on ne peut pas. */
    fichierFige:
      'Le document n’est plus remplaçable : il a été transmis à votre directeur avec le dépôt.',
    soumettre: 'Soumettre à mon directeur',
    /**
     * ⚠ LA SORTIE D'UN DÉPÔT SOUMIS — 12 septembre 2026, arbitrée par Jean.
     *
     * « Soumis » était le SEUL état dont la sortie dépendait de quelqu'un
     * d'autre : valider et refuser sont réservés au directeur DÉSIGNÉ, et le
     * directeur ne se change que sur un brouillon. Un directeur qui perdait la
     * fonction — rôle changé, compte désactivé, départ — bloquait le dépôt pour
     * toujours, et l'étudiant lisait « en attente de votre directeur »
     * indéfiniment, ce qui était exact.
     *
     * C'est SON dépôt : il ne doit dépendre de personne pour en reprendre la
     * main.
     */
    retirer: 'Retirer mon dépôt',
    /**
     * ⚠ La confirmation dit les DEUX effets. Le retrait n'est pas une
     * suppression — c'est un retour en arrière — et il PRÉVIENT le directeur,
     * ce qui ne se devine pas.
     */
    retirerConfirmation:
      'Retirer ce dépôt de l’examen ? Il redevient un brouillon : vous pourrez le corriger, ' +
      'changer de directeur, et le soumettre à nouveau. Rien n’est supprimé. Votre directeur ' +
      'sera prévenu du retrait.',
    retirerConfirmer: 'Retirer et repasser en brouillon',
    retireEtPrevenu: 'Dépôt retiré : il est redevenu un brouillon, et votre directeur a été prévenu.',
    /** ⚠ L'échec de l'envoi n'efface pas le succès du retrait. */
    retireNonPrevenu:
      'Dépôt retiré : il est redevenu un brouillon. Mais votre directeur n’a PAS pu être prévenu ' +
      'par courriel — s’il attendait votre travail, dites-le-lui.',
    retirerEchec: 'Le dépôt n’a pas pu être retiré.',
    /** ⚠ Le geste qui MANQUAIT : voir sa thèse là où le public la trouvera. */
    voirAuCatalogue: 'Voir la notice au catalogue',
    /**
     * ⚠ Dit l'ATTENTE quand la notice n'est pas encore là. Sans elle, « Validé
     * par votre directeur » est le dernier mot que l'étudiant lit, et il ne
     * sait pas qu'une étape reste — ni qu'elle ne dépend plus de lui.
     */
    valideEnAttenteDeCatalogage:
      'Votre directeur a validé. La bibliothèque doit encore créer la notice : c’est la dernière ' +
      'étape, et elle ne dépend plus de vous.',
    /**
     * ⚠ CE TEXTE A ÉTÉ RÉÉCRIT LE 12 SEPTEMBRE 2026, ET LA RAISON COMPTE PLUS
     * QUE LE TEXTE. Il disait « votre établissement n'a pas encore ouvert la
     * désignation » — vrai le matin, faux l'après-midi : le backend a livré
     * `GET /depots/directeurs` et `PATCH /depots/:id/directeur`.
     *
     * Une phrase qui reste écrite sans plus être vraie ne se voit pas : elle
     * est là, lisible, rassurante, et elle envoie l'étudiant demander à sa
     * bibliothèque d'ouvrir ce qui est déjà ouvert. C'est la question qu'on se
     * pose maintenant devant tout élargissement — « qu'est-ce qui reste écrit
     * sans plus être vrai ? »
     *
     * Il ne subsiste QUE pour le cas où il est encore exact : la liste des
     * directeurs est arrivée, et elle est VIDE — personne, dans cette école, ne
     * porte `depot.valider`. Là, l'étudiant ne peut effectivement rien faire, et
     * la phrase doit dire à qui s'adresser.
     */
    sansDirecteur:
      'Soumission impossible : aucun directeur de mémoire ou de thèse n’est déclaré dans votre établissement. Signalez-le à votre bibliothèque — votre dépôt et son document sont conservés.',
    /** Le menu de désignation, ouvert dès qu'un directeur est disponible. */
    choisirDirecteur: 'Directeur de mémoire ou de thèse',
    /** ⚠ Ni « aucun directeur » ni le menu tant que la liste n'est pas arrivée. */
    chargementDirecteurs: 'Chargement des directeurs…',
    aucunChoixDirecteur: 'Choisissez…',
    directeurDesigne: (nom: string) => `Directeur désigné : ${nom}`,
    directeurChange: 'Directeur enregistré.',
    /** ⚠ Dit POURQUOI le bouton est gris, sinon il se lit comme une panne. */
    sansDirecteurDesigne:
      'Désignez votre directeur ci-dessus avant de soumettre : c’est lui qui recevra le dépôt.',
    /**
     * ⚠ L'ENVOI PEUT ÉCHOUER SANS QUE LA SOUMISSION ÉCHOUE. L'API rend l'issue
     * de la notification exprès pour que l'écran puisse le dire : sinon
     * l'étudiant attend une réponse d'un directeur qui n'a jamais été prévenu.
     */
    /**
     * ⚠ TROISIÈME ÉTAT, POSÉ LE 12 SEPTEMBRE 2026 AVANT QUE L'API NE CHANGE.
     *
     * Le backend cessera de prévenir le directeur à la RESOUMISSION — une
     * resoumission après retrait n'est pas une information nouvelle — et il
     * OMETTRA `notification` plutôt que de rendre `{ sent: false }`. La
     * distinction est celle de Jean, et elle est juste : « déjà prévenu » n'est
     * pas « pas pu être prévenu ».
     *
     * ⚠ Sans ce troisième état, l'écran tombait sur « votre directeur a été
     * prévenu » — une affirmation tirée d'une ABSENCE. On ne dit donc RIEN de
     * l'envoi quand l'API n'en dit rien : le dépôt est soumis, c'est tout ce
     * qu'on sait.
     */
    soumisSansNouvelEnvoi: 'Dépôt soumis.',
    soumisEtPrevenu: 'Dépôt soumis : votre directeur a été prévenu.',
    soumisNonPrevenu:
      'Dépôt soumis, MAIS votre directeur n’a pas pu être prévenu par courriel. Signalez-le-lui, ou prévenez votre bibliothèque : le dépôt, lui, est bien enregistré.',
    nouveau: 'Déposer un document',
    champTitre: 'Titre du document',
    champAuteur: 'Auteur',
    champType: 'Type de document',
    champAnnee: 'Année de soutenance',
    creer: 'Créer le dépôt',
    annuler: 'Annuler',
  },

  inscription: {
    compteActive: 'Compte activé !',
    /**
     * ⚠ CE BLOC EXISTE PARCE QUE L'ÉCRAN NE PEUT PAS SAVOIR. `register`
     * notifie les gestionnaires, mais l'issue de cet envoi est JOURNALISÉE PUIS
     * AVALÉE côté API : elle n'atteint jamais la réponse. Le cas
     * `aucun_destinataire` — une école sans gestionnaire actif — est
     * explicitement reconnu dans le code, et personne à l'extérieur ne
     * l'apprend.
     *
     * L'ancienne phrase disait « le gestionnaire doit activer votre compte.
     * Vous recevrez alors un email. » Exacte SI quelqu'un a été prévenu. Sinon,
     * l'inscrit attend indéfiniment une activation que personne n'a été invité
     * à faire — et il n'a aucun autre canal : il n'a pas encore de compte.
     *
     * ⚠ On ne peut pas rendre la phrase vraie, on peut lui donner une SORTIE.
     * C'est la règle : « si c'est faux, que peut faire la personne ? » Ici,
     * se présenter à la bibliothèque.
     */
    enAttenteTitre: 'Compte créé, en attente de validation.',
    enAttenteEtudiant:
      'Votre matricule n’est pas dans la liste pré-chargée : un gestionnaire de votre ' +
      'établissement doit activer votre compte.',
    enAttentePersonnel:
      'Un gestionnaire de votre établissement doit activer votre compte, et définira votre ' +
      'rôle à cette occasion.',
    /** ⚠ Ce qui suit, et le recours — jamais une promesse qu'on ne peut pas tenir. */
    enAttenteSuite:
      'Une fois votre compte activé, vous recevrez un email pour définir votre mot de passe. ' +
      'Si rien ne vient sous quelques jours, présentez-vous à la bibliothèque de votre ' +
      'établissement avec votre email : nous ne pouvons pas vous confirmer ici que votre ' +
      'demande a bien été signalée.',
    emailParti:
      'Un email vous a été envoyé avec un lien sécurisé pour définir votre mot de passe (valable 24 h).',
    /** ⚠ Dit l'échec ET la sortie : sans recours, l'information ne sert à rien. */
    emailNonParti:
      'Votre compte est actif, mais l’email de définition de mot de passe N’A PAS PU ÊTRE ENVOYÉ. Contactez votre bibliothèque : elle peut vous transmettre le lien directement.',
  },

  /**
   * Comptes — pagination et compteur d'onglets.
   *
   * ⚠ DEUX DÉFAUTS TROUVÉS À 481 COMPTES, INVISIBLES À CINQ.
   *
   * 1. L'onglet « Tous » affichait `data.total`, c'est-à-dire le total de la
   *    requête COURANTE : « Tous(68) » quand on regardait les comptes en
   *    attente, « Tous(413) » sur les actifs, et le vrai chiffre seulement
   *    quand il était sélectionné. Un gestionnaire lisait donc le nombre de
   *    l'onglet d'à côté. Le remède était sous la main : l'API rend `counts`,
   *    la ventilation complète et stable quel que soit le filtre.
   * 2. Cent lignes affichées sur 481, sans pagination et sans un mot — la même
   *    liste tronquée que l'index des auteurs, à la même semaine.
   */
  comptes: {
    compte: (total: number) => `${total} compte(s)`,
    pageSur: (page: number, total: number) => `Page ${page} sur ${total}`,
    pagePrecedente: 'Page précédente',
    pageSuivante: 'Page suivante',
  },

  /**
   * Arbre des collections — P6-1.
   *
   * ⚠ LA PHRASE CENTRALE DE CE LOT EST CELLE DU NON-HÉRITAGE, et elle existe
   * parce que le contraire est ce que tout le monde suppose. Une sous-collection
   * n'hérite de RIEN : sans règle propre, elle n'est visible de personne, même
   * si sa parente en porte dix. Un administrateur qui pose une règle sur
   * « Faculté de Droit » et croit avoir ouvert ses départements se tromperait
   * en silence — et ce silence serait du côté du produit.
   *
   * ⚠ Elle ne s'affiche QUE là où elle détrompe : sur une sous-collection sans
   * règle. Sur une racine sans règle, le fait est le même mais personne n'a cru
   * hériter de quoi que ce soit — le dire partout apprendrait à ne plus le lire.
   */
  collectionsArbre: {
    sansRegle: 'Aucune règle d’accès : cette collection n’est visible de personne.',
    sansRegleSousCollection:
      'Aucune règle d’accès propre : cette sous-collection n’est visible de personne. Les règles de la collection parente ne s’appliquent PAS — il n’y a pas d’héritage.',
    /** Rappel discret, en tête de liste, pour qui découvre la hiérarchie. */
    pasDHeritage:
      'Une sous-collection n’hérite pas des règles de sa parente : chacune porte les siennes.',
    profondeurMax: 'Trois niveaux au maximum : faculté, département, type de document.',
  },

  auteurs: {
    /** ⚠ Pas de nombre tant qu'on ne l'a pas : un compteur est une affirmation. */
    chargement: 'Chargement de l’index des auteurs…',
    compte: (total: number) => `${total} auteur(s)`,
    /**
     * ⚠ `listeTronquee` A VÉCU UNE JOURNÉE, et sa disparition est le bon signe.
     * Elle disait « 200 auteurs affichés sur 557 » parce que la route refusait
     * `page` : dire la coupure était tout ce qu'on pouvait faire honnêtement,
     * un pager n'ayant nulle part où aller. La route l'accepte depuis, et le
     * parcours remplace l'aveu. On ne garde pas un libellé qui décrit une
     * limite levée.
     */
    pageSur: (page: number, total: number) => `Page ${page} sur ${total}`,
    pagePrecedente: 'Page précédente',
    pageSuivante: 'Page suivante',
  },

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
