import { notFound } from 'next/navigation';
import { noticeExiste } from '@/lib/server-api';
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
 * ⚠ CE QUE L'ENVELOPPE NE FAIT PAS : décider 404 sur une panne. `noticeExiste`
 * rend trois réponses, pas deux. Une API injoignable laisse passer le rendu —
 * la fiche affichera son propre message d'échec — parce que répondre 404 quand
 * on ne sait pas reviendrait à déclarer disparu ce qu'on n'a pas pu joindre,
 * et à le faire savoir aux moteurs.
 */
export default async function FicheNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if ((await noticeExiste(id)) === 'introuvable') notFound();
  return <FicheNotice />;
}
