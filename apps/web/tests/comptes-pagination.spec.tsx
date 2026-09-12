/**
 * L'écran des comptes : le compteur « Tous » et la liste de 481.
 *
 * ⚠ DEUX DÉFAUTS TROUVÉS À 481 COMPTES, INVISIBLES À CINQ — et c'est la
 * troisième fois de la semaine que le fonds d'échelle sert à ça.
 *
 * 1. L'onglet « Tous » affichait `data.total`, le total de la requête COURANTE :
 *    « Tous(68) » quand on regardait les comptes en attente, « Tous(413) » sur
 *    les actifs, et le vrai chiffre seulement quand il était sélectionné. Un
 *    gestionnaire lisait le nombre de l'onglet d'à côté. L'API rendait pourtant
 *    `counts`, la ventilation complète, stable quel que soit le filtre.
 * 2. Cent lignes sur 481, sans pagination et sans un mot — la même liste
 *    tronquée que l'index des auteurs, à la même semaine, sur un autre écran.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession } from './aide-session';
import { monterEcran } from './aide-ecran';

// ⚠ Le NOM ACCESSIBLE n'est pas le `textContent` : la bibliothèque joint les
// nœuds enfants par une espace, donc « Tous(481) » se nomme « Tous (481) ». Un
// motif collé échouait en disant « onglet introuvable » — en accusant l'écran
// pour une espace que personne ne voit.
vi.mock('next/navigation', async () => (await import('./aide-navigation')).navigationDeTest());

// ⚠ La coque refuse l'espace à qui n'a AUCUNE entrée de menu : trois fonctions
// ne suffisent pas à ouvrir un onglet, et l'écran ne se montait pas du tout. Le
// test échouait alors en disant « onglet Tous introuvable » — en accusant le
// compteur, sur un écran qui n'était jamais rendu.
const ADMIN = [
  'document.lire', 'catalogue.gerer', 'circulation.faire', 'adherents.gerer',
  'lecteurs.voir', 'comptes.activer', 'comptes.gerer', 'statistiques.voir',
  'etablissement.regles', 'securite.roles',
];

function comptes(nb: number, total: number) {
  return {
    total,
    counts: { PENDING: 68, ACTIVE: 413 },
    users: Array.from({ length: nb }, (_, i) => ({
      id: `u${i}`,
      email: `h-2026-${String(i).padStart(5, '0')}@etu.horizon.bf`,
      firstName: 'Awa',
      lastName: 'Traoré',
      role: 'STUDENT',
      status: 'ACTIVE',
      matricule: `H-2026-${String(i).padStart(5, '0')}`,
      className: 'L1_DROIT',
      createdAt: '2026-09-01T00:00:00.000Z',
    })),
  };
}

let urls: string[] = [];
function monter(nb: number, total: number) {
  urls = [];
  const r = monterEcran('/admin/comptes', {
    fonctions: ADMIN,
    modules: ['amendes', 'interoperabilite', 'rappels'],
    reponses: { '/accounts/assignable-roles': [], '/accounts': comptes(nb, total) },
  });
  urls = r.appels;
  return r;
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Comptes · compteur des onglets', () => {
  /**
   * ⚠ LE CŒUR DU PREMIER DÉFAUT. `total` vaut ici 68 — le total d'une requête
   * filtrée — pendant que `counts` dit 68 + 413. L'onglet « Tous » doit lire la
   * VENTILATION, jamais le total courant.
   */
  it('« Tous » somme la ventilation, il ne lit pas le total courant', async () => {
    monter(68, 68);
    expect(await screen.findByRole('tab', { name: /Tous\s*\(481\)/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /En attente\s*\(68\)/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Actifs\s*\(413\)/ })).toBeTruthy();
  });

  it('un statut ajouté demain entre dans le total sans qu’on y pense', async () => {
    monterEcran('/admin/comptes', {
      fonctions: ADMIN,
      modules: ['amendes'],
      reponses: {
        '/accounts/assignable-roles': [],
        '/accounts': { total: 5, counts: { PENDING: 68, ACTIVE: 413, SUSPENDED: 9 }, users: [] },
      },
    });
    // ⚠ 490, pas 481 : la somme, et non deux clés nommées à la main.
    expect(await screen.findByRole('tab', { name: /Tous\s*\(490\)/ })).toBeTruthy();
  });
});

describe('Comptes · pagination', () => {
  it('481 comptes : le compteur les annonce et le parcours existe', async () => {
    monter(100, 481);
    expect(await screen.findByText(LIBELLES.comptes.compte(481))).toBeTruthy();
    expect(screen.getByText(LIBELLES.comptes.pageSur(1, 5))).toBeTruthy();
  });

  it('une seule page : pas de commandes de parcours', async () => {
    monter(68, 68);
    expect(await screen.findByText(LIBELLES.comptes.compte(68))).toBeTruthy();
    expect(screen.queryByRole('button', { name: LIBELLES.comptes.pageSuivante })).toBeNull();
  });

  it('la requête PORTE la page', async () => {
    monter(100, 481);
    await waitFor(() => expect(urls.some((u) => u.includes('/accounts?'))).toBe(true));
    expect(urls.find((u) => u.includes('/accounts?'))!).toMatch(/[?&]page=1\b/);
  });

  /**
   * ⚠ LE PIÈGE DES ÉCRANS QUI FILTRENT ET PAGINENT. Passer de « Tous » page 4 à
   * « En attente » demanderait la page 4 d'un résultat qui n'en a qu'une, et
   * l'écran afficherait une liste vide sur un onglet qui compte 68 comptes.
   * Corrigé une fois sur le catalogue, une fois sur les auteurs, ici la
   * troisième.
   */
  it('changer d’onglet revient à la première page', async () => {
    monter(100, 481);
    await screen.findByText(LIBELLES.comptes.pageSur(1, 5));
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.comptes.pageSuivante }));
    await waitFor(() => expect(urls.some((u) => /[?&]page=2\b/.test(u))).toBe(true));

    const avant = urls.length;
    // ⚠ On revient sur « Tous », pas sur « En attente » : l'écran DÉMARRE sur
    // « En attente », donc recliquer dessus ne change pas l'état et ne déclenche
    // aucune requête. Le test échouait alors en disant « aucun appel » — et
    // accusait le retour à la première page, qui fonctionnait.
    fireEvent.click(screen.getByRole('tab', { name: /Actifs/ }));
    await waitFor(() => {
      // ⚠ On repart de l'INDEX, pas d'un `urls.length = 0` : vider le tableau
      // que la doublure remplit marche, mais on perd alors la trace de ce qui
      // précède — et quand rien n'arrive, on ne sait plus si c'est parce que
      // l'appel manque ou parce qu'on a effacé au mauvais moment.
      const apres = urls.slice(avant).filter((u) => u.includes('/accounts?'));
      expect(apres.length).toBeGreaterThan(0);
      const dernier = apres[apres.length - 1];
      expect(dernier).toMatch(/[?&]page=1\b/);
      expect(dernier).toMatch(/status=ACTIVE/);
    });
  });
});
