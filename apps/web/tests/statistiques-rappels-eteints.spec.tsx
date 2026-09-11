/**
 * Éteindre `rappels` retire le bloc « Rappels envoyés » — P4-4, second besoin.
 *
 * ⚠ TROISIÈME OMISSION DE LA MÊME FAMILLE, et c'est le garde-fou de l'API qui
 * l'a trouvée, pas une lecture : une page qui parle d'un module sans que ce
 * module la déclare est un oubli. Le registre la déclare désormais
 * (`admin/statistiques` → « le bloc “Rappels envoyés” des statistiques »).
 *
 * Le partage est celui des amendes, et pour la même raison : ce qui part est la
 * FONCTION (compter des envois qui n'ont plus lieu), ce qui reste est
 * l'HISTOIRE (les rappels déjà partis sont des faits, et l'API les conserve —
 * aucun `@ModuleRequis('rappels')` sur `/stats`, vérifié).
 *
 * ⚠ Et le cas qui décide de la forme : module éteint, période sans rappel.
 * « Aucun rappel sur la période » dit alors que le système a compté et n'a rien
 * trouvé, quand il ne compte plus. C'est une non-réponse écrite comme un fait —
 * le bloc ne s'affiche pas du tout.
 *
 * Monté DANS la coque, par son adresse : c'est le harnais de `aide-ecran.tsx`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession } from './aide-session';
import { monterEcran } from './aide-ecran';

vi.mock('next/navigation', async () => (await import('./aide-navigation')).navigationDeTest());

const ADMIN = ['document.lire', 'statistiques.voir', 'circulation.faire', 'circulation.retards'];

function tableauDeBord(rappels: { type: string; status: string; count: number }[]) {
  return {
    period: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-11T00:00:00.000Z', granularity: 'day' },
    kpis: { records: 352, items: 364, activeAccounts: 60, openLoans: 45, overdues: 16, pendingHolds: 0, digital: 12 },
    activity: {
      loans: { current: 45, previous: 40, variationPct: 12.5 },
      returns: { current: 55, previous: 50, variationPct: 10 },
    },
    timeseries: [{ date: '2026-09-10', loans: 3, returns: 2 }],
    rankings: {
      mostBorrowed: [], neverBorrowed: { count: 0, sample: [] },
      topCategories: [], topClasses: [], topAuthors: [],
    },
    fundByCategory: [],
    system: { reminders: rappels, holds: { fulfilled: 4, expired: 1 } },
  };
}

const ENVOYES = [{ type: 'OVERDUE', status: 'SENT', count: 7 }];

function monter(rappelsActif: boolean | null, rappels = ENVOYES) {
  return monterEcran('/admin/statistiques', {
    fonctions: ADMIN,
    modules: rappelsActif === null ? null : rappelsActif ? ['rappels'] : ['amendes'],
    reponses: { '/stats/dashboard': tableauDeBord(rappels) },
  });
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Statistiques · bloc « Rappels envoyés »', () => {
  it('module ACTIF : le bloc et son export, comme avant', async () => {
    monter(true);
    expect(await screen.findByText('Rappels envoyés')).toBeTruthy();
    expect(screen.getByText('Relance de retard')).toBeTruthy();
    expect(screen.queryByText(LIBELLES.statistiques.rappelsEteints)).toBeNull();
  });

  it('module ÉTEINT avec de l’histoire : le décompte reste, et il est daté', async () => {
    monter(false);
    expect(await screen.findByText(LIBELLES.statistiques.rappelsEteints)).toBeTruthy();
    // L'histoire est un fait : elle ne disparaît pas avec la fonction.
    expect(screen.getByText('Relance de retard')).toBeTruthy();
  });

  it('module ÉTEINT sans histoire : le bloc entier disparaît', async () => {
    monter(false, []);
    // La carte reste — les réservations sont du noyau.
    expect(await screen.findByText('Réservations')).toBeTruthy();
    expect(screen.queryByText('Rappels envoyés')).toBeNull();
    // ⚠ Le vrai défaut : cette phrase affirmait un comptage qui n'a plus lieu.
    expect(screen.queryByText('Aucun rappel sur la période.')).toBeNull();
  });

  it('module ACTIF sans rappel : « Aucun rappel » est alors une vraie réponse', async () => {
    monter(true, []);
    expect(await screen.findByText('Aucun rappel sur la période.')).toBeTruthy();
  });

  it('état du module INCONNU : l’affichage d’avant, rien n’est affirmé', async () => {
    monter(null);
    expect(await screen.findByText('Rappels envoyés')).toBeTruthy();
    expect(screen.queryByText(LIBELLES.statistiques.rappelsEteints)).toBeNull();
  });

  it('module ÉTEINT sans histoire : l’export des rappels disparaît avec le bloc', async () => {
    monter(false, []);
    await screen.findByText('Réservations');
    const exports = screen.queryAllByRole('link', { name: /CSV/i })
      .filter((a) => (a.getAttribute('href') ?? '').includes('reminders'));
    expect(exports).toHaveLength(0);
  });

  it('module ÉTEINT avec de l’histoire : l’export reste, il porte cette histoire', async () => {
    monter(false);
    await screen.findByText(LIBELLES.statistiques.rappelsEteints);
    await waitFor(() => {
      const exports = screen.queryAllByRole('link', { name: /CSV/i })
        .filter((a) => (a.getAttribute('href') ?? '').includes('reminders'));
      expect(exports.length).toBeGreaterThan(0);
    });
  });
});
