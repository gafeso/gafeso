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
/**
 * ⚠ BORNE DE TEMPS — et elle existe à cause de ce que ce module a CHANGÉ.
 *
 * Avant le 14 septembre 2026, `/tenancy/home` n'était appelé que par la page
 * d'accueil. Depuis que le gabarit racine en tire le titre, **toutes les pages
 * l'appellent** — y compris l'espace professionnel, qui ne dépendait pas de lui.
 *
 * `fetch` de Node n'a PAS de délai par défaut. Une API qui REFUSE échoue vite ;
 * une API qui SE FIGE ne répond jamais, et une page qui l'attend ne rend rien.
 * J'ai donc étendu à tout le produit un mode de panne qui n'existait que sur
 * l'accueil. On le borne.
 *
 * ⚠ POURQUOI UNE COURSE ET PAS UN `signal`. Passer un `AbortSignal` dans les
 * options de `fetch` peut modifier la façon dont Next met la réponse en cache —
 * et un cache perdu ferait appeler l'API à chaque rendu de chaque page, soit
 * exactement le coût que ce module évite. La course ne touche PAS aux options :
 * le cache reste celui de `server-api.ts`, et l'appel en vol continue de le
 * remplir même si l'on a déjà rendu la main.
 *
 * Trois secondes contre une latence mesurée à 10–30 ms : cent fois la marge. Le
 * délai ne se déclenchera jamais sur une API saine, et c'est le but — une borne
 * qui mord en fonctionnement normal est un défaut, pas une protection.
 */
const DELAI_MAX_MS = 3_000;

async function nomDeLEcole(): Promise<string | null> {
  const home = await Promise.race([
    fetchTenantHome(),
    // ⚠ MÊME ISSUE QU'UN ÉCHEC, délibérément : `null` veut dire « on ne sait pas
    // de quelle bibliothèque il s'agit », et c'est vrai aussi bien quand l'API
    // refuse que quand elle ne répond pas. Le titre retombe alors sur le nom du
    // produit, qui n'affirme rien de faux.
    new Promise<null>((resolve) => setTimeout(() => resolve(null), DELAI_MAX_MS)),
  ]);
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
  const home = await Promise.race([
    fetchTenantHome(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), DELAI_MAX_MS)),
  ]);
  const ecole = home?.content.identity.fullName || home?.name || null;
  const description = home?.content.identity.lead || LIBELLES.titres.descriptionParDefaut;
  if (!ecole) return { title: LIBELLES.titres.replique, description };
  return { title: { default: ecole, template: `%s · ${ecole}` }, description };
}
