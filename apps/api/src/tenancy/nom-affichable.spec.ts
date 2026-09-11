import { describe, expect, it } from 'vitest';
import { nomAffichable } from './tenancy.controller';

/**
 * Le nom d'établissement affiché — et la chaîne vide.
 *
 * CONTRÔLE NÉGATIF : ces tests doivent ÉCHOUER si l'on rétablit
 * `record?.name ?? tenant.name`. Le cas décisif est « chaîne vide » : avec
 * `??`, elle traverse intacte et ressort telle quelle jusque dans la
 * Constellation et le pied de page de la vitrine, qui la rendent sans repli.
 * Un test qui ne couvrirait que `null` passerait avec ET sans le correctif —
 * il ne prouverait rien.
 */
describe('nomAffichable', () => {
  it('rend le nom quand il est renseigné', () => {
    expect(nomAffichable('Université Joseph Ki-Zerbo')).toBe('Université Joseph Ki-Zerbo');
  });

  it('LE CAS DU DÉFAUT : une chaîne vide compte pour une absence', () => {
    // Avec `??`, ceci renvoyait '' — et la vitrine affichait du vide.
    expect(nomAffichable('')).toBe('Bibliothèque');
  });

  it('une chaîne d’espaces compte aussi pour une absence', () => {
    expect(nomAffichable('   ')).toBe('Bibliothèque');
  });

  it('retombe sur le candidat suivant quand le premier est vide', () => {
    expect(nomAffichable('', 'Université d’Exemple')).toBe('Université d’Exemple');
  });

  it('gère null et undefined comme avant', () => {
    expect(nomAffichable(null, undefined, 'Bibliothèque Centrale')).toBe('Bibliothèque Centrale');
  });

  it('sans aucun candidat exploitable, rend le repli — jamais une chaîne vide', () => {
    expect(nomAffichable(null, undefined, '')).toBe('Bibliothèque');
    expect(nomAffichable()).toBe('Bibliothèque');
  });

  it('NE REND JAMAIS UN SLUG : ce n’est pas un candidat, c’est un identifiant technique', () => {
    // Garde-fou d'intention. Le slug ne doit jamais être passé à cette
    // fonction ; s'il l'était un jour, ce test ne l'empêcherait pas — mais il
    // documente que « universite-joseph-ki-zer » n'est pas un nom affichable.
    const repli = nomAffichable('', '');
    expect(repli).not.toContain('-');
    expect(repli).toBe('Bibliothèque');
  });
});
