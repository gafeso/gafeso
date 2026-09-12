/**
 * Éteindre le module `amendes` retire des BLOCS — P4-4, moitié front.
 *
 * ⚠ CE MODULE N'A PAS D'ENTRÉE DE MENU. Les trois lots précédents filtraient la
 * navigation ; celui-ci ne le peut pas : les amendes s'affichent DANS le guichet
 * et DANS la fiche d'adhérent, deux écrans du noyau qui restent. Ce qui doit
 * disparaître n'est donc pas une porte mais une section.
 *
 * ⚠ ET LA DETTE NE DISPARAÎT PAS AVEC ELLE. Le backend l'a mesuré : 61 prêts,
 * 21 900 FCFA identiques avant et après extinction — le tarif applicable tombe à
 * zéro, aucun montant passé ne bouge. Un écran qui effacerait le montant dû en
 * même temps que la section annoncerait une remise de dette que personne n'a
 * décidée, et cette information n'est lisible nulle part ailleurs.
 *
 * D'où la coupure que tiennent ces tests :
 *   — ce qui PART : le détail « en cours sur les retards », le calcul, la
 *     section entière quand rien n'est dû ;
 *   — ce qui RESTE : le montant dû, plus la phrase qui dit pourquoi il est figé.
 *
 * ⚠ Le quatrième bloc (« le reçu de retour ») ne parle pas du module, et c'est
 * voulu. Il portait un faux qui n'attendait pas P4 pour être faux : brancher sur
 * le MONTANT faisait écrire « Rendu dans les délais » à un retour de onze jours
 * dès que le tarif valait zéro — module éteint, ou simple catégorie sans amende.
 * Le retard appartient à la circulation, qui est du noyau.
 *
 * ⚠ BORNE ASSUMÉE, ET CE N'EST PAS UNE DETTE. Le reçu de retour n'a pas été
 * recetté à l'écran : un vrai retour ferme un prêt et ne se restaure pas — le
 * prêt redevient neuf, le retard est perdu, et aucune école de démonstration ne
 * vaut qu'on sacrifie une donnée pour une capture. Les quatre tests ci-dessous
 * le tiennent, dont l'invariant sur TOUS les couples (retard, montant) et la
 * teinte du cas dégradé. Décidé le 11 septembre 2026 : on n'y revient pas.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GuichetPage from '@/app/guichet/page';
import FicheAdherent from '@/app/admin/adherents/[id]/page';
import { invaliderModulesActifs } from '@/lib/modules-actifs';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/guichet',
  useParams: () => ({ id: 'p1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const FONCTIONS = ['document.lire', 'circulation.faire', 'adherents.gerer', 'lecteurs.voir'];

/** 21 900 FCFA constatés — le chiffre que le backend dit inchangé après extinction. */
const DUES = 21_900;

interface Reglages {
  /** `null` = /modules ne répond jamais : l'état du module reste INCONNU. */
  amendes: boolean | null;
  constatees?: number;
  courantes?: number;
  retour?: { overdueDays: number; amountXof: number };
  /** Prêts en cours : `[en retard ?, amende courue]`. */
  prets?: [boolean, number][];
}

function situation(r: Reglages) {
  const recordedXof = r.constatees ?? 0;
  const accruingXof = r.courantes ?? 0;
  return {
    patron: {
      id: 'p1', barcode: 'P-2026-0001', category: 'etudiant', expiryDate: null,
      user: { firstName: 'Awa', lastName: 'Traoré' },
    },
    checkouts: (r.prets ?? []).map(([overdue, accruedFineXof], i) => ({
      checkoutId: `c${i}`,
      title: 'Droit constitutionnel burkinabè',
      itemBarcode: `BIB-00012${i}`,
      dueDate: '2026-08-20T00:00:00.000Z',
      renewals: 0,
      overdue,
      accruedFineXof,
    })),
    holds: [],
    fines: { recordedXof, accruingXof, totalXof: recordedXof + accruingXof },
  };
}

/**
 * Doublure à clés EXPLICITES et disjointes — pas de tri par longueur.
 *
 * ⚠ Une doublure qui répond à la place d'une autre fait échouer le test pour une
 * raison qui n'est jamais celle que le message affiche. Ici chaque branche teste
 * un fragment qu'aucune autre route ne contient, et une URL non nommée LÈVE : un
 * appel oublié doit se voir, pas recevoir un tableau vide.
 */
function brancher(r: Reglages) {
  ouvrirSession();
  invaliderModulesActifs(); // sinon une requête en vol d'un test précédent est réutilisée
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      const ok = (corps: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(corps) } as Response);
      if (url.includes('/auth/me/functions')) return ok({ functions: FONCTIONS });
      if (url.includes('/modules')) {
        if (r.amendes === null) return new Promise<Response>(() => {});
        return ok([
          { id: 'circulation', actif: true },
          { id: 'amendes', actif: r.amendes },
        ]);
      }
      if (url.includes('/circulation/return')) return ok({
        returned: true,
        fine: r.retour ?? { overdueDays: 0, amountXof: 0 },
        holdReady: null,
      });
      if (url.includes('/circulation/patrons/')) return ok(situation(r));
      if (url.includes('/patrons/p1/loans')) return ok({
        current: [],
        history: { entries: [], total: 0, page: 1, pageSize: 10 },
      });
      if (url.includes('/patrons/p1')) return ok({
        id: 'p1', firstName: 'Awa', lastName: 'Traoré', barcode: 'P-2026-0001',
        category: 'etudiant', userId: null, registrationDate: '2026-09-01T00:00:00.000Z',
        expiryDate: null, user: null,
      });
      if (url.includes('/patrons?q=')) return ok({ patrons: [{ id: 'p1', barcode: 'P-2026-0001' }] });
      throw new Error(`Requête non prévue par la doublure : ${init?.method ?? 'GET'} ${url}`);
    }),
  );
}

/** Ouvre l'onglet « Adhérent » du guichet et affiche la situation de P-2026-0001. */
async function ouvrirSituation() {
  render(<GuichetPage />);
  // ⚠ Par le NOM accessible, jamais par la position : à 375 px le premier bouton
  // de la page est « Se déconnecter », et un clic à l'aveugle a déjà fermé une
  // session de travail.
  fireEvent.click(await screen.findByRole('tab', { name: 'Adhérent' }));
  fireEvent.change(await screen.findByPlaceholderText('P-2026-0001'), {
    target: { value: 'P-2026-0001' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Consulter' }));
  await screen.findByText(/P-2026-0001/);
}

/**
 * Rend le reçu d'un retour et renvoie son texte ET sa couleur.
 *
 * ⚠ La couleur fait partie de la propriété, pas du décor. Un contrôle négatif l'a
 * montré : rebrancher la TEINTE sur le montant ne faisait tomber aucun test, alors
 * qu'un retard de onze jours se peignait alors en vert — la phrase disait le
 * retard, la couleur disait le contraire, et c'est la couleur qu'on lit d'abord.
 */
async function rendreUnExemplaire(r: Reglages): Promise<{ texte: string; classe: string }> {
  brancher(r);
  render(<GuichetPage />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Retour' }));
  fireEvent.change(await screen.findByPlaceholderText('BIB-000123'), {
    target: { value: 'BIB-000123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le retour' }));
  const recu = await screen.findByText('Retour enregistré.');
  const bloc = recu.parentElement;
  return { texte: bloc?.textContent ?? '', classe: bloc?.className ?? '' };
}

beforeEach(() => invaliderModulesActifs());
afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Ce que la phrase d’extinction DOIT dire', () => {
  /**
   * ⚠ SA PROPRIÉTÉ, PAS SA VALEUR. Les tests ci-dessous comparent au LIBELLÉ :
   * ils suivraient sa dégradation sans broncher. Or ce texte porte la seule
   * information qui empêche de lire un montant figé comme un calcul en panne —
   * les amendes dues sont CONSERVÉES, elles cessent seulement de s'accumuler.
   */
  it('elle dit la conservation ET l’arrêt de l’accumulation', () => {
    expect(LIBELLES.amendes.conservees).toMatch(/conservé/i);
    expect(LIBELLES.amendes.conservees).toMatch(/cessent|s’accumuler/i);
  });

  /**
   * ⚠ « CONSTATÉES (CUMUL) », ET PLUS « DUES » — 12 septembre 2026.
   *
   * `Checkout.fineAmount` n'est jamais réduit : aucune route ne consigne un
   * encaissement. « Dues » affirmait un SOLDE, c'est-à-dire une somme qui
   * décroît quand on paie. Une bibliothécaire qui encaisse 2 950 FCFA revoyait
   * le même montant le lendemain et en concluait que son encaissement s'était
   * perdu — ou le réclamait deux fois.
   *
   * On teste la PROPRIÉTÉ du texte, pas sa valeur : comparer au libellé le
   * suivrait dans sa dégradation sans broncher.
   */
  it('⚠ le vocabulaire des amendes ne promet plus un SOLDE', () => {
    expect(LIBELLES.amendes.constatees('1 000 FCFA')).toMatch(/constatée/i);
    expect(LIBELLES.amendes.constatees('1 000 FCFA')).toMatch(/cumul/i);
    // Le mot qui ment, et il ne doit revenir nulle part dans ce vocabulaire.
    for (const texte of [
      LIBELLES.amendes.constatees('1 000 FCFA'),
      LIBELLES.amendes.constatees('1 000 FCFA'),
      LIBELLES.amendes.conservees,
      LIBELLES.amendes.detailConstateEtCourant('1 000 FCFA', '0 FCFA'),
    ]) {
      expect(texte).not.toMatch(/\bdues?\b/i);
    }
  });

  it('⚠ l’écran DIT que les encaissements ne sont pas enregistrés', () => {
    // « Constatées (cumul) » est exact et opaque. Sans cette phrase, le mot
    // seul n'apprend rien à qui vient d'encaisser — et un montant figé se lit
    // comme un calcul en panne, ce que ce fichier documente déjà ailleurs.
    expect(LIBELLES.amendes.aucunEncaissementEnregistre).toMatch(/encaissement/i);
    expect(LIBELLES.amendes.aucunEncaissementEnregistre).toMatch(/ne diminue pas|pas encore/i);
  });
});

describe('Guichet · situation d’un adhérent', () => {
  it('module ACTIF : le total et le détail s’affichent comme avant', async () => {
    brancher({ amendes: true, constatees: DUES, courantes: 500 });
    await ouvrirSituation();
    expect(
      await screen.findByText(LIBELLES.amendes.constatees('21 900 FCFA')),
    ).toBeTruthy();
    expect(screen.getByText(/en cours\s+sur les retards/)).toBeTruthy();
  });

  it('module ÉTEINT : la dette reste, le calcul en cours disparaît', async () => {
    brancher({ amendes: false, constatees: DUES, courantes: 0 });
    await ouvrirSituation();
    // Ce qui RESTE : le montant dû, nommé « dues » et non « Amendes ».
    expect(
      await screen.findByText(LIBELLES.amendes.constatees('21 900 FCFA')),
    ).toBeTruthy();
    expect(screen.getByText(LIBELLES.amendes.conservees)).toBeTruthy();
    // Ce qui PART : le détail, dont le « en cours : 0 FCFA » se lirait comme une panne.
    expect(screen.queryByText(/en cours\s+sur les retards/)).toBeNull();
  });

  it('module ÉTEINT et rien dû : plus rien, pas même « Aucune amende »', async () => {
    brancher({ amendes: false, constatees: 0, courantes: 0 });
    await ouvrirSituation();
    // ⚠ Un « Aucune amende » vert laisserait croire qu'un calcul a tourné.
    expect(screen.queryByText('Aucune amende')).toBeNull();
    expect(screen.queryByText(LIBELLES.amendes.constatees('21 900 FCFA'))).toBeNull();
    expect(screen.queryByText(LIBELLES.amendes.conservees)).toBeNull();
  });

  it('état du module INCONNU : l’affichage d’avant, rien n’est affirmé', async () => {
    brancher({ amendes: null, constatees: DUES, courantes: 500 });
    await ouvrirSituation();
    expect(
      await screen.findByText(LIBELLES.amendes.constatees('21 900 FCFA')),
    ).toBeTruthy();
    expect(screen.queryByText(LIBELLES.amendes.conservees)).toBeNull();
  });
});

describe('Guichet · prêts en cours', () => {
  /**
   * ⚠ TROUVÉ À L'ÉCRAN, pas ici. Aucun test du lot ne montait cette liste : les
   * onze premiers tenaient la section Amendes, et la ligne fautive était deux
   * cartes plus bas. C'est exactement la classe de défauts que le harnais ne
   * peut pas atteindre — d'où ce test, écrit APRÈS la recette.
   */
  it('amende nulle : le retard est dit, le zéro ne s’écrit pas', async () => {
    brancher({ amendes: false, constatees: DUES, prets: [[true, 0]] });
    await ouvrirSituation();
    const badge = await screen.findByText(/En retard/);
    expect(badge.textContent).toBe('En retard');
  });

  it('amende non nulle : le montant accompagne le retard', async () => {
    brancher({ amendes: true, constatees: DUES, courantes: 1150, prets: [[true, 1150]] });
    await ouvrirSituation();
    const badge = await screen.findByText(/En retard/);
    // ⚠ `Intl` sépare les milliers par une ESPACE FINE INSÉCABLE (U+202F) : la
    // comparaison brute échouait sur un caractère invisible, pas sur le contenu.
    expect(badge.textContent?.replace(/[\u202f\u00a0]/g, ' ')).toBe('En retard · 1 150 FCFA');
  });
});

describe('Guichet · reçu de retour', () => {
  it('rendu à l’heure : « dans les délais »', async () => {
    const { texte, classe } = await rendreUnExemplaire({
      amendes: true, retour: { overdueDays: 0, amountXof: 0 },
    });
    expect(texte).toContain('Rendu dans les délais');
    expect(classe).toContain('green');
  });

  it('retard avec amende : le retard ET le montant', async () => {
    const { texte, classe } = await rendreUnExemplaire({
      amendes: true, retour: { overdueDays: 3, amountXof: 300 },
    });
    expect(texte).toContain('Retard de 3 jours');
    expect(texte).toContain('300 FCFA');
    expect(classe).toContain('amber');
  });

  it('retard SANS amende : le retard est dit quand même', async () => {
    const { texte, classe } = await rendreUnExemplaire({
      amendes: false, retour: { overdueDays: 11, amountXof: 0 },
    });
    expect(texte).toContain('Retard de 11 jours');
    expect(texte).not.toContain('dans les délais');
    // ⚠ Le cas DÉGRADÉ, celui qu'on regarde le moins : onze jours de retard ne se
    // peignent pas en vert parce que le tarif vaut zéro.
    expect(classe).not.toContain('green');
  });

  /**
   * ⚠ L'INVARIANT, pas les trois cas ci-dessus.
   *
   * Ceux-là couvrent ce à quoi on a pensé ; celui-ci couvre le quatrième couple
   * qu'écrira quelqu'un qui n'aura jamais entendu parler de ce défaut. La règle
   * tient en une phrase : un retard ne se déduit JAMAIS d'un montant.
   */
  it('invariant : jamais « dans les délais » quand le retard est non nul', async () => {
    for (const [jours, montant] of [[1, 0], [1, 100], [11, 0], [40, 4000]] as const) {
      const { texte, classe } = await rendreUnExemplaire({
        amendes: montant > 0,
        retour: { overdueDays: jours, amountXof: montant },
      });
      expect(texte).not.toContain('dans les délais');
      expect(classe).not.toContain('green');
      expect(texte).toContain(`Retard de ${jours} jour`);
      // ⚠ Le nettoyage automatique n'a lieu qu'entre les `it` : sans celui-ci le
      // deuxième tour trouve DEUX guichets montés et échoue sur l'ambiguïté, pas
      // sur la propriété qu'on éprouve.
      cleanup();
      fermerSession();
    }
  });
});

describe('Fiche d’adhérent · section Amendes', () => {
  it('module ÉTEINT : la dette reste, « courant sur les retards » part', async () => {
    brancher({ amendes: false, constatees: DUES, courantes: 0 });
    render(<FicheAdherent />);
    await screen.findByText(LIBELLES.amendes.conservees);
    expect(screen.getByRole('heading', { name: 'Amendes' })).toBeTruthy();
    expect(screen.queryByText(/courant sur les retards/)).toBeNull();
  });

  it('module ÉTEINT et rien dû : la section entière disparaît', async () => {
    brancher({ amendes: false, constatees: 0, courantes: 0 });
    render(<FicheAdherent />);
    await screen.findByText(/P-2026-0001/);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Amendes' })).toBeNull());
  });

  it('module ACTIF : la section est celle d’avant', async () => {
    brancher({ amendes: true, constatees: DUES, courantes: 500 });
    render(<FicheAdherent />);
    expect(await screen.findByRole('heading', { name: 'Amendes' })).toBeTruthy();
    expect(screen.getByText(/courant sur les retards/)).toBeTruthy();
  });
});
