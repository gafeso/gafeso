// Invalidation à la demande du cache SSR de la page d'accueil (spec §4 :
// « cache raisonnable, invalidé quand l'admin modifie le contenu »).
//
// Appelé en POST par l'écran admin après une sauvegarde réussie. On purge le
// tag de cache de l'hôte courant (celui de l'admin = domaine du tenant) : la
// prochaine visite de l'accueil re-fetch les données fraîches. Aucun secret :
// l'opération ne fait que forcer un rafraîchissement du cache, pour le tenant
// du domaine appelant uniquement.

import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { homeCacheTag } from '@/lib/server-api';

export async function POST() {
  // Next 15 : headers() est asynchrone (les APIs de requête renvoient une promesse).
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  revalidateTag(homeCacheTag(host));
  return NextResponse.json({ revalidated: true, host });
}
