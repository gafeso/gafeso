import type { Metadata } from 'next';
import { LIBELLES } from '@/lib/libelles';
import { metadonneesDeSection } from '@/lib/titre-onglet';

/**
 * ⚠ CE GABARIT N'EXISTE QUE POUR LE TITRE D'ONGLET — la page est un composant
 * CLIENT, qui ne peut pas exporter de métadonnées.
 *
 * Il passe par `metadonneesDeSection` et non par un `title` en chaîne simple :
 * celui-ci REMETTRAIT À ZÉRO le gabarit de ses descendants (sémantique de Next,
 * mesurée le 14 septembre 2026).
 */
export function generateMetadata(): Promise<Metadata> {
  return metadonneesDeSection(LIBELLES.titres.motDePasse);
}

export default function MotDePasseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
