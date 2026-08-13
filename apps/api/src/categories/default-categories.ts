/**
 * Les 28 catégories standard recueillies auprès de la responsable d'un fonds
 * universitaire réel (juillet 2026).
 *
 * Libellés tels que fournis ; le seed les normalise à l'insertion (minuscules,
 * espaces réduits — même règle que la création manuelle, voir
 * CategoriesService.normalize) et compare sans casse NI accents pour ne
 * jamais créer de doublon avec une catégorie existante du tenant.
 */
export const DEFAULT_CATEGORIES: readonly string[] = [
  'Information, ouvrages généraux',
  'Informatique',
  'Philosophie, Parapsychologie et Occultisme, Psychologie',
  'Religions',
  'Sciences sociales',
  'Science politique',
  'Économie',
  'Droit',
  'Problèmes et services sociaux, Associations',
  'Éducation, enseignement',
  'Coutumes, savoir-vivre, folklore',
  'Linguistique',
  'Mathématiques',
  'Astronomie et ses sciences connexes',
  'Physique',
  'Chimie et sciences connexes',
  'Sciences de la Terre',
  'Biologie',
  'Zoologie',
  'Médecine',
  'Agronomie, agriculture et activités connexes',
  "Gestion de l'entreprise et services auxiliaires",
  'Comptabilité',
  'Arts, Loisirs et Sports / Musiques',
  'Urbanisme / Architecture',
  'Littérature',
  'Géographie',
  'Histoire et disciplines auxiliaires',
] as const;
