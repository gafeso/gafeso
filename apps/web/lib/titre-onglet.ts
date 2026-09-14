import type { Metadata } from 'next';
import { LIBELLES } from '@/lib/libelles';
import { fetchTenantHome } from '@/lib/server-api';

/**
 * Le nom de l'établissement tel qu'il s'écrit dans un onglet — ou `null`.
 *
 * ⚠ `null` COUVRE DEUX CAS QU'ON NE DISTINGUE PAS ICI : hôte inconnu et API
 * injoignable. Dans les deux on ignore de quelle bibliothèque il s'agit, et
 * c'est la seule chose qui compte pour un titre : on ne le devine pas. Un
 * titre qui nomme la mauvaise école part dans un signet et y reste.
 */
async function nomDeLEcole(): Promise<string | null> {
  const home = await fetchTenantHome();
  return home?.content.identity.fullName || home?.name || null;
}

/**
 * ⚠ POURQUOI CETTE FONCTION EXISTE — et la mesure qui l'a exigée.
 *
 * Next ne fait PAS descendre un `template` à travers un gabarit qui déclare un
 * `title` en chaîne simple : ce gabarit REMET À ZÉRO le gabarit de ses
 * descendants. Posé le 14 septembre 2026, `title: 'Catalogue'` sur `/opac` a
 * donc rendu « Catalogue · École » pour /opac — et « Auteurs » tout court pour
 * `/opac/auteurs`, « Textiles et motifs… » tout court pour une notice.
 *
 * ⚠ Ma relecture ne l'a pas vu : la règle est dans la sémantique de Next, pas
 * dans mon code. Seul le relevé des titres SERVIS l'a montré, et c'est la
 * raison pour laquelle il a été refait après le changement.
 *
 * Tout gabarit de section passe donc par ici : il porte son propre titre ET
 * republie le gabarit pour ce qu'il contient.
 */
export async function metadonneesDeSection(segment: string): Promise<Metadata> {
  const ecole = await nomDeLEcole();
  if (!ecole) return { title: segment };
  // ⚠ LE SEGMENT RESTE NU. Un `default` est lui-même passé au gabarit du
  // PARENT : composer l'école ici la ferait apparaître DEUX FOIS
  // (« Catalogue · École · École »). Mesuré le 14 septembre 2026, et invisible
  // autrement — la règle est dans la sémantique de Next, pas dans ce fichier.
  return { title: { default: segment, template: `%s · ${ecole}` } };
}

/** Le gabarit RACINE : le nom de l'école seul, et le gabarit pour tout le reste. */
export async function metadonneesRacine(): Promise<Metadata> {
  const home = await fetchTenantHome();
  const ecole = home?.content.identity.fullName || home?.name || null;
  const description = home?.content.identity.lead || LIBELLES.titres.descriptionParDefaut;
  if (!ecole) return { title: LIBELLES.titres.replique, description };
  return { title: { default: ecole, template: `%s · ${ecole}` }, description };
}
