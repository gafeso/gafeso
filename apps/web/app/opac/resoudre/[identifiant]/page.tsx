import type { Metadata } from 'next';

import { résoudreEtRediriger, métadonnéesDeRésolution } from '@/components/resolution-perenne';

/**
 * ⭐⭐ `/opac/resoudre/<identifiant>` — ET ELLE EST VALIDE POUR TOUJOURS.
 *
 * ## ⚠ LA RÈGLE, ET ELLE N'EST PAS NÉGOCIABLE
 *
 * **Cette adresse et `/opac/<id>` restent valides POUR TOUJOURS.** Des QR codes
 * IMPRIMÉS y pointent — collés dans des livres, affichés dans des couloirs. Ils
 * ne se reprennent pas : on ne décolle pas huit mille étiquettes.
 *
 * `routes-perennes.spec.ts` verrouille les trois, et son message dit pourquoi.
 *
 * ## ⚠ POURQUOI ELLE EXISTE — une dette que le backend a RAPPORTÉE
 *
 * `apps/api/src/opac/identifiant-perenne.ts` portait, le 11 octobre 2026 :
 *
 * > « **le WEB NE SERT AUCUNE PAGE `/opac/resoudre/…`** […] Un QR pointant là
 * >   mènerait à un 404. […] Dette RAPPORTÉE au front plutôt que corrigée ici :
 * >   si `/opac/resoudre/[identifiant]` devient une page web (une simple
 * >   redirection vers `/opac/<id>` suffit), cette fonction bascule dessus en
 * >   une ligne. »
 *
 * ⭐ C'est exactement ce que fait cette page. Et le gain est celui que leur
 * fichier décrit : l'identifiant pérenne ne porte AUCUN domaine, donc il
 * survit à un déménagement de serveur — là où `/opac/<id>` est une
 * LOCALISATION.
 *
 * ## ⚠ ET DEPUIS LE 2 NOVEMBRE 2026, CE N'EST PLUS ELLE QU'ON IMPRIME
 *
 * `/p/<identifiant>` fait la même chose en douze caractères de moins, ce qui
 * vaut SIX caractères de slug dans un QR de 13 mm — le slug apparaît deux fois
 * dans l'adresse. Les étiquettes impriment donc `/p/`.
 *
 * ⚠ **Cette adresse ne disparaît pas pour autant, et elle ne disparaîtra
 * jamais** : les QR déjà émis la portent, et les moissonneurs OAI ont pu
 * stocker l'identifiant depuis P4-3. La résolution est PARTAGÉE avec `/p/`
 * plutôt que recopiée.
 *
 * ## ⚠ RENDUE AU SERVEUR, DONC SANS JAVASCRIPT
 *
 * Un appareil photo ouvre l'adresse dans un navigateur quelconque, parfois sans
 * JS, parfois sur un réseau qui coupe. La redirection part dans l'en-tête HTTP,
 * avant le premier octet de contenu.
 */
export function generateMetadata(): Metadata {
  return métadonnéesDeRésolution();
}

export default async function ResoudrePage({
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
