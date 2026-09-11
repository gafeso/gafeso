import { CHAMPS_PAR_PROFIL } from './profil-de-notice';

/**
 * LECTURE ET ÉCRITURE DES CHAMPS DE PROFIL — P3-3, temps 1.
 *
 * Les trois champs propres aux profils (`publicationCity`, `defenseUniversity`,
 * `defensePlace`) vivaient en colonnes du noyau. Ils sont désormais portés par
 * `profile_data`, une colonne JSON.
 *
 * ⚠ COEXISTENCE, ET ELLE EST DÉLIBÉRÉE. Pendant le temps 1 :
 *   · les ÉCRITURES alimentent les DEUX endroits (colonnes + JSON) ;
 *   · les LECTURES passent par le JSON.
 * C'est ce qui prouve que le temps 2 — retirer les colonnes — sera sans effet :
 * si un consommateur avait été manqué, il lirait une colonne encore présente et
 * le filet de comparaison le montrerait AVANT la suppression, pas après.
 *
 * ⚠ Sortir ces champs du noyau ne les retire NI de la recherche NI des
 * réponses. `defenseUniversity` reste un attribut cherchable pondéré, et les
 * trois valeurs continuent de voyager à plat aux clés que le mobile connaît.
 */

/** Les trois champs portés par `profile_data`, dérivés de la déclaration P3-2. */
export const CHAMPS_PORTES_PAR_PROFILE_DATA = [
  ...CHAMPS_PAR_PROFIL.bibliographique.filter((c) => c !== 'isbn' && c !== 'publisher'),
  ...CHAMPS_PAR_PROFIL.academique,
] as const;

export interface ChampsDeProfil {
  publicationCity: string | null;
  defenseUniversity: string | null;
  defensePlace: string | null;
}

/**
 * Lit les champs de profil d'une notice.
 *
 * ⚠ TOLÈRE UN `profileData` ABSENT OU MAL FORMÉ, et rend `null` — jamais
 * `undefined`, jamais une exception. Une notice écrite avant le temps 1 par un
 * chemin oublié, ou un JSON malmené à la main, ne doit pas faire tomber une
 * réponse : `null` est exactement ce que la colonne rendait.
 */
export function lireChampsDeProfil(profileData: unknown): ChampsDeProfil {
  const donnees =
    profileData && typeof profileData === 'object' && !Array.isArray(profileData)
      ? (profileData as Record<string, unknown>)
      : {};
  const chaine = (cle: string): string | null => {
    const v = donnees[cle];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  return {
    publicationCity: chaine('publicationCity'),
    defenseUniversity: chaine('defenseUniversity'),
    defensePlace: chaine('defensePlace'),
  };
}

/**
 * Construit la valeur de `profile_data` pour une écriture.
 *
 * Les clés à valeur nulle sont OMISES, pas mises à `null` : une notice sans
 * champ de profil porte `{}`, ce qui est ce que la migration a écrit
 * (`jsonb_strip_nulls`). Sans cette symétrie, une notice créée par l'API et une
 * notice recopiée par la migration différeraient à l'octet — et le filet
 * signalerait un changement que personne n'aurait voulu.
 */
export function ecrireChampsDeProfil(champs: Partial<ChampsDeProfil>): Record<string, string> {
  const sortie: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(champs)) {
    if (typeof valeur === 'string' && valeur.length > 0) sortie[cle] = valeur;
  }
  return sortie;
}

/**
 * Rend la notice telle que les consommateurs l'attendent : les trois champs de
 * profil À PLAT, et `profileData` RETIRÉ.
 *
 * ⚠ POURQUOI LE RETIRER EST OBLIGATOIRE, PAS COSMÉTIQUE. Les routes
 * d'administration renvoient la LIGNE ENTIÈRE (`include`). Ajouter une colonne
 * ajoute donc une clé à leur réponse — `profileData` s'y est invité tout seul
 * au moment du `db push`, sans que personne l'ait décidé. C'est exactement le
 * défaut que P3-4 a corrigé sur la route publique (« chaque colonne ajoutée
 * fuite automatiquement »), et il se rejouerait ici.
 *
 * Le retirer maintient la promesse du lot : AUCUNE réponse ne change. Le jour
 * où un écran voudra lire l'objet, ce sera une décision annoncée.
 */
export function aplatirChampsDeProfil<T extends { profileData?: unknown }>(
  record: T,
): Omit<T, 'profileData'> & ChampsDeProfil {
  const { profileData, ...reste } = record;
  return { ...(reste as Omit<T, 'profileData'>), ...lireChampsDeProfil(profileData) };
}
