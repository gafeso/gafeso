/**
 * L'arbre des collections DIT qu'il n'y a pas d'héritage — P6-1, moitié front.
 *
 * ⚠ C'EST LE POINT DU LOT, ET IL EST CONTRE-INTUITIF. Une sous-collection
 * n'hérite de RIEN : sans règle propre elle n'est visible de personne, même si
 * sa parente en porte dix. Un administrateur qui pose une règle sur « Faculté de
 * Droit » et croit avoir ouvert ses départements se tromperait — et il ne le
 * saurait jamais, puisque l'écran lui montrerait une hiérarchie qui SUGGÈRE
 * l'héritage sans le pratiquer.
 *
 * La phrase ne s'affiche que là où elle détrompe. Sur une racine sans règle, le
 * fait est le même, mais personne n'a cru hériter : la dire partout apprendrait
 * à ne plus la lire.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession } from './aide-session';
import { monterEcran } from './aide-ecran';

vi.mock('next/navigation', async () => (await import('./aide-navigation')).navigationDeTest());

const ADMIN = [
  'document.lire', 'catalogue.gerer', 'circulation.faire', 'adherents.gerer',
  'lecteurs.voir', 'collections.gerer', 'statistiques.voir', 'securite.roles',
];

const col = (
  id: string,
  name: string,
  parentId: string | null,
  accessRules: number,
) => ({
  id, name, description: null, type: 'INTERNAL', tenantId: 't1', parentId,
  _count: { titles: 3, accessRules },
});

const monter = (collections: unknown[]) =>
  monterEcran('/admin/collections', {
    fonctions: ADMIN,
    modules: ['amendes', 'interoperabilite', 'rappels'],
    reponses: { '/collections': collections },
  });

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Arbre des collections', () => {
  it('la hiérarchie s’affiche, et elle porte son niveau', async () => {
    monter([
      col('fac', 'Faculté de Droit', null, 2),
      col('dep', 'Département de droit privé', 'fac', 1),
      col('typ', 'Thèses', 'dep', 1),
    ]);
    const fac = await screen.findByText('Faculté de Droit');
    const dep = screen.getByText('Département de droit privé');
    const typ = screen.getByText('Thèses');
    // ⚠ `aria-level` porte la hiérarchie pour une lecture non visuelle : sans
    // lui, un arbre indenté n'est qu'une liste plate décalée.
    expect(fac.closest('a')?.getAttribute('aria-level')).toBe('1');
    expect(dep.closest('a')?.getAttribute('aria-level')).toBe('2');
    expect(typ.closest('a')?.getAttribute('aria-level')).toBe('3');
  });

  /** ⚠ LE CAS QUI MOTIVE TOUT LE LOT. */
  it('sous-collection sans règle : elle dit que rien n’est hérité', async () => {
    monter([
      col('fac', 'Faculté de Droit', null, 5),
      col('dep', 'Département de droit privé', 'fac', 0),
    ]);
    const phrase = await screen.findByText(LIBELLES.collectionsArbre.sansRegleSousCollection);
    expect(phrase.textContent).toMatch(/n’est visible de personne/);
    expect(phrase.textContent).toMatch(/ne s’appliquent PAS/);
  });

  it('racine sans règle : on dit l’invisibilité, pas l’héritage', async () => {
    monter([col('seule', 'Collection orpheline', null, 0)]);
    expect(await screen.findByText(LIBELLES.collectionsArbre.sansRegle)).toBeTruthy();
    // ⚠ Personne n'a cru hériter ici : la phrase longue serait du bruit.
    expect(screen.queryByText(LIBELLES.collectionsArbre.sansRegleSousCollection)).toBeNull();
  });

  it('collection qui porte des règles : aucune phrase d’alerte', async () => {
    monter([
      col('fac', 'Faculté de Droit', null, 5),
      col('dep', 'Département de droit privé', 'fac', 2),
    ]);
    await screen.findByText('Faculté de Droit');
    expect(screen.queryByText(LIBELLES.collectionsArbre.sansRegle)).toBeNull();
    expect(screen.queryByText(LIBELLES.collectionsArbre.sansRegleSousCollection)).toBeNull();
  });

  /**
   * ⚠ Le rappel en tête ne s'affiche QUE s'il existe une hiérarchie. Sur les
   * quatre collections racines d'aujourd'hui, expliquer un héritage inexistant
   * pour une structure inexistante serait du bruit — et le bruit use ce qui doit
   * être lu le jour où il compte.
   */
  it('sans hiérarchie : pas de rappel en tête', async () => {
    monter([col('a', 'Une', null, 1), col('b', 'Deux', null, 1)]);
    await screen.findByText('Une');
    expect(screen.queryByText(new RegExp(LIBELLES.collectionsArbre.pasDHeritage.slice(0, 30)))).toBeNull();
  });

  it('avec hiérarchie : le rappel est là', async () => {
    monter([col('a', 'Une', null, 1), col('b', 'Deux', 'a', 1)]);
    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(LIBELLES.collectionsArbre.pasDHeritage.slice(0, 30))),
      ).toBeTruthy(),
    );
  });
});
