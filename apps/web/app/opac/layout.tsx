import type { Metadata } from 'next';
import { LIBELLES } from '@/lib/libelles';
import { metadonneesDeSection } from '@/lib/titre-onglet';
import { Header } from '@/components/header';
import { LienDEvitement } from '@/components/lien-evitement';

// Le nom de l'école est composé par le gabarit RACINE ; ici, le segment seul.
export function generateMetadata(): Promise<Metadata> {
  return metadonneesDeSection(LIBELLES.titres.catalogue);
}

export default function OpacLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* ⚠ PREMIER ÉLÉMENT FOCALISABLE de la page : il n'a de sens qu'ici, avant
          l'en-tête. Les pages posent la cible `#contenu` sur leur `<main>`. */}
      <LienDEvitement />
      <Header />
      {children}
    </>
  );
}
