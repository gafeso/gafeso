import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import { ID_CONTENU } from '@/components/lien-evitement';
import { LIBELLES } from '@/lib/libelles';
import { resoudreIdentifiant } from '@/lib/server-api';
import { identifiantDuSegment } from '@/lib/url-publique';

const T = LIBELLES.resolution;

/**
 * ⭐⭐ LA RÉSOLUTION D'UN IDENTIFIANT PÉRENNE — PARTAGÉE PAR DEUX ADRESSES.
 *
 * ## ⚠ POURQUOI UN MODULE, ET PAS UN SECOND FICHIER QUI RESSEMBLE
 *
 * Deux adresses résolvent le même identifiant :
 *
 * | L'adresse | Depuis | Ce qu'elle porte |
 * |---|---|---|
 * | `/opac/resoudre/<identifiant>` | 11 oct. 2026 | les QR déjà émis, les moissonneurs OAI |
 * | **`/p/<identifiant>`** | 2 nov. 2026 | ce que les ÉTIQUETTES impriment désormais |
 *
 * ⚠ **Les deux restent valides POUR TOUJOURS** — on n'enlève jamais une
 * adresse pérenne, on en ajoute une plus courte. `routes-perennes.spec.ts`
 * verrouille les deux.
 *
 * ⭐ Et c'est exactement le cas où « deux tableaux qui se ressemblent » coûte :
 * deux pages recopiées divergeraient sur la décision la plus fine de ce
 * fichier — qu'`indisponible` ne rend PAS 404 —, et la copie oubliée serait
 * celle qui archive « cet identifiant n'existe pas » chez les moteurs pendant
 * que l'étiquette reste collée dans le livre.
 *
 * ⚠ Ce qui est VOLONTAIREMENT recopié, en revanche : les deux `not-found.tsx`.
 * Le routeur de Next exige un fichier par segment, et un composant partagé y
 * est appelé — c'est le CONTENU qui est partagé, pas le fichier.
 *
 * ## ⚠ UNE FONCTION, PAS UN COMPOSANT — et un test l'a exigé
 *
 * Ma première extraction en faisait un COMPOSANT que la page retournait sans
 * l'attendre. La redirection levait alors pendant le rendu de l'ENFANT, pas
 * dans la page. Le 308 partait quand même — mesuré sur le serveur de
 * développement, les quatre écritures d'adresse — mais
 * `resolution-identifiant.spec.tsx` a refusé : son contrat est que **la page
 * elle-même** lève, donc que rien ne s'exécute après.
 *
 * ⭐ Le test avait raison et la mesure ne le démentait pas : « la redirection
 * part avant le premier octet de contenu » est la propriété de cette page, et
 * la déplacer d'un cran la rend dépendante de l'ordre de rendu de React. Les
 * deux pages AWAITENT donc cette fonction.
 */
export async function résoudreEtRediriger(segment: string) {
  /*
   * ⚠⚠ LE SEGMENT ARRIVE PERCENT-ENCODÉ — mesuré, après que le contraire a été
   * écrit comme un fait. Sans ce décodage, l'appel à l'API double l'encodage et
   * TOUT identifiant valide rend 404. Le motif complet est dans
   * `identifiantDuSegment`.
   *
   * ⭐ Et il encaisse les DEUX écritures qu'un QR peut porter — deux-points
   * bruts ou `%3A` —, parce que Next normalise l'adresse avant `params`. Les
   * étiquettes impriment désormais les bruts (4 caractères gagnés, mesuré) ;
   * les QR déjà émis portent l'encodée.
   */
  const identifiant = identifiantDuSegment(segment);
  const r = await resoudreIdentifiant(identifiant);

  if (r.etat === 'trouve') {
    // ⚠ `permanentRedirect` LÈVE : rien ne s'exécute après.
    permanentRedirect(`/opac/${encodeURIComponent(r.recordId)}`);
  }

  if (r.etat === 'introuvable') notFound();

  /*
   * ⚠⚠ `indisponible` NE REND PAS 404, et c'est la décision qui compte le plus
   * ici. Un 404 servi parce que le catalogue a cligné serait archivé par les
   * moteurs comme « cet identifiant n'existe pas » — et l'étiquette reste
   * collée dans le livre. On dit qu'on ne sait pas.
   */
  return (
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-12 text-center">
      <h1 className="font-serif text-2xl font-bold">{T.indisponibleTitre}</h1>
      <p className="mt-2 text-sm text-muted">{T.indisponibleTexte}</p>
      <Link
        href="/opac"
        className="mt-6 inline-flex min-h-11 items-center font-semibold text-ocre hover:underline"
      >
        {LIBELLES.opac.retourCatalogue}
      </Link>
    </main>
  );
}

/**
 * ⚠ Aucun titre propre : la page ne s'AFFICHE qu'en cas de refus, et elle
 * retombe alors sur le nom de l'école — vrai quoi qu'il arrive. Lui donner un
 * titre affirmerait qu'elle est une destination, alors qu'elle est un
 * aiguillage.
 */
export const métadonnéesDeRésolution = () => ({});

/** Le 404 d'un code scanné — explicite, et AVEC UNE SORTIE. */
export function IdentifiantIntrouvable() {
  return (
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-12 text-center">
      <h1 className="font-serif text-2xl font-bold">{T.introuvableTitre}</h1>
      <p className="mt-2 text-sm text-muted">{T.introuvableTexte}</p>
      <Link
        href="/opac"
        className="mt-6 inline-flex min-h-11 items-center font-semibold text-ocre hover:underline"
      >
        {T.introuvableSortie}
      </Link>
    </main>
  );
}
