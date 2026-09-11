import { HomeContent } from './home-content';

/**
 * Amorce d'EXEMPLE pour la page d'accueil d'un établissement.
 *
 * Utilisée par la commande de seed dédiée (POST /admin/tenants/:slug/seed-homepage)
 * pour donner à un nouvel établissement une page d'accueil complète et cohérente,
 * qu'il n'a plus qu'à réécrire avec ses propres informations. Ce n'est pas un défaut
 * applicatif : sans appel explicite à cette commande, un établissement part d'un
 * contenu vide.
 *
 * POURQUOI DES DONNÉES FICTIVES. Ce fichier contenait auparavant le contenu réel
 * d'un établissement client : son adresse postale, ses téléphones, son adresse
 * email, sa page Facebook et l'adresse IP de son ancien catalogue. C'est de la
 * donnée d'infrastructure et de contact d'un tiers qui n'a pas consenti à figurer
 * dans le code d'un produit diffusé — et une amorce taillée pour un établissement
 * n'a de toute façon rien à faire dans un produit générique.
 *
 * Tout ici est INVENTÉ et doit le rester : le nom, le domaine `exemple.bf`, les
 * numéros à zéros. Un relecteur doit voir au premier coup d'œil qu'il s'agit de
 * remplissage, et non se demander s'il a sous les yeux les coordonnées de
 * quelqu'un. N'y remettez jamais les données d'un établissement réel : ce fichier
 * part dans l'instantané public.
 */
export const EXEMPLE_HOME_CONTENT: HomeContent = {
  identity: {
    fullName: 'Bibliothèque Universitaire d’Exemple',
    acronym: 'BUE',
    brandMark: 'BU',
    subtitle: 'Université d’Exemple',
    tagline: 'Bibliothèque Universitaire d’Exemple',
    heroTitle: 'Un lieu,',
    heroTitleAccent: 'mille savoirs.',
    lead: 'Un espace de lecture, de recherche et de rencontre, ouvert à toute la communauté universitaire — sur place et en ligne. Remplacez ce texte par la présentation de votre établissement.',
    searchHint: 'Recherche propulsée par le catalogue Gafeso — accès libre, sans compte.',
    logoUrl: null,
    heroImageUrl: null,
    heroImageKicker: 'ACCUEIL — REZ-DE-CHAUSSÉE',
    heroImageCaption: 'Comptoir d’accueil',
    // Le seed reste sur les trois champs historiques : c'est le cas que la
    // compatibilité ascendante doit couvrir, et l'exemple sert justement de
    // témoin d'une école configurée « à l'ancienne ».
    heroSlides: [],
  },
  stats: [
    { value: '400', label: 'Places · grande salle de lecture' },
    { value: '200', label: 'Places · salle d’étude du soir' },
    { value: '7', label: 'Espaces documentaires distincts' },
    { value: '7h30–22h', label: 'Amplitude d’ouverture, lun.–ven.' },
  ],
  espaces: [
    {
      icon: '📖',
      title: 'Grande salle de lecture',
      tag: '400 places',
      description: 'Ouverte de 7h30 à 19h30, pour le travail individuel et la lecture au long cours.',
    },
    {
      icon: '🗂️',
      title: 'Salle de consultation',
      tag: 'Libre accès',
      description: 'Fonds en accès direct, à parcourir librement sans passer par le prêt.',
    },
    {
      icon: '🏛️',
      title: 'Fonds patrimonial',
      tag: 'Consultation sur place',
      description: 'Collections anciennes et documents rares, consultables sur demande.',
    },
    {
      icon: '📚',
      title: 'Salle de documentation',
      tag: 'Ressources spécialisées',
      description: 'Revues, mémoires et thèses pour la recherche approfondie.',
    },
    {
      icon: '🌙',
      title: 'Salle d’étude du soir',
      tag: '200 places · jusqu’à 22h00',
      description: 'Pour prolonger le travail bien après la fermeture des autres salles.',
    },
    {
      icon: '⠃',
      title: 'Salle braille',
      tag: 'Accessibilité',
      description: 'Équipements et documents adaptés pour les usagers malvoyants.',
    },
    {
      icon: '🧵',
      title: 'Salle de reliure',
      tag: 'Conservation',
      description: 'Restauration et reliure des ouvrages pour préserver le fonds.',
    },
  ],
  services: [
    'Accueil & orientation',
    'Consultation & prêt de documents',
    'Formation à la recherche documentaire',
    'Accès Internet & ressources numériques',
    'Communication & animation',
  ],
  hours: {
    note: 'La bibliothèque reste ouverte sans permanence du soir durant les vacances universitaires.',
    lines: [
      { label: 'Lundi – Vendredi', value: '7h30 – 19h30' },
      { label: 'Salle d’étude du soir', value: 'jusqu’à 22h00' },
      { label: 'Pendant les vacances universitaires', value: '7h30 – 15h30' },
      { label: 'Samedi', value: 'Fermé' },
    ],
  },
  resources: [
    {
      name: 'Gafeso',
      description: 'Catalogue en ligne, compte lecteur, réservations',
      status: 'live',
      statusLabel: 'En ligne',
      url: '',
    },
    {
      name: 'Catalogue historique',
      description: 'Fonds documentaire antérieur à la migration',
      status: 'live',
      statusLabel: 'Disponible',
      url: '',
    },
    {
      name: 'Ancien portail',
      description: 'Portail numérique remplacé par Gafeso',
      status: 'maint',
      statusLabel: 'Remplacé',
      url: '',
    },
  ],
  contact: {
    description:
      'Bibliothèque Universitaire d’Exemple — un espace de savoir et de rencontre dédié à la réussite académique. Remplacez ce texte, l’adresse et les coordonnées par les vôtres.',
    partnerNote: 'Mentionnez ici vos partenaires ou financeurs, si vous en avez.',
    address: '00 BP 0000\nOuagadougou 00, Burkina Faso',
    phones: '+226 00 00 00 00',
    email: 'contact@bibliotheque.exemple.bf',
    socials: [{ label: 'exemple.bf', url: 'https://bibliotheque.exemple.bf' }],
    copyright: '© Université d’Exemple — Bibliothèque Universitaire d’Exemple',
  },
};

/**
 * Tokens de thème de l'amorce d'exemple : un accent chaud et le motif de fond.
 * --primary N'EST PAS forcé ici : il reste la couleur déjà choisie par
 * l'établissement (TenantSettings.primaryColor) — spec §1.
 */
export const EXEMPLE_HOME_THEME = {
  themeTokens: {
    accent: '#C1592C',
    accentSoft: '#E8B98C',
    primaryDark: '#083F24',
    highlight: '#D9A441',
    bg: '#F1E7D2',
    bgDeep: '#E7D9BB',
    surface: '#FBF6EA',
    text: '#221C13',
    textSoft: '#4A4030',
    danger: '#9E2B2B',
  },
  latticeEnabled: true,
};
