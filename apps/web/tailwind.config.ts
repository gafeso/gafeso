import type { Config } from 'tailwindcss';

// Couleurs de marque Gafeso (mêmes valeurs que TenantSettings par défaut)
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Couleurs de marque DYNAMIQUES : alimentées par TenantSettings via
        // le ThemeProvider (variables CSS). Défauts Gafeso dans globals.css.
        ink: 'rgb(var(--brand-primary-rgb) / <alpha-value>)',
        ocre: 'rgb(var(--brand-secondary-rgb) / <alpha-value>)',
        // Marron de lecture (titres + texte courant) — indépendant du primaire
        // du tenant. Voir --heading-rgb dans globals.css.
        heading: 'rgb(var(--heading-rgb) / <alpha-value>)',
        paper: '#FCFBF7', // fond chaud
        line: '#E5E1D6',
        muted: '#5E6B78',
      },
      fontFamily: {
        serif: ['Charter', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
