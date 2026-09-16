/**
 * ⚠ ANNULER UN SCAN POINTÉ PAR ERREUR — la porte qui manquait.
 *
 * *Relevée par le backend, posée le 16 septembre 2026.* La route existait,
 * gardée et testée ; aucun écran n'y menait.
 *
 * ⚠ CE QUE SON ABSENCE COÛTAIT, et c'est l'API qui l'écrit : « une erreur de
 * scan DÉFAIT SILENCIEUSEMENT le récolement — l'exemplaire est marqué vu pour
 * toujours, "marquer les manquants" ne le signale pas, et un exemplaire
 * réellement absent reste disponible au catalogue ».
 *
 * C'est le critère qui l'a fait passer devant les deux autres portes
 * manquantes : **les deux autres échouent bruyamment, celle-ci ment.**
 *
 * ⚠ ET LA FORME VIENT D'UNE MESURE, pas d'un goût : le rapport ne rend PAS la
 * liste des « vus », seulement leur COMPTE. Un exemplaire pointé par erreur
 * n'est donc visible NULLE PART dans l'écran. On annule par CODE-BARRES — on
 * ne peut pas cliquer une ligne qui n'existe pas.
 *
 * > ⭐ **Quand un écran ne peut pas MONTRER ce qu'on veut corriger, le geste de
 * > correction doit se passer de la liste.**
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecolementSessionPage from '@/app/admin/recolement/[id]/page';
import { LIBELLES } from '@/lib/libelles';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 's1' }),
  usePathname: () => '/admin/recolement/s1',
  useRouter: () => routeur,
}));
const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton', getUser: () => ({ id: 'u1' }) }));

const T = LIBELLES.recolement;

const SESSION = {
  id: 's1',
  name: 'Salle de lecture — septembre',
  scope: 'LOCATION',
  location: 'Salle de lecture',
  status: 'OPEN',
  progress: { expected: 120, scanned: 2, totalScans: 2 },
};
const RAPPORT = {
  counts: { seen: 2, missing: 1, onLoan: 0, unexpected: 0, expected: 120 },
  seen: [],
  missing: [{ id: 'i9', barcode: 'BIB-000999', title: 'Manquant', callNumber: null, location: null, status: 'AVAILABLE' }],
  onLoan: [],
  unexpected: [],
};

/** Les appels partis, pour pouvoir affirmer ce que la requête EMPORTE. */
let appels: { url: string; method: string }[] = [];
/** Ce que la suppression répondra — succès, ou refus de l'API. */
let refusSuppression: { statut: number; message: string } | null = null;

function brancher() {
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      const method = init?.method ?? 'GET';
      appels.push({ url, method });
      const ok = (corps: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as Response);

      if (method === 'DELETE' && url.includes('/scans/')) {
        if (refusSuppression) {
          return Promise.resolve({
            ok: false,
            status: refusSuppression.statut,
            json: () => Promise.resolve({ message: refusSuppression!.message }),
          } as Response);
        }
        return ok({ annule: true });
      }
      if (url.includes('/report')) return ok(RAPPORT);
      if (url.includes('/scan')) {
        return ok({ result: 'SEEN', barcode: 'BIB-000123', item: { id: 'i1', barcode: 'BIB-000123', title: 'Un ouvrage', callNumber: null, location: null, status: 'AVAILABLE' } });
      }
      if (url.includes('/sessions/s1')) return ok(SESSION);
      // ⚠ JAMAIS de repli silencieux : un oubli de doublure doit se voir.
      return Promise.reject(new Error(`requête non couverte — ${method} ${url}`));
    }),
  );
}

const repos = () => new Promise((r) => setTimeout(r, 40));

beforeEach(() => {
  refusSuppression = null;
  brancher();
});
afterEach(() => vi.unstubAllGlobals());

async function monter() {
  render(<RecolementSessionPage />);
  await waitFor(() => expect(screen.getByText(SESSION.name)).toBeTruthy());
}

/** Scanne un code, pour avoir une ligne de journal sur laquelle agir. */
async function scanner() {
  fireEvent.change(screen.getByLabelText('Code-barres à scanner'), {
    target: { value: 'BIB-000123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  await waitFor(() => expect(screen.getByText('BIB-000123')).toBeTruthy());
}

describe('la porte existe, et elle mène à la bonne route', () => {
  it('⚠ le champ d’annulation est là, avec ce qu’annuler CHANGE', async () => {
    await monter();
    expect(screen.getByLabelText(T.codeBarresAAnnuler)).toBeTruthy();
    expect(screen.getByText(T.aQuoiCaSert)).toBeTruthy();
  });

  it('⚠ elle appelle DELETE sur le code-barres, et rien d’autre', async () => {
    // Un harnais qui n'instrumente que les RÉPONSES est aveugle à la requête :
    // ici on affirme ce que l'appel EMPORTE.
    await monter();
    fireEvent.change(screen.getByLabelText(T.codeBarresAAnnuler), {
      target: { value: 'BIB-000123' },
    });
    fireEvent.click(screen.getByRole('button', { name: T.annulerScan }));
    await waitFor(() => {
      const envoi = appels.find((a) => a.method === 'DELETE');
      expect(envoi, 'aucun DELETE n’est parti').toBeTruthy();
      expect(envoi!.url).toContain('/inventory/sessions/s1/scans/BIB-000123');
    });
  });

  it('⚠ un code-barres à caractères spéciaux est ENCODÉ dans l’adresse', async () => {
    // Sans encodage, un code portant « / » couperait la route en deux et
    // l'API répondrait 404 sur une adresse qui n'est pas celle qu'on visait.
    await monter();
    fireEvent.change(screen.getByLabelText(T.codeBarresAAnnuler), {
      target: { value: 'A/B 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: T.annulerScan }));
    await waitFor(() => {
      const envoi = appels.find((a) => a.method === 'DELETE');
      expect(envoi!.url).toContain('/scans/A%2FB%201');
    });
  });

  it('le champ vide ne déclenche rien — pas de bouton sans effet', async () => {
    await monter();
    const bouton = screen.getByRole('button', { name: T.annulerScan });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('après l’annulation', () => {
  it('⚠ la ligne du journal RESTE, marquée annulée', async () => {
    // La retirer donnerait un journal qui ment sur ce qui s'est passé : on
    // veut voir ce qu'on vient de défaire.
    await monter();
    await scanner();
    fireEvent.click(screen.getByRole('button', { name: T.annulerLeScanDe('BIB-000123') }));
    await waitFor(() => expect(screen.getByText(T.ligneAnnulee)).toBeTruthy());
    expect(screen.getByText('BIB-000123')).toBeTruthy();
  });

  it('⚠ le RAPPORT est rechargé — annuler change le compte des vus', async () => {
    // Sans ce rechargement, l'écran afficherait l'ancien compte : le geste
    // aurait eu lieu et l'écran dirait le contraire.
    await monter();
    await scanner();
    const avant = appels.filter((a) => a.url.includes('/report')).length;
    fireEvent.click(screen.getByRole('button', { name: T.annulerLeScanDe('BIB-000123') }));
    await waitFor(() =>
      expect(appels.filter((a) => a.url.includes('/report')).length).toBeGreaterThan(avant),
    );
  });

  it('l’écran dit ce qui a été annulé, en nommant le code', async () => {
    await monter();
    await scanner();
    fireEvent.click(screen.getByRole('button', { name: T.annulerLeScanDe('BIB-000123') }));
    await waitFor(() => expect(screen.getByText(T.annule('BIB-000123'))).toBeTruthy());
  });
});

describe('⚠ les refus viennent de l’API, on n’en invente aucun', () => {
  it('session close : c’est le message du serveur qui s’affiche', async () => {
    // L'API a deux refus précis — session close, ou aucun scan à ce code.
    // En écrire un troisième ici, c'est inventer une raison qu'on ne connaît pas.
    refusSuppression = { statut: 409, message: 'Session close : un scan ne s’annule que pendant le récolement.' };
    await monter();
    await scanner();
    fireEvent.click(screen.getByRole('button', { name: T.annulerLeScanDe('BIB-000123') }));
    await waitFor(() =>
      expect(screen.getByText(/Session close : un scan ne s’annule/)).toBeTruthy(),
    );
  });

  it('rien à annuler : idem, et la ligne n’est PAS marquée annulée', async () => {
    // Le témoin inversé : un refus ne doit pas laisser croire que c'est fait.
    refusSuppression = { statut: 404, message: 'Aucun scan « BIB-000123 » dans cette session : rien à annuler.' };
    await monter();
    await scanner();
    fireEvent.click(screen.getByRole('button', { name: T.annulerLeScanDe('BIB-000123') }));
    await waitFor(() => expect(screen.getByText(/rien à annuler/)).toBeTruthy());
    expect(screen.queryByText(T.ligneAnnulee)).toBeNull();
  });
});

describe('⚠ ce que le texte DOIT dire', () => {
  it('l’explication dit ce qu’annuler CHANGE, pas ce que le bouton fait', () => {
    // « Annuler un scan » seul se lit comme une commodité d'affichage. Ce qui
    // compte est que le compte du récolement bouge — et qu'un exemplaire
    // laissé « vu » ne sera signalé par rien.
    expect(T.aQuoiCaSert).toMatch(/vu|récolement/i);
    expect(T.aQuoiCaSert, 'doit dire que le rapport ne le signale pas').toMatch(
      /ne le signale pas|jusqu’à la clôture/i,
    );
  });
});
