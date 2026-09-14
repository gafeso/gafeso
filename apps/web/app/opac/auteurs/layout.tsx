import type { Metadata } from 'next';
import { LIBELLES } from '@/lib/libelles';
import { metadonneesDeSection } from '@/lib/titre-onglet';

/**
 * ⚠ CE GABARIT N'EXISTE QUE POUR LE TITRE D'ONGLET. La page des auteurs est un composant CLIENT, qui ne peut pas exporter de métadonnées.
 *
 * Le nom de l'école vient du gabarit RACINE, qui le compose ; cette page ne
 * déclare que son propre segment.
 */
export function generateMetadata(): Promise<Metadata> {
  return metadonneesDeSection(LIBELLES.titres.auteurs);
}

export default function AuteursLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
