import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { noticePublique } from '@/lib/server-api';
import { FicheNotice } from './fiche-notice';

/**
 * Fiche publique d'une notice — enveloppe SERVEUR, backlog n° 7.
 *
 * ⚠ POURQUOI CETTE ENVELOPPE EXISTE. La fiche est un composant client : le 404
 * vivait dans son appel à l'API, jamais dans la réponse HTTP. La page rendait
 * donc **200** pour un identifiant qui n'existe pas. Correct pour l'utilisateur,
 * qui lit « Notice introuvable » — mais indétectable par une machine : un
 * vérificateur de liens morts ou un moteur d'indexation ne distingue pas une
 * notice supprimée d'une notice vivante.
 *
 * Et ces identifiants circulent : `BiblioRecord.id` ne change JAMAIS, il est
 * inscrit dans les licences hors-ligne signées déjà déployées. Des liens vers
 * des notices retirées existeront.
 *
 * ⚠ CE QUE L'ENVELOPPE NE FAIT PAS : décider 404 sur une panne. `noticePublique`
 * rend trois réponses, pas deux. Une API injoignable laisse passer le rendu —
 * la fiche affichera son propre message d'échec — parce que répondre 404 quand
 * on ne sait pas reviendrait à déclarer disparu ce qu'on n'a pas pu joindre,
 * et à le faire savoir aux moteurs.
 */
/**
 * Le titre d'onglet d'une notice — et il obéit aux MÊMES TROIS ÉTATS que la
 * page, parce que c'est la même question posée deux fois.
 *
 * ⚠ `introuvable` ne titre pas : la page rend 404, et Next affiche alors la
 * page d'erreur. `indisponible` ne titre pas NON PLUS — on ne sait pas ce
 * qu'est cette notice, et écrire un titre reviendrait à l'affirmer. Dans les
 * deux cas on retombe sur le défaut du gabarit racine, c'est-à-dire le nom de
 * l'école : vrai quoi qu'il arrive.
 *
 * ⚠ Le fetch est PARTAGÉ avec la page (même URL, même cache Next) : ce titre ne
 * coûte aucune requête supplémentaire.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { etat, notice } = await noticePublique(id);
  if (etat !== 'existe') return {};
  const titre = (notice as { title?: string } | null)?.title;
  return titre ? { title: titre } : {};
}

export default async function FicheNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { etat, notice } = await noticePublique(id);
  if (etat === 'introuvable') notFound();
  // ⚠ `notice` est nulle quand l'état est « indisponible » : la fiche se charge
  // alors comme avant, côté client, et dit elle-même son échec. Passer un objet
  // vide à la place ferait rendre une notice sans titre — une page qui affirme
  // un contenu qu'elle n'a pas.
  return <FicheNotice initial={(notice as never) ?? null} />;
}
