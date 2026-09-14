/**
 * « Moissonnage » — P7, versant front.
 *
 * ⚠ LA DISTINCTION QUI PORTE TOUT L'ÉCRAN : « injoignable » n'est PAS « vide ».
 * L'API l'écrit dans son propre schéma — « les confondre ferait lire ‘zéro
 * notice’ là où il faut lire ‘je n'ai pas pu savoir’ » — et c'est la famille que
 * ce dépôt connaît le mieux : une non-réponse écrite comme un fait.
 *
 * Le coût n'est pas théorique. Un entrepôt momentanément injoignable affiché
 * « 0 notice » pousse à supprimer la source, ou à conclure que le partenaire n'a
 * rien publié. Deux gestes qu'on ne reprend pas facilement.
 *
 * ⚠ ET LE MOISSONNAGE SIGNALE, IL NE TRANCHE PAS — décision 2 du brief. Les
 * collisions s'affichent comme en attente d'arbitrage, jamais comme un défaut :
 * rien n'a été écrasé.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageMoissonnage from '@/app/admin/moissonnage/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/moissonnage',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const T = LIBELLES.moissonnage;
const OUTILS = ['document.lire', 'outils.catalogue'];

const execution = (extra: Record<string, unknown> = {}) => ({
  id: 'r1',
  startedAt: '2026-09-13T02:00:00.000Z',
  finishedAt: '2026-09-13T02:01:00.000Z',
  outcome: 'moisson',
  reason: null,
  received: 120,
  created: 88,
  ignored: 30,
  collided: 2,
  deletions: 0,
  ...extra,
});

const source = (extra: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Dépôt institutionnel de l’Université d’Exemple',
  baseUrl: 'https://depot.exemple.bf/oai',
  metadataPrefix: 'oai_dc',
  setSpec: '',
  periodicity: 'manuelle',
  active: true,
  derniereExecution: execution(),
  ...extra,
});

let appels: string[] = [];
let corps: Record<string, unknown>[] = [];

function brancher(liste: unknown[] | 'jamais' | 'panne', fonctions: string[] = OUTILS) {
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
      if (url.includes('/executer')) return ok(execution());
      if (init?.method === 'DELETE') return ok({ noticesConservees: 412 });
      if (init?.method === 'PATCH') return ok(source());
      if (url.includes('/moissonnage/sources')) {
        if (init?.method === 'POST') return ok(source());
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

describe('Moissonnage · injoignable n’est PAS vide', () => {
  it('⚠ une source INJOIGNABLE ne montre AUCUN chiffre de récolte', async () => {
    // C'est la propriété centrale. « 0 reçue, 0 créée » serait exact — les
    // compteurs valent bien zéro — et la lecture serait fausse : on n'a pas
    // récolté zéro notice, on n'a rien pu lire.
    brancher([
      source({
        derniereExecution: execution({
          outcome: 'injoignable',
          reason: 'délai dépassé après 30 s',
          received: 0, created: 0, ignored: 0, collided: 0,
        }),
      }),
    ]);
    render(<PageMoissonnage />);
    expect(await screen.findByText(T.issues.injoignable)).toBeTruthy();
    expect(screen.queryByText(T.bilan(0, 0, 0))).toBeNull();
  });

  it('⚠ et elle DIT son motif — « injoignable » seul n’aide personne', async () => {
    brancher([
      source({
        derniereExecution: execution({ outcome: 'injoignable', reason: 'délai dépassé après 30 s' }),
      }),
    ]);
    render(<PageMoissonnage />);
    expect(await screen.findByText(T.motif('délai dépassé après 30 s'))).toBeTruthy();
  });

  it('une source VIDE le dit autrement, et montre son bilan', async () => {
    // Elle a RÉPONDU. Le zéro est alors une mesure, pas une absence de mesure.
    brancher([
      source({
        derniereExecution: execution({
          outcome: 'vide', reason: null, received: 0, created: 0, ignored: 0, collided: 0,
        }),
      }),
    ]);
    render(<PageMoissonnage />);
    expect(await screen.findByText(T.issues.vide)).toBeTruthy();
    expect(screen.getByText(T.bilan(0, 0, 0))).toBeTruthy();
  });

  it('⚠ les deux textes ne se ressemblent pas', () => {
    // Leur propriété, pas leur valeur : l'un doit parler de la SOURCE qui
    // répond, l'autre de ce qu'on n'a pas pu lire.
    expect(LIBELLES.moissonnage.issues.vide).toMatch(/a répondu/i);
    expect(LIBELLES.moissonnage.issues.injoignable).toMatch(/injoignable|n’a pu être lu/i);
    expect(LIBELLES.moissonnage.issues.injoignable).not.toMatch(/aucune notice/i);
  });
});

describe('Moissonnage · les collisions sont signalées, pas subies', () => {
  it('⚠ elles disent que RIEN n’a été écrasé', async () => {
    // Décision 2 du brief : le moissonnage signale, il ne tranche pas. Une
    // ligne « 2 collisions » sans cette phrase se lit comme une perte.
    brancher([source()]);
    render(<PageMoissonnage />);
    expect(await screen.findByText(new RegExp(T.collisions(2)))).toBeTruthy();
    expect(screen.getByText(new RegExp(T.collisionsAide))).toBeTruthy();
  });

  it('⚠ la phrase dit l’attente d’un arbitrage HUMAIN', () => {
    expect(LIBELLES.moissonnage.collisionsAide).toMatch(/rien n’a été écrasé/i);
    expect(LIBELLES.moissonnage.collisionsAide).toMatch(/arbitrage humain/i);
  });

  it('aucune collision : rien ne s’affiche', async () => {
    brancher([source({ derniereExecution: execution({ collided: 0 }) })]);
    render(<PageMoissonnage />);
    await screen.findByText(T.issues.moisson);
    expect(screen.queryByText(new RegExp(T.collisionsAide))).toBeNull();
  });

  it('les suppressions signalées disent qu’elles ne sont PAS appliquées', () => {
    expect(LIBELLES.moissonnage.suppressionsSignalees(3)).toMatch(/non appliquée/i);
  });
});

describe('Moissonnage · rien n’est affirmé avant la réponse', () => {
  it('⚠ en vol : ni liste, ni « aucun entrepôt »', async () => {
    // Un « aucun entrepôt déclaré » prématuré fait DÉCLARER un doublon, et la
    // contrainte d'unicité le refuserait — après coup.
    brancher('jamais');
    render(<PageMoissonnage />);
    expect(await screen.findByText(T.chargement)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
  });

  it('⚠ une PANNE ne s’écrit pas « aucun entrepôt »', async () => {
    brancher('panne');
    render(<PageMoissonnage />);
    expect(await screen.findByText(T.echec)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
  });

  it('jamais moissonnée : on le dit, on n’invente pas de bilan', async () => {
    brancher([source({ derniereExecution: null })]);
    render(<PageMoissonnage />);
    expect(await screen.findByText(T.jamaisMoissonnee)).toBeTruthy();
  });
});

describe('Moissonnage · déclarer un entrepôt', () => {
  it('⚠ la règle des adresses internes se LIT avant le refus', async () => {
    // Le serveur appellera cette adresse. Laisser l'API découvrir la règle
    // enverrait chercher ce qu'on a mal fait alors qu'elle n'était écrite nulle
    // part — et le refus de l'API arrive après la saisie complète.
    brancher([]);
    render(<PageMoissonnage />);
    fireEvent.click(await screen.findByRole('button', { name: T.declarer }));
    expect(await screen.findByText(T.champAdresseAide)).toBeTruthy();
  });

  it('⚠ l’aide nomme les adresses refusées', () => {
    expect(LIBELLES.moissonnage.champAdresseAide).toMatch(/localhost/i);
    expect(LIBELLES.moissonnage.champAdresseAide).toMatch(/publique/i);
  });

  it('la déclaration envoie les champs, puis RELIT', async () => {
    brancher([]);
    render(<PageMoissonnage />);
    fireEvent.click(await screen.findByRole('button', { name: T.declarer }));
    const champs = document.querySelectorAll('input');
    fireEvent.change(champs[0], { target: { value: 'Dépôt partenaire' } });
    fireEvent.change(champs[1], { target: { value: 'https://partenaire.bf/oai' } });
    fireEvent.click(screen.getByRole('button', { name: T.creer }));
    await waitFor(() => expect(appels).toContain('POST /api/moissonnage/sources'));
    expect(corps[0]).toMatchObject({ name: 'Dépôt partenaire', baseUrl: 'https://partenaire.bf/oai' });
    await waitFor(() =>
      expect(appels.filter((a) => a === 'GET /api/moissonnage/sources').length).toBeGreaterThan(1),
    );
  });
});

describe('Moissonnage · retirer un entrepôt', () => {
  /**
   * ⚠ LA CONFIRMATION DIT CE QUI PART **ET CE QUI RESTE**, et l'API l'exige
   * dans sa propre description : « supprimée » sans le dire laisserait croire
   * que les notices sont parties avec.
   *
   * Ce sont des notices du catalogue comme les autres. Personne ne retirerait
   * une source s'il croyait emporter des centaines de notices — et personne ne
   * le referait après l'avoir cru une fois.
   */
  it('⚠ la confirmation dit que les NOTICES restent', async () => {
    brancher([source()]);
    render(<PageMoissonnage />);
    fireEvent.click(await screen.findByRole('button', { name: T.retirer }));
    expect(await screen.findByText(T.retirerConfirmation(source().name))).toBeTruthy();
  });

  it('⚠ sa propriété : elle nomme ce qui part ET ce qui reste', () => {
    const texte = LIBELLES.moissonnage.retirerConfirmation('X');
    expect(texte).toMatch(/mémoire du moissonnage part|comptes rendus/i);
    expect(texte).toMatch(/restent au catalogue|notices comme les autres/i);
    expect(texte).toMatch(/ne s’annule pas/i);
  });

  it('⚠ rien n’est envoyé tant que la confirmation n’est pas donnée', async () => {
    brancher([source()]);
    render(<PageMoissonnage />);
    fireEvent.click(await screen.findByRole('button', { name: T.retirer }));
    await screen.findByText(T.retirerConfirmation(source().name));
    expect(appels.some((a) => a.startsWith('DELETE'))).toBe(false);
  });

  it('⚠ l’avis COMPTE les notices restées, et ce compte vient de l’API', async () => {
    // Un compte deviné serait pire que pas de compte : il porte la preuve de ce
    // que la confirmation promettait.
    brancher([source()]);
    render(<PageMoissonnage />);
    fireEvent.click(await screen.findByRole('button', { name: T.retirer }));
    fireEvent.click(screen.getByRole('button', { name: T.retirerConfirmer }));
    await waitFor(() => expect(appels).toContain('DELETE /api/moissonnage/sources/s1'));
    expect(await screen.findByText(T.retiree(source().name, 412))).toBeTruthy();
  });
});

describe('Moissonnage · modifier un entrepôt', () => {
  it('le formulaire s’ouvre pré-rempli, et enregistre par PATCH', async () => {
    brancher([source()]);
    render(<PageMoissonnage />);
    fireEvent.click(await screen.findByRole('button', { name: T.modifier }));
    expect(await screen.findByDisplayValue(source().baseUrl)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: T.enregistrer }));
    await waitFor(() => expect(appels).toContain('PATCH /api/moissonnage/sources/s1'));
  });

  it('⚠ la règle des adresses internes y est rappelée aussi', async () => {
    // Une règle qui ne tient qu'au formulaire de création ne tient pas : on
    // modifie une adresse aussi souvent qu'on en déclare une.
    brancher([source()]);
    render(<PageMoissonnage />);
    fireEvent.click(await screen.findByRole('button', { name: T.modifier }));
    expect(await screen.findByText(T.champAdresseAide)).toBeTruthy();
  });
});

describe('Moissonnage · le droit', () => {
  it('sans la fonction, l’écran refuse et NOMME la fonction', async () => {
    brancher([source()], ['document.lire']);
    render(<PageMoissonnage />);
    expect(await screen.findByText(LIBELLES.refusDeDroit.moissonnage)).toBeTruthy();
  });

  it('⚠ sans la fonction, la route n’est même pas appelée', async () => {
    brancher([source()], ['document.lire']);
    render(<PageMoissonnage />);
    await screen.findByText(LIBELLES.refusDeDroit.moissonnage);
    expect(appels.some((a) => a.includes('/moissonnage/sources'))).toBe(false);
  });
});
