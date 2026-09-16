/**
 * ⚠ RÉGLER LES RAPPELS N'EST PAS LES LIRE.
 *
 * Le 15 septembre 2026, `circulation.retards` a été SCINDÉE — sur ma
 * proposition, après que j'aie refusé de l'accorder telle quelle au
 * Bibliothécaire. Elle gardait ensemble le RAPPORT des retards et
 * `POST /reminders/run`, qui envoie des courriels à tous les adhérents en
 * retard. Une action sortante de masse ne se donne pas avec le droit de
 * consulter une liste.
 *
 * Depuis la scission :
 *   · `circulation.retards` — lire le journal et le rapport ;
 *   · `rappels.envoyer` — changer les modèles, la bascule, déclencher l'envoi.
 *
 * Le Bibliothécaire a reçu la PREMIÈRE au déploiement du 15 septembre.
 *
 * ⚠ ET LE FRONT N'AVAIT PAS SUIVI. `/admin/rappels` affichait le formulaire de
 * réglages sous la seule condition `circulation.retards` : le Bibliothécaire
 * voyait un formulaire dont l'enregistrement répond **403**. Un contrôle
 * inerte, sur l'écran d'un métier qui est le sien — le pire endroit pour en
 * poser un.
 *
 * ⚠ C'est « une moitié livrée n'est pas une correction », appliqué à une
 * SCISSION DE DROIT : le backend a séparé les deux gestes, et notre écran les
 * offrait encore ensemble.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PageRappels from '@/app/admin/rappels/page';
import { fermerSession, ouvrirSession } from './aide-session';

const ROUTEUR = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/rappels',
  useRouter: () => ROUTEUR,
  useSearchParams: () => new URLSearchParams(),
}));

/** Les fonctions réellement portées par le rôle, à l'appel de /auth/me/functions. */
function brancher(fonctions: string[]) {
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const u = String(url);
      const ok = (c: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(c) } as Response);
      if (u.includes('/auth/me/functions')) return ok({ functions: fonctions });
      if (u.includes('/reminders/log')) return ok({ entries: [], total: 0, page: 1, totalPages: 1 });
      if (u.includes('/reminders/settings')) {
        // ⚠ LA FORME COMPLÈTE QUE LE COMPOSANT ATTEND. Une première doublure
        // rendait `{ enabled, beforeDueDays, templates: {} }` — assez pour un
        // coup d'œil, pas pour le composant, qui reste sur « Chargement… »
        // faute de `defaults`. Le test échouait alors en accusant l'écran.
        const modele = { subject: 'Objet', body: 'Corps' };
        return ok({
          enabled: true,
          daysBefore: 2,
          overdueRepeatDays: 7,
          templates: { dueSoon: modele, overdue: modele },
          defaults: { dueSoon: modele, overdue: modele },
          variables: [],
          smtpConfigured: true,
        });
      }
      if (u.includes('/modules')) return ok([{ id: 'rappels', actif: true }]);
      return ok({});
    }),
  );
}

const BIBLIOTHECAIRE = ['document.lire', 'circulation.faire', 'circulation.retards'];
const ADMINISTRATEUR = [...BIBLIOTHECAIRE, 'rappels.envoyer'];

beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))));
afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('⚠ le formulaire de réglages suit `rappels.envoyer`, pas `circulation.retards`', () => {
  it('le Bibliothécaire LIT le journal', async () => {
    // Témoin de présence : sans lui, « le formulaire est absent » ne
    // distinguerait pas un écran bien filtré d'un écran qui refuse tout.
    brancher(BIBLIOTHECAIRE);
    render(<PageRappels />);
    await waitFor(() =>
      expect(screen.queryByText(/réservé au personnel|pas accès/i)).toBeNull(),
    );
  });

  it('⚠ mais il ne voit PAS le formulaire de réglages', async () => {
    // ⚠ PREMIÈRE ÉCRITURE INUTILE, et le contrôle négatif l'a dit : elle
    // attendait `document.body.textContent`, qui est vrai immédiatement.
    // L'assertion d'absence s'exécutait AVANT que le composant de réglages ait
    // eu le temps de se rendre — elle passait donc dans les deux cas, défaut
    // rétabli compris. Un test qui ne peut pas échouer.
    //
    // On attend désormais un ANCRE STABLE que le bibliothécaire voit VRAIMENT,
    // puis on affirme l'absence. C'est « le signal d'attente ne doit pas être
    // la grandeur mesurée », appliqué à une absence.
    brancher(BIBLIOTHECAIRE);
    render(<PageRappels />);
    // L'ancre : les filtres du journal, que le bibliothécaire voit bien.
    await waitFor(() => expect(document.querySelectorAll('select').length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.queryByRole('button', { name: /enregistrer/i })).toBeNull();
  });

  it('l’Administrateur, lui, le voit', async () => {
    // ⚠ TÉMOIN D'ABSENCE INVERSÉ : sans ce cas, masquer le formulaire pour TOUT
    // LE MONDE passerait le test ci-dessus — et personne ne pourrait plus
    // régler les rappels.
    brancher(ADMINISTRATEUR);
    render(<PageRappels />);
    expect(await screen.findByRole('button', { name: /enregistrer/i })).toBeTruthy();
  });
});
