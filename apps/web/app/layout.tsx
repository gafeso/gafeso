import type { Metadata } from 'next';
import { metadonneesRacine } from '@/lib/titre-onglet';
import { headers } from 'next/headers';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';

/**
 * ⚠ LE TITRE D'ONGLET NE DISAIT PAS DE QUELLE BIBLIOTHÈQUE IL S'AGIT.
 *
 * Constaté le 14 septembre 2026 en balayant le chemin PUBLIC sans cookie :
 * toutes les pages sauf l'accueil portaient `<title>Gafeso</title>` — le nom du
 * PRODUIT. Une notice dont le `<h1>` dit « Textiles et motifs en Afrique de
 * l'Ouest » s'annonçait « Gafeso » dans l'onglet, dans un signet, et dans
 * l'index d'un moteur.
 *
 * ⚠ C'est un défaut d'ABSENCE, et aucune mutation ne pouvait le révéler : rien
 * n'était faux, il n'y avait simplement rien d'écrit. Il s'est trouvé en
 * ÉNUMÉRANT ce que chaque page publique sert et en demandant qui le montre.
 *
 * Le gabarit racine est le seul endroit qui corrige toute la famille : il pose
 * le nom de l'école en DÉFAUT et en GABARIT, et chaque page ne déclare plus que
 * son propre segment. Une page ajoutée demain hérite de la propriété sans que
 * personne y pense — c'est un invariant, pas cinq corrections.
 *
 * Le coût est nul : `/tenancy/home` est déjà mis en cache par Next (tags +
 * revalidate, voir lib/server-api.ts) et toutes les routes sont déjà dynamiques
 * pour le nonce.
 */
export async function generateMetadata(): Promise<Metadata> {
  return metadonneesRacine();
}

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
