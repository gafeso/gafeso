/**
 * L'instrument qui lit les rôles système — éprouvé comme du code neuf.
 *
 * ⚠ IL SERT À JUGER AUTRE CHOSE, donc il mérite plus de soin qu'un test
 * ordinaire : quatre fois dans ce dépôt, l'outil écrit pour traquer une famille
 * en portait un exemplaire, et aucun n'a été trouvé par relecture.
 *
 * Deux témoins, et le second est celui qu'on oublie :
 *   · PRÉSENCE — il voit un cas qu'il DOIT voir ;
 *   · ABSENCE  — il sait dire NON. Sans lui, un lecteur qui rendrait des listes
 *     vides pour tout serait indiscernable d'un lecteur juste, et plus
 *     rassurant : il ne signalerait jamais rien.
 */

import { describe, expect, it } from 'vitest';
import { catalogue, fonctionsDuRole, rolesSysteme } from './aide-roles-systeme';

describe('Lecture des rôles système', () => {
  it('⚠ témoin de COMPTE : il lit les CINQ rôles système', () => {
    // Un compte exact ne dit pas que la lecture est juste : il oblige à revenir
    // la regarder le jour où un sixième rôle apparaît.
    expect(rolesSysteme().map((r) => r.nom).sort()).toEqual([
      'Acquisitions',
      'Administrateur',
      'Bibliothécaire',
      'Gestionnaire',
      'Étudiant',
    ]);
  });

  it('témoin de PRÉSENCE : il résout les identifiants, pas les noms de constantes', () => {
    const f = fonctionsDuRole('Bibliothécaire');
    expect(f).toContain('catalogue.gerer');
    expect(f.every((x) => /^[a-z]+\.[a-z]+$/.test(x))).toBe(true);
  });

  it('⚠ il voit l’élargissement du 14 septembre 2026', () => {
    // Le cas qui a motivé ce fichier : une copie écrite à la main ne l'aurait
    // pas su, et serait restée verte en décrivant un rôle qui n'existe plus.
    expect(fonctionsDuRole('Bibliothécaire')).toContain('lecteurs.voir');
  });

  it('⚠ témoin d’ABSENCE : un rôle inconnu ÉCHOUE, il ne rend pas une liste vide', () => {
    // La confusion PLAUSIBLE, pas un cas inventé : une faute de frappe sur un
    // nom accentué. Sans ce refus, l'écran monté afficherait son refus d'accès
    // et le test passerait sur une page qui n'est pas celle qu'on mesure.
    expect(() => fonctionsDuRole('Bibliothecaire')).toThrow(/introuvable/);
  });

  it('⚠ l’Administrateur échoue AUSSI — il porte TOUTES_LES_FONCTIONS', () => {
    // Rendre `[]` pour lui serait le piège exact que ce fichier existe pour
    // éviter : une liste vide qui se lit comme « ce rôle n'a aucun droit ».
    expect(() => fonctionsDuRole('Administrateur')).toThrow(/VIDE|TOUTES/);
  });

  it('le catalogue est lu, et il est large', () => {
    const c = catalogue();
    expect(Object.keys(c).length).toBeGreaterThan(15);
    expect(c.CATALOGUE_GERER).toBe('catalogue.gerer');
  });
});
