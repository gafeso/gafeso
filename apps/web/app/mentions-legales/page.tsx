import type { Metadata } from 'next';
import { PageLegalePublique } from '@/components/page-legale';
import { fetchTenantHome } from '@/lib/server-api';
import { LIBELLES } from '@/lib/libelles';
import { metadonneesDeSection } from '@/lib/titre-onglet';

export async function generateMetadata(): Promise<Metadata> {
  return metadonneesDeSection(LIBELLES.pagesLegales.mentions);
}

/**
 * ⚠ RENDU SERVEUR, et `notFound()` quand la page n'est pas publiée. Un
 * composant client aurait affiché un squelette puis disparu — or ce qui doit
 * sortir de cette page est un CODE HTTP : un 404 part dans l'index d'un moteur
 * et dans un vérificateur de liens, là où un écran vide n'y part pas.
 */
export default async function Page() {
  // ⚠ `fetchTenantHome()` résout le host elle-même (`currentHost()`) — je lui
  // passais un host, et tsc l'a refusé. C'est la bonne forme : une seule
  // fonction connaît comment le host se lit.
  const home = await fetchTenantHome();
  return (
    <PageLegalePublique
      cle="mentions"
      titre={LIBELLES.pagesLegales.mentions}
      page={home?.pagesLegales?.mentions}
    />
  );
}
