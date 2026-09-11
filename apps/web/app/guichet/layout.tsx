import { AdminShell } from '@/components/admin-shell';

// Le guichet est un onglet de l'espace professionnel depuis la refonte de
// navigation : il porte donc la même coque que le reste, et non l'en-tête
// public seul. Sans quoi le bibliothécaire perdrait sa barre d'onglets en
// arrivant sur l'écran où il passe sa journée.
export default function GuichetLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
