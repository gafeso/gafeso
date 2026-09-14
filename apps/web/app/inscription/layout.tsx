import type { Metadata } from 'next';
import { LIBELLES } from '@/lib/libelles';

/**
 * ⚠ CE GABARIT N'EXISTE QUE POUR LE TITRE D'ONGLET. L'écran d'inscription est un composant CLIENT, qui ne peut pas exporter de métadonnées.
 *
 * Le nom de l'école vient du gabarit RACINE, qui le compose ; cette page ne
 * déclare que son propre segment.
 */
export const metadata: Metadata = { title: LIBELLES.titres.inscription };

export default function InscriptionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
