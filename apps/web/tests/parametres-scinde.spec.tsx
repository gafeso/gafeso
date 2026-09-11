/**
 * /admin/parametres est scindé — backlog n° 2.
 *
 * ⚠ LE SYMPTÔME ÉTAIT LE BESOIN DE DEUX DROITS. L'écran portait l'identité de
 * l'établissement ET les règles de prêt, et réclamait donc
 * `etablissement.apparence` OU `etablissement.regles` : il était le seul de la
 * table des permissions à en demander deux. Modifier un logo et fixer la durée
 * d'un prêt ne sont pas le même métier et ne devraient pas exiger le même droit.
 *
 * ⚠ ET IL EN MÊLAIT UN TROISIÈME, que la dette ne nommait pas : le paramétrage
 * des rappels de retard, dont l'API exige `circulation.retards`. Sur cet écran
 * il refusait pour la personne même qui pouvait le voir. Il a rejoint
 * /admin/rappels, où le droit et le métier concordent.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EtablissementPage from '@/app/admin/etablissement/page';
import ReglesDePretPage from '@/app/admin/regles-de-pret/page';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

function brancher(fonctions: string[]) {
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/auth/me/functions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ functions: fonctions }) } as Response);
      }
      if (url.includes('/tenancy/current')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            name: 'Université d’Exemple', slug: 'zinda',
            primaryColor: '#0F2B46', secondaryColor: '#D97B2B',
            require2fa: false, enrollmentUrl: null,
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe('⚠ chaque écran exige SA permission, et refuse l’autre', () => {
  it('l’identité s’ouvre avec etablissement.apparence', async () => {
    brancher(['etablissement.apparence']);
    render(<EtablissementPage />);
    expect(await screen.findByRole('heading', { name: 'Établissement' })).toBeInTheDocument();
  });

  it('l’identité REFUSE à qui n’a que les règles', async () => {
    // Le point du lot : avant, cette personne voyait l'écran ENTIER, couleurs
    // et sécurité comprises, parce qu'une seule des deux permissions suffisait.
    brancher(['etablissement.regles']);
    render(<EtablissementPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('etablissement.apparence');
  });

  it('les règles s’ouvrent avec etablissement.regles', async () => {
    brancher(['etablissement.regles']);
    render(<ReglesDePretPage />);
    expect(await screen.findByRole('heading', { name: 'Règles de prêt' })).toBeInTheDocument();
  });

  it('les règles REFUSENT à qui n’a que l’apparence', async () => {
    brancher(['etablissement.apparence']);
    render(<ReglesDePretPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('etablissement.regles');
  });
});

describe('ce que chaque écran porte, et ce qu’il ne porte plus', () => {
  it('l’identité ne porte AUCUN réglage de prêt ni de rappel', async () => {
    brancher(['etablissement.apparence']);
    render(<EtablissementPage />);
    await screen.findByRole('heading', { name: 'Établissement' });
    expect(screen.queryByText(/Règles de prêt/)).toBeNull();
    expect(screen.queryByText(/rappel/i)).toBeNull();
  });

  it('les règles ne portent ni couleurs ni sécurité', async () => {
    brancher(['etablissement.regles']);
    render(<ReglesDePretPage />);
    await screen.findByRole('heading', { name: 'Règles de prêt' });
    expect(screen.queryByText('Couleur principale')).toBeNull();
    expect(screen.queryByText('Sécurité')).toBeNull();
  });
});
