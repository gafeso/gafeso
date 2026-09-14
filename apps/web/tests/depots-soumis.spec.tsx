/**
 * « Dépôts en attente » — la vue du personnel sur ce qui n'a pas été décidé.
 *
 * ⚠ CE QU'ELLE REND VISIBLE. Un dépôt soumis ne sort de cet état que par son
 * directeur DÉSIGNÉ. Si celui-ci ne peut plus agir, le dépôt attend
 * indéfiniment — et personne ne le voyait : `a-valider` est auto-portée au
 * directeur, `a-cataloguer` ne rend que les validés, `mes-depots` est celle du
 * déposant.
 *
 * ⚠ ELLE N'OFFRE AUCUN GESTE DE DÉCISION, et c'est une propriété de l'API, pas
 * un oubli : valider et refuser restent au directeur désigné. Un bouton qui
 * refuserait serait pire que son absence.
 *
 * Les propriétés tenues ici :
 *   1. rien n'est affirmé avant la réponse — et une PANNE ne s'écrit pas
 *      « aucun dépôt n'attend », ce qui serait le contraire du service rendu ;
 *   2. l'ANCIENNETÉ est dite, et jamais devinée : `null` n'est pas zéro ;
 *   3. le NOM du directeur, pas son identifiant — et « aucun désigné » quand il
 *      n'y en a pas, qui est le cas le plus bloqué de tous ;
 *   4. aucun geste de décision n'est offert.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageDepotsSoumis from '@/app/admin/depots-soumis/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/depots-soumis',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const T = LIBELLES.depotsSoumis;
const BIB = ['document.lire', 'catalogue.gerer'];

const depot = (extra: Record<string, unknown> = {}) => ({
  id: 'd1',
  title: 'Contentieux foncier et médiation coutumière',
  authorName: 'Traoré, Awa',
  documentType: 'these',
  submittedAt: '2026-06-10T00:00:00.000Z',
  directorId: 'u-zongo',
  directeur: 'Pauline Zongo',
  joursDepuisSoumission: 94,
  ...extra,
});

let appels: string[] = [];

const DIRECTEURS = [
  { id: 'u-zongo', nom: 'Pauline Zongo' },
  { id: 'u-sanogo', nom: 'Alain Sanogo' },
];

/**
 * ⚠ LA FORME A CHANGÉ LE 13 SEPTEMBRE, ET MA DOUBLURE A CACHÉ LA RUPTURE.
 *
 * `GET /depots/soumis` rendait un TABLEAU ; il rend `{ depots, directeurs }`.
 * L'écran appelait `.map` sur un objet — et la suite est restée VERTE, parce
 * que la doublure encodait l'ancienne forme, c'est-à-dire mon hypothèse.
 *
 * C'est la lecture de l'API qui l'a dit. Une doublure ne dément jamais un
 * contrat qu'on a mal lu : elle répond ce qu'on lui a appris à répondre.
 */
function brancher(
  liste: unknown[] | 'jamais' | 'panne',
  fonctions: string[] = BIB,
  directeurs: unknown[] = DIRECTEURS,
  reattribution: { ancienDirecteur: { nom: string } | null; notification?: { sent: boolean } } = {
    ancienDirecteur: { nom: 'Pauline Zongo' },
  },
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
      if (url.includes('/auth/me/functions')) return ok({ functions: fonctions });
      if (url.includes('/reattribuer')) return ok(reattribution);
      if (url.includes('/depots/soumis')) {
        if (liste === 'jamais') return new Promise<Response>(() => {});
        if (liste === 'panne')
          return Promise.resolve({
            ok: false, status: 500, statusText: 'Erreur',
            json: () => Promise.resolve({ message: 'Erreur' }),
          } as Response);
        return ok({ depots: liste, directeurs });
      }
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Dépôts en attente · rien n’est affirmé avant la réponse', () => {
  it('⚠ en vol : ni liste, ni « aucun dépôt »', async () => {
    brancher('jamais');
    render(<PageDepotsSoumis />);
    expect(await screen.findByText(T.chargement)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
  });

  it('⚠ une PANNE ne s’écrit pas « aucun dépôt n’attend »', async () => {
    // Ce serait le contraire exact du service que cet écran rend : il existe
    // pour montrer ce qui est bloqué.
    brancher('panne');
    render(<PageDepotsSoumis />);
    expect(await screen.findByText(LIBELLES.aCataloguer.echec)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
  });

  it('liste vide : le dire, une fois qu’on le sait', async () => {
    brancher([]);
    render(<PageDepotsSoumis />);
    expect(await screen.findByText(T.aucun)).toBeTruthy();
  });
});

describe('Dépôts en attente · l’ancienneté', () => {
  it('se lit en jours, pas en date', async () => {
    brancher([depot()]);
    render(<PageDepotsSoumis />);
    expect(await screen.findByText(T.depuis(94))).toBeTruthy();
  });

  it('⚠ sans date connue, on ne DEVINE pas zéro', async () => {
    // L'API rend `null` quand la date manque, et le défend : zéro voudrait dire
    // « aujourd'hui », ce qui est exactement faux pour un dépôt dont on ignore
    // l'âge — au moment précis où l'âge est ce qu'on vient chercher.
    brancher([depot({ joursDepuisSoumission: null, submittedAt: null })]);
    render(<PageDepotsSoumis />);
    expect(await screen.findByText(T.ancienneteInconnue)).toBeTruthy();
    expect(screen.queryByText(T.depuis(0))).toBeNull();
  });

  it('le singulier et le pluriel sont distingués', () => {
    expect(T.depuis(0)).toMatch(/aujourd’hui/i);
    expect(T.depuis(1)).toMatch(/1 jour\b/);
    expect(T.depuis(2)).toMatch(/2 jours/);
  });
});

describe('Dépôts en attente · le directeur', () => {
  it('est nommé, pas identifié', async () => {
    brancher([depot()]);
    render(<PageDepotsSoumis />);
    expect(await screen.findByText(T.directeur('Pauline Zongo'))).toBeTruthy();
    expect(screen.queryByText(/u-zongo/)).toBeNull();
  });

  it('⚠ son ABSENCE est dite — c’est le cas le plus bloqué de tous', async () => {
    // Un dépôt soumis sans directeur n'a aucune sortie : ni valider, ni
    // refuser, et la désignation est réservée au brouillon. Une ligne vide le
    // rendrait invisible dans la liste qui existe pour le montrer.
    brancher([depot({ directorId: null, directeur: null })]);
    render(<PageDepotsSoumis />);
    expect(await screen.findByText(T.sansDirecteur)).toBeTruthy();
  });
});

describe('Dépôts en attente · la réattribution', () => {
  /**
   * ⚠ LA SECONDE PORTE HORS DE « SOUMIS ». C'est le seul état dont la sortie
   * dépend de quelqu'un d'autre : valider et refuser sont réservés au directeur
   * DÉSIGNÉ, et le directeur ne se change plus hors brouillon. Un directeur qui
   * perd la fonction bloquait le dépôt définitivement.
   *
   * ⚠ Et la liste des directeurs vient de `GET /depots/soumis` elle-même : le
   * menu dédié exige `depot.deposer`, que le bibliothécaire n'a pas. Aucune
   * fonction n'a été élargie — la lecture voyage avec ce qu'elle sert.
   */
  it('le menu propose les directeurs rendus par la route', async () => {
    brancher([depot()]);
    render(<PageDepotsSoumis />);
    fireEvent.click(await screen.findByRole('button', { name: T.reattribuer }));
    const menu = await screen.findByRole('combobox');
    expect([...menu.querySelectorAll('option')].map((o) => o.textContent)).toContain('Alain Sanogo');
  });

  it('⚠ il ne propose PAS le directeur qui l’a déjà', async () => {
    // L'API refuse ce cas. Un menu qui mène à un refus fait chercher ce qu'on a
    // mal fait, alors que la règle n'était écrite nulle part.
    brancher([depot()]);
    render(<PageDepotsSoumis />);
    fireEvent.click(await screen.findByRole('button', { name: T.reattribuer }));
    const menu = await screen.findByRole('combobox');
    expect([...menu.querySelectorAll('option')].map((o) => o.textContent)).not.toContain(
      'Pauline Zongo',
    );
  });

  it('confier appelle la route, envoie le directeur, puis RELIT', async () => {
    brancher([depot()]);
    render(<PageDepotsSoumis />);
    fireEvent.click(await screen.findByRole('button', { name: T.reattribuer }));
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'u-sanogo' } });
    await waitFor(() => expect(appels).toContain('POST /api/depots/d1/reattribuer'));
    await waitFor(() =>
      expect(appels.filter((a) => a === 'GET /api/depots/soumis').length).toBeGreaterThan(1),
    );
  });

  it('⚠ l’avis NOMME l’ancien et le nouveau', async () => {
    // « Réattribué » sans dire de qui à qui ne raconte rien — et l'ancien vient
    // de l'API, parce que l'écran ne l'a plus une fois la liste relue.
    brancher([depot()]);
    render(<PageDepotsSoumis />);
    fireEvent.click(await screen.findByRole('button', { name: T.reattribuer }));
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'u-sanogo' } });
    expect(await screen.findByText(T.reattribue('Pauline Zongo', 'Alain Sanogo'))).toBeTruthy();
  });

  it('⚠ le nouveau directeur NON prévenu : on le dit, sans effacer le geste', async () => {
    brancher([depot()], BIB, DIRECTEURS, {
      ancienDirecteur: { nom: 'Pauline Zongo' },
      notification: { sent: false },
    });
    render(<PageDepotsSoumis />);
    fireEvent.click(await screen.findByRole('button', { name: T.reattribuer }));
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'u-sanogo' } });
    expect(await screen.findByText(T.reattribueNonPrevenu)).toBeTruthy();
  });

  it('⚠ AUCUN directeur disponible : on le DIT, et on nomme ce qui manque', async () => {
    // Un menu vide se lirait comme une panne. Ici le geste est impossible, et
    // la phrase dit quoi faire pour qu'il devienne possible.
    brancher([depot()], BIB, []);
    render(<PageDepotsSoumis />);
    expect(await screen.findByText(T.aucunDirecteurDisponible)).toBeTruthy();
    expect(screen.queryByRole('button', { name: T.reattribuer })).toBeNull();
  });

  it('⚠ la phrase nomme la FONCTION et l’écran où la créer', () => {
    expect(LIBELLES.depotsSoumis.aucunDirecteurDisponible).toMatch(/depot\.valider/);
    expect(LIBELLES.depotsSoumis.aucunDirecteurDisponible).toMatch(/Rôles/i);
  });
});

describe('Dépôts en attente · ce que l’écran n’offre PAS', () => {
  it('⚠ aucun geste de DÉCISION — valider et refuser restent au directeur', async () => {
    // ⚠ CE TEST A ÉTÉ PRÉCISÉ LE 13 SEPTEMBRE. Il affirmait « aucun bouton »,
    // ce qui MESURAIT la propriété par une approximation : tant qu'aucun geste
    // n'existait, l'absence de bouton en tenait lieu.
    //
    // La réattribution a livré un bouton LÉGITIME, et l'approximation est
    // tombée — à juste titre. La propriété n'a jamais été « pas de bouton »,
    // elle est « pas de DÉCISION » : valider et refuser appartiennent au
    // directeur désigné, et un bouton qui refuserait ferait recommencer.
    brancher([depot()]);
    render(<PageDepotsSoumis />);
    await screen.findByText(T.depuis(94));
    const noms = [...document.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(noms.filter((n) => /valider|refuser/i.test(n))).toEqual([]);
  });
});

describe('Dépôts en attente · le droit', () => {
  it('sans la fonction, l’écran refuse et NOMME la fonction', async () => {
    brancher([depot()], ['document.lire']);
    render(<PageDepotsSoumis />);
    expect(await screen.findByText(LIBELLES.refusDeDroit.depotsSoumis)).toBeTruthy();
  });

  it('⚠ sans la fonction, la route n’est même pas appelée', async () => {
    brancher([depot()], ['document.lire']);
    render(<PageDepotsSoumis />);
    await screen.findByText(LIBELLES.refusDeDroit.depotsSoumis);
    expect(appels.some((a) => a.includes('/depots/soumis'))).toBe(false);
  });
});
