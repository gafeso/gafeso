/**
 * Tokens de couleur de la page d'accueil vitrine (spec docs/spec-accueil-tenant.md §1).
 *
 * IMPORTANT : SEUL `--primary` est partagé avec le thème applicatif (décision
 * §1 « recommandé » — un seul choix de couleur principale par école, via
 * TenantSettings.primaryColor). Tous les AUTRES tokens de la vitrine — accent
 * compris — vivent ici : la vitrine peut ainsi afficher l'accent clay de la
 * maquette sans imposer cet accent à l'application (dont l'accent applicatif,
 * secondaryColor, reste indépendant).
 *
 * Les défauts reproduisent la palette de la maquette officielle de la BUC
 * de la maquette de vitrine — noms sémantiques neutres, aucune référence à un
 * établissement particulier dans le code.
 */

export const HOME_TOKEN_KEYS = [
  'accent', // --accent : accent chaud (em du titre, bouton secondaire)
  'accentSoft', // --accent-soft : dégradés
  'primaryDark', // --primary-dark : footer, survols
  'highlight', // --highlight : petites touches (numéros, titres footer)
  'bg', // --bg : fond de page
  'bgDeep', // --bg-deep : sections alternées
  'surface', // --surface : cartes, header
  'text', // --text : texte principal
  'textSoft', // --text-soft : texte secondaire
  'danger', // --danger : statuts négatifs
] as const;

export type HomeThemeTokenKey = (typeof HOME_TOKEN_KEYS)[number];
export type HomeThemeTokens = Record<HomeThemeTokenKey, string>;

/** Défauts = palette de la maquette BUC. */
export const DEFAULT_HOME_TOKENS: HomeThemeTokens = {
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
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Fusionne les tokens stockés (partiels, potentiellement null/invalides) avec
 * les défauts — la réponse publique porte TOUJOURS une palette complète et
 * valide, quel que soit l'état en base.
 */
export function mergeHomeTokens(stored: unknown): HomeThemeTokens {
  const result: HomeThemeTokens = { ...DEFAULT_HOME_TOKENS };
  if (stored && typeof stored === 'object') {
    const source = stored as Record<string, unknown>;
    for (const key of HOME_TOKEN_KEYS) {
      const value = source[key];
      if (typeof value === 'string' && HEX.test(value)) result[key] = value;
    }
  }
  return result;
}

/**
 * Ne conserve QUE les clés connues et hexadécimales valides (anti-injection :
 * un client ne peut pas écrire de clés/valeurs arbitraires dans le JSON).
 */
export function sanitizeHomeTokens(input: unknown): Partial<HomeThemeTokens> {
  const out: Partial<HomeThemeTokens> = {};
  if (input && typeof input === 'object') {
    const source = input as Record<string, unknown>;
    for (const key of HOME_TOKEN_KEYS) {
      const value = source[key];
      if (typeof value === 'string' && HEX.test(value)) out[key] = value;
    }
  }
  return out;
}
