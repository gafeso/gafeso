import { Header } from '@/components/header';
import { LienDEvitement } from '@/components/lien-evitement';

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
