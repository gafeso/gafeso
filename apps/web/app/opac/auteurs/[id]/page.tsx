import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auteurPublic } from '@/lib/server-api';
import { FicheAuteur, type AuthorDetail } from './fiche-auteur';

/**
 * Fiche publique d'un auteur — enveloppe SERVEUR.
 *
 * ⚠ POURQUOI ELLE EXISTE, et c'est le même motif que pour la notice, mesuré le
 * 14 septembre 2026 :
 *
 *   · la page rendait **200** pour un auteur qui n'existe pas, alors que l'API
 *     répond 404. Correct pour un lecteur, qui lit « Auteur indisponible » —
 *     indétectable par une machine, qui ne distingue pas une fiche retirée
 *     d'une fiche vivante ;
 *   · et son HTML ne portait que la coque : 65 octets de texte, aucun `<h1>`.
 *     Un moteur n'y voyait RIEN.
 *
 * ⚠ CE QU'ELLE NE FAIT PAS : décider 404 sur une panne. `auteurPublic` rend
 * trois réponses, pas deux — une API injoignable laisse passer le rendu, et la
 * fiche dit elle-même son échec. Déclarer disparu ce qu'on n'a pas pu joindre
 * le ferait savoir aux moteurs, et un désindexage ne se répare pas tout seul.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { etat, auteur } = await auteurPublic(id);
  // ⚠ Mêmes trois états que la page : on ne titre que ce qu'on SAIT. Sinon on
  // retombe sur le segment « Auteurs », qui reste vrai.
  if (etat !== 'existe') return {};
  const nom = (auteur as AuthorDetail | null)?.displayName;
  return nom ? { title: nom } : {};
}

export default async function FicheAuteurPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { etat, auteur } = await auteurPublic(id);
  if (etat === 'introuvable') notFound();
  return <FicheAuteur initial={(auteur as AuthorDetail) ?? null} />;
}
