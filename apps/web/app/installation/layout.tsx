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
/**
 * ⚠⚠ `absolute`, ET PAS UNE CHAÎNE NUE — corrigé le 9 octobre 2026 par une
 * RECETTE, et mon commentaire décrivait déjà l'intention que le code n'avait pas
 * atteinte.
 *
 * Une chaîne nue est passée au `template` du gabarit PARENT, qui ajoute le nom
 * de l'école : l'onglet affichait « Installer Gafeso · Université d'Exemple —
 * Bibliothèque universitaire ». Sur une instance NEUVE il n'existe pas d'école,
 * et c'est précisément le cas que ce fichier existe pour traiter.
 *
 * ⭐ Le commentaire disait « hériter du gabarit racine ferait apparaître un nom
 * vide » — il avait raison, et il décrivait une protection que le code ne
 * fournissait pas. **Un texte qui décrit une sauvegarde est un test qui n'a pas
 * été écrit** : celui-ci est dans `assistant-installation.spec.tsx`.
 */
export const metadata: Metadata = { title: { absolute: 'Installer Gafeso' } };

export default function InstallationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
