/**
 * Les filtres de la recherche publique ne proposent que ce qui filtre.
 *
 * ⚠ Un filtre qui ne filtre pas est un contrôle sans effet — la faute que ce
 * projet corrige partout ailleurs. Deux groupes de la maquette sont donc
 * absents, et leur absence est VÉRIFIÉE ici, pas seulement commentée :
 *  - « Périodiques » : aucun recordType ne correspond ;
 *  - « Documents numériques » : `avecFichier` n'existe que sur
 *    /opac/nouveautes, /opac/search le refuse.
 */

import { describe, expect, it } from 'vitest';
import { GROUPES_DE_TYPES, isDefenseType, RECORD_TYPES } from '@/lib/record-types';
import { LIBELLES } from '@/lib/libelles';

const typesConnus = new Set(RECORD_TYPES.map((t) => t.value));

describe('groupes de types proposés au public', () => {
  it('chaque valeur envoyée existe VRAIMENT côté catalogue', () => {
    // Une valeur inventée produirait zéro résultat en silence — et l'API,
    // vérifié le 10 septembre, applique bien un filtre vide dans ce cas au
    // lieu de l'ignorer. L'erreur ne serait donc pas rattrapée en aval.
    const inconnues = GROUPES_DE_TYPES.flatMap((g) =>
      g.types.filter((t) => !typesConnus.has(t)).map((t) => `${g.cle} → ${t}`),
    );
    expect(inconnues).toEqual([]);
  });

  it('chaque groupe a un libellé, et chaque libellé un groupe', () => {
    expect(GROUPES_DE_TYPES.map((g) => g.cle).sort()).toEqual(
      Object.keys(LIBELLES.recherche.groupes).sort(),
    );
  });

  it('« Thèses et mémoires » couvre tous les travaux soutenus', () => {
    // Sinon un mémoire de licence disparaîtrait du groupe qui le nomme.
    const travaux = GROUPES_DE_TYPES.find((g) => g.cle === 'travaux');
    const soutenus = RECORD_TYPES.filter((t) => isDefenseType(t.value)).map((t) => t.value);
    expect([...(travaux?.types ?? [])].sort()).toEqual(soutenus.sort());
  });

  it('les groupes couvrent TOUS les types réels — aucun ne devient introuvable', () => {
    // `as const` sur GROUPES_DE_TYPES fige les valeurs en union littérale :
    // on élargit à string pour comparer avec RECORD_TYPES.
    const couverts = new Set<string>(GROUPES_DE_TYPES.flatMap((g) => [...g.types]));
    const orphelins = RECORD_TYPES.map((t) => t.value).filter((t) => !couverts.has(t));
    expect(orphelins).toEqual([]);
  });

  it('aucun groupe ne promet un filtre que l’API ne sert pas', () => {
    // Les deux groupes de la maquette qu'on n'affiche pas. S'ils
    // réapparaissent un jour, ce sera après une mesure, pas par recopie.
    const cles = GROUPES_DE_TYPES.map((g) => g.cle) as string[];
    expect(cles).not.toContain('periodiques');
    expect(cles).not.toContain('numeriques');
    // Et rien dans les libellés ne les annonce non plus.
    const textes = Object.values(LIBELLES.recherche.groupes).join(' ');
    expect(textes).not.toMatch(/périodique/i);
    expect(textes).not.toMatch(/numérique/i);
  });

  it('la valeur envoyée est la forme multiple livrée par l’API', () => {
    const travaux = GROUPES_DE_TYPES.find((g) => g.cle === 'travaux');
    expect(travaux!.types.join(',')).toBe('these,memoire,licence,master,these_unique');
  });
});
