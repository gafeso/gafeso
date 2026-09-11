/**
 * Un catalogue vide et un filtre périmé ne s'écrivent pas pareil.
 *
 * Le défaut : une URL partagée portant `recordType=nimportequoi` affichait
 * « 0 résultat » et une liste vide, sans un mot. Le lecteur en concluait que la
 * bibliothèque n'avait rien — alors que 352 notices l'attendaient derrière un
 * filtre qui ne correspond à rien. C'est le motif que ce produit corrige
 * partout : une NON-RÉPONSE écrite comme un FAIT.
 *
 * ⚠ La moitié à ne pas casser en corrigeant : « aucune notice ne correspond »
 * reste une réponse LÉGITIME. Une recherche qui ne trouve rien a fonctionné.
 * La présenter comme une anomalie serait le défaut symétrique, et l'API prend
 * soin de ne rien signaler dans ce cas — l'écran doit en faire autant.
 *
 * ⚠ Et le cul-de-sac, qui ne se voit qu'en essayant de sortir : à zéro
 * résultat le moteur ne rend AUCUNE facette, donc les pastilles de filtre
 * disparaissent au moment précis où il faudrait les décocher. Nommer le filtre
 * fautif sans offrir de l'enlever n'aurait corrigé que la moitié visible.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OpacPage from '@/app/opac/page';

let parametres = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => parametres,
  usePathname: () => '/opac',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

type Reponse = {
  totalHits: number;
  totalPages?: number;
  filtresInconnus?: Record<string, string[]>;
};

/** URLs demandées à l'API, dans l'ordre — c'est par là que passe la preuve. */
let appels: string[] = [];

function brancherApi(reponse: (url: string) => Reponse | 'jamais') {
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      appels.push(url);
      const r = reponse(url);
      // ⚠ Réponse qui n'arrive JAMAIS : le seul état où un écran muet se voit.
      if (r === 'jamais') return new Promise(() => {});
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            hits: [],
            page: Number(new URL(url, 'http://x').searchParams.get('page') ?? 1),
            totalPages: 1,
            // ⚠ Zéro résultat ⇒ AUCUNE facette. C'est le comportement réel du
            // moteur, mesuré contre l'API le 10 septembre 2026, et c'est lui
            // qui faisait disparaître les pastilles.
            facets: r.totalHits === 0 ? {} : { recordType: { ouvrage: r.totalHits } },
            ...r,
          }),
      } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  parametres = new URLSearchParams();
});

describe('le filtre périmé est NOMMÉ', () => {
  it('dit quelle valeur n’existe pas, et que le catalogue n’y est pour rien', async () => {
    parametres = new URLSearchParams('recordType=nimportequoi');
    brancherApi(() => ({ totalHits: 0, filtresInconnus: { recordType: ['nimportequoi'] } }));
    render(<OpacPage />);

    await screen.findByText('Ce filtre n’existe pas dans ce catalogue');
    expect(screen.getByText('Type de document : « nimportequoi »')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Le résultat est vide à cause de ce filtre, pas parce que le catalogue l’est.',
      ),
    ).toBeInTheDocument();
  });

  it('accorde au pluriel quand plusieurs valeurs sont inconnues', async () => {
    parametres = new URLSearchParams('recordType=nimportequoi');
    brancherApi(() => ({
      totalHits: 0,
      filtresInconnus: { recordType: ['nimportequoi'], language: ['xx'] },
    }));
    render(<OpacPage />);

    await screen.findByText('Ces filtres n’existent pas dans ce catalogue');
    expect(screen.getByText('Langue : « xx »')).toBeInTheDocument();
  });
});

describe('⚠ le vide LÉGITIME reste une réponse, pas une anomalie', () => {
  it('ne signale aucun filtre quand l’API n’en signale aucun', async () => {
    parametres = new URLSearchParams('q=zzzzqqqinexistant');
    brancherApi(() => ({ totalHits: 0 })); // pas de filtresInconnus
    render(<OpacPage />);

    await screen.findByText('Aucune notice ne correspond à cette recherche.');
    expect(screen.queryByText(/n’existe pas dans ce catalogue/)).toBeNull();
    expect(screen.queryByText(/n’existent pas dans ce catalogue/)).toBeNull();
  });
});

describe('⚠ l’écran n’est pas un cul-de-sac', () => {
  it('offre de retirer le filtre, ET relance la recherche sans lui', async () => {
    parametres = new URLSearchParams('recordType=nimportequoi');
    brancherApi((url) =>
      url.includes('recordType')
        ? { totalHits: 0, filtresInconnus: { recordType: ['nimportequoi'] } }
        : { totalHits: 352 },
    );
    render(<OpacPage />);

    const pastille = await screen.findByLabelText(
      'Retirer le filtre Type de document « nimportequoi »',
    );
    fireEvent.click(pastille);

    // La preuve n'est pas que la pastille a disparu : c'est que l'API a été
    // rappelée SANS le filtre. Une pastille qui s'efface sans relancer serait
    // une case inerte de plus.
    await waitFor(() => expect(appels.length).toBe(2));
    expect(appels[0]).toContain('recordType=nimportequoi');
    expect(appels[1]).not.toContain('recordType');
    expect(await screen.findByText('352 résultats')).toBeInTheDocument();
  });

  it('une pastille PAR valeur : retirer un type garde les autres', async () => {
    // Les groupes de la page d'accueil envoient `recordType=these,memoire,…`.
    parametres = new URLSearchParams('recordType=these,memoire');
    brancherApi(() => ({ totalHits: 0 }));
    render(<OpacPage />);

    await screen.findByLabelText('Retirer le filtre Type de document « Thèses »');
    fireEvent.click(screen.getByLabelText('Retirer le filtre Type de document « Mémoires »'));

    await waitFor(() => expect(appels.length).toBe(2));
    expect(appels[1]).toContain('recordType=these');
    expect(appels[1]).not.toContain('memoire');
  });
});

describe('⚠ tant que la réponse n’arrive pas, l’écran le dit', () => {
  it('dit qu’il charge, et n’affirme rien d’autre', async () => {
    // Trouvé par la passe « réseau lent » du 11 septembre 2026 : avec 1,5 s de
    // latence, l'écran le plus public du produit restait muet — ni compte, ni
    // liste, ni mot. En local ce silence dure 20 ms et ne se voit pas.
    parametres = new URLSearchParams('q=droit');
    brancherApi(() => 'jamais');
    render(<OpacPage />);

    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    expect(screen.queryByText(/résultat/)).toBeNull();
    expect(screen.queryByText('Aucun résultat')).toBeNull();
  });
});

describe('⚠ la recherche PAGINE — backlog n° 6', () => {
  // L'écran que voient les étudiants s'arrêtait à la première page sans le
  // dire : `totalPages` était dans la réponse et n'était pas affiché. Paginer
  // n'était sûr qu'une fois l'ordre vérifié stable — mesuré sur /opac/search,
  // 25 sur 25 et 148 sur 148 distinctes, même ordre à deux appels.
  it('demande vingt résultats, dit sa page, et demande la suivante', async () => {
    brancherApi(() => ({ totalHits: 148, totalPages: 8 }));
    render(<OpacPage />);

    await screen.findByText('148 résultats');
    expect(screen.getByText('Page 1 sur 8')).toBeInTheDocument();
    expect(appels[0]).toContain('limit=20');

    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    await waitFor(() => expect(appels[appels.length - 1]).toContain('page=2'));
  });

  it('un seul écran de résultats ⇒ aucune commande', async () => {
    brancherApi(() => ({ totalHits: 12, totalPages: 1 }));
    render(<OpacPage />);
    await screen.findByText('12 résultats');
    expect(screen.queryByRole('button', { name: 'Page suivante' })).toBeNull();
  });

  it('⚠ cocher une FACETTE depuis la page 2 ramène en page 1', async () => {
    // ⚠ Le bon chemin à exercer. Le bouton « Rechercher » force déjà la page 1
    // dans son gestionnaire ; un premier test passait donc même sans l'effet de
    // remise à zéro, et ne prouvait rien. C'est la facette qui a besoin de
    // l'effet : elle change le critère sans passer par le formulaire.
    //
    // Sans lui, affiner depuis la page 2 demanderait la page 2 d'un résultat qui
    // n'en a qu'une : une liste vide sur un filtre qui trouve.
    brancherApi(() => ({ totalHits: 148, totalPages: 8 }));
    render(<OpacPage />);
    await screen.findByText('Page 1 sur 8');

    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    await waitFor(() => expect(appels[appels.length - 1]).toContain('page=2'));

    fireEvent.click(await screen.findByRole('button', { name: /Ouvrages/ }));
    await waitFor(() => expect(appels[appels.length - 1]).toContain('recordType=ouvrage'));
    expect(appels[appels.length - 1]).toContain('page=1');
  });
});

describe('le chemin nominal ne change pas', () => {
  it('des résultats ⇒ aucun bloc d’état vide', async () => {
    brancherApi(() => ({ totalHits: 148 }));
    render(<OpacPage />);

    expect(await screen.findByText('148 résultats')).toBeInTheDocument();
    expect(screen.queryByText('Aucun résultat')).toBeNull();
    expect(screen.queryByText('Filtres actifs')).toBeNull();
  });
});
