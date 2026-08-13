// Construit le bloc de variables CSS de la vitrine (spec docs/spec-accueil-tenant.md §1),
// injecté au rendu SSR de la page d'accueil (pas de flash de thème : les
// couleurs sont dans le HTML servi, avant hydratation).
//
// SEUL `--primary` est partagé avec le thème applicatif (il vient de
// primaryColor de l'établissement). Tous les autres tokens — accent compris —
// viennent de themeTokens renvoyé par l'API (déjà fusionné avec les défauts).

/** Tokens de la vitrine, camelCase → nom de variable CSS kebab-case. */
const TOKEN_TO_CSS_VAR: Record<string, string> = {
  accent: '--accent',
  accentSoft: '--accent-soft',
  primaryDark: '--primary-dark',
  highlight: '--highlight',
  bg: '--bg',
  bgDeep: '--bg-deep',
  surface: '--surface',
  text: '--text',
  textSoft: '--text-soft',
  danger: '--danger',
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

export interface HomeTheme {
  /** Couleur principale de l'école (TenantSettings.primaryColor) → --primary. */
  primary: string;
  /** Tokens de la vitrine, accent compris (API → themeTokens). */
  tokens: Record<string, string>;
}

/**
 * Rend le contenu d'un bloc `:root { ... }` avec toutes les variables de la
 * vitrine. Chaque valeur est validée (hex 6) — une valeur inattendue est
 * simplement ignorée (le défaut du CSS de la vitrine prend le relais).
 */
export function homeThemeCssVars(theme: HomeTheme): string {
  const decls: string[] = [];
  if (HEX.test(theme.primary)) decls.push(`--primary:${theme.primary}`);
  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS_VAR)) {
    const value = theme.tokens?.[key];
    if (typeof value === 'string' && HEX.test(value)) decls.push(`${cssVar}:${value}`);
  }
  return decls.join(';');
}

/**
 * Variante objet (pour l'attribut `style` d'un élément React) : injecte les
 * variables au rendu SSR, sans flash, scoping par héritage CSS.
 */
export function homeThemeStyle(theme: HomeTheme): Record<string, string> {
  const style: Record<string, string> = {};
  if (HEX.test(theme.primary)) style['--primary'] = theme.primary;
  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS_VAR)) {
    const value = theme.tokens?.[key];
    if (typeof value === 'string' && HEX.test(value)) style[cssVar] = value;
  }
  return style;
}
