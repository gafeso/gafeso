/**
 * L'écran des adhérents — backlog n° 8.
 *
 * ⚠ CE QUE CET ÉCRAN RÉPARE. `adherents.gerer` était une fonction que le rôle
 * Bibliothécaire DÉTENAIT et qui n'ouvrait aucun écran : cinq routes d'API
 * derrière elle — inscrire, lister, fiche, modifier, supprimer — et pas une
 * porte. Elle prêtait et rendait sans pouvoir inscrire un lecteur.
 *
 * Ce fichier tient les quatre propriétés qui ne se négocient pas, et la
 * cinquième qui est la plus dangereuse :
 *   1. rien ne s'affiche sans la fonction ;
 *   2. la liste est paginée et cherchable ;
 *   3. aucun vide n'est affirmé avant la réponse ;
 *   4. aucune invitation à agir n'est fondée sur un vide non vérifié ;
 *   5. la suppression refuse en NOMMANT ce qui l'empêche.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIBELLES } from '@/lib/libelles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ListeAdherents from '@/app/admin/adherents/page';
import FicheAdherent from '@/app/admin/adherents/[id]/page';
import { ongletsVisibles } from '@/lib/navigation';
import { fermerSession, ouvrirSession } from './aide-session';

const pousser = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/adherents',
  useParams: () => ({ id: 'p1' }),
  useRouter: () => ({ push: pousser, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const BIB = ['document.lire', 'catalogue.gerer', 'outils.catalogue', 'circulation.faire', 'adherents.gerer'];

let appels: string[] = [];
/** Corps des requêtes émises — c'est là que se voit ce qui part vraiment. */
let corps: Record<string, unknown>[] = [];

function adherent(n: number, avecCompte = true, nomPropre = true) {
  return {
    id: `p${n}`,
    // ⚠ Le nom appartient à la CARTE depuis A2, il n'est plus emprunté au compte.
    firstName: nomPropre ? 'Awa' : null,
    lastName: nomPropre ? 'Traoré' : null,
    barcode: `P-2026-${String(n).padStart(4, '0')}`,
    category: 'etudiant',
    userId: avecCompte ? `u${n}` : null,
    registrationDate: '2026-09-01T00:00:00.000Z',
    expiryDate: null,
    user: avecCompte ? { firstName: 'Awa', lastName: 'Traoré', email: 'a@b.bf' } : null,
  };
}

/**
 * @param reponses table chemin → corps. 'jamais' = promesse qui ne se résout
 *                 pas, l'état où un vide affirmé trop tôt devient visible.
 */
function brancher(fonctions: string[], reponses: Record<string, unknown | 'jamais'>) {
  appels = [];
  corps = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      appels.push(`${init?.method ?? 'GET'} ${url}`);
      if (typeof init?.body === 'string') corps.push(JSON.parse(init.body));
      if (url.includes('/auth/me/functions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ functions: fonctions }) } as Response);
      }
      // ⚠ CLÉS PRÉCISES, et la plus longue gagne. Trois routes se recouvrent —
      // `/patrons/p1`, `/patrons/p1/loans` et `/circulation/patrons/p1` — et
      // deux heuristiques successives se sont trompées avant celle-ci : trier
      // par longueur sur des clés vagues (`/patrons/`) faisait répondre la
      // fiche à la place de l'historique ; trier par position faisait répondre
      // la fiche à la place de la circulation, `/patrons/` apparaissant PLUS
      // TARD dans `/api/circulation/patrons/p1` que `/circulation/patrons/`.
      //
      // Le défaut n'était pas dans le tri, il était dans les CLÉS. Des clés
      // sans ambiguïté rendent la règle évidente — et une doublure qui répond à
      // la place d'une autre fait échouer le test pour une raison qui n'est
      // jamais celle que le message affiche.
      const cle = Object.keys(reponses)
        .filter((k) => url.includes(k))
        .sort((a, b) => b.length - a.length)[0];
      if (cle === undefined) {
        return Promise.resolve({
          ok: false, status: 404, statusText: 'Not Found',
          json: () => Promise.resolve({ message: 'Inconnu.' }),
        } as Response);
      }
      // ⚠ `reponse`, pas `corps` : un `const corps` ici mettait le tableau
      // `corps` du module en zone morte temporelle pour TOUT ce bloc, y compris
      // la ligne qui le remplit plus haut. Elle levait, l'erreur était avalée
      // par le `catch` de l'écran, et le test échouait en disant « undefined »
      // — jamais « votre doublure est cassée ».
      const reponse = reponses[cle];
      if (reponse === 'jamais') return new Promise(() => {});
      if (reponse && typeof reponse === 'object' && 'erreur' in (reponse as object)) {
        const e = reponse as { erreur: number; message: string };
        return Promise.resolve({
          ok: false, status: e.erreur, statusText: 'Conflict',
          json: () => Promise.resolve({ message: e.message }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(reponse) } as Response);
    }),
  );
}

/**
 * Réponse de `GET /patrons/:id/loans`. Déclarée EXPLICITEMENT dans chaque test
 * de fiche : sans elle, l'URL de l'historique retombait sur la doublure de la
 * fiche, l'écran lisait `history` sur un objet qui n'en a pas, et il ne rendait
 * plus rien. Une doublure muette sur une route réellement appelée fait échouer
 * le test pour une raison qui n'est pas celle qu'on croit.
 */
const prets = (historique: unknown[] = [], total = historique.length) => ({
  current: [],
  history: { entries: historique, total, page: 1, totalPages: Math.max(1, Math.ceil(total / 10)) },
  counters: { current: 0, overdue: 0 },
});

const pageDe = (n: number, total = n, page = 1, totalPages = 1) => ({
  total, page, totalPages,
  patrons: Array.from({ length: n }, (_, i) => adherent(i + 1)),
});

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
  pousser.mockClear();
});

describe('Ce que le refus de suppression DOIT dire', () => {
  /**
   * ⚠ SA PROPRIÉTÉ, PAS SA VALEUR. Un refus qui ne NOMME pas ce qui l'empêche
   * envoie chercher une panne au lieu d'une raison — c'est la cinquième
   * propriété de cet écran, celle qui ne se négocie pas. Un test qui compare au
   * libellé laisserait passer « Suppression impossible. » tout court.
   */
  it('il nomme l’historique, et dit qu’il est conservé', () => {
    expect(LIBELLES.adherents.supprimerRefusHistorique).toMatch(/historique/i);
    expect(LIBELLES.adherents.supprimerRefusHistorique).toMatch(/conservé/i);
  });
});

describe('1 · sans la fonction, ni l’entrée ni l’écran', () => {
  it('l’entrée de menu n’apparaît pas', () => {
    const sansElle = BIB.filter((f) => f !== 'adherents.gerer');
    const hrefs = ongletsVisibles(sansElle).flatMap((o) => o.entrees.map((e) => e.href));
    expect(hrefs).not.toContain('/admin/adherents');
    // Témoin : avec la fonction, elle apparaît — sinon on testerait le vide.
    expect(ongletsVisibles(BIB).flatMap((o) => o.entrees.map((e) => e.href))).toContain(
      '/admin/adherents',
    );
  });

  it('l’écran refuse, en nommant la fonction manquante', async () => {
    brancher(BIB.filter((f) => f !== 'adherents.gerer'), {});
    render(<ListeAdherents />);
    expect(await screen.findByRole('alert')).toHaveTextContent('adherents.gerer');
    // Et il n'a rien demandé à l'API des adhérents.
    expect(appels.some((a) => a.includes('/patrons'))).toBe(false);
  });
});

describe('⚠ 3 · aucun vide affirmé avant la réponse', () => {
  it('dit qu’il charge, pas « Aucun adhérent »', async () => {
    brancher(BIB, { '/patrons': 'jamais' });
    render(<ListeAdherents />);
    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    expect(screen.queryByText('Aucun adhérent.')).toBeNull();
  });

  it('un vrai vide se DIT vide, une fois la réponse arrivée', async () => {
    brancher(BIB, { '/patrons': pageDe(0) });
    render(<ListeAdherents />);
    expect(await screen.findByText('Aucun adhérent.')).toBeInTheDocument();
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  it('⚠ 4 · le bouton d’inscription ne dépend PAS du vide', async () => {
    // Une invitation à agir fondée sur un vide non vérifié est le défaut le
    // plus grave de sa famille : elle pousse à créer un doublon. Le bouton est
    // donc permanent — présent avant même la réponse.
    brancher(BIB, { '/patrons': 'jamais' });
    render(<ListeAdherents />);
    expect(await screen.findByRole('button', { name: 'Inscrire un adhérent' })).toBeInTheDocument();
    expect(screen.queryByText(/Aucun adhérent/)).toBeNull();
  });
});

describe('2 · la liste est paginée et cherchable', () => {
  it('compte, pagine, et demande la page suivante', async () => {
    brancher(BIB, { '/patrons': { ...pageDe(20, 45), totalPages: 3 } });
    render(<ListeAdherents />);

    expect(await screen.findByText('45 adhérents')).toBeInTheDocument();
    expect(screen.getByText('Page 1 sur 3')).toBeInTheDocument();
    // ⚠ Paginée dès le départ : le catalogue professionnel s'arrête à 100 sans
    // le dire (backlog n° 9), on ne rejoue pas ce défaut sur un écran neuf.
    expect(appels[appels.length - 1]).toContain('limit=20');

    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    await waitFor(() => expect(appels[appels.length - 1]).toContain('page=2'));
  });

  it('la recherche part en `q`, et s’efface', async () => {
    brancher(BIB, { '/patrons': pageDe(1, 1) });
    render(<ListeAdherents />);
    await screen.findByText('1 adhérent');

    fireEvent.change(screen.getByLabelText('Rechercher un adhérent par nom ou par code-barres'), {
      target: { value: 'P-2026-0007' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher un adhérent' }));
    await waitFor(() => expect(appels[appels.length - 1]).toContain('q=P-2026-0007'));

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    await waitFor(() => expect(appels[appels.length - 1]).not.toContain('q='));
  });

  it('une recherche sans résultat ne dit pas que le fichier est vide', async () => {
    brancher(BIB, { '/patrons': pageDe(0) });
    render(<ListeAdherents />);
    await screen.findByText('Aucun adhérent.');

    fireEvent.change(screen.getByLabelText('Rechercher un adhérent par nom ou par code-barres'), {
      target: { value: 'ZZZ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher un adhérent' }));

    expect(
      await screen.findByText('Aucun adhérent ne correspond à cette recherche.'),
    ).toBeInTheDocument();
  });
});

describe('5 · inscription', () => {
  it('énonce la règle « un nom ou un compte », et recharge la liste', async () => {
    brancher(BIB, { '/patrons': pageDe(1, 1) });
    render(<ListeAdherents />);
    await screen.findByText('1 adhérent');

    fireEvent.click(screen.getByRole('button', { name: 'Inscrire un adhérent' }));
    // ⚠ La règle conditionnelle SE LIT. Se la laisser découvrir par le refus de
    // l'API, c'est envoyer la bibliothécaire chercher ce qu'elle a mal fait
    // alors que la règle n'était écrite nulle part.
    expect(screen.getByText(/sauf si vous liez la carte à un compte existant/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('P-2026-0021'), {
      target: { value: 'P-2026-0021' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(appels.some((a) => a.startsWith('POST'))).toBe(true));
    // Recette n° 5 : la liste est rechargée sans geste de l'utilisateur.
    await waitFor(() =>
      expect(appels.filter((a) => a.startsWith('GET') && a.includes('/patrons?')).length).toBeGreaterThan(1),
    );
  });
});

describe('⚠ Les amendes : aucun zéro affiché, aucun total qui ne désigne rien', () => {
  /**
   * ⚠ CE CAS EST DEVENU ATTEIGNABLE le 12 septembre 2026, en détachant l'écran
   * de `fines.totalXof`.
   *
   * L'API marque ce champ `@deprecated` : il additionne un CUMUL HISTORIQUE et
   * un ENCOURS DU JOUR — un nombre qui ne désigne rien, et que l'écran lisait
   * comme un solde. Le remplacer par les deux grandeurs séparées fait
   * apparaître le cas « rien de constaté, mais un retard court aujourd'hui »,
   * où l'écran écrivait « 0 FCFA constatées aux retours passés · 450 FCFA
   * courant ».
   *
   * Un zéro n'apprend rien et se lit comme un compte soldé. C'est le badge
   * « En retard · 0 FCFA » déjà corrigé une fois sur cet écran.
   */
  // Les mêmes aides que le bloc voisin, où elles sont locales à son `describe`.
  const ficheLocale = (openCheckouts: number) => ({ ...adherent(1), openCheckouts, activeHolds: 0 });
  const situationSansCumul = {
    patron: { id: 'p1', barcode: 'P-2026-0001', category: 'etudiant' },
    checkouts: [
      {
        checkoutId: 'c1',
        title: 'Droit constitutionnel burkinabè',
        itemBarcode: 'BIB-000123',
        recordId: 'r1',
        dueDate: '2026-09-01T00:00:00.000Z',
        renewals: 0,
        overdue: true,
        accruedFineXof: 450,
      },
    ],
    holds: [],
    fines: { recordedXof: 0, accruingXof: 450 },
  };

  it('⚠ rien de constaté : le « 0 FCFA » ne s’écrit pas', async () => {
    brancher(BIB, {
      '/patrons/p1/loans': prets(),
      '/circulation/patrons/p1': situationSansCumul,
      '/patrons/p1': ficheLocale(1),
    });
    render(<FicheAdherent />);
    await screen.findByText('Awa Traoré');
    // ⚠ On vise la SYNTHÈSE, pas la ligne du prêt : les deux portent « 450 FCFA ».
    expect(
      await screen.findByText(/courant sur les retards en cours/),
    ).toBeTruthy();
    expect(screen.queryByText(/0 FCFA constatées/)).toBeNull();
  });

  it('⚠ rien de constaté : la phrase sur les encaissements ne s’affiche pas', async () => {
    // Elle détrompe quelqu'un qui vient d'encaisser. Sans cumul, il n'y a rien
    // à détromper — et un avertissement se place là où il détrompe, pas
    // partout où le fait est vrai.
    brancher(BIB, {
      '/patrons/p1/loans': prets(),
      '/circulation/patrons/p1': situationSansCumul,
      '/patrons/p1': ficheLocale(1),
    });
    render(<FicheAdherent />);
    await screen.findByText('Awa Traoré');
    expect(screen.queryByText(LIBELLES.amendes.aucunEncaissementEnregistre)).toBeNull();
  });
});

describe('⚠ 6 · la suppression, le seul endroit où une erreur détruit', () => {
  const fiche = (openCheckouts: number, activeHolds = 0) => ({
    ...adherent(1),
    openCheckouts,
    activeHolds,
  });
  const situation = {
    patron: { id: 'p1', barcode: 'P-2026-0001', category: 'etudiant' },
    checkouts: [
      {
        checkoutId: 'c1',
        title: 'Droit constitutionnel burkinabè',
        itemBarcode: 'BIB-000123',
        dueDate: '2026-09-01T00:00:00.000Z',
        renewals: 0,
        overdue: true,
        accruedFineXof: 450,
      },
    ],
    holds: [],
    fines: { recordedXof: 0, accruingXof: 450, totalXof: 450 },
  };

  it('refuse en NOMMANT le document, et n’appelle jamais DELETE', async () => {
    brancher(BIB, { '/patrons/p1/loans': prets(), '/circulation/patrons/p1': situation, '/patrons/p1': fiche(1) });
    render(<FicheAdherent />);
    await screen.findByText('Awa Traoré');

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la carte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));

    const refus = await screen.findByRole('alert');
    expect(refus).toHaveTextContent('Droit constitutionnel burkinabè');
    // La preuve qui compte : la requête destructrice n'est pas partie.
    expect(appels.some((a) => a.startsWith('DELETE'))).toBe(false);
  });

  it('la confirmation NOMME la personne, jamais « êtes-vous sûr ? »', async () => {
    brancher(BIB, { '/patrons/p1/loans': prets(), '/circulation/patrons/p1': situation, '/patrons/p1': fiche(0) });
    render(<FicheAdherent />);
    await screen.findByText('Awa Traoré');

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la carte' }));
    expect(
      screen.getByText('Supprimer définitivement la carte de Awa Traoré ?'),
    ).toBeInTheDocument();
  });

  it('un historique se dit définitif, pas « réessayez »', async () => {
    // L'API refuse (RESTRICT sur checkouts.patron_id) : l'historique de prêt
    // ne s'efface jamais par effet de bord. Ce cas n'appelle AUCUNE action —
    // le confondre avec un prêt en cours ferait chercher un retour inexistant.
    brancher(BIB, {
      '/patrons/p1/loans': prets(),
      '/circulation/patrons/p1': { ...situation, checkouts: [] },
      '/patrons/p1': fiche(0),
    });
    render(<FicheAdherent />);
    await screen.findByText('Awa Traoré');

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la carte' }));
    // Le DELETE part cette fois, et c'est l'API qui refuse.
    brancher(BIB, {
      '/patrons/p1/loans': prets(),
      '/circulation/patrons/p1': { ...situation, checkouts: [] },
      '/patrons/p1': { erreur: 409, message: 'peu importe' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('déjà emprunté');
  });
});

describe('l’historique et les liens — câblés le 11 septembre 2026', () => {
  // ⚠ Ces trois choses ont été LAISSÉES VIDES la veille, faute de route et de
  // champ : l'historique n'était rendu par aucun endpoint, et la situation de
  // circulation ne portait pas le `recordId`. Rien d'inerte n'avait été affiché
  // en attendant — pas d'onglet « historique » vide. Le lot backend 2695ca2 a
  // servi les deux, et voici ce que le front en fait.
  const situation = {
    patron: { id: 'p1', barcode: 'P-2026-0001', category: 'etudiant' },
    checkouts: [
      {
        checkoutId: 'c1',
        recordId: 'r-courant',
        title: 'Droit constitutionnel burkinabè',
        itemBarcode: 'BIB-000123',
        dueDate: '2026-09-01T00:00:00.000Z',
        renewals: 0,
        overdue: true,
        accruedFineXof: 450,
      },
    ],
    holds: [],
    fines: { recordedXof: 0, accruingXof: 450, totalXof: 450 },
  };
  const ligne = (n: number) => ({
    checkoutId: `h${n}`,
    recordId: `r${n}`,
    title: `Titre rendu ${n}`,
    itemBarcode: `BIB-0009${n}`,
    checkoutDate: '2026-08-01T00:00:00.000Z',
    dueDate: '2026-08-08T00:00:00.000Z',
    returnDate: '2026-08-20T00:00:00.000Z',
  });
  const carte = { ...adherent(1), openCheckouts: 1, activeHolds: 0 };

  it('⚠ ne dit pas « aucun prêt rendu » avant d’avoir la réponse', async () => {
    brancher(BIB, {
      '/patrons/p1/loans': 'jamais',
      '/circulation/patrons/p1': situation,
      '/patrons/p1': carte,
    });
    render(<FicheAdherent />);

    await screen.findByText('Historique des prêts');
    expect(screen.queryByText('Aucun prêt rendu pour l’instant.')).toBeNull();
    expect(screen.getAllByText('Chargement…').length).toBeGreaterThan(0);
  });

  it('un vrai historique vide se DIT vide', async () => {
    brancher(BIB, {
      '/patrons/p1/loans': prets([]),
      '/circulation/patrons/p1': situation,
      '/patrons/p1': carte,
    });
    render(<FicheAdherent />);
    expect(await screen.findByText('Aucun prêt rendu pour l’instant.')).toBeInTheDocument();
  });

  it('le titre d’un prêt EN COURS mène à sa notice', async () => {
    brancher(BIB, {
      '/patrons/p1/loans': prets([]),
      '/circulation/patrons/p1': situation,
      '/patrons/p1': carte,
    });
    render(<FicheAdherent />);

    const lien = await screen.findByRole('link', {
      name: 'Ouvrir la notice « Droit constitutionnel burkinabè »',
    });
    // ⚠ Le geste suivant d'une bibliothécaire qui regarde un retard. Le lien
    // est construit sur le `recordId` rendu par l'API — jamais deviné sur le
    // titre, ce qui aurait donné un lien mort.
    expect(lien).toHaveAttribute('href', '/admin/catalogue/r-courant');
  });

  it('l’historique liste, compte et pagine', async () => {
    brancher(BIB, {
      '/patrons/p1/loans': prets([ligne(1), ligne(2)], 24),
      '/circulation/patrons/p1': situation,
      '/patrons/p1': carte,
    });
    render(<FicheAdherent />);

    expect(await screen.findByText('24 prêts rendus')).toBeInTheDocument();
    expect(screen.getByText('Page 1 sur 3')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ouvrir la notice « Titre rendu 1 »' }),
    ).toHaveAttribute('href', '/admin/catalogue/r1');

    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    await waitFor(() =>
      expect(appels.some((a) => a.includes('/loans?page=2'))).toBe(true),
    );
  });

  it('un historique tenant sur une page n’affiche aucune commande', async () => {
    // Refus d'inertie : deux boutons qui ne mènent nulle part.
    brancher(BIB, {
      '/patrons/p1/loans': prets([ligne(1)], 1),
      '/circulation/patrons/p1': situation,
      '/patrons/p1': carte,
    });
    render(<FicheAdherent />);

    await screen.findByText('1 prêt rendu');
    expect(screen.queryByRole('button', { name: 'Page suivante' })).toBeNull();
  });

  it('⚠ un retour EN RETARD se voit dans l’historique', async () => {
    // Rendu le 20 août pour une échéance au 8 : douze jours. Le calcul se fait
    // sur la date de RETOUR, pas sur aujourd'hui — sans quoi un prêt rendu
    // il y a un an s'afficherait avec un an de retard.
    brancher(BIB, {
      '/patrons/p1/loans': prets([ligne(1)], 1),
      '/circulation/patrons/p1': situation,
      '/patrons/p1': carte,
    });
    render(<FicheAdherent />);
    expect(await screen.findByText('rendu avec 12 jours de retard')).toBeInTheDocument();
  });
});

describe('inscription : les noms partent, et les vides ne partent pas', () => {
  it('⚠ un champ de nom VIDE est omis, jamais envoyé en chaîne vide', async () => {
    // L'API valide « un nom OU un compte lié ». Pour class-validator, une chaîne
    // vide est un nom PRÉSENT : envoyer `firstName: ''` ferait passer une carte
    // anonyme pour une carte nommée, et le garde-fou ne garderait rien — le
    // défaut exact que l'API a corrigé de son côté le même jour.
    brancher(BIB, { '/patrons': pageDe(1, 1) });
    render(<ListeAdherents />);
    await screen.findByText('1 adhérent');

    fireEvent.click(screen.getByRole('button', { name: 'Inscrire un adhérent' }));
    fireEvent.change(screen.getByPlaceholderText('P-2026-0021'), {
      target: { value: 'P-2026-0021' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(appels.some((a) => a.startsWith('POST'))).toBe(true));
    const envoi = corps[corps.length - 1];
    expect(envoi).not.toHaveProperty('firstName');
    expect(envoi).not.toHaveProperty('lastName');
  });

  it('un nom saisi part bien', async () => {
    brancher(BIB, { '/patrons': pageDe(1, 1) });
    render(<ListeAdherents />);
    await screen.findByText('1 adhérent');

    fireEvent.click(screen.getByRole('button', { name: 'Inscrire un adhérent' }));
    fireEvent.change(screen.getByPlaceholderText('Awa'), { target: { value: 'Rasmata' } });
    fireEvent.change(screen.getByPlaceholderText('Traoré'), { target: { value: 'Nikiema' } });
    fireEvent.change(screen.getByPlaceholderText('P-2026-0021'), {
      target: { value: 'P-2026-0022' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(appels.some((a) => a.startsWith('POST'))).toBe(true));
    expect(corps[corps.length - 1]).toMatchObject({
      firstName: 'Rasmata',
      lastName: 'Nikiema',
      barcode: 'P-2026-0022',
    });
  });
});

describe('le nom appartient à la carte — A2, 11 septembre 2026', () => {
  const base = { openCheckouts: 0, activeHolds: 0, nomsDivergents: false };

  it('une carte d’avant A2, sans nom ni compte, dit ce qui lui manque', async () => {
    brancher(BIB, {
      '/patrons/p1/loans': prets(),
      '/circulation/patrons/p1': null,
      '/patrons/p1': { ...adherent(9, false, false), ...base },
    });
    render(<FicheAdherent />);
    expect(await screen.findByText(/avant que les adhérents portent leur propre nom/)).toBeInTheDocument();
  });

  it('⚠ le nom de la CARTE prime sur celui du compte', async () => {
    // Inverser l'ordre ferait réapparaître le nom du compte par-dessus une
    // correction délibérée de la bibliothécaire.
    brancher(BIB, {
      '/patrons/p1/loans': prets(),
      '/circulation/patrons/p1': null,
      '/patrons/p1': {
        ...adherent(1),
        firstName: 'Awa',
        lastName: 'Kaboré',
        user: { firstName: 'Awa', lastName: 'Traoré', email: 'a@b.bf' },
        ...base,
        nomsDivergents: true,
      },
    });
    render(<FicheAdherent />);
    expect(await screen.findByRole('heading', { name: 'Awa Kaboré' })).toBeInTheDocument();
  });

  it('⚠ le désaccord s’affiche en INFORMATION, pas en alerte', async () => {
    brancher(BIB, {
      '/patrons/p1/loans': prets(),
      '/circulation/patrons/p1': null,
      '/patrons/p1': {
        ...adherent(1),
        firstName: 'Awa',
        lastName: 'Kaboré',
        user: { firstName: 'Awa', lastName: 'Traoré', email: 'a@b.bf' },
        ...base,
        nomsDivergents: true,
      },
    });
    render(<FicheAdherent />);

    const ligne = await screen.findByText('Compte lié : Awa Traoré');
    expect(ligne).toBeInTheDocument();
    // Le contrôle qui porte la décision : aucune alerte, aucun rôle d'alerte.
    // Un désaccord est souvent le résultat voulu d'une correction ; le signaler
    // comme une faute pousserait à défaire ce que quelqu'un a fait exprès.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sans désaccord, aucune ligne « Compte lié » — elle n’apprendrait rien', async () => {
    brancher(BIB, {
      '/patrons/p1/loans': prets(),
      '/circulation/patrons/p1': null,
      '/patrons/p1': { ...adherent(1), ...base, nomsDivergents: false },
    });
    render(<FicheAdherent />);
    await screen.findByRole('heading', { name: 'Awa Traoré' });
    expect(screen.queryByText(/Compte lié/)).toBeNull();
  });
});
