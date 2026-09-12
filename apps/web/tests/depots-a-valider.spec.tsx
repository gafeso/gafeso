/**
 * « Dépôts à valider » — l'écran du DIRECTEUR. 12 septembre 2026.
 *
 * ⚠ COMMENT CE MANQUE A ÉTÉ TROUVÉ, et c'est le point. Trois routes servaient
 * déjà le directeur — `GET /depots/a-valider`, `POST /depots/:id/valider`,
 * `POST /depots/:id/refuser` — et aucun écran ne les ouvrait. Le matin, la
 * recette avait fait tomber le mur « aucun directeur désignable » ; l'écran du
 * déposant marchait, le circuit restait infranchissable UN CRAN PLUS LOIN.
 *
 * ⚠ AUCUN GARDE NE POUVAIT LE DIRE. `couverture-des-roles` ne lit que
 * `ROLES_SYSTEME` ; `depot.valider` n'est portée que par un rôle DYNAMIQUE,
 * donc hors de sa portée par construction. C'est la recette sur session réelle
 * qui l'a vu — la troisième fois qu'elle trouve ce qu'aucun test n'atteint.
 *
 * Les propriétés tenues ici :
 *   1. on LIT avant de décider — l'API elle-même dit que sans sa route de
 *      lecture, « le circuit demandait de valider un contenu illisible » ;
 *   2. un refus SANS motif est impossible, et la règle se lit à l'écran plutôt
 *      que de se découvrir par un refus de l'API ;
 *   3. rien n'est affirmé avant la réponse, et une PANNE ne s'écrit pas
 *      « aucun dépôt n'attend votre décision » ;
 *   4. les textes disent ce que les gestes font — et ne font pas.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageDepotsAValider from '@/app/depots-a-valider/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/depots-a-valider',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const T = LIBELLES.depotsAValider;
const ENSEIGNANT = ['document.lire', 'depot.valider', 'encadrements.voir'];

const depot = (extra: Record<string, unknown> = {}) => ({
  id: 'd1',
  status: 'soumis',
  title: 'Le régime foncier coutumier en zone périurbaine',
  authorName: 'Traoré, Awa',
  documentType: 'these',
  year: 2026,
  fileName: 'recette.pdf',
  submittedAt: '2026-09-12T10:00:00.000Z',
  ...extra,
});

let appels: string[] = [];
let corps: Record<string, unknown>[] = [];

function brancher(
  liste: unknown[] | 'jamais' | 'panne',
  fonctions: string[] = ENSEIGNANT,
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
      if (url.includes('/document')) return ok({ url: 'https://exemple.test/signee' });
      if (url.includes('/valider') || url.includes('/refuser')) return ok({});
      if (url.includes('/depots/a-valider')) {
        if (liste === 'jamais') return new Promise<Response>(() => {});
        if (liste === 'panne')
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Erreur',
            json: () => Promise.resolve({ message: 'Erreur' }),
          } as Response);
        return ok(liste);
      }
      // ⚠ Un repli silencieux transforme un oubli de doublure en défaut
      // apparent du produit.
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Dépôts à valider · rien n’est affirmé avant la réponse', () => {
  it('⚠ en vol : ni liste, ni « aucun dépôt »', async () => {
    brancher('jamais');
    render(<PageDepotsAValider />);
    expect(await screen.findByText(T.chargement)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
  });

  it('⚠ une PANNE ne s’écrit pas « aucun dépôt n’attend votre décision »', async () => {
    // Sinon le directeur s'en va, et le dépôt attend indéfiniment.
    brancher('panne');
    render(<PageDepotsAValider />);
    expect(await screen.findByText(T.echec)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
  });

  it('liste vide : le dire, une fois qu’on le sait', async () => {
    brancher([]);
    render(<PageDepotsAValider />);
    expect(await screen.findByText(T.aucun)).toBeTruthy();
  });
});

describe('Dépôts à valider · lire avant de décider', () => {
  it('le document s’ouvre par une URL signée demandée à l’API', async () => {
    brancher([depot()]);
    render(<PageDepotsAValider />);
    const ouvrir = vi.fn();
    vi.stubGlobal('open', ouvrir);
    fireEvent.click(await screen.findByRole('button', { name: T.lire }));
    await waitFor(() => expect(appels).toContain('GET /api/depots/d1/document'));
    expect(ouvrir).toHaveBeenCalledWith('https://exemple.test/signee', '_blank', 'noopener,noreferrer');
  });

  it('⚠ sans document, on le DIT plutôt que d’offrir un bouton inerte', async () => {
    brancher([depot({ fileName: null })]);
    render(<PageDepotsAValider />);
    expect(await screen.findByText(T.sansDocument)).toBeTruthy();
    expect(screen.queryByRole('button', { name: T.lire })).toBeNull();
  });
});

describe('Dépôts à valider · la décision', () => {
  it('valider appelle la route EXPLICITE, puis relit', async () => {
    brancher([depot()]);
    render(<PageDepotsAValider />);
    fireEvent.click(await screen.findByRole('button', { name: T.valider }));
    await waitFor(() => expect(appels).toContain('POST /api/depots/d1/valider'));
    await waitFor(() =>
      expect(appels.filter((a) => a === 'GET /api/depots/a-valider').length).toBeGreaterThan(1),
    );
  });

  it('⚠ un refus SANS motif est impossible, et la règle se lit à l’écran', async () => {
    // Une règle conditionnelle qui se découvre par un refus de l'API envoie
    // quelqu'un chercher ce qu'il a mal fait alors qu'elle n'était écrite
    // nulle part.
    brancher([depot()]);
    render(<PageDepotsAValider />);
    fireEvent.click(await screen.findByRole('button', { name: T.refuser }));
    expect(await screen.findByText(T.motifObligatoire)).toBeTruthy();
    expect(screen.getByRole('button', { name: T.refuserConfirmer })).toHaveProperty(
      'disabled',
      true,
    );
    expect(appels.some((a) => a.includes('/refuser'))).toBe(false);
  });

  it('le motif part dans le corps de la requête', async () => {
    brancher([depot()]);
    render(<PageDepotsAValider />);
    fireEvent.click(await screen.findByRole('button', { name: T.refuser }));
    const zone = await screen.findByRole('textbox');
    fireEvent.change(zone, { target: { value: 'Le chapitre 3 n’est pas celui de la soutenance.' } });
    fireEvent.click(screen.getByRole('button', { name: T.refuserConfirmer }));
    await waitFor(() => expect(appels).toContain('POST /api/depots/d1/refuser'));
    expect(corps).toContainEqual({ motif: 'Le chapitre 3 n’est pas celui de la soutenance.' });
  });
});

describe('Dépôts à valider · ce que les textes DOIVENT dire', () => {
  it('⚠ la validation dit que la notice reste À CRÉER', () => {
    // Sa propriété, pas sa valeur. « Dépôt validé. » serait exact et ferait
    // croire le document mis au catalogue — l'API ne crée aucune notice ici.
    expect(LIBELLES.depotsAValider.validerSuite).toMatch(/notice/i);
    expect(LIBELLES.depotsAValider.validerSuite).toMatch(/reste à créer|pas fait automatiquement/i);
  });

  it('⚠ le refus dit que RIEN n’est supprimé, et que le motif sera LU', () => {
    // « Refus envoyé. » laisserait croire qu'on vient de faire disparaître un
    // travail, ou que le motif reste entre le directeur et la bibliothèque.
    expect(LIBELLES.depotsAValider.refuseSuite).toMatch(/conservés?/i);
    expect(LIBELLES.depotsAValider.refuseSuite).toMatch(/étudiant/i);
    expect(LIBELLES.depotsAValider.refuseSuite).toMatch(/motif/i);
  });

  it('⚠ l’aide du motif prévient qu’il sera lu, AVANT qu’on l’écrive', () => {
    // C'est la seule occasion : une fois envoyé, il est à l'écran de quelqu'un
    // d'autre et rien ne permet de le reprendre.
    expect(LIBELLES.depotsAValider.motifAide).toMatch(/lu par l’étudiant|étudiant/i);
    expect(LIBELLES.depotsAValider.motifAide).toMatch(/corriger/i);
  });
});

describe('Dépôts à valider · le droit', () => {
  it('sans la fonction, l’écran refuse et NOMME la fonction', async () => {
    brancher([depot()], ['document.lire']);
    render(<PageDepotsAValider />);
    expect(await screen.findByText(LIBELLES.refusDeDroit.depotsAValider)).toBeTruthy();
  });

  it('⚠ sans la fonction, la route n’est même pas appelée', async () => {
    brancher([depot()], ['document.lire']);
    render(<PageDepotsAValider />);
    await screen.findByText(LIBELLES.refusDeDroit.depotsAValider);
    expect(appels.some((a) => a.includes('/depots/a-valider'))).toBe(false);
  });
});
