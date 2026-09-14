/**
 * Le DÉTAIL d'un entrepôt moissonné — comptes rendus et notices signalées.
 *
 * ⚠ AUCUNE ROUTE NE RÉSOUT UNE COLLISION. L'API l'écrit dans son propre code :
 * « on SIGNALE, on ne tranche pas — c'est un humain qui décidera ». L'écran
 * MONTRE donc, et n'offre aucun geste d'arbitrage : un bouton qui ne peut pas
 * aboutir est pire que son absence.
 *
 * Ce qu'il offre à la place est le seul geste qui existe : ouvrir NOTRE notice,
 * pour que la personne décide en la regardant.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageDetail from '@/app/admin/moissonnage/[id]/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/moissonnage/s1',
  useParams: () => ({ id: 's1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const T = LIBELLES.moissonnage;
const D = LIBELLES.moissonnage.detail;
const OUTILS = ['document.lire', 'outils.catalogue'];

const run = (extra: Record<string, unknown> = {}) => ({
  id: 'r1',
  startedAt: '2026-09-13T02:00:00.000Z',
  finishedAt: '2026-09-13T02:01:00.000Z',
  outcome: 'moisson',
  reason: null,
  received: 120, created: 88, ignored: 30, collided: 2, deletions: 0,
  ...extra,
});

const collision = (extra: Record<string, unknown> = {}) => ({
  id: 'h1',
  oaiIdentifier: 'oai:depot.exemple.bf:1234',
  datestamp: '2026-09-01',
  recordId: 'r-42',
  status: 'collision',
  lastSeenAt: '2026-09-13T02:00:30.000Z',
  ...extra,
});

let appels: string[] = [];

function brancher(
  runs: unknown[] | 'panne',
  cols: unknown[] = [collision()],
  fonctions: string[] = OUTILS,
) {
  appels = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      appels.push(`${init?.method ?? 'GET'} ${url}`);
      const ok = (c: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(c) } as Response);
      const ko = () =>
        Promise.resolve({
          ok: false, status: 500, statusText: 'Erreur',
          json: () => Promise.resolve({ message: 'Erreur' }),
        } as Response);
      if (url.includes('/auth/me/functions')) return ok({ functions: fonctions });
      if (runs === 'panne') return ko();
      if (url.includes('/executions'))
        return ok({ total: runs.length, page: 1, totalPages: 1, runs });
      if (url.includes('/collisions'))
        return ok({ total: cols.length, page: 1, totalPages: 1, collisions: cols });
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Détail · les comptes rendus gardent la distinction', () => {
  it('⚠ une exécution INJOIGNABLE ne montre aucun chiffre', async () => {
    // Même règle que sur la liste : sous une source injoignable, « 0 reçue »
    // serait exact et la lecture fausse. La règle doit tenir aux DEUX endroits,
    // sinon elle ne tient nulle part.
    brancher([run({ outcome: 'injoignable', reason: 'délai dépassé', received: 0, created: 0, ignored: 0 })]);
    render(<PageDetail />);
    expect(await screen.findByText(T.issues.injoignable)).toBeTruthy();
    expect(screen.queryByText(T.bilan(0, 0, 0))).toBeNull();
    expect(screen.getByText(T.motif('délai dépassé'))).toBeTruthy();
  });

  it('une récolte réelle montre son bilan', async () => {
    brancher([run()]);
    render(<PageDetail />);
    expect(await screen.findByText(T.bilan(120, 88, 30))).toBeTruthy();
  });
});

describe('Détail · les notices signalées', () => {
  it('⚠ l’intro dit que RIEN n’a été écrasé', async () => {
    // Une liste de « collisions » sans cette phrase se lit comme une perte. Ce
    // n'est pas un défaut : c'est le fonctionnement même du moissonnage.
    brancher([run()]);
    render(<PageDetail />);
    expect(await screen.findByText(D.collisionsIntro)).toBeTruthy();
  });

  it('⚠ elle dit aussi que la DÉCISION revient à la personne', () => {
    expect(LIBELLES.moissonnage.detail.collisionsIntro).toMatch(/rien n’a été écrasé/i);
    expect(LIBELLES.moissonnage.detail.collisionsIntro).toMatch(/c’est à vous de décider/i);
  });

  it('le seul geste offert mène à NOTRE notice', async () => {
    brancher([run()], [collision()]);
    render(<PageDetail />);
    const lien = (await screen.findByText(D.ouvrirLaNotice)) as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/admin/catalogue/r-42');
  });

  it('⚠ sans notice locale, on le DIT au lieu d’un lien mort', async () => {
    // Une notice ignorée faute de titre, puis redonnée, devient une collision
    // sans `recordId`. Un lien construit dessus mènerait à `/admin/catalogue/`.
    brancher([run()], [collision({ recordId: null })]);
    render(<PageDetail />);
    expect(await screen.findByText(D.sansNoticeLocale)).toBeTruthy();
    expect(screen.queryByText(D.ouvrirLaNotice)).toBeNull();
  });

  it('⚠ AUCUN geste d’arbitrage n’est offert — aucune route ne l’accepte', async () => {
    // L'API signale, elle ne tranche pas. Un bouton « accepter la version
    // distante » n'aurait rien à appeler.
    brancher([run()], [collision()]);
    render(<PageDetail />);
    await screen.findByText(D.ouvrirLaNotice);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Détail · rien n’est affirmé avant la réponse', () => {
  it('⚠ une PANNE ne s’écrit pas « aucune notice signalée »', async () => {
    // Ce serait dire que rien n'attend d'arbitrage — le contraire exact du
    // service que cet écran rend.
    brancher('panne');
    render(<PageDetail />);
    expect(await screen.findByText(D.echec)).toBeTruthy();
    expect(screen.queryByText(D.aucuneCollision)).toBeNull();
    expect(screen.queryByText(D.aucunCompteRendu)).toBeNull();
  });

  it('les deux listes vides se disent, une fois qu’on le sait', async () => {
    brancher([], []);
    render(<PageDetail />);
    expect(await screen.findByText(D.aucunCompteRendu)).toBeTruthy();
    expect(screen.getByText(D.aucuneCollision)).toBeTruthy();
  });
});

describe('Détail · le droit', () => {
  it('⚠ sans la fonction, aucune route n’est appelée', async () => {
    brancher([run()], [collision()], ['document.lire']);
    render(<PageDetail />);
    expect(await screen.findByText(LIBELLES.refusDeDroit.moissonnage)).toBeTruthy();
    expect(appels.some((a) => a.includes('/moissonnage/'))).toBe(false);
  });
});
