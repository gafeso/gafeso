/**
 * « Dépôts à cataloguer » — l'écran du BIBLIOTHÉCAIRE, dernier maillon du
 * circuit de dépôt. 12 septembre 2026.
 *
 * ⚠ SANS LUI, UN DÉPÔT VALIDÉ N'ENTRE JAMAIS AU CATALOGUE. L'étudiant dépose,
 * le directeur valide — et le document reste dans une table que rien n'expose.
 * Le circuit s'arrêtait à un pas de son but, et c'est le troisième écran
 * manquant trouvé dans la même journée derrière des routes déjà servies.
 *
 * ⚠ LA NOTICE NE SE CRÉE PAS ICI, et c'est une décision de l'API :
 * `POST /cataloging/records` porte ses invariants — un auteur principal, trois
 * mots-clés — que le formulaire de dépôt ne fournit pas. Créer la notice depuis
 * le dépôt demanderait un troisième chemin d'écriture aux règles plus souples.
 *
 * D'où DEUX temps, et la propriété centrale de cet écran : il doit les rendre
 * lisibles. Sans la phrase, « Rattacher une notice » se lit comme « créer la
 * notice », et son absence d'effet se lit comme une panne.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageACataloguer from '@/app/admin/depots-a-cataloguer/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/depots-a-cataloguer',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const T = LIBELLES.aCataloguer;
const BIB = ['document.lire', 'catalogue.gerer'];

const depot = (extra: Record<string, unknown> = {}) => ({
  id: 'd1',
  title: 'Le régime foncier coutumier en zone périurbaine',
  authorName: 'Traoré, Awa',
  documentType: 'these',
  year: 2026,
  fileName: 'recette.pdf',
  decidedAt: '2026-09-12T10:00:00.000Z',
  ...extra,
});

const notice = { id: 'r-42', title: 'Le régime foncier coutumier', author: 'Traoré, Awa', publishYear: 2026 };

let appels: string[] = [];
let corps: Record<string, unknown>[] = [];

function brancher(
  liste: unknown[] | 'jamais' | 'panne',
  fonctions: string[] = BIB,
  resultats: unknown[] | 'jamais' = [notice],
) {
  appels = [];
  corps = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      appels.push(`${init?.method ?? 'GET'} ${url}`);
      if (typeof init?.body === 'string') corps.push(JSON.parse(init.body));
      const ok = (c: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(c) } as Response);
      if (url.includes('/auth/me/functions')) return ok({ functions: fonctions });
      if (url.includes('/cataloging/records')) {
        return resultats === 'jamais' ? new Promise<Response>(() => {}) : ok({ records: resultats });
      }
      if (url.includes('/document')) return ok({ url: 'https://exemple.test/signee' });
      if (url.includes('/notice')) return ok({});
      if (url.includes('/depots/a-cataloguer')) {
        if (liste === 'jamais') return new Promise<Response>(() => {});
        if (liste === 'panne')
          return Promise.resolve({
            ok: false, status: 500, statusText: 'Erreur',
            json: () => Promise.resolve({ message: 'Erreur' }),
          } as Response);
        return ok(liste);
      }
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('À cataloguer · rien n’est affirmé avant la réponse', () => {
  it('⚠ en vol : ni liste, ni « aucun dépôt »', async () => {
    brancher('jamais');
    render(<PageACataloguer />);
    expect(await screen.findByText(T.chargement)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
  });

  it('⚠ une PANNE ne s’écrit pas « aucun dépôt n’attend »', async () => {
    // Sinon le bibliothécaire s'en va, et les dépôts validés n'entrent jamais
    // au catalogue — le circuit s'arrête à un pas de son but, en silence.
    brancher('panne');
    render(<PageACataloguer />);
    expect(await screen.findByText(T.echec)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
  });

  it('liste vide : le dire, une fois qu’on le sait', async () => {
    brancher([]);
    render(<PageACataloguer />);
    expect(await screen.findByText(T.aucun)).toBeTruthy();
  });
});

describe('À cataloguer · les deux temps sont lisibles', () => {
  it('⚠ la marche à suivre est dite AVANT le geste', async () => {
    brancher([depot()]);
    render(<PageACataloguer />);
    expect(await screen.findByText(T.marcheASuivre)).toBeTruthy();
  });

  it('⚠ elle dit que la notice n’est PAS créée ici', () => {
    // Sa propriété, pas sa valeur. « Rattachez la notice » serait exact et
    // laisserait chercher un formulaire de saisie qui n'existe pas sur cet
    // écran — l'API garde ses invariants sur le chemin normal.
    expect(LIBELLES.aCataloguer.marcheASuivre).toMatch(/chemin habituel|puis revenez/i);
    expect(LIBELLES.aCataloguer.marcheASuivre).toMatch(/n’est pas créée depuis cet écran/i);
  });

  it('le chemin du catalogue est offert, pas seulement nommé', async () => {
    brancher([depot()]);
    render(<PageACataloguer />);
    const lien = (await screen.findByText(T.allerCataloguer)) as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/admin/catalogue');
  });
});

describe('À cataloguer · le rattachement', () => {
  const ouvrirLaRecherche = async () => {
    render(<PageACataloguer />);
    fireEvent.click(await screen.findByRole('button', { name: T.rattacher }));
  };

  it('⚠ « aucune notice » ne s’affirme pas avant d’avoir cherché', async () => {
    brancher([depot()], BIB, 'jamais');
    await ouvrirLaRecherche();
    const champ = await screen.findByRole('textbox');
    fireEvent.change(champ, { target: { value: 'foncier' } });
    fireEvent.click(screen.getByRole('button', { name: T.chercher }));
    expect(await screen.findByText(T.rechercheEnCours)).toBeTruthy();
    expect(screen.queryByText(T.aucunResultat)).toBeNull();
  });

  it('rattacher envoie le recordId, puis RELIT la liste', async () => {
    brancher([depot()]);
    await ouvrirLaRecherche();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'foncier' } });
    fireEvent.click(screen.getByRole('button', { name: T.chercher }));
    fireEvent.click(await screen.findByRole('button', { name: T.choisirCetteNotice }));
    await waitFor(() => expect(appels).toContain('POST /api/depots/d1/notice'));
    expect(corps).toContainEqual({ recordId: 'r-42' });
    // ⚠ Le dépôt doit avoir QUITTÉ la liste, et c'est la liste qui le prouve.
    await waitFor(() =>
      expect(appels.filter((a) => a === 'GET /api/depots/a-cataloguer').length).toBeGreaterThan(1),
    );
  });

  it('⚠ l’avis dit que le dépôt QUITTE la liste', () => {
    // « Notice rattachée. » serait exact et ne dirait pas que la carte va
    // disparaître — ce qui se lit sinon comme une perte.
    expect(LIBELLES.aCataloguer.rattachee('X')).toMatch(/quitte cette liste/i);
    expect(LIBELLES.aCataloguer.rattachee('X')).toMatch(/au catalogue/i);
  });
});

describe('À cataloguer · le droit', () => {
  it('sans la fonction, l’écran refuse et NOMME la fonction', async () => {
    brancher([depot()], ['document.lire']);
    render(<PageACataloguer />);
    expect(await screen.findByText(LIBELLES.refusDeDroit.aCataloguer)).toBeTruthy();
  });

  it('⚠ sans la fonction, la route n’est même pas appelée', async () => {
    brancher([depot()], ['document.lire']);
    render(<PageACataloguer />);
    await screen.findByText(LIBELLES.refusDeDroit.aCataloguer);
    expect(appels.some((a) => a.includes('/depots/a-cataloguer'))).toBe(false);
  });
});
