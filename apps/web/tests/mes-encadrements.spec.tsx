/**
 * « Mes encadrements » — l'écran de l'enseignant. P6-3, moitié front.
 *
 * ⚠ CET ÉCRAN SERT À MONTER UN DOSSIER. L'API nomme sa route CSV « la pièce du
 * dossier CCI ». Tout ce qui suit en découle.
 *
 * Les propriétés qu'il doit tenir, et qui sont ici :
 *   1. TROIS ÉTATS, JAMAIS DEUX — « aucun encadrement » et « compte non
 *      rattaché à une fiche d'auteur » ne se confondent pas. Les confondre
 *      affirme à un enseignant qu'il n'a rien dirigé, et il ne peut RIEN y
 *      faire : le rattachement se pose au catalogage ;
 *   2. rien n'est affirmé avant la réponse, et une PANNE ne s'écrit pas
 *      « aucun encadrement » ;
 *   3. le recours NOMME à qui s'adresser — une attente sans destinataire est
 *      une impasse ;
 *   4. l'export dit qu'il n'est pas paginé : une pièce justificative tronquée
 *      sans le dire serait un faux dans un dossier de promotion.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageMesEncadrements from '@/app/mes-encadrements/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/mes-encadrements',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const T = LIBELLES.mesEncadrements;
const ENSEIGNANT = ['document.lire', 'encadrements.voir'];

const ligne = (extra: Record<string, unknown> = {}) => ({
  recordId: 'r-1',
  titre: 'Le régime foncier coutumier en zone périurbaine',
  type: 'these',
  annee: 2025,
  etudiant: 'Ouédraogo, Salif',
  universiteDeSoutenance: 'Université Joseph Ki-Zerbo',
  ...extra,
});

const reponse = (extra: Record<string, unknown> = {}) => ({
  ficheLiee: true,
  nomDeLaFiche: 'Zongo, Pauline',
  total: 1,
  page: 1,
  totalPages: 1,
  encadrements: [ligne()],
  ...extra,
});

let appels: string[] = [];

function brancher(
  corps: unknown | 'jamais' | 'panne',
  fonctions: string[] = ENSEIGNANT,
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
      if (url.includes('/encadrements/miens')) {
        if (corps === 'jamais') return new Promise<Response>(() => {});
        if (corps === 'panne')
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Erreur',
            json: () => Promise.resolve({ message: 'Erreur' }),
          } as Response);
        return ok(corps);
      }
      // ⚠ Une doublure qui se replie en silence transforme un oubli de doublure
      // en défaut apparent du produit — et on cherche alors dans le code ce qui
      // n'y est pas.
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Mes encadrements · trois états, jamais deux', () => {
  it('⚠ un compte NON RATTACHÉ ne s’entend pas dire qu’il n’a rien dirigé', async () => {
    // LE défaut que cet écran existe pour éviter. Un enseignant qui a dirigé
    // quinze thèses, mais dont le compte n'est pas relié à sa fiche d'auteur,
    // verrait « aucun encadrement » — sur l'écran de son dossier de promotion.
    brancher(reponse({ ficheLiee: false, nomDeLaFiche: null, total: 0, encadrements: [] }));
    render(<PageMesEncadrements />);
    expect(await screen.findByText(T.ficheNonLieeTitre)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
  });

  it('un compte rattaché SANS encadrement le dit, et ne parle pas de rattachement', async () => {
    brancher(reponse({ total: 0, encadrements: [] }));
    render(<PageMesEncadrements />);
    expect(await screen.findByText(T.aucun)).toBeTruthy();
    expect(screen.queryByText(T.ficheNonLieeTitre)).toBeNull();
  });

  it('⚠ rien n’est affirmé tant que la réponse n’est pas là', async () => {
    // `queryBy*` et non `findBy*` : pour affirmer une ABSENCE, on constate,
    // on n'attend pas. `findBy*` expirerait et dirait « j'ai renoncé ».
    brancher('jamais');
    render(<PageMesEncadrements />);
    expect(await screen.findByText(T.chargement)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
    expect(screen.queryByText(T.ficheNonLieeTitre)).toBeNull();
  });

  it('⚠ une PANNE ne s’écrit pas « aucun encadrement »', async () => {
    // Une non-réponse qui s'écrit comme un fait : le cas dégradé, celui qu'on
    // teste le moins et qui arrive sur le réseau d'un campus.
    brancher('panne');
    render(<PageMesEncadrements />);
    expect(await screen.findByText(T.erreur)).toBeTruthy();
    expect(screen.queryByText(T.aucun)).toBeNull();
    expect(screen.queryByText(T.ficheNonLieeTitre)).toBeNull();
  });
});

describe('Mes encadrements · ce que le texte doit DIRE', () => {
  it('⚠ le recours NOMME à qui s’adresser', () => {
    // Sa propriété, pas sa valeur. « Réessayez plus tard » serait exact et sans
    // issue : la personne ne peut rien faire seule, le rattachement se pose au
    // catalogage. Une attente sans destinataire est une impasse.
    expect(LIBELLES.mesEncadrements.ficheNonLiee).toMatch(/bibliothèque|gestionnaire/i);
    expect(LIBELLES.mesEncadrements.ficheNonLiee).toMatch(/demandez|contactez/i);
  });

  it('⚠ le recours dit que les encadrements EXISTENT peut-être déjà', () => {
    // Sans cette moitié, le message se lit « vous n'avez rien » avec une
    // formalité en plus — c'est-à-dire le faux qu'on cherchait à éviter.
    expect(LIBELLES.mesEncadrements.ficheNonLiee).toMatch(/existent peut-être|peut-être déjà/i);
  });

  it('⚠ l’aide de l’export dit qu’il n’est PAS paginé', () => {
    // Une pièce justificative tronquée sans le dire serait un faux dans un
    // dossier de promotion. C'est la raison d'être de la phrase.
    expect(T.exportAide).toMatch(/tous|complè/i);
    expect(T.exportAide).toMatch(/pas seulement|page affichée/i);
  });
});

describe('Mes encadrements · la liste', () => {
  it('rend les colonnes de chaque encadrement', async () => {
    brancher(reponse());
    render(<PageMesEncadrements />);
    expect(await screen.findByText('Le régime foncier coutumier en zone périurbaine')).toBeTruthy();
    expect(screen.getByText('Ouédraogo, Salif')).toBeTruthy();
    expect(screen.getByText('Université Joseph Ki-Zerbo')).toBeTruthy();
    expect(screen.getByText('2025')).toBeTruthy();
    expect(screen.getByText('Thèse')).toBeTruthy();
  });

  it('une donnée absente s’affiche comme absente, pas comme un vide', async () => {
    brancher(
      reponse({ encadrements: [ligne({ annee: null, etudiant: null, universiteDeSoutenance: null })] }),
    );
    render(<PageMesEncadrements />);
    expect((await screen.findAllByText(T.nonRenseigne)).length).toBe(3);
  });

  it('le nom de la fiche est rappelé — c’est sous ce nom que le catalogue enregistre', async () => {
    brancher(reponse());
    render(<PageMesEncadrements />);
    expect(await screen.findByText(T.enregistreSous('Zongo, Pauline'))).toBeTruthy();
  });

  it('⚠ l’export n’est proposé que s’il y a quelque chose à exporter', async () => {
    brancher(reponse({ total: 0, encadrements: [] }));
    render(<PageMesEncadrements />);
    await screen.findByText(T.aucun);
    expect(screen.queryByText(T.exportCsv)).toBeNull();
  });

  it('l’export pointe la route CSV de l’API', async () => {
    brancher(reponse());
    render(<PageMesEncadrements />);
    const lien = (await screen.findByText(T.exportCsv)) as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/api/encadrements/miens.csv');
  });
});

describe('Mes encadrements · la pagination', () => {
  it('⚠ la route reçoit bien `page` — le DTO l’accepte, on l’envoie', async () => {
    // `/authors` rendait `totalPages` en refusant `page`, et la correction de
    // bonne foi affichait « property page should not exist » à la place de la
    // liste. Le DTO de cette route-ci déclare `page` : lu, pas supposé.
    brancher(reponse({ total: 120, page: 1, totalPages: 3 }));
    render(<PageMesEncadrements />);
    await screen.findByText(T.pageSur(1, 3));
    expect(appels.some((a) => a.includes('/encadrements/miens?page=1'))).toBe(true);

    fireEvent.click(screen.getByText(T.pageSuivante));
    await waitFor(() =>
      expect(appels.some((a) => a.includes('/encadrements/miens?page=2'))).toBe(true),
    );
  });

  it('une seule page : aucun rouage de pagination', async () => {
    brancher(reponse());
    render(<PageMesEncadrements />);
    await screen.findByText('Ouédraogo, Salif');
    expect(screen.queryByText(T.pageSuivante)).toBeNull();
  });
});

describe('Mes encadrements · le droit', () => {
  it('sans la fonction, l’écran refuse et NOMME la fonction manquante', async () => {
    brancher(reponse(), ['document.lire']);
    render(<PageMesEncadrements />);
    expect(await screen.findByText(LIBELLES.refusDeDroit.encadrements)).toBeTruthy();
  });

  it('⚠ sans la fonction, la route n’est même pas appelée', async () => {
    // Pas d'entrée sans écran, pas d'écran sans droit — et pas d'appel qui
    // ferait un 403 dans la console de quelqu'un qui n'a rien demandé.
    brancher(reponse(), ['document.lire']);
    render(<PageMesEncadrements />);
    await screen.findByText(LIBELLES.refusDeDroit.encadrements);
    expect(appels.some((a) => a.includes('/encadrements/miens'))).toBe(false);
  });
});
