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
   * ⚠ LES TITRES D'ONGLET SONT DES TEXTES VISIBLES. Ils s'affichent dans
   * l'onglet du navigateur, dans un signet, dans un résultat de moteur et dans
   * l'aperçu d'un lien partagé. Ils sortent donc du code comme le reste.
   *
   * ⚠ ET CE SONT LES SEULS QUI QUITTENT L'APPLICATION. Le reste de ce fichier
   * s'affiche à quelqu'un qui est déjà là ; ceux-ci partent dans l'index d'un
   * moteur et dans les signets de gens qu'on ne reverra peut-être pas. C'est
   * la borne de « quand le faux silencieux SORT de l'application » appliquée
   * non plus à un code HTTP mais à une IDENTITÉ.
   *
   * Le nom de l'ÉCOLE est composé par le gabarit racine ; ces libellés ne
   * portent que le segment propre à la page.
   */
  /**
   * L'écran de CONNEXION — et le repli de double authentification, qui est le
   * texte le plus lourd de conséquence de tout ce fichier.
   *
   * ⚠ CE QUI ÉTAIT FAUX, mesuré le 14 septembre 2026. Le bouton affichait
   * « Code envoyé par email ✓ » dès que l'appel rendait 200 — **sans lire ce
   * que l'API répondait**. Or elle rend le sort RÉEL de l'envoi depuis le
   * 12 septembre, et son commentaire dit pourquoi : « quelqu'un qui a perdu son
   * appareil TOTP n'a plus que ce chemin ».
   *
   * Le backend avait livré sa moitié. La nôtre n'a jamais été branchée : la
   * correction existait, et le mensonge restait affiché.
   *
   * ⚠ C'est « UN FAUX QUI RETIRE LE SEUL RECOURS » dans sa forme la plus pure.
   * La personne ne peut pas se connecter, elle attend devant une boîte vide,
   * et rien ne lui dit qu'il faut demander de l'aide.
   */
  connexion: {
    /**
     * ⚠ LA DÉCONNEXION QUI N'A PAS ABOUTI.
     *
     * `header.tsx` appelait `POST /auth/logout` dans un `try` dont le `catch`
     * était vide — « déconnexion best-effort : on nettoie l'UI quoi qu'il
     * arrive ». L'interface disait donc « déconnecté » que l'appel ait abouti
     * ou non, pendant que le cookie de session du SERVEUR survivait 24 h.
     *
     * Mesuré le 16 septembre 2026 dans le volet de recette : `bc_user` effacé,
     * `bc_token` toujours valide, `/api/auth/me` répondant 200. La route,
     * elle, fonctionne (200 → 201 → 401 en l'appelant à la main) : ce qui
     * manquait n'était pas le serveur, c'était de LIRE sa réponse.
     *
     * ⚠ On continue de nettoyer l'interface — la personne a demandé à partir,
     * et la laisser connectée serait pire. Mais on le DIT, et on donne le
     * geste : fermer le navigateur ferme la session côté navigateur, et
     * réessayer ferme celle du serveur.
     */
    deconnexionNonConfirmee:
      'Votre session n’a pas pu être fermée sur le serveur — elle peut rester ouverte jusqu’à demain.',
    deconnexionNonConfirmeeGeste:
      'Sur un ordinateur partagé, fermez complètement le navigateur, ou reconnectez-vous puis déconnectez-vous à nouveau.',
    /**
     * ⚠ NE S'AFFICHE QUE SI L'API A DIT `sent: true`. Jamais sur un simple 200 :
     * c'est exactement la distinction qui manquait.
     */
    codeEnvoye: 'Code envoyé par email ✓ (renvoyer)',
    codeDemander: 'Recevoir un code par email',
    /**
     * `smtp_absent` — rien n'est parti et rien ne partira tant que la
     * configuration ne change pas. Dire « réessayez » ici serait cruel : le
     * texte nomme donc la SORTIE, et elle est humaine.
     */
    codeNonPartiDefinitif:
      'Le code n’a PAS pu être envoyé : la messagerie de votre établissement n’est pas ' +
      'configurée, et un nouvel essai n’y changera rien. Demandez à votre bibliothèque ou ' +
      'à votre administrateur de vous rouvrir l’accès.',
    /** `smtp_error` — le serveur a refusé ; un nouvel essai a du sens. */
    codeNonPartiReessayable:
      'Le code n’a PAS pu être envoyé : la messagerie a refusé le message. Réessayez dans ' +
      'un instant ; si rien n’arrive, demandez à votre bibliothèque de vous rouvrir l’accès.',
    /** Tout autre motif — on ne devine pas lequel, on donne la même sortie. */
    codeNonParti:
      'Le code n’a PAS pu être envoyé. Demandez à votre bibliothèque ou à votre ' +
      'administrateur de vous rouvrir l’accès.',
  },


  /**
   * ⚠ LES ÉCRANS QUI NE MONTRAIENT RIEN PENDANT QU'ILS CHARGENT.
   *
   * Relevé le 14 septembre 2026 : cinq `if (!x) return null` sur des écrans de
   * détail. Deux sont couverts par le rendu serveur ; trois restaient BLANCS
   * pendant tout leur chargement — dont le lecteur, qui télécharge le document
   * entier avant d'afficher quoi que ce soit.
   *
   * ⚠ Un écran blanc n'affirme rien de faux — c'est pourquoi il échappe à la
   * famille des non-réponses écrites comme des faits. Mais sur une connexion
   * lente, et c'est le contexte de ce produit, il se lit comme une PANNE. Le
   * produit porte partout ailleurs un libellé de chargement : ces trois-là
   * dérogeaient à sa propre convention.
   */
  chargements: {
    /** ⚠ Dit ce qu'on attend, pas seulement qu'on attend : ici le fichier lui-même. */
    document: 'Ouverture du document…',
    notice: 'Chargement de la notice…',
    collection: 'Chargement de la collection…',
    /**
     * `smtp_absent` — rien n'est parti et rien ne partira tant que la
     * configuration ne change pas. Dire « réessayez » ici serait cruel : le
     * texte nomme donc la SORTIE, et elle est humaine.
     */
  },

  /**
   * LE RAPPORT ANNUEL — P8-3, moitié front, 15 septembre 2026.
   *
   * ⚠ CE N'EST PAS UN TABLEAU DE BORD, et l'écran doit le dire par sa FORME.
   * Le tableau de bord répond « comment ça va » au quotidien ; celui-ci est le
   * document qu'une directrice remet à son université une fois par an, et
   * qu'elle fait à la main aujourd'hui. Il est lu par des gens qui n'ont pas
   * construit le produit, et il sert à décider d'un budget.
   *
   * ⚠ TROIS PROPRIÉTÉS DU CONTRAT DÉCIDENT DE CET ÉCRAN, et aucune n'est
   * cosmétique :
   *
   * 1. LES RÉSERVES SONT EN TÊTE. L'API les rend en premier et son commentaire
   *    dit pourquoi — « ce que le rapport NE PEUT PAS dire, en tête plutôt
   *    qu'en note de bas ». Les reléguer en pied de page rendrait le document
   *    plus flatteur et moins vrai.
   * 2. UN BLOC ABSENT DIT SON MOTIF, et ne ressemble PAS à une panne. C'est une
   *    limite honnête, pas une erreur : la peindre en rouge apprendrait à lire
   *    les rouges comme du décor.
   * 3. UNE LIGNE MASQUÉE RESTE. La supprimer ferait disparaître le groupe du
   *    rapport, et un lecteur en conclurait qu'il n'existe pas — c'est
   *    exactement le faux que ce seuil existe pour éviter.
   */
  rapportAnnuel: {
    titre: 'Rapport annuel',
    introduction:
      'Le bilan de l’année civile, tel qu’il peut être remis à l’université. Chaque chiffre ' +
      'est calculé sur la période indiquée ; ce qui ne peut pas l’être est dit, jamais remplacé ' +
      'par un zéro.',
    chargement: 'Calcul du rapport annuel…',
    choisirAnnee: 'Année du rapport',
    /**
     * ⚠ LE LIBELLÉ DE L'API SUFFIT, et le doubler était une faute.
     *
     * Première écriture : « ${libelle} — du ${debut} au ${fin} inclus ». À
     * l'écran, ça donnait « du 1er janvier au 31 décembre 2026 — du 1 janvier
     * 2026 au 31 décembre 2026 inclus » : la même phrase deux fois, et la
     * seconde moins bien écrite que la première (« 1 janvier » au lieu de
     * « 1er »).
     *
     * L'API compose déjà sa période en français, et son commentaire dit
     * qu'elle porte LE DERNIER JOUR COMPTÉ, pas la borne exclue. Il n'y avait
     * rien à ajouter — seulement à ne pas réécrire moins bien.
     */
    periode: (libelle: string) => libelle,

    /**
     * ⚠ « CE QUE CE RAPPORT NE PEUT PAS DIRE » — le titre est délibérément net.
     * « Notes méthodologiques » se saute ; celui-ci se lit, parce qu'il annonce
     * une limite et non un appareil critique.
     */
    reservesTitre: 'Ce que ce rapport ne peut pas dire',
    reservesIntroduction:
      'À lire avant les chiffres. Ces limites tiennent à ce que le logiciel enregistre, ' +
      'pas à l’activité de la bibliothèque.',

    /** Un bloc que l'API déclare non calculable. */
    blocAbsentTitre: 'Non mesurable',
    /**
     * ⚠ NE DIT PAS « ERREUR » ET NE PROPOSE PAS DE RÉESSAYER. Le chiffre
     * n'existe pas ; un nouvel essai n'y changera rien, et le suggérer ferait
     * chercher une panne là où il y a une limite assumée.
     */
    blocAbsentPrefixe: 'Ce bloc n’est pas calculable, et voici pourquoi :',

    blocs: {
      fonds: 'Le fonds',
      lecteurs: 'Les lecteurs',
      circulation: 'La circulation',
      numerique: 'Le numérique',
      depot: 'Les dépôts universitaires',
      diffusion: 'La diffusion vers l’extérieur',
    },
    champs: {
      documents: 'Documents au catalogue',
      exemplaires: 'Exemplaires',
      documentsNumeriques: 'Documents numérisés',
      cataloguesDansLAnnee: 'Catalogués dans l’année',
      inscrits: 'Lecteurs inscrits',
      actifsDansLAnnee: 'Lecteurs actifs dans l’année',
      prets: 'Prêts',
      retours: 'Retours',
      pretsEnRetardAuTerme: 'Prêts en retard au 31 décembre',
      tauxDeRotation: 'Taux de rotation',
      lecturesEnLigne: 'Lectures en ligne',
      telechargements: 'Téléchargements',
      lecturesHorsLigne: 'Lectures hors ligne',
      deposes: 'Dépôts créés',
      soumis: 'Soumis à un directeur',
      valides: 'Validés',
      refuses: 'Refusés',
      catalogues: 'Entrés au catalogue',
    },
    repartitionTitre: 'Répartition',
    /** ⚠ Ce que porte une ligne dont l'effectif est masqué. Le groupe RESTE. */
    colonneGroupe: 'Groupe',
    colonneNombre: 'Nombre',
    /** Le taux de rotation peut être nul faute de fonds : on le DIT. */
    tauxIndisponible: 'non calculable (aucun exemplaire)',
    /**
     * ⚠ « EN RETARD AU 31 DÉCEMBRE » D'UNE ANNÉE QUI N'EST PAS FINIE EST UNE
     * PRÉDICTION, PAS UNE MESURE.
     *
     * L'API compte les prêts dont l'échéance tombe avant le terme de la période
     * et qui ne sont pas rendus à cette date-là. C'est juste pour une année
     * ÉCOULÉE — un rapport annuel décrit un état daté. Pour l'année en cours,
     * le terme est dans le FUTUR : le compte inclut alors des prêts qui ne sont
     * pas en retard du tout, simplement pas encore dus.
     *
     * Mesuré le 15 septembre 2026 sur l'école de démonstration : 55 annoncés
     * « en retard au 31 décembre », 47 réellement en retard ce jour-là, et
     * **8 prêts parfaitement à l'heure comptés comme des retards**.
     *
     * ⚠ Et cette ligne contredisait l'avertissement placé quatre centimètres
     * plus haut, qui dit « chiffres arrêtés au 15 septembre ». Celle-ci ne
     * l'était pas : elle regardait jusqu'au 31 décembre.
     */
    retardsNonArretes: 'non arrêté (l’année n’est pas finie)',
    /**
     * ⚠ L'ANNÉE EN COURS N'EST PAS FINIE, ET LE DOCUMENT NE LE DIT PAS TOUT SEUL.
     *
     * Le défaut porte sur l'année ÉCOULÉE — un rapport annuel se produit en
     * janvier pour l'année qui vient de finir. Mais rien n'empêche de choisir
     * l'année en cours dans le sélecteur, et les chiffres sont alors PARTIELS :
     * un mois d'octobre rend dix mois d'activité, présentés comme un bilan.
     *
     * ⚠ Ce document sert à demander un budget. Un total partiel qui ne se
     * signale pas est un faux — et c'est le seul faux que ce rapport peut
     * produire sans qu'aucun de ses blocs soit en cause.
     */
    anneeEnCours: (jusquA: string) =>
      `Année en cours : chiffres arrêtés au ${jusquA}, et non sur douze mois. ` +
      `Ce n’est pas un bilan annuel.`,
    imprimer: 'Imprimer',
  },

  /**
   * ⚠ CE QUI REMPLACE LE FAUX BOUTON DE LECTURE.
   *
   * *Trouvé en recette le 16 septembre 2026, avec la vraie session `awa@`.*
   *
   * Quand l'accès est refusé, la fiche rendait un `<p>` MAQUILLÉ EN BOUTON —
   * mêmes formes, même taille, grisé, avec `aria-disabled="true"` — au-dessus
   * de la phrase « Réservé aux étudiants de L1_INFO ». C'est exactement ce que
   * ce produit a tranché trois jours plus tôt sur « Réserver ce document » :
   * **pas un bouton grisé, il n'existe pas**. Un bouton désactivé se lit comme
   * une panne.
   *
   * ⚠ Et l'`aria-disabled` sur un `<p>` ne dit rien à personne : un paragraphe
   * n'est pas focalisable, donc il n'est jamais atteint au clavier. L'attribut
   * rassurait celui qui l'a écrit, pas celui qui lit l'écran.
   *
   * Reste ce qui INFORME : le document existe, et on dit sous quelle forme.
   */
  lectureRefusee: {
    formatExistant: (format: string) => `Une version ${format.toUpperCase()} existe.`,
  },

  /**
   * LA FICHE PUBLIQUE D'UNE NOTICE — ce qui s'y réserve, et ce qui ne s'y
   * réserve pas.
   *
   * ⚠ DÉCISION DE JEAN, 15 septembre 2026 : « Réserver » n'apparaît PAS sur une
   * notice sans exemplaire. Trois motifs, et le troisième est le plus lourd :
   *
   * 1. Un document purement NUMÉRIQUE ne se réserve pas — il se lit ou il ne se
   *    lit pas. Une file d'attente sur un fichier n'a aucun sens.
   * 2. Une notice sans exemplaire n'est pas « en attente d'acquisition », c'est
   *    une notice sans exemplaire. Nous n'avons AUCUN moyen de distinguer les
   *    deux — la date d'acquisition n'est même pas enregistrée, c'est une
   *    réserve écrite en tête du rapport annuel.
   * 3. ⚠ Une file qui ne peut JAMAIS se vider est un faux dispositif : le
   *    lecteur croit avoir une place dans une file, et il n'en a pas.
   *
   * Mesuré avant d'appliquer : 139 notices sur 480 sont sans exemplaire — 20
   * avec une copie numérique (le cas « purement numérique »), 119 sans rien.
   * La phrase convient aux deux : dans les deux cas, il n'y a pas d'exemplaire.
   */
  /**
   * L'EMBARGO — poser une date, et la DIRE.
   *
   * ⚠ LA FONCTIONNALITÉ EXISTAIT ENTIÈREMENT SAUF ICI. L'API accepte
   * `embargoUntil` à la création et à la mise à jour, l'APPLIQUE à deux points
   * de décision (l'accès en ligne et l'émission de licence hors-ligne), sert la
   * date sur la notice publique avec un commentaire qui dit pourquoi, et a même
   * séparé son refus de celui d'un droit manquant — pour que le lecteur sache
   * qu'il doit ATTENDRE et non DEMANDER.
   *
   * Le front ne connaissait pas le mot : zéro occurrence, aucun champ, aucun
   * affichage. Mesuré le 16 septembre 2026, et zéro notice sous embargo sur
   * 8 480 — la fonctionnalité n'avait jamais pu être exercée par le produit.
   *
   * ⚠ LES DEUX MOITIÉS SONT UN SEUL LOT. Livrer le champ sans l'affichage
   * fabrique le défaut que l'affichage corrige : une bibliothécaire croit avoir
   * protégé un document, et le lecteur voit un refus sans raison — il conclut à
   * une panne et réessaie.
   */
  embargo: {
    /** Le champ de catalogage. Vide = pas d'embargo ; l'effacer le lève. */
    champ: 'Sous embargo jusqu’au',
    champAide:
      'Laissez vide s’il n’y a pas d’embargo. Le document reste DÉCRIT dans le catalogue ; seul son fichier devient inaccessible jusqu’à cette date.',
    /** ⚠ Effacer la date est un geste ordinaire, pas une suppression. */
    lever: 'Effacer la date lève l’embargo à l’enregistrement.',

    /**
     * ⚠ INFORMATION, JAMAIS AVERTISSEMENT. Un embargo est un état VOULU — une
     * thèse sous embargo est la situation normale d'un travail récent. Le
     * signaler en jaune qualifierait d'anomalie ce que la bibliothécaire vient
     * de poser exprès. On réserve l'avertissement à ce que personne n'a pu
     * vouloir.
     */
    enCours: (date: string) => `Sous embargo jusqu’au ${date}.`,
    /**
     * ⚠ CE QUE LA PHRASE DOIT CONTINUER DE DIRE, et c'est la raison pour
     * laquelle l'API sert la date : un fichier qui refuse SANS DIRE POURQUOI
     * est le faux silencieux que ce dépôt passe son temps à corriger. Le
     * lecteur doit comprendre qu'il n'a rien à demander — seulement à attendre.
     */
    enCoursSuite:
      'La description reste consultable ; le fichier ne l’est pas encore.',
    /** Une date PASSÉE ne se dit pas « sous embargo » : il est levé. */
    echu: (date: string) => `Embargo échu le ${date}.`,
  },

  ficheNotice: {
    /**
     * ⚠ PAS UN BOUTON GRISÉ. Un bouton désactivé se lit comme une panne, et un
     * lecteur d'écran n'annonce qu'« bouton, non disponible ». La phrase dit ce
     * qui EST, et elle ne propose rien qu'on ne puisse pas tenir.
     */
    sansExemplaire: 'Aucun exemplaire physique n’est disponible pour ce document.',

    /**
     * ⚠ LE BADGE CONNAISSAIT DEUX ÉTATS LÀ OÙ LA FICHE EN DISTINGUE TROIS.
     *
     * Trouvé en recettant le PARCOURS du 21 septembre, sur la notice du
     * MOMENT 3 : le badge affichait « Indisponible » en tête pendant que la
     * page offrait « Lire en ligne » vingt lignes plus bas. L'état réel n'était
     * pas « indisponible » mais « sans exemplaire physique » — ce que le corps
     * de la fiche disait déjà, dans deux phrases distinctes selon que
     * `totalItems` vaut zéro ou que tous les exemplaires sont sortis.
     *
     * Le badge collapsait les deux ; il les sépare désormais, et ses trois
     * états sont exactement ceux des deux phrases du dessous.
     */
    badgeDisponible: 'Disponible',
    /** Des exemplaires existent, aucun n'est libre. */
    badgeIndisponible: 'Indisponible',
    /** Il n'y en a aucun — ce qui ne dit RIEN de la lecture en ligne. */
    badgeSansExemplaire: 'Sans exemplaire',
  },

  titres: {
    catalogue: 'Catalogue',
    auteurs: 'Auteurs',
    connexion: 'Se connecter',
    inscription: 'Créer un compte',
    motDePasse: 'Définir mon mot de passe',
    lecture: 'Lecture',
    /**
     * ⚠ Ne subsiste que lorsque le tenant NE RÉSOUT PAS — hôte inconnu, API
     * injoignable. On ne devine alors aucun nom d'établissement : un titre qui
     * nomme la mauvaise école est pire qu'un titre générique, parce qu'il part
     * dans un signet et qu'il y reste.
     */
    replique: 'Gafeso',
    descriptionParDefaut: 'Bibliothèque physique et numérique de votre établissement',
  },
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
    /**
     * ⚠ CE QU'ON AFFICHE À LA PLACE DE « Chargement… » QUAND ÇA A ÉCHOUÉ.
     *
     * « Chargement… » invite à patienter sur quelque chose qui n'arrivera
     * jamais. Le message d'erreur, lui, est déjà rendu au-dessus de la liste ;
     * cette ligne-ci existe pour que la LISTE elle-même cesse de mentir.
     */
    listeNonChargee: 'La liste n’a pas pu être chargée.',
    chargement: 'Chargement…',
  },

  /** Barre applicative, présente sur tous les écrans. */
  /**
   * LA PAGE D'ADMINISTRATION — un index à rubriques, pas une barre latérale.
   *
   * ⚠ Posée le 15 septembre 2026. Le titre de la barre latérale reprenait le
   * libellé de l'onglet : « Administration » s'affichait deux fois, l'une sous
   * l'autre. Si un sous-menu répète le nom de son parent, il y a un niveau de
   * trop.
   */
  administration: {
    titre: 'Administration',
    intro:
      'Le paramétrage de l’établissement. Chaque réglage dit ce qu’il change ; ' +
      'rien ici ne se voit des lecteurs tant que vous ne l’avez pas enregistré.',
    /**
     * ⚠ CE QUE CETTE PHRASE DOIT DIRE, et un test le vérifie : que l'absence
     * vient des DROITS ou d'un module éteint, jamais d'une panne. Un
     * « aucun réglage disponible » nu se lirait comme un logiciel cassé.
     */
    aucuneRubrique:
      'Aucun réglage ne vous est ouvert ici. C’est une question de droits ou de ' +
      'modules activés — demandez à un administrateur de votre établissement.',
  },

  /**
   * LE RÉCOLEMENT — annuler un scan pointé par erreur.
   *
   * ⚠ POURQUOI CETTE PORTE EXISTE, et c'est l'API qui l'écrit : « sans elle,
   * une erreur de scan DÉFAIT SILENCIEUSEMENT le récolement — l'exemplaire est
   * marqué vu pour toujours, "marquer les manquants" ne le signale pas, et un
   * exemplaire réellement absent reste disponible au catalogue ».
   *
   * ⚠ Et le rapport ne rend PAS la liste des « vus », seulement leur compte :
   * un exemplaire pointé par erreur n'est donc visible NULLE PART dans
   * l'écran. C'est ce qui décide de la forme — on annule par CODE-BARRES, pas
   * en cliquant une ligne qu'on ne peut pas voir.
   */
  /**
   * LE RAPPORT DE RÉCOLEMENT — et la catégorie qu'on affichait pas.
   *
   * ⚠ « VUS » N'ÉTAIT AFFICHÉ NULLE PART. Le COMPTE l'était, dans la tuile
   * verte ; la LISTE, que l'API sert et que le type du front déclarait
   * (`seen: ItemInfo[]`), était jetée. Les trois autres catégories avaient leur
   * table. Une bibliothécaire qui voulait vérifier qu'un exemplaire précis
   * avait bien été scanné n'avait aucun moyen de le voir — elle ne pouvait que
   * constater qu'il n'était pas dans « Manquants », ce qui n'est pas la même
   * chose quand le périmètre est partiel.
   *
   * ⚠ ET ELLE NE COÛTE RIEN DE PLUS : la liste est DÉJÀ transportée par
   * `GET /report`. L'afficher n'ajoute aucun octet — c'est le chemin PAGINÉ qui
   * réduira la charge, et il attend que le backend pousse `counts` et
   * `items/:categorie` (voir la passation du 22 septembre).
   */
  rapportRecolement: {
    vus: 'Vus (scannés, dans le périmètre)',
    manquants: 'Manquants (attendus, non scannés)',
    enPret: 'En prêt (absents légitimes)',
    inattendus: 'Inattendus (inconnus ou hors périmètre)',
  },

  recolement: {
    annulerScan: 'Annuler un scan',
    annulerCeScan: 'Annuler',
    /**
     * ⚠ NOM ACCESSIBLE DE L'ANNULATION DANS LE JOURNAL — et il est distinct
     * exprès. Les deux portes portent le même mot visible, « Annuler » : sur
     * la ligne, le code-barres est juste à côté et le répéter alourdirait.
     * Mais au clavier et au lecteur d'écran, deux boutons nommés « Annuler »
     * sur le même écran ne se distinguent PAS — c'est la règle déjà posée sur
     * les barres de la coque : un nom par repère, sinon le repère ne repère
     * rien. Trouvé par un test qui ne savait pas lequel cliquer.
     */
    annulerLeScanDe: (codeBarres: string) => `Annuler le scan ${codeBarres}`,
    codeBarresAAnnuler: 'Code-barres pointé par erreur',
    /**
     * ⚠ CE QUE CE TEXTE DOIT DIRE, et un test le vérifie : ce qu'annuler
     * CHANGE. « Annuler un scan » seul laisse croire à une commodité
     * d'affichage ; c'est le compte du récolement qui bouge.
     */
    aQuoiCaSert:
      'Un code-barres pointé par erreur reste « vu » jusqu’à la clôture, et le ' +
      'rapport ne le signale pas. L’annuler le retire du récolement.',
    annule: (codeBarres: string) => `Scan « ${codeBarres} » annulé — il ne compte plus comme vu.`,
    /** ⚠ La ligne du journal RESTE, barrée : on voit ce qu'on vient de défaire. */
    ligneAnnulee: 'Annulé',

    /**
     * ROUVRIR UNE SESSION CLÔTURÉE PAR ERREUR — la deuxième porte manquante.
     *
     * ⚠ CE QUE SON ABSENCE COÛTAIT, et c'est l'API qui l'écrit : « un clic
     * coûtait le récolement entier — `scan` refuse sur une session close en
     * disant "rouvrez-en une NOUVELLE", c'est-à-dire recommencer sur plusieurs
     * milliers d'exemplaires ».
     *
     * ⚠ TROIS ÉTATS, PAS DEUX. L'écran n'en connaissait que deux — ouverte ou
     * « clôturée ». La base en porte trois, et le troisième existe
     * PRÉCISÉMENT pour que « rouvrir » puisse refuser : une session dont on a
     * marqué les manquants a CHANGÉ LE CATALOGUE. La rouvrir produirait un
     * second marquage sur un fonds déjà modifié.
     */
    rouvrir: 'Rouvrir la session',
    /** ⚠ Dit ce que rouvrir REND, pas ce que le bouton fait. */
    rouvrirPourquoi:
      'Une session clôturée refuse les scans. La rouvrir reprend le récolement ' +
      'là où il s’est arrêté — sans elle, il faut tout rescanner.',
    rouverte: 'Session rouverte — vous pouvez reprendre les scans.',
    /**
     * ⚠ CE TEXTE PREND LA PLACE DU BOUTON, il ne l'accompagne pas. Offrir
     * « rouvrir » sur une session appliquée serait un bouton dont la seule
     * issue est un refus — et l'écran doit dire POURQUOI, à l'endroit exact
     * où l'on cherchait le geste.
     */
    dejaAppliquee:
      'Les manquants de cette session ont été marqués : le catalogue a changé. ' +
      'Elle ne se rouvre plus — ouvrez une nouvelle session, un second marquage ' +
      'porterait sur un fonds déjà modifié.',
    /** Les trois états, nommés. « Clôturée » ne suffisait plus. */
    etatEnCours: 'En cours',
    etatCloturee: 'Clôturée',
    etatAppliquee: 'Clôturée — manquants marqués',
  },

  entete: {
    /** Porte d'entrée vers l'espace du personnel, depuis les pages publiques. */
    espaceProfessionnel: 'Espace professionnel',
    /** Bouton d'ouverture du menu replié (sous md). Annoncé, donc traduisible. */
    menu: 'Menu',

    /**
     * LE MENU DE COMPTE — les écrans de la PERSONNE, sortis de la barre de
     * travail le 15 septembre 2026.
     *
     * ⚠ Le bouton porte le PRÉNOM, jamais une icône muette. Deux recettes ont
     * produit un faux défaut parce que la session ouverte n'était pas celle
     * qu'on croyait — « Mon dépôt est vide » alors qu'on était `admin@` et non
     * `awa@`. Un prénom affiché coûte trois mots et supprime cette famille
     * entière, pour tout le monde et le jour de la présentation comprise.
     *
     * ⚠ Le nom de l'ÉTABLISSEMENT l'accompagne quand on le connaît : sur une
     * installation multi-établissements, savoir OÙ l'on est compte autant que
     * savoir QUI l'on est. Tant qu'on ne le sait pas, on n'écrit rien — une
     * donnée pas encore chargée ne s'affiche pas comme un fait.
     */
    compte: {
      /** Nom accessible du bouton : « Compte de Rasmata ». */
      bouton: (prenom: string) => `Compte de ${prenom}`,
      /** Nom accessible du panneau déroulé. */
      panneau: 'Mon compte et mes écrans',
      seDeconnecter: 'Se déconnecter',
      /** Titre du groupe des écrans personnels dans le panneau replié (mobile). */
      groupeMobile: 'Mon compte',
    },
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
    depotsSoumis:
      'La vue des dépôts en attente n’est pas ouverte à votre compte (fonction « catalogue.gerer »).',
    moissonnage:
      'Le moissonnage n’est pas ouvert à votre compte (fonction « outils.catalogue »).',
    /**
     * ⚠ LES TROIS DERNIERS ÉCRANS SANS GARDE, ajoutés le 16 septembre 2026.
     *
     * Défaut mesuré par le backend en TAPANT l'adresse : `/admin/classes` avec
     * un compte sans `lecteurs.gerer` rendait deux 403 et laissait le tableau
     * sur « Chargement… » indéfiniment. Le menu cachait bien l'entrée — ce
     * n'était pas le problème : **un refus s'affichait comme une ATTENTE**, et
     * sans aucune sortie.
     *
     * Le balayage a trouvé deux écrans de la même structure (`auteurs`,
     * `recolement`), et sept qui faisaient déjà bien — `!donnees && !error`.
     * La forme de référence était `adherents/[id]` : garde de fonction, puis
     * `error && !donnees` → message ET lien de retour.
     */
    classes:
      'La gestion des classes n’est pas ouverte à votre compte (fonction « lecteurs.gerer »).',
    /*
     * ⚠ PAS DE CLÉ `auteurs` ICI, ET C'EST VOULU. `/admin/auteurs` porte déjà
     * son refus, écrit dans l'écran avant la convention du 10 septembre. En
     * ajouter un second ici ferait DEUX formulations du même refus, qui
     * divergeraient le jour où l'une change — et c'est le lecteur qui paie la
     * différence. L'écran n'avait pas besoin d'un refus : il lui manquait la
     * distinction entre « je charge » et « ça a échoué ».
     */
    recolement:
      'Le récolement n’est pas ouvert à votre compte (fonction « outils.catalogue »).',
    reglesDeCirculation:
      'Les règles de prêt ne sont pas ouvertes à votre compte (fonction « circulation.faire »).',
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
    /**
     * ⚠ LA TROISIÈME ISSUE, ET ELLE ÉTAIT INDISCERNABLE DES DEUX AUTRES.
     *
     * Ouvrir le document demande une fenêtre. Si le navigateur la bloque, le
     * clic ne produisait RIEN : ni document, ni message. Le directeur recommence,
     * conclut que le bouton est cassé, et abandonne — sur le geste qui lui sert
     * à décider d'un dépôt.
     *
     * Trois issues doivent se distinguer : le document s'ouvre, l'appel échoue,
     * ou la FENÊTRE est refusée. La troisième n'est pas une panne du produit, et
     * la phrase dit donc quoi faire plutôt que de s'excuser.
     */
    fenetreBloquee:
      'Votre navigateur a bloqué la fenêtre du document. Autorisez les fenêtres ' +
      'surgissantes pour ce site, puis réessayez.',
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
  /**
   * « Dépôts en attente » — la vue du personnel sur ce qui n'a pas été décidé.
   * 12 septembre 2026, `GET /depots/soumis`.
   *
   * ⚠ CE QU'ELLE RÉPOND : quel dépôt attend, DEPUIS QUAND, et chez qui. Un
   * dépôt soumis ne sort de cet état que par son directeur désigné ; si celui-ci
   * ne peut plus agir, personne ne le voyait. C'est la vue qui rend le blocage
   * visible — avant même de pouvoir le résoudre.
   *
   * ⚠ ELLE NE PERMET NI DE VALIDER NI DE REFUSER, et c'est une propriété de
   * l'API, pas un oubli : décider reste au directeur désigné. L'écran n'offre
   * donc aucun geste de décision — un bouton qui refuserait serait pire que son
   * absence.
   */
  /**
   * LE VOCABULAIRE DES TYPES DE DOCUMENT DÉPOSÉ — une seule source.
   *
   * ⚠ POURQUOI IL EST SORTI DU CODE LE 13 SEPTEMBRE 2026. Il était recopié dans
   * CINQ écrans neufs, et les cinq copies avaient déjà DIVERGÉ en moins d'une
   * journée. Un vocabulaire dupliqué se désynchronise à la vitesse où on ajoute
   * des écrans, et rien ne le signale : chaque copie est correcte isolément.
   *
   * ⚠ ET IL NE SE CONFOND PAS AVEC `recordType`. `Deposit.documentType` porte
   * cinq valeurs — le vocabulaire académique du dépôt. `BiblioRecord.recordType`
   * en porte d'autres, dont `ouvrage`, et sert à décrire TOUT le catalogue.
   * « Mes encadrements » affiche le second et garde donc sa propre table : les
   * fondre ferait apparaître « Ouvrage » dans un menu de dépôt de thèse.
   */
  typesDeDepot: {
    memoire: 'Mémoire',
    these: 'Thèse',
    licence: 'Mémoire de licence',
    master: 'Mémoire de master',
    these_unique: 'Thèse unique',
  } as Record<string, string>,

  depotsSoumis: {
    titre: 'Dépôts en attente',
    introduction:
      'Les mémoires et les thèses soumis à un directeur et qui attendent sa décision, du plus ancien au plus récent.',
    chargement: 'Chargement des dépôts…',
    aucun: 'Aucun dépôt n’attend de décision.',
    /** ⚠ L'ANCIENNETÉ se lit ; une date demande un calcul que personne ne fait. */
    depuis: (jours: number) =>
      jours === 0
        ? 'Soumis aujourd’hui'
        : jours === 1
          ? 'Soumis il y a 1 jour'
          : `Soumis il y a ${jours} jours`,
    /**
     * ⚠ `joursDepuisSoumission` peut être NULL — l'API le dit et le défend :
     * zéro voudrait dire « aujourd'hui », ce qui est exactement faux pour un
     * dépôt dont on ignore l'âge. On ne calcule donc rien, on dit qu'on ne sait
     * pas.
     */
    ancienneteInconnue: 'Date de soumission inconnue',
    directeur: (nom: string) => `Directeur : ${nom}`,
    /** Un dépôt soumis SANS directeur : l'API l'autorise, l'écran le montre. */
    sansDirecteur: 'Aucun directeur désigné',

    /**
     * LA RÉATTRIBUTION — livrée le 13 septembre 2026, après deux jours de porte
     * sans clé.
     *
     * ⚠ POURQUOI ELLE EXISTE. « Soumis » est le seul état dont la sortie dépend
     * de QUELQU'UN D'AUTRE : valider et refuser sont réservés au directeur
     * désigné, et le directeur ne se change plus hors brouillon. Un directeur
     * qui perd la fonction — rôle changé, compte désactivé, départ — bloquait le
     * dépôt définitivement.
     *
     * ⚠ ET LA LISTE DES DIRECTEURS VIENT DE `GET /depots/soumis` ELLE-MÊME. Le
     * menu dédié exige `depot.deposer`, que le bibliothécaire n'a pas : la
     * lecture voyage donc avec ce qu'elle sert, et aucune fonction n'a été
     * élargie.
     */
    reattribuer: 'Confier à un autre directeur',
    choisirNouveau: 'Nouveau directeur',
    aucunChoix: 'Choisissez…',
    /** ⚠ Le dépôt reste SOUMIS : seul son directeur change. */
    reattribuerAide:
      'Le dépôt reste soumis : seul son directeur change, et le nouveau le voit apparaître dans sa liste.',
    /**
     * ⚠ NOMME L'ANCIEN ET LE NOUVEAU. « Réattribué » sans dire de qui à qui ne
     * raconte rien — et c'est l'API qui rend l'ancien, parce que l'écran ne
     * l'a plus une fois la liste relue.
     */
    reattribue: (ancien: string | null, nouveau: string) =>
      ancien
        ? `Dépôt confié à ${nouveau} — il était attribué à ${ancien}.`
        : `Dépôt confié à ${nouveau} — aucun directeur n’était désigné.`,
    /** ⚠ L'échec de l'envoi n'efface pas la réattribution. */
    reattribueNonPrevenu:
      'Dépôt confié, MAIS le nouveau directeur n’a PAS pu être prévenu par courriel. Il le verra dans sa liste, et vous pouvez le lui signaler.',
    echecReattribution: 'Le dépôt n’a pas pu être confié à un autre directeur.',
    /**
     * ⚠ LE CAS OÙ LE GESTE EST IMPOSSIBLE. Aucune personne ne portant
     * `depot.valider`, il n'y a personne à qui confier — et un menu vide se
     * lirait comme une panne. On le DIT, et on nomme ce qui manque.
     */
    aucunDirecteurDisponible:
      'Aucun directeur n’est déclaré dans votre établissement : il n’y a personne à qui confier ces dépôts. Créez un rôle portant « depot.valider » dans Rôles & fonctions.',
  },

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
    /**
     * ⚠ LA TROISIÈME ISSUE, ET ELLE ÉTAIT INDISCERNABLE DES DEUX AUTRES.
     *
     * Ouvrir le document demande une fenêtre. Si le navigateur la bloque, le
     * clic ne produisait RIEN : ni document, ni message. Le directeur recommence,
     * conclut que le bouton est cassé, et abandonne — sur le geste qui lui sert
     * à décider d'un dépôt.
     *
     * Trois issues doivent se distinguer : le document s'ouvre, l'appel échoue,
     * ou la FENÊTRE est refusée. La troisième n'est pas une panne du produit, et
     * la phrase dit donc quoi faire plutôt que de s'excuser.
     */
    fenetreBloquee:
      'Votre navigateur a bloqué la fenêtre du document. Autorisez les fenêtres ' +
      'surgissantes pour ce site, puis réessayez.',
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
    /**
     * ⚠ CE QUE LE GUICHET NE SAVAIT PAS, relevé le 14 septembre 2026.
     *
     * Le retour d'un document réservé affichait « À mettre de côté — le
     * réservataire a N jours pour venir le retirer », ce qui **laisse croire
     * qu'il a été prévenu**. L'API rend pourtant `nonPrevenus` — et son
     * commentaire disait déjà tout : « la bibliothécaire met un document de
     * côté, croit le lecteur prévenu, et le document repart au suivant à
     * l'expiration sans que celui qui l'attendait ait jamais rien su ».
     *
     * ⚠ DEUX SILENCES QUI SE CUMULENT : le courriel échoue sans bruit, et
     * l'écran ne dit rien. Chacun seul est rattrapable ; ensemble ils ferment
     * la porte. Le type du front ne DÉCLARAIT même pas le champ.
     */
    nonPrevenuDefinitif:
      'Ce lecteur n’a PAS pu être prévenu, et il ne le sera pas : son compte n’a pas ' +
      'd’adresse courriel exploitable. Prévenez-le autrement — au comptoir, ou par ' +
      'téléphone — sinon le document repartira au suivant sans qu’il ait rien su.',
    /**
     * Les autres motifs relâchent la réservation : une nouvelle tentative AURA
     * lieu. On le dit, parce que l'action de la bibliothécaire n'est pas la même.
     */
    nonPrevenuRetente:
      'Ce lecteur n’a PAS encore été prévenu : l’envoi a échoué et sera retenté. ' +
      'Si vous le voyez passer, dites-le-lui — le délai de retrait court déjà.',
    /**
     * ⚠ LE CÔTÉ LECTEUR, resté muet jusqu'au 15 septembre 2026.
     *
     * Le guichet a été corrigé le 14 : il dit désormais quand un réservataire
     * n'a pas pu être prévenu. L'écran du LECTEUR, lui, affichait « Un
     * exemplaire vous est mis de côté : passez le retirer au comptoir » — sans
     * l'échéance, et sans savoir si la confirmation était partie. L'API rend
     * pourtant `pickupDays` ET `nonPrevenus` sur la pose de réservation ; le
     * type du front ne déclarait ni l'un ni l'autre.
     *
     * ⚠ C'est « une moitié livrée n'est pas une correction » : le côté qui
     * RAPPORTE attendait le côté qui LIT, et personne n'avait branché
     * celui-ci. Et c'est aussi la chaîne complète des deux silences — le
     * courriel qui échoue, l'écran qui ne dit pas l'échéance —, cette fois du
     * point de vue de la seule personne qui perd quelque chose.
     */
    misDeCoteAvecDelai: (jours: number) =>
      `Un exemplaire vous est mis de côté : vous avez ${jours} jour${jours > 1 ? 's' : ''} ` +
      `pour venir le retirer au comptoir.`,
    /** ⚠ Sans délai servi, on n'en invente pas — trois états, pas deux. */
    misDeCoteSansDelai: 'Un exemplaire vous est mis de côté : passez le retirer au comptoir.',
    /**
     * ⚠ CE QUE CE TEXTE DOIT DIRE, et un test le vérifie : que la confirmation
     * n'arrivera PAS, et que la personne doit donc retenir l'information
     * elle-même. Sans ça, elle attend un courriel qui ne viendra jamais et
     * laisse expirer le document qu'elle a réservé.
     */
    confirmationNonEnvoyee:
      'Nous n’avons pas pu vous envoyer la confirmation par courriel : notez ce délai, ' +
      'vous ne le retrouverez pas dans votre boîte. En cas de doute, demandez à la ' +
      'bibliothèque.',
    aRetirerAvant: (date: string) => `À retirer avant le ${date}`,
    /** ⚠ Dit ce qui arrive si on ne vient pas — sinon la date n'est qu'un chiffre. */
    apresEcheance: 'Passé ce délai, le document repart à la personne suivante.',
  },

  /**
   * LE MOISSONNAGE — P7, écran `/admin/moissonnage`. 13 septembre 2026.
   *
   * ⚠ LA DISTINCTION QUI PORTE TOUT L'ÉCRAN : « injoignable » n'est PAS
   * « vide ». L'API l'écrit dans son propre schéma — « les confondre ferait lire
   * ‘zéro notice’ là où il faut lire ‘je n'ai pas pu savoir’ » — et c'est la
   * famille que ce dépôt connaît le mieux : une non-réponse écrite comme un
   * fait.
   *
   * Le coût n'est pas théorique. Un entrepôt momentanément injoignable affiché
   * « 0 notice » pousse à supprimer la source, ou à conclure que le partenaire
   * n'a rien publié — deux gestes qu'on ne reprend pas facilement.
   */
  moissonnage: {
    titre: 'Moissonnage',
    introduction:
      'Les entrepôts extérieurs dont votre établissement récupère les notices, et le compte rendu de la dernière récolte.',
    chargement: 'Chargement des entrepôts…',
    aucun: 'Aucun entrepôt déclaré.',
    /**
     * ⚠ CINQ ISSUES, ET DEUX NE SE CONFONDENT JAMAIS. `vide` dit « la source a
     * répondu, elle n'a rien » ; `injoignable` dit « je n'ai pas pu savoir ».
     */
    issues: {
      en_cours: 'Récolte en cours…',
      moisson: 'Récolte effectuée',
      vide: 'La source a répondu : aucune notice',
      injoignable: 'Source injoignable — rien n’a pu être lu',
      erreur_protocole: 'Réponse illisible — le protocole n’a pas été respecté',
    } as Record<string, string>,
    /** ⚠ Le motif, quand il existe : « injoignable » sans raison n'aide personne. */
    motif: (raison: string) => `Motif : ${raison}`,
    jamaisMoissonnee: 'Jamais moissonnée',
    /**
     * ⚠ LE COMPTE RENDU NE SE LIT QUE POUR UNE RÉCOLTE RÉELLE. Afficher
     * « 0 reçue, 0 créée » sous une source injoignable rendrait le chiffre
     * exact et la lecture fausse.
     */
    bilan: (recues: number, creees: number, ignorees: number) =>
      `${recues} reçue(s) · ${creees} créée(s) · ${ignorees} ignorée(s)`,
    collisions: (n: number) =>
      n === 1 ? '1 notice signalée, non tranchée' : `${n} notices signalées, non tranchées`,
    /** ⚠ Le moissonnage SIGNALE, il ne tranche pas — décision 2 du brief. */
    collisionsAide:
      'Rien n’a été écrasé : ces notices attendent un arbitrage humain.',
    suppressionsSignalees: (n: number) =>
      n === 1
        ? '1 suppression signalée par la source, non appliquée'
        : `${n} suppressions signalées par la source, non appliquées`,
    moissonnerMaintenant: 'Moissonner maintenant',
    moissonEnCours: 'Récolte en cours…',
    /** Déclaration d'un entrepôt. */
    declarer: 'Déclarer un entrepôt',
    champNom: 'Nom de l’entrepôt',
    champNomAide: 'Un nom lisible : une adresse n’est pas un nom dans une liste.',
    champAdresse: 'Adresse du point d’accès OAI-PMH',
    /**
     * ⚠ DIT LA RÈGLE AVANT LE REFUS. Le serveur appellera cette adresse : les
     * adresses internes sont refusées. Laisser l'API le découvrir enverrait
     * quelqu'un chercher ce qu'il a mal fait alors que la règle n'était écrite
     * nulle part.
     */
    champAdresseAide:
      'Le serveur appellera cette adresse : elle doit être publique. Les adresses internes (localhost, 10.x, 192.168.x, .local) sont refusées.',
    champFormat: 'Format des métadonnées',
    champFormatAide: 'Par exemple oai_dc, marcxml ou etdms — celui que l’entrepôt annonce.',
    champEnsemble: 'Ensemble (setSpec, facultatif)',
    champPeriodicite: 'Périodicité',
    creer: 'Déclarer',
    annuler: 'Annuler',
    creee: (nom: string) => `Entrepôt « ${nom} » déclaré.`,
    echec: 'Les entrepôts n’ont pas pu être chargés.',
    echecCreation: 'L’entrepôt n’a pas pu être déclaré.',
    echecMoisson: 'La récolte n’a pas pu être lancée.',
    inactive: 'Inactive',

    modifier: 'Modifier',
    enregistrer: 'Enregistrer',
    modifiee: 'Entrepôt modifié.',
    echecModification: 'L’entrepôt n’a pas pu être modifié.',

    retirer: 'Retirer cet entrepôt',
    /**
     * ⚠ LA CONFIRMATION DIT CE QUI PART **ET CE QUI RESTE**. L'API l'écrit
     * elle-même : « supprimée » sans le dire laisserait croire que les notices
     * sont parties avec. Or ce sont des notices du catalogue comme les autres —
     * personne ne prendrait le risque de retirer une source s'il croyait
     * emporter des centaines de notices.
     */
    retirerConfirmation: (nom: string) =>
      `Retirer l’entrepôt « ${nom} » ? La mémoire du moissonnage part — les comptes rendus et ` +
      `les identités des notices récoltées. Les NOTICES, elles, restent au catalogue : ce sont ` +
      `des notices comme les autres. Ce geste ne s’annule pas.`,
    retirerConfirmer: 'Retirer l’entrepôt',
    /** ⚠ Le compte vient de l'API, jamais deviné — et il est la preuve du dire. */
    retiree: (nom: string, notices: number) =>
      notices === 0
        ? `Entrepôt « ${nom} » retiré. Aucune notice n’en provenait.`
        : notices === 1
          ? `Entrepôt « ${nom} » retiré. 1 notice reste au catalogue.`
          : `Entrepôt « ${nom} » retiré. ${notices} notices restent au catalogue.`,
    echecRetrait: 'L’entrepôt n’a pas pu être retiré.',

    /**
     * LE DÉTAIL D'UNE SOURCE — comptes rendus et collisions.
     *
     * ⚠ AUCUNE ROUTE NE RÉSOUT UNE COLLISION. L'API le dit : « c'est un humain
     * qui décidera ». L'écran MONTRE donc, il n'offre aucun geste d'arbitrage —
     * un bouton qui ne peut pas aboutir est pire que son absence.
     */
    detail: {
      retour: 'Tous les entrepôts',
      comptesRendus: 'Comptes rendus',
      aucunCompteRendu: 'Cette source n’a jamais été moissonnée.',
      collisionsTitre: 'Notices signalées',
      aucuneCollision: 'Aucune notice signalée sur cette source.',
      /** ⚠ Dit l'ÉTAT, et que rien n'a été écrasé — la ligne seule alarmerait. */
      collisionsIntro:
        'La source redonne ces notices avec une date différente de celle que nous avons. Rien n’a été écrasé : c’est à vous de décider si la version distante doit remplacer la vôtre.',
      /** L'identifiant de la SOURCE — le seul que l'on ait sur ces lignes. */
      identifiantSource: 'Identifiant à la source',
      dateSource: 'Date annoncée par la source',
      vueLe: (date: string) => `Signalée le ${date}`,
      ouvrirLaNotice: 'Ouvrir notre notice',
      /**
       * ⚠ `recordId` peut manquer — une notice ignorée faute de titre puis
       * redonnée devient une collision sans notice locale. On le DIT plutôt que
       * d'offrir un lien mort.
       */
      sansNoticeLocale: 'Aucune notice locale ne lui correspond.',
      chargement: 'Chargement…',
      echec: 'Le détail n’a pas pu être chargé.',
      pageSur: (page: number, total: number) => `Page ${page} sur ${total}`,
      pagePrecedente: 'Page précédente',
      pageSuivante: 'Page suivante',
    },
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

  /**
   * LES RÈGLES DE CIRCULATION — une COLLECTION, pas un réglage.
   *
   * ⚠ LA FORME FAUTIVE QUE CE LOT REFUSE, et elle était nommée dans la dette :
   * ajouter quatre champs à la carte de `/admin/regles-de-pret`.
   * `CirculationRule` est clé par (catégorie, type). Quatre champs auraient
   * créé UNE règle globale et masqué la dimension par catégorie : l'écran
   * afficherait « plafond : 5 » pendant que la base en porte cinq différents,
   * et le premier enregistrement écraserait la nuance qu'une bibliothécaire
   * avait posée. **Un singleton n'est pas une collection à un élément.**
   */
  reglesDeCirculation: {
    titre: 'Règles de prêt',
    introduction:
      'Une règle par couple catégorie d’adhérent / type d’exemplaire. Le guichet applique la plus précise qui correspond au prêt.',
    /** ⚠ Ce que « * » veut dire, écrit là où on le lit — pas dans une aide. */
    toutesCategories: 'Toutes les catégories',
    tousTypes: 'Tous les types',
    joker: '*',

    colCategorie: 'Catégorie d’adhérent',
    colType: 'Type d’exemplaire',
    colDuree: 'Durée du prêt',
    colRenouvellements: 'Renouvellements',
    colPlafond: 'Prêts simultanés',
    colAmende: 'Amende / jour',
    jours: (n: number) => `${n} jour(s)`,
    fcfa: (n: number) => `${n} FCFA`,

    ajouter: 'Ajouter une règle',
    enregistrer: 'Enregistrer',
    annuler: 'Annuler',
    modifier: 'Modifier',
    supprimer: 'Supprimer',
    /** ⚠ La suppression se confirme : elle change ce que le guichet applique. */
    supprimerConfirmer: (categorie: string, type: string) =>
      `Supprimer la règle « ${categorie} / ${type} » ? Le guichet appliquera alors la règle la plus proche, ou ses valeurs par défaut.`,

    /**
     * ⚠ AUCUNE RÈGLE N'EST UN ÉTAT NORMAL, PAS UN VIDE À REMPLIR EN URGENCE.
     * Le produit a des défauts semés ; une école qui n'a rien posé n'est pas
     * en panne. Le texte le dit, sinon il pousse à créer des règles au hasard.
     */
    aucune:
      'Aucune règle propre à cet établissement : le guichet applique ses valeurs par défaut.',
    listeNonChargee: 'Les règles n’ont pas pu être chargées.',
    /**
     * ⚠ LES REPLIS AUSSI SONT DES TEXTES VISIBLES. Je les avais écrits en dur
     * dans l'écran — « Enregistrement impossible. », « Suppression
     * impossible. » — le jour même où j'avais versé deux leçons sur les textes
     * sortis du code. Ils ne s'affichent que quand l'API ne rend pas de
     * message, c'est-à-dire au pire moment, et c'est exactement pour ça qu'on
     * ne les relit jamais.
     */
    enregistrementImpossible: 'Enregistrement impossible.',
    suppressionImpossible: 'Suppression impossible.',
  },

  reglesDePret: {
    titre: 'Règles de prêt',
    /**
     * ⚠ CE TEXTE A ÉTÉ FAUX, ET IL ANNONÇAIT PLUS QUE L'ÉCRAN NE PORTE.
     *
     * Il disait : « Durée d'un prêt, nombre de renouvellements, plafond
     * d'emprunts et amende journalière, par catégorie d'adhérent et par type de
     * document. » Mesuré le 16 septembre 2026 : **aucune** de ces grandeurs
     * n'est éditable ici. Elles vivent sur `CirculationRule` (`loanPeriodDays`,
     * `maxCheckouts`, `maxRenewals`, `finePerDay`), dont les quatre routes
     * `/circulation/rules` ne sont appelées par AUCUN écran — backlog n° 46.
     *
     * ⚠ Et le piège qui rendait la phrase crédible : « nombre de
     * renouvellements » EXISTE bien sur cet écran — mais c'est
     * `onlineRenewalMax`, le plafond du renouvellement EN LIGNE par le lecteur,
     * pas `maxRenewals`, le plafond de la règle appliqué au guichet. Deux
     * plafonds voisins, deux noms presque identiques, et un seul est ici.
     *
     * Le texte ne décrit donc plus que ce que l'écran fait — et il ne promet
     * pas ce qui viendra : « pas encore » date sa propre péremption.
     */
    introduction:
      'Renouvellement en ligne par le lecteur, et durée de mise de côté d’une réservation disponible.',
    /** La durée de mise de côté : servie par l’API depuis toujours, éditable nulle part avant le 16 septembre 2026. */
    miseDeCoteTitre: 'Durée de mise de côté d’une réservation (jours)',
    miseDeCoteAide:
      'Délai laissé au lecteur pour venir retirer un document réservé, une fois qu’il est disponible. Passé ce délai, le document repart à la personne suivante.',
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
/**
     * ⚠ POURQUOI « SOUMETTRE » EST DÉSACTIVÉ — signalé par la session backend le
     * 15 septembre 2026, et c'est notre propre règle qui était enfreinte.
     *
     * Le bouton était grisé sans dire pourquoi : ni `title`, ni `aria-label`,
     * ni `aria-describedby`. Le seul indice était l'étiquette voisine du champ
     * de fichier — et un lecteur d'écran n'annonce qu'un bouton grisé.
     *
     * ⚠ La règle du dépôt est écrite depuis le 11 septembre : « une règle
     * CONDITIONNELLE se lit à l'écran, elle ne se découvre pas par un refus ».
     * Ici elle ne se découvrait même pas par un refus — le bouton ne répond
     * pas. C'est le cas le plus fermé de la famille.
     *
     * Ces phrases sont VISIBLES autant qu'annoncées : les réserver au lecteur
     * d'écran ferait deux produits, et laisserait voyant celui qui a le moins
     * besoin d'aide.
     */
    manqueDocument: 'Ajoutez le document avant de soumettre.',
    manqueDirecteur: 'Désignez un directeur avant de soumettre.',
    manqueLesDeux: 'Ajoutez le document et désignez un directeur avant de soumettre.',
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

  /**
   * L'IMPORT DES ÉTUDIANTS ATTENDUS — l'aperçu, puis le remplacement.
   *
   * ⚠ Le remplacement SUPPRIME des lignes. Les textes de cet écran ont donc
   * une contrainte que les autres n'ont pas : ils doivent permettre de
   * RECONNAÎTRE ce qui va partir, pas seulement de le compter. « 47 lignes
   * seront supprimées » ne se vérifie pas ; « Traoré Awa, Zongo Moussa… » se
   * reconnaît — ou ne se reconnaît pas, et c'est alors qu'on s'arrête.
   *
   * ⚠ ET L'ACCORD EN NOMBRE EST PORTÉ ICI, pas par l'API. Trouvé par la
   * RECETTE À L'ÉCRAN le 16 septembre 2026, sur le seul cas que mes dix tests
   * n'exerçaient pas : `n = 1`. Ils éprouvaient 12 et 9 — deux pluriels. La
   * phrase lue à l'écran était « Supprimer aussi **ces 1 étudiant(s)
   * attendu(s)** », et « 1 étudiant attendu **ne figurent** plus ». Un « (s) »
   * paresseux se tolère ; un démonstratif pluriel sur UN élément se lit comme
   * un produit inachevé — sur l'écran qui demande d'autoriser une suppression.
   * (Le motif est celui du commentaire de `apercuImportExpectedStudents`
   * côté API, qui rend `retraits.premiers` exactement pour ça.)
   */
  importEtudiants: {
    /** L'aperçu ne s'affiche qu'après réponse — il n'affirme donc jamais un vide qu'il ne connaît pas. */
    apercuTitre: 'Ce que cet import ferait',
    /** ⚠ Condition d'affichage : l'aperçu a répondu et l'import n'a pas encore été lancé. */
    rienEcrit: 'Rien n’a encore été écrit. Relisez ci-dessous, puis confirmez.',
    analyse: 'Lecture du fichier…',
    lignesAImporter: (n: number) =>
      n <= 1
        ? `${n} ligne sera créée ou mise à jour.`
        : `${n} lignes seront créées ou mises à jour.`,
    aucuneLigne:
      'Aucune ligne exploitable dans ce fichier : il n’y a rien à importer.',
    classesConcernees: 'Classes du fichier',
    lignesEnErreur: (n: number) =>
      n <= 1
        ? `${n} ligne sera ignorée (voir le détail).`
        : `${n} lignes seront ignorées (voir le détail).`,

    /** Le bloc de suppression. Il ne s'affiche que si l'aperçu annonce au moins un retrait. */
    retraitsTitre: (n: number) =>
      n <= 1
        ? `${n} étudiant attendu ne figure plus dans ce fichier`
        : `${n} étudiants attendus ne figurent plus dans ce fichier`,
    retraitsPortee:
      'La suppression ne touche que les classes présentes dans le fichier, et seulement les étudiants qui ne se sont pas encore inscrits. Les comptes déjà réclamés ne sont jamais retirés.',
    retraitsEtAutres: (n: number) => (n <= 1 ? `… et ${n} autre.` : `… et ${n} autres.`),
    /** ⚠ Case DÉCOCHÉE par défaut : la suppression est un second geste, jamais l'effet du premier. */
    caseSupprimer: (n: number) =>
      n <= 1
        ? `Supprimer aussi cet étudiant attendu de la liste`
        : `Supprimer aussi ces ${n} étudiants attendus de la liste`,
    conserverParDefaut:
      'Sans cette case, l’import ajoute et met à jour, et ne supprime rien.',

    importer: 'Importer',
    importerEtSupprimer: (n: number) =>
      n <= 1 ? `Importer et supprimer ${n} ligne` : `Importer et supprimer ${n} lignes`,
    changerDeFichier: 'Choisir un autre fichier',
    enCours: 'Import en cours…',

    /**
     * LE DÉSACCORD DE NOMBRE. L'API refuse le remplacement si le nombre lu à
     * l'aperçu ne correspond plus. ⚠ Ce n'est PAS une panne : c'est la garde
     * qui fonctionne, et la seule suite utile est de relire l'aperçu. Le texte
     * dit donc ce qui s'est passé ET ce qui n'a pas eu lieu — sans quoi on
     * ignore si une partie a été écrite.
     */
    desaccordTitre: 'Rien n’a été importé, et rien n’a été supprimé',
    desaccordSuite:
      'La liste ou le fichier a changé depuis l’aperçu. Relancez-le pour voir ce qui partirait maintenant.',
    relancerApercu: 'Relancer l’aperçu',

    /**
     * Le compte rendu. ⚠ Sa première phrase était écrite dans le composant, en
     * `(s)` — elle est sortie du code parce que ce LOT la modifie (il lui
     * ajoute le sort des suppressions), pas pour reprendre l'écran.
     */
    importees: (n: number) =>
      n <= 1 ? `${n} étudiant importé` : `${n} étudiants importés`,
    sansErreur: ' — aucune erreur.',
    avecErreurs: (n: number) =>
      n <= 1
        ? `, ${n} ligne en erreur (voir ci-dessous).`
        : `, ${n} lignes en erreur (voir ci-dessous).`,
    /** Compte rendu : `retires` est servi par l'API depuis le premier jour — il s'affiche. */
    retiresFaits: (n: number) =>
      n <= 1
        ? `${n} ligne supprimée de la liste.`
        : `${n} lignes supprimées de la liste.`,
    aucunRetrait: 'Aucune suppression.',
  },
} as const;
