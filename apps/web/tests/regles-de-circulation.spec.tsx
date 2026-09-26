/**
 * LES RÈGLES DE CIRCULATION — la collection que l'API portait et que rien
 * n'ouvrait (dette front n° 15).
 *
 * 🔴 CE QUI ÉTAIT MESURÉ. `CirculationRule` porte `loanPeriodDays`,
 * `maxCheckouts`, `maxRenewals` et `finePerDay`, **par catégorie d'adhérent et
 * par type d'exemplaire**. L'API expose les quatre verbes et APPLIQUE ces
 * valeurs au guichet — un prêt est refusé au plafond, un renouvellement au
 * maximum. Le front n'appelait **aucune** des quatre : les valeurs venaient des
 * défauts semés, et aucune école ne pouvait en changer autrement qu'en base.
 *
 * ⚠ LA FORME FAUTIVE QUE CE LOT REFUSE, nommée dans la dette : ajouter quatre
 * champs à la carte de `/admin/regles-de-pret`. C'est une COLLECTION clé par
 * (catégorie, type) ; quatre champs auraient créé UNE règle globale et masqué
 * la dimension par catégorie — l'écran afficherait « plafond : 5 » pendant que
 * la base en porte cinq différents, et le premier enregistrement écraserait la
 * nuance qu'une bibliothécaire avait posée. **Un singleton n'est pas une
 * collection à un élément.**
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

const T = LIBELLES.reglesDeCirculation;

let FONCTIONS: string[] = ['etablissement.regles'];
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => ({ functions: FONCTIONS }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/regles-de-circulation',
  useSearchParams: () => new URLSearchParams(),
}));

import ReglesDeCirculationPage from '@/app/admin/regles-de-circulation/page';

const REGLES = [
  {
    id: 'r1',
    patronCategory: 'etudiant',
    itemType: 'livre',
    loanPeriodDays: 14,
    maxRenewals: 1,
    maxCheckouts: 5,
    finePerDay: 50,
  },
  {
    id: 'r2',
    patronCategory: 'enseignant',
    itemType: '*',
    loanPeriodDays: 30,
    maxRenewals: 3,
    maxCheckouts: 10,
    finePerDay: 0,
  },
];

let envois: { url: string; methode: string; corps: unknown }[] = [];
let liste: unknown = REGLES;
let listeRefuse = false;

beforeEach(() => {
  FONCTIONS = ['etablissement.regles'];
  envois = [];
  liste = REGLES;
  listeRefuse = false;
  ouvrirSession();
  vi.stubGlobal('fetch', (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    const methode = init?.method ?? 'GET';
    if (methode !== 'GET') {
      envois.push({ url, methode, corps: init?.body ? JSON.parse(String(init.body)) : null });
    }
    const ok = (corps: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as Response);
    if (url.includes('/circulation/rules')) {
      if (methode === 'GET' && listeRefuse) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Erreur interne' }),
        } as Response);
      }
      return ok(methode === 'GET' ? liste : {});
    }
    // Une doublure qui se tait transforme un oubli en défaut apparent.
    return Promise.reject(new Error(`requête non couverte — ${url}`));
  });
});

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('La table montre la COLLECTION, pas un réglage', () => {
  it('une ligne par couple (catégorie, type), avec les quatre valeurs', async () => {
    render(<ReglesDeCirculationPage />);
    await screen.findByText('etudiant');
    expect(screen.getByText('livre')).toBeTruthy();
    expect(screen.getByText(T.jours(14))).toBeTruthy();
    expect(screen.getByText(T.fcfa(50))).toBeTruthy();
    // La SECONDE ligne existe — c'est elle qui prouve que ce n'est pas un
    // singleton : deux plafonds différents coexistent.
    expect(screen.getByText('enseignant')).toBeTruthy();
    expect(screen.getByText(T.jours(30))).toBeTruthy();
  });

  it('⚠ le joker `*` s’écrit en toutes lettres, jamais brut', async () => {
    render(<ReglesDeCirculationPage />);
    await screen.findByText('enseignant');
    expect(screen.getByText(T.tousTypes)).toBeTruthy();
    // « * » dans une colonne ne dit rien à personne, et surtout pas à un
    // lecteur d'écran.
    expect(screen.queryByText('*')).toBeNull();
  });

  it('aucune règle n’est un ÉTAT, pas une panne', async () => {
    liste = [];
    render(<ReglesDeCirculationPage />);
    expect(await screen.findByText(T.aucune)).toBeTruthy();
    // ⚠ Et le texte ne pousse pas à créer dans l'urgence : le produit a des
    // défauts, une école qui n'a rien posé n'est pas en panne.
    expect(T.aucune).toMatch(/défaut/i);
  });

  it('⚠ un refus ne s’affiche pas comme une attente', async () => {
    listeRefuse = true;
    render(<ReglesDeCirculationPage />);
    expect(await screen.findByText(LIBELLES.commun.listeNonChargee)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.commun.chargement)).toBeNull();
  });

  it('⚠ le Bibliothécaire — l’ANCIENNE fonction — est refusé, pas accueilli', async () => {
    // ⚠ CE CAS EST LE LOT DU 26 SEPTEMBRE 2026, et un `FONCTIONS = []` ne
    // l'aurait jamais attrapé. L'écran a vécu quatre jours sous
    // `circulation.faire` ; ses routes exigent `etablissement.regles` depuis le
    // découplage du module `amendes`. Un Bibliothécaire porte la PREMIÈRE et
    // pas la seconde : sans ce cas, garder l'ancienne garde laisse la suite
    // verte et l'écran visible à qui l'API refuse.
    //
    // C'est « le jeu d'essai n'atteint pas le chemin » pris par l'autre bout :
    // le cas minimal (aucune fonction) traverse le même garde et ne distingue
    // pas les deux fonctions. Seul le jeu d'essai RÉEL — les sept fonctions du
    // Bibliothécaire — mesure le rétrécissement.
    FONCTIONS = [
      'document.lire',
      'catalogue.gerer',
      'outils.catalogue',
      'circulation.faire',
      'adherents.gerer',
      'circulation.retards',
      'lecteurs.voir',
    ];
    render(<ReglesDeCirculationPage />);
    expect(await screen.findByText(LIBELLES.refusDeDroit.reglesDeCirculation)).toBeTruthy();
    // et il ne voit pas la table : un refus n'est pas un écran en lecture seule
    expect(screen.queryByText(T.titre)).toBeNull();
    expect(envois.filter((e) => e.url.includes('/circulation/rules'))).toEqual([]);
  });

  it('⚠ son titre ne se confond pas avec celui de son VOISIN d’onglet', () => {
    // Les deux écrans s'appelaient « Règles de prêt » et vivaient dans deux
    // onglets. Le déplacement du 26 septembre 2026 les a mis côte à côte : le
    // titre, comme le libellé de l'entrée, doit les distinguer.
    expect(T.titre).not.toBe(LIBELLES.reglesDePret.titre);
  });

  it('⚠ le refus NOMME la fonction que l’écran exige, et son destinataire', () => {
    // Un test qui restate la constante suivrait sa dégradation sans broncher :
    // c'est la PROPRIÉTÉ du texte qu'on éprouve, pas son emploi.
    expect(LIBELLES.refusDeDroit.reglesDeCirculation).toContain('etablissement.regles');
    expect(LIBELLES.refusDeDroit.reglesDeCirculation).not.toContain('circulation.faire');
    expect(LIBELLES.refusDeDroit.reglesDeCirculation).toMatch(/administrateur/i);
    expect(LIBELLES.refusDeDroit.reglesDeCirculation).toMatch(/demandez|contactez/i);
  });

  it('sans aucune fonction, l’écran refuse en la nommant', async () => {
    FONCTIONS = [];
    render(<ReglesDeCirculationPage />);
    expect(await screen.findByText(LIBELLES.refusDeDroit.reglesDeCirculation)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.commun.chargement)).toBeNull();
  });
});

describe('Créer, modifier, supprimer — les trois verbes que personne n’appelait', () => {
  it('créer envoie un POST avec les six champs', async () => {
    liste = [];
    render(<ReglesDeCirculationPage />);
    await screen.findByText(T.aucune);

    fireEvent.change(screen.getByLabelText(T.colCategorie), { target: { value: 'personnel' } });
    fireEvent.change(screen.getByLabelText(T.colType), { target: { value: 'dvd' } });
    fireEvent.change(screen.getByLabelText(T.colDuree), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(T.colRenouvellements), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(T.colPlafond), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(T.colAmende), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: T.enregistrer }));

    await waitFor(() => expect(envois.length).toBeGreaterThan(0));
    expect(envois[0].methode).toBe('POST');
    expect(envois[0].corps).toEqual({
      patronCategory: 'personnel',
      itemType: 'dvd',
      loanPeriodDays: 7,
      maxRenewals: 2,
      maxCheckouts: 3,
      finePerDay: 100,
      // ⚠ Des NOMBRES, pas des chaînes : le DTO les valide en `@IsInt()`, et
      // « 7 » serait refusé par une 400 que rien à l'écran n'expliquerait.
    });
  });

  it('modifier une ligne envoie un PATCH sur SON identifiant', async () => {
    render(<ReglesDeCirculationPage />);
    await screen.findByText('etudiant');
    // ⚠ Le nom accessible porte la ligne : « Modifier » seul se répéterait
    // autant de fois qu'il y a de règles.
    fireEvent.click(screen.getByRole('button', { name: `${T.modifier} etudiant / livre` }));
    fireEvent.change(screen.getByLabelText(T.colPlafond), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: T.enregistrer }));

    await waitFor(() => expect(envois.length).toBeGreaterThan(0));
    expect(envois[0].methode).toBe('PATCH');
    expect(envois[0].url).toContain('/circulation/rules/r1');
    expect((envois[0].corps as Record<string, unknown>).maxCheckouts).toBe(8);
  });

  it('⚠ supprimer DEMANDE d’abord — et la question nomme la règle', async () => {
    render(<ReglesDeCirculationPage />);
    await screen.findByText('etudiant');
    fireEvent.click(screen.getByRole('button', { name: `${T.supprimer} etudiant / livre` }));

    // Rien n'est parti tant qu'on n'a pas confirmé.
    expect(envois).toEqual([]);
    expect(screen.getByText(T.supprimerConfirmer('etudiant', 'livre'))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: T.supprimer }));
    await waitFor(() => expect(envois.length).toBeGreaterThan(0));
    expect(envois[0].methode).toBe('DELETE');
    expect(envois[0].url).toContain('/circulation/rules/r1');
  });

  it('⚠ et la confirmation dit ce qui se passera APRÈS', () => {
    // Supprimer une règle ne « supprime » rien pour le lecteur : le guichet
    // appliquera la règle la plus proche, ou ses défauts. Sans cette phrase, on
    // croit fermer un droit alors qu'on en rend un autre applicable.
    const texte = T.supprimerConfirmer('etudiant', 'livre');
    expect(texte).toMatch(/guichet/i);
    expect(texte).toMatch(/défaut|plus proche/i);
  });
});
