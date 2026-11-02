import type { Metadata } from 'next';

import { résoudreEtRediriger, métadonnéesDeRésolution } from '@/components/resolution-perenne';

/**
 * ⭐⭐ `/p/<identifiant>` — L'ADRESSE PÉRENNE **COURTE**, celle que les
 * étiquettes impriment.
 *
 * ## ⚠ ELLE EST VALIDE POUR TOUJOURS, et `/opac/resoudre/…` AUSSI
 *
 * On n'enlève jamais une adresse pérenne : **on en ajoute une plus courte.**
 * Les deux résolvent le même identifiant, par le même code partagé.
 * `routes-perennes.spec.ts` verrouille les deux, et son message dit pourquoi.
 *
 * ## ⭐ POURQUOI ELLE EXISTE : un chiffre, et une fenêtre qui se fermait
 *
 * Le QR d'une étiquette est un carré FIXE de 13 mm, et le seuil imprimable du
 * produit est `LARGEUR_MODULE_MIN_MM = 0,25`. Le slug d'une école apparaît
 * DEUX FOIS dans l'adresse pérenne — dans l'hôte, puis dans l'identifiant —
 * donc chaque caractère de préfixe coûte double. Mesuré le 2 novembre 2026,
 * en deux-points bruts, ECC M :
 *
 * | Le gabarit | Slug le plus long qui tient |
 * |---|---|
 * | `/opac/resoudre/oai:<slug>:<uuid>` | **15 caractères** |
 * | **`/p/oai:<slug>:<uuid>`** | **21 caractères** |
 * | `/p/<slug>:<uuid>` (sans `oai:`) | 23 caractères |
 *
 * ⭐ Six caractères de slug gagnés pour douze de chemin économisés — et
 * `zinda` retombe en **version 5** (0,2889 mm au lieu de 0,2653).
 *
 * ⚠ **`/p/<slug>:<uuid>` a été ÉCARTÉE** malgré ses deux caractères de plus :
 * l'adresse ne contiendrait plus l'identifiant publié *verbatim*, donc on ne
 * pourrait plus le recopier depuis la barre du navigateur, et le résolveur
 * devrait rajouter `oai:` — une seconde représentation d'une valeur que le
 * backend publie déjà à des moissonneurs extérieurs. Deux caractères ne paient
 * pas ça.
 *
 * ⚠ Et la fenêtre : **rien n'est encore imprimé.** Une adresse pérenne ne se
 * change plus une fois collée sur un livre — c'est pourquoi ce raccourcissement
 * se fait maintenant et pas après la première planche.
 */
export function generateMetadata(): Metadata {
  return métadonnéesDeRésolution();
}

export default async function PageCourtePérenne({
  params,
}: {
  params: Promise<{ identifiant: string }>;
}) {
  const { identifiant } = await params;
  /*
   * ⚠ `await` : la redirection doit lever DANS cette page, avant le premier
   * octet de contenu. Retourner un composant la déplacerait dans le rendu de
   * l'enfant — le 308 part quand même, mais la propriété devient dépendante de
   * l'ordre de rendu de React, et un test l'a refusé à juste titre.
   */
  return await résoudreEtRediriger(identifiant);
}
