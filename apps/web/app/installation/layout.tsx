import type { Metadata } from 'next';

/**
 * LE TITRE DE L'ASSISTANT — et il ne nomme AUCUNE école.
 *
 * ⚠ C'est le seul écran public du produit dans ce cas, et le motif est
 * mesurable : sur une instance NEUVE il n'existe pas encore d'établissement.
 * Hériter du gabarit racine — qui ajoute le nom de l'école — ferait apparaître
 * un nom vide, ou le nom d'une école que l'installateur n'a pas encore créée.
 *
 * ⚠ Et il est en DUR ici, pas dans les libellés, pour la même raison que le
 * titre racine : une métadonnée Next est évaluée côté serveur au rendu, hors du
 * cycle React, et `metadonneesDeSection` va chercher le nom de l'école — ce qui
 * est exactement ce qu'on ne veut pas ici.
 */
export const metadata: Metadata = { title: 'Installer Gafeso' };

export default function InstallationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
