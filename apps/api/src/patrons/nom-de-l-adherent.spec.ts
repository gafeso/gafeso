import { describe, expect, it } from 'vitest';
import { nomDeLAdherent } from './noms-divergents';

describe('⚠ nomDeLAdherent — la FICHE fait autorité, le compte est un repli', () => {
  /**
   * ⚠ TROIS SITES COMPOSAIENT CE NOM DEPUIS LE COMPTE SEUL, et c'était
   * l'inverse de la règle : `circulation.service` (onglet Réservations),
   * `holds.service` (courriel de mise de côté), `reminders.service` (nom
   * persisté dans le journal des rappels).
   *
   * Mesuré le 16/09/2026 : 4 réservataires sur 6 s'affichaient « — », faute de
   * compte lié. Et une correction faite par la bibliothécaire n'apparaissait
   * nulle part — ce qui contredisait la raison même de la règle : corriger un
   * COMPTE exige `comptes.gerer` (Administrateur), corriger une FICHE exige
   * `adherents.gerer` (bibliothécaire).
   */
  it('⚠ SANS COMPTE, le nom de la fiche est rendu — c’était le « — » visible', () => {
    expect(nomDeLAdherent({ firstName: 'Awa', lastName: 'Traoré', user: null })).toBe('Awa Traoré');
  });

  it('⚠ AVEC COMPTE, la FICHE l’emporte — sinon la correction au comptoir est invisible', () => {
    expect(
      nomDeLAdherent({
        firstName: 'Awa',
        lastName: 'Traoré-Zongo',
        user: { firstName: 'Awa', lastName: 'Traoré' },
      }),
    ).toBe('Awa Traoré-Zongo');
  });

  it('le compte est le REPLI quand la fiche n’a pas de nom — le DTO l’autorise', () => {
    expect(nomDeLAdherent({ firstName: null, lastName: null, user: { firstName: 'Issouf', lastName: 'Zongo' } }))
      .toBe('Issouf Zongo');
  });

  it('un prénom SEUL suffit : on assemble ce qui existe', () => {
    expect(nomDeLAdherent({ firstName: 'Awa', lastName: null, user: null })).toBe('Awa');
    expect(nomDeLAdherent({ firstName: null, lastName: 'Traoré', user: null })).toBe('Traoré');
  });

  it('⚠ TÉMOIN D’ABSENCE : ni fiche ni compte → null, jamais une chaîne vide', () => {
    // Une chaîne vide s'afficherait comme un nom manquant SANS que rien ne le
    // dise ; `null` laisse l'écran choisir ce qu'il en fait.
    expect(nomDeLAdherent({ firstName: null, lastName: null, user: null })).toBeNull();
    expect(nomDeLAdherent({ firstName: '   ', lastName: '', user: null })).toBeNull();
  });
});
