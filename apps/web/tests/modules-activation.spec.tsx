/**
 * L'écran d'activation des modules — P4-2.
 *
 * ⚠ TROIS RÈGLES DU BRIEF, TENUES ICI :
 *   4 · le noyau est VISIBLE et verrouillé, pas caché ;
 *   5 · désactiver ne supprime aucune donnée, et l'écran le DIT avant le geste ;
 *   6 · les dépendances sont structurelles — un module verrouillé n'est pas
 *       cliquable, et la ligne dit de quoi il dépend. Pas de refus après clic.
 *
 * ⚠ ET LA RÈGLE DU LOT : l'écran affiche ce que l'API DÉCLARE, jamais la liste
 * de la maquette. Celle-ci décrit douze modules, l'API en déclare huit :
 * afficher les quatre autres donnerait des interrupteurs qui ne commandent
 * rien. Une maquette dit une intention, pas un état.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIBELLES } from '@/lib/libelles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModulesPage from '@/app/admin/modules/page';
import { ongletsVisibles } from '@/lib/navigation';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/modules',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mod = (o: Partial<ReturnType<typeof base>> & { id: string }) => ({ ...base(o.id), ...o });
const base = (id: string) => ({
  id,
  libelle: id,
  description: `Description de ${id}`,
  dependances: [] as string[],
  noyau: false,
  actif: true,
  verrouille: false,
  motifVerrouillage: null as string | null,
  motif: null as { code: string; modules: { id: string; libelle: string }[] } | null,
  ecrans: [] as string[],
});

let appels: { methode: string; url: string; corps?: unknown }[] = [];

function brancher(fonctions: string[], modules: unknown[] | 'jamais' | 'echec') {
  appels = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      appels.push({
        methode: init?.method ?? 'GET',
        url,
        corps: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      if (url.includes('/auth/me/functions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ functions: fonctions }) } as Response);
      }
      if (url.includes('/modules')) {
        if (init?.method === 'PATCH') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
        }
        if (modules === 'jamais') return new Promise(() => {});
        if (modules === 'echec') {
          return Promise.resolve({
            ok: false, status: 500, statusText: 'Erreur',
            json: () => Promise.resolve({ message: 'Panne.' }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(modules) } as Response);
      }
      throw new Error(`Doublure : requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe('Ce que la confirmation DOIT promettre', () => {
  /**
   * ⚠ SA PROPRIÉTÉ, PAS SA VALEUR. Cette phrase est dite AVANT le geste, et
   * c'est elle qui lève l'inquiétude : un administrateur qui désactive un module
   * doit savoir qu'il ne perd rien. Un test qui la compare au libellé suivrait
   * sa dégradation — « Attention. » passerait.
   */
  it('elle NIE la suppression de données', () => {
    expect(LIBELLES.modules.aucuneDonneeSupprimee).toMatch(/aucune donnée/i);
    expect(LIBELLES.modules.aucuneDonneeSupprimee).toMatch(/supprim/i);
  });
});

describe('sans modules.gerer, ni entrée ni écran', () => {
  it('l’entrée de menu n’apparaît pas', () => {
    const hrefs = (f: string[]) => ongletsVisibles(f).flatMap((o) => o.entrees.map((e) => e.href));
    expect(hrefs(['etablissement.apparence'])).not.toContain('/admin/modules');
    expect(hrefs(['modules.gerer'])).toContain('/admin/modules'); // témoin
  });

  it('l’écran refuse en nommant la fonction', async () => {
    brancher(['etablissement.apparence'], []);
    render(<ModulesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('modules.gerer');
    expect(appels.some((a) => a.url.includes('/modules'))).toBe(false);
  });
});

describe('⚠ décision 4 · le noyau est VISIBLE et verrouillé', () => {
  it('il s’affiche, avec son motif, et sans bouton', async () => {
    brancher(['modules.gerer'], [
      mod({ id: 'catalogue', libelle: 'Catalogue', noyau: true, verrouille: true,
            // ⚠ Motif STRUCTURÉ, et AUCUNE phrase de l'API : c'est le front qui
            // doit la composer. En laissant `motifVerrouillage`, le test serait
            // passé par le repli déprécié sans exercer le nouveau chemin.
            motif: { code: 'noyau', modules: [] } }),
    ]);
    render(<ModulesPage />);

    expect(await screen.findByText('Catalogue')).toBeInTheDocument();
    expect(screen.getByText('Requis — ce module ne se désactive pas.')).toBeInTheDocument();
    // ⚠ RIEN D'INERTE : pas de bouton grisé qui invite à cliquer puis refuse.
    expect(screen.queryByRole('button', { name: /Désactiver/ })).toBeNull();
  });
});

describe('⚠ décision 6 · un module verrouillé n’est pas cliquable', () => {
  it('celui dont un autre dépend affiche « Requis par » et n’a pas de bouton', async () => {
    brancher(['modules.gerer'], [
      mod({ id: 'interoperabilite', libelle: 'Interopérabilité', verrouille: true,
            motif: { code: 'requis_par', modules: [{ id: 'moissonnage', libelle: 'Moissonnage' }] } }),
    ]);
    render(<ModulesPage />);

    expect(await screen.findByText('Requis par : Moissonnage.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Désactiver/ })).toBeNull();
  });

  it('celui dont la dépendance manque affiche « Nécessite » et n’a pas de bouton', async () => {
    brancher(['modules.gerer'], [
      mod({ id: 'moissonnage', libelle: 'Moissonnage', actif: false, verrouille: true,
            dependances: ['interoperabilite'],
            motif: { code: 'dependance_manquante',
                     modules: [{ id: 'interoperabilite', libelle: 'Interopérabilité' }] } }),
    ]);
    render(<ModulesPage />);

    expect(await screen.findByText('Nécessite : Interopérabilité (désactivé).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Activer/ })).toBeNull();
  });
});

describe('⚠ un code de motif inconnu ne laisse pas la ligne muette', () => {
  it('retombe sur la phrase dépréciée de l’API plutôt que de ne rien dire', async () => {
    // Une ligne verrouillée sans raison affichée est pire qu'une ligne muette :
    // on ne sait pas quoi faire pour la débloquer.
    brancher(['modules.gerer'], [
      mod({ id: 'inconnu', libelle: 'Inconnu', verrouille: true,
            motif: { code: 'code-que-le-front-ne-connait-pas', modules: [] },
            motifVerrouillage: 'Verrouillé pour une raison nouvelle.' }),
    ]);
    render(<ModulesPage />);
    expect(await screen.findByText('Verrouillé pour une raison nouvelle.')).toBeInTheDocument();
  });
});

describe('⚠ décision 5 · désactiver ne supprime aucune donnée, et l’écran le dit', () => {
  const amendes = mod({
    id: 'amendes',
    libelle: 'Amendes',
    ecrans: ['Guichet · Amendes', 'Administration · Tarifs de retard'],
  });

  it('la confirmation NOMME le module et LISTE les écrans qui disparaissent', async () => {
    brancher(['modules.gerer'], [amendes]);
    render(<ModulesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver Amendes' }));

    expect(screen.getByText('Désactiver Amendes ?')).toBeInTheDocument();
    expect(screen.getByText('Guichet · Amendes')).toBeInTheDocument();
    expect(screen.getByText('Administration · Tarifs de retard')).toBeInTheDocument();
    // ⚠ Dit AVANT le geste : c'est là qu'il lève l'inquiétude, pas après.
    expect(screen.getAllByText('Aucune donnée n’est supprimée.').length).toBeGreaterThan(0);
    // Et rien n'est parti tant qu'on n'a pas confirmé.
    expect(appels.some((a) => a.methode === 'PATCH')).toBe(false);
  });

  it('confirmer envoie actif:false, puis RECHARGE tout', async () => {
    brancher(['modules.gerer'], [amendes]);
    render(<ModulesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver Amendes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));

    await waitFor(() => expect(appels.some((a) => a.methode === 'PATCH')).toBe(true));
    const patch = appels.find((a) => a.methode === 'PATCH')!;
    expect(patch.url).toContain('/modules/amendes');
    expect(patch.corps).toEqual({ actif: false });
    // ⚠ Rechargement COMPLET : éteindre un module change l'état des autres —
    // celui qui en dépendait se verrouille, celui qui le requérait se libère.
    await waitFor(() =>
      expect(appels.filter((a) => a.methode === 'GET' && a.url.includes('/modules')).length)
        .toBeGreaterThan(1),
    );
  });

  it('un module sans écran rattaché le DIT, au lieu d’une liste vide', async () => {
    // « Rien ne disparaît » et « on ne sait pas ce qui disparaît » ne sont pas
    // la même information.
    brancher(['modules.gerer'], [mod({ id: 'statistiques', libelle: 'Statistiques' })]);
    render(<ModulesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver Statistiques' }));
    expect(screen.getByText(/Aucun écran de l’espace professionnel/)).toBeInTheDocument();
  });
});

describe('⚠ activer ne demande pas de confirmation', () => {
  it('rallumer part directement — le geste n’enlève rien', async () => {
    brancher(['modules.gerer'], [mod({ id: 'amendes', libelle: 'Amendes', actif: false })]);
    render(<ModulesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Activer Amendes' }));
    await waitFor(() => expect(appels.some((a) => a.methode === 'PATCH')).toBe(true));
    expect(appels.find((a) => a.methode === 'PATCH')!.corps).toEqual({ actif: true });
  });
});

describe('⚠ les états de non-réponse', () => {
  it('tant que la liste n’arrive pas, l’écran dit qu’il charge', async () => {
    brancher(['modules.gerer'], 'jamais');
    render(<ModulesPage />);
    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    expect(screen.queryByText('Aucun module déclaré.')).toBeNull();
  });

  it('une panne se dit, et ne se lit pas « aucun module »', async () => {
    brancher(['modules.gerer'], 'echec');
    render(<ModulesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Panne.');
    expect(screen.queryByText('Aucun module déclaré.')).toBeNull();
  });
});
