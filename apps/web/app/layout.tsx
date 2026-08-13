import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Gafeso',
  description: 'Bibliothèque physique et numérique de votre établissement',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // SÉCURITÉ / CSP (bug prod 2026-07-16) : la CSP à nonce (middleware.ts) exige
  // un rendu DYNAMIQUE — Next n'injecte le nonce dans ses <script> (y compris
  // les scripts inline d'hydratation) que lorsqu'il rend la page à la demande.
  // Une page prérendue STATIQUEMENT est figée au build SANS nonce : en prod, la
  // CSP stricte bloque alors ses scripts inline → pas d'hydratation (login qui
  // n'aboutit pas, lien « Créer un compte » inerte). Accéder à un en-tête de
  // requête ici opte TOUTES les routes dans le rendu dynamique → nonce partout.
  // Le nonce n'est PAS exposé au DOM (le navigateur le masque volontairement
  // des scripts pour empêcher un XSS de le réutiliser). NE PAS remplacer par
  // `export const dynamic = 'force-dynamic'` : cela passerait aussi le cache
  // fetch en no-store et casserait le cache SSR de l'accueil (revalidate/tags,
  // voir lib/server-api.ts).
  //
  // Next 15 : headers() renvoie une promesse et l'opt-in dynamique se produit à
  // la RÉSOLUTION, pas à l'appel — d'où le `await` et le layout asynchrone.
  // Sans lui, l'appel serait un no-op et la CSP à nonce recasserait en prod.
  await headers();

  return (
    <html lang="fr">
      <body>
        <ThemeProvider />
        {children}
      </body>
    </html>
  );
}
