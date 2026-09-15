/**
 * Accessibilité de l'espace professionnel — la passe qui n'avait jamais été faite.
 *
 * ⚠ CE QUE LE RELEVÉ A TROUVÉ, et pourquoi il fallait le faire mécaniquement.
 * Le seul chiffre d'accessibilité du dépôt était un contraste, sur un seul
 * bandeau — celui où l'instrument s'était trompé la première fois. Tout le reste
 * n'avait jamais été regardé. Cinq défauts, dont trois sur CHAQUE écran :
 *
 *   1. aucun `<main>` dans la branche NOMINALE de la coque — les trois branches
 *      dégradées en portaient un, pas celle que tout le monde voit ;
 *   2. aucun lien d'évitement, devant trois barres de navigation ;
 *   3. deux `nav` sur trois sans nom, donc « navigation » trois fois ;
 *   4. un `tablist` qui n'en était pas un : ni panneau, ni lien onglet/panneau,
 *      et les quatre onglets dans l'ordre de tabulation au lieu des flèches ;
 *   5. la confirmation de désactivation d'un module apparaissait sans que le
 *      clavier ni le lecteur d'écran ne l'apprennent.
 *
 * ⚠ L'INSTRUMENT S'EST TROMPÉ D'ABORD, comme d'habitude. Sa première version
 * signalait le lien du logo sur les cinq écrans : elle calculait le nom
 * accessible d'un lien sur son `textContent`, or ce lien contient un
 * `<img alt="Gafeso">` et un `<img>` n'a pas de texte. Cinq faux positifs, et
 * c'est le témoin — un lien dont je SAVAIS qu'il est nommé — qui l'a montré.
 *
 * Les assertions ci-dessous portent l'INVARIANT sur tous les écrans de la table,
 * pas les cinq cas corrigés : le sixième écran branché demain est couvert sans
 * qu'on y pense.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession } from './aide-session';
import {
  ADRESSES_DE_COQUE,
  ADRESSES_HORS_COQUE,
  ECRANS,
  monterEcran,
  MODULES_ACTIVABLES,
  type Adresse,
} from './aide-ecran';

vi.mock('next/navigation', async () => (await import('./aide-navigation')).navigationDeTest());

const ADMIN = [
  'document.lire', 'catalogue.gerer', 'outils.catalogue', 'circulation.faire',
  'circulation.retards', 'adherents.gerer', 'lecteurs.voir', 'lecteurs.gerer',
  'outils.lecteurs', 'comptes.activer', 'comptes.gerer', 'collections.gerer',
  'statistiques.voir', 'etablissement.apparence', 'etablissement.regles',
  'diffusion.gerer', 'securite.roles', 'securite.audit', 'modules.gerer',
];
// ⚠ LU DANS LE REGISTRE, plus recopié : un module ajouté côté API arrive ici
// sans qu'on y touche. La liste en dur a fait échouer trois tests le
// 14 septembre 2026 en décrivant un monde où `depot` n'existe pas.
const TOUS = MODULES_ACTIVABLES as unknown as string[];

const REPONSES = {
  '/patrons/p1/loans': { current: [], history: { entries: [], total: 0, page: 1, pageSize: 10 } },
  '/circulation/patrons/p1': {
    patron: { id: 'p1', barcode: 'P-2026-0001', category: 'etudiant', expiryDate: null, user: null },
    checkouts: [], holds: [], fines: { recordedXof: 0, accruingXof: 0, totalXof: 0 },
  },
  '/patrons/p1': {
    id: 'p1', firstName: 'Awa', lastName: 'Traoré', barcode: 'P-2026-0001', category: 'etudiant',
    userId: null, registrationDate: '2026-09-01T00:00:00.000Z', expiryDate: null, user: null,
  },
  '/oai/sources': [], '/interoperabilite': {},
  // Les routes des écrans ajoutés à la table. Une URL non couverte LÈVE : c'est
  // la règle des doublures, et elle a déjà évité deux diagnostics à côté.
  '/cataloging/records': { records: [], total: 0, page: 1, pageSize: 20 },
  '/cataloging/keywords': [],
  '/categories': [],
  '/authors': { authors: [], total: 0, page: 1, pageSize: 50 },
  '/enrollment/classes': [],
  '/collections': [],
  '/accounts/assignable-roles': [],
  // ⚠ `users`, pas `accounts`. La première doublure a inventé la clé, l'écran a
  // lu `data.users.length` sur `undefined`, et le test a échoué en disant « pas
  // de repère principal » — donc en accusant la coque, sur un écran qui allait
  // bien. Une doublure qui se trompe de forme fait chercher le défaut du mauvais
  // côté : c'est la troisième fois cette semaine.
  '/accounts': { users: [], total: 0, page: 1, pageSize: 20 },
  '/tenancy/current': { name: 'Université d’Exemple', slug: 'zinda' },
  '/audit/actions': [],
  '/audit': { entries: [], total: 0, page: 1, pageSize: 20 },
  '/reminders/log': { entries: [], total: 0, page: 1, pageSize: 20 },
  '/inventory/sessions': [],
  '/roles/fonctions': [],
  '/roles': [],
  '/patrons': { patrons: [], total: 0, page: 1, pageSize: 20 },
  '/stats/dashboard': {
    period: { from: 'a', to: 'b', granularity: 'day' },
    kpis: { records: 1, items: 1, activeAccounts: 1, openLoans: 1, overdues: 1, pendingHolds: 0, digital: 0 },
    activity: { loans: { current: 1, previous: 1, variationPct: 0 }, returns: { current: 1, previous: 1, variationPct: 0 } },
    timeseries: [{ date: '2026-09-10', loans: 1, returns: 1 }],
    rankings: { mostBorrowed: [], neverBorrowed: { count: 0, sample: [] }, topCategories: [], topClasses: [], topAuthors: [] },
    fundByCategory: [], system: { reminders: [], holds: { fulfilled: 1, expired: 0 } },
  },
};

// ⚠ Les invariants de la COQUE ne valent que pour les écrans qu'elle porte.
// « Mon dépôt » vit dans l'espace de l'étudiant, avec son propre en-tête : le
// lui soumettre ferait échouer un test sur une exigence qui ne le concerne pas.
const ADRESSES = ADRESSES_DE_COQUE as Adresse[];
const monter = (a: Adresse) =>
  monterEcran(a, { fonctions: ADMIN, modules: [...TOUS], reponses: REPONSES });
const repos = () => new Promise((r) => setTimeout(r, 60));

/**
 * Nom accessible, approché — et l'approximation est DOCUMENTÉE parce qu'elle
 * s'est déjà trompée : le nom d'un lien vient de son CONTENU, `alt` des images
 * comprises. Sans cette ligne, cinq faux positifs sur le logo.
 */
function nomAccessible(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();
  const par = el.getAttribute('aria-labelledby');
  if (par) {
    return par.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? '').join(' ').trim();
  }
  if (el instanceof HTMLImageElement) return (el.alt ?? '').trim();
  const texte = (el.textContent ?? '').trim();
  if (texte) return texte;
  const alts = [...el.querySelectorAll('img')].map((i) => i.alt).join(' ').trim();
  return alts || (el.getAttribute('title') ?? '').trim();
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Invariants de la coque, sur TOUS les écrans de la table', () => {
  it.each(ADRESSES)('%s — un repère principal, et le lien qui y mène', async (adresse) => {
    monter(adresse);
    await repos();
    const mains = document.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    const evitement = screen.getByRole('link', { name: LIBELLES.accessibilite.allerAuContenu });
    // ⚠ Le lien doit POINTER sur le repère, pas exister à côté de lui.
    expect(evitement.getAttribute('href')).toBe(`#${mains[0].id}`);
    expect(mains[0].id).not.toBe('');
  });

  it.each(ADRESSES)('%s — le lien d’évitement est le PREMIER au clavier', async (adresse) => {
    monter(adresse);
    await repos();
    const focalisables = [...document.querySelectorAll('a[href], button, input, select, textarea')]
      .filter((e) => Number(e.getAttribute('tabindex') ?? 0) >= 0);
    expect(nomAccessible(focalisables[0])).toBe(LIBELLES.accessibilite.allerAuContenu);
  });

  it.each(ADRESSES)('%s — chaque barre de navigation porte un nom distinct', async (adresse) => {
    monter(adresse);
    await repos();
    const barres = [...document.querySelectorAll('nav')];
    const noms = barres.map((n) => n.getAttribute('aria-label'));
    // ⚠ TOUTES nommées, pas « au moins une ». La première rédaction ne gardait
    // que les `nav` déjà nommées avant de vérifier leur unicité : retirer le nom
    // de la barre latérale n'y changeait rien — elle sortait du relevé au lieu
    // de le faire échouer. Le contrôle négatif ne cassait rien, et ce n'était ni
    // un chemin mort ni un mauvais test : je ne regardais pas assez large.
    expect(barres.length).toBeGreaterThan(1);
    expect(noms.filter((n) => !n?.trim())).toEqual([]);
    expect(new Set(noms).size).toBe(noms.length);
  });

  it.each(ADRESSES)('%s — tout élément interactif a un nom', async (adresse) => {
    monter(adresse);
    await repos();
    const sansNom = [...document.querySelectorAll('button, a[href], [role="tab"]')]
      .filter((e) => !nomAccessible(e));
    expect(sansNom.map((e) => e.outerHTML.slice(0, 80))).toEqual([]);
  });

  /** ⚠ Le témoin : un lien dont je SAIS qu'il est nommé par l'`alt` de son image. */
  it('témoin — le calcul de nom voit bien le logo', async () => {
    monter('/guichet');
    await repos();
    const logo = document.querySelector('a[href="/"]');
    expect(logo).not.toBeNull();
    expect(nomAccessible(logo!)).toBe('Gafeso');
  });
});

describe('Guichet — un tablist qui tient ses promesses', () => {
  it('chaque onglet désigne son panneau, et le panneau son onglet', async () => {
    monter('/guichet');
    const onglets = await screen.findAllByRole('tab');
    expect(onglets).toHaveLength(4);
    const actif = onglets.find((o) => o.getAttribute('aria-selected') === 'true')!;
    const panneau = document.getElementById(actif.getAttribute('aria-controls')!);
    expect(panneau).not.toBeNull();
    expect(panneau!.getAttribute('aria-labelledby')).toBe(actif.id);
  });

  it('un seul onglet dans l’ordre de tabulation', async () => {
    monter('/guichet');
    const onglets = await screen.findAllByRole('tab');
    const dansLOrdre = onglets.filter((o) => o.getAttribute('tabindex') === '0');
    expect(dansLOrdre).toHaveLength(1);
    expect(dansLOrdre[0].getAttribute('aria-selected')).toBe('true');
  });

  it('les flèches déplacent le FOCUS, et bouclent', async () => {
    monter('/guichet');
    const barre = await screen.findByRole('tablist');
    const focalise = () => (document.activeElement as HTMLElement)?.textContent;

    screen.getByRole('tab', { name: 'Prêt' }).focus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Prêt' }), { key: 'ArrowRight' });
    await waitFor(() => expect(focalise()).toBe('Retour'));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Retour' }), { key: 'ArrowLeft' });
    await waitFor(() => expect(focalise()).toBe('Prêt'));
    // ⚠ Le bouclage : à gauche depuis le premier, on arrive au DERNIER.
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Prêt' }), { key: 'ArrowLeft' });
    await waitFor(() => expect(focalise()).toBe('Réservations'));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Réservations' }), { key: 'End' });
    await waitFor(() => expect(focalise()).toBe('Réservations'));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Réservations' }), { key: 'Home' });
    await waitFor(() => expect(focalise()).toBe('Prêt'));
    expect(barre.getAttribute('aria-label')).toBe(LIBELLES.accessibilite.ongletsDuGuichet);
  });

  /**
   * ⚠ ACTIVATION MANUELLE, et c'est un choix mesuré, pas un défaut. La flèche ne
   * change pas d'onglet : les panneaux portent un `autoFocus` sur leur champ de
   * code-barres — voulu, une bibliothécaire scanne dans la seconde — et une
   * flèche qui activerait enverrait le focus dans le champ, d'où la flèche
   * suivante ne ferait plus rien. Le motif ARIA recommande l'activation manuelle
   * exactement dans ce cas.
   */
  it('la flèche ne change PAS d’onglet ; le clic, oui', async () => {
    monter('/guichet');
    const actif = () =>
      screen.getAllByRole('tab').find((o) => o.getAttribute('aria-selected') === 'true')!.textContent;

    await screen.findByRole('tablist');
    expect(actif()).toBe('Prêt');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Prêt' }), { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Retour' })));
    expect(actif()).toBe('Prêt');

    fireEvent.click(screen.getByRole('tab', { name: 'Retour' }));
    await waitFor(() => expect(actif()).toBe('Retour'));
  });
});

describe('Modules — la confirmation se fait connaître du clavier', () => {
  it('elle reçoit le focus, et elle est nommée par son titre', async () => {
    monter('/admin/modules');
    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver Interopérabilité' }));
    const boite = await screen.findByRole('group', {
      name: LIBELLES.modules.confirmerTitre('Interopérabilité'),
    });
    await waitFor(() => expect(document.activeElement).toBe(boite));
  });

  it('Échap l’annule, et rien n’est basculé', async () => {
    monter('/admin/modules');
    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver Interopérabilité' }));
    const boite = await screen.findByRole('group', {
      name: LIBELLES.modules.confirmerTitre('Interopérabilité'),
    });
    fireEvent.keyDown(boite, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('group')).toBeNull());
    // Le module est intact : son bouton propose toujours de le désactiver.
    expect(screen.getByRole('button', { name: 'Désactiver Interopérabilité' })).toBeTruthy();
  });
});

/**
 * ⚠ LES ÉCRANS PERSONNELS N'ÉTAIENT COUVERTS PAR RIEN.
 *
 * L'exclusion des écrans `horsCoque` était justifiée — « le lui soumettre
 * ferait échouer un test sur une exigence qui ne le concerne pas » — et c'est
 * vrai des barres de navigation de la coque du personnel. Ce n'est PAS vrai
 * d'« un repère principal et le lien qui y mène » : cet invariant ne dépend
 * d'aucune coque, et ces écrans le portent eux-mêmes, à la main.
 *
 * Constaté le 12 septembre 2026 en ajoutant « Mes encadrements » : j'ai recopié
 * le lien d'évitement de « Mon dépôt » sans que rien ne vérifie ni l'un ni
 * l'autre. Un motif de refus juste avait produit une exclusion trop large.
 */
describe('Invariants de PAGE, sur les écrans qui portent leur propre en-tête', () => {
  /**
   * ⚠ LE JEU D'ESSAI DOIT ATTEINDRE L'ÉCRAN, PAS SON REFUS.
   *
   * Première écriture : `fonctions: ADMIN`. Or ADMIN ne porte ni
   * `depot.deposer` ni `encadrements.voir` — ces deux écrans rendaient donc
   * leur branche de REFUS, qui a son propre lien d'évitement. Les invariants
   * passaient, et ils ne mesuraient rien de l'écran réel : retirer le
   * `<LienDEvitement />` de la branche nominale ne faisait tomber AUCUN test.
   *
   * C'est la cinquième lecture d'une mutation qui ne casse rien — le chemin
   * existe, le test est juste, et le jeu d'essai n'arrive pas jusqu'au code
   * muté. Le remède n'est ni de corriger le test ni d'élargir les assertions :
   * c'est de rendre le jeu d'essai RÉEL.
   */
  // ⚠ `depot.valider` AJOUTÉE le 13 septembre : sans elle, `/depots-a-valider`
  // rendait sa branche de REFUS et les invariants mesuraient une page vide.
  const PERSONNELLES = [...ADMIN, 'depot.deposer', 'encadrements.voir', 'depot.valider'];
  const REPONSES_PERSONNELLES = {
    ...REPONSES,
    /**
   * ⚠ AJOUTÉES LE 13 SEPTEMBRE 2026, ET C'EST LA MÊME FAUTE QUE L'APRÈS-MIDI.
   *
   * Les trois écrans de dépôt étaient dans la table des adresses, donc balayés
   * par les invariants — et SANS DONNÉES. Ils rendaient leur état de chargement :
   * un titre, une phrase, zéro carte, zéro bouton. « Tout élément interactif a
   * un nom » passait en ne mesurant AUCUN élément.
   *
   * Trouvé cette fois en posant la question — « sur quelle branche le test
   * s'exécute-t-il ? » — et non par un contrôle négatif. C'est la leçon du
   * jeu d'essai qui n'atteint pas le code mesuré, prise par le bon bout.
   */
  '/depots/soumis': [
    {
      id: 'ds1',
      title: 'Contentieux foncier et médiation coutumière',
      authorName: 'Traoré, Awa',
      documentType: 'these',
      submittedAt: '2026-06-10T00:00:00.000Z',
      directorId: 'u-zongo',
      directeur: 'Pauline Zongo',
      joursDepuisSoumission: 94,
    },
  ],
  '/depots/a-cataloguer': [
    {
      id: 'dc1',
      title: 'Le régime foncier coutumier en zone périurbaine',
      authorName: 'Ouédraogo, Salif',
      documentType: 'memoire',
      year: 2026,
      fileName: 'memoire.pdf',
      decidedAt: '2026-09-12T00:00:00.000Z',
    },
  ],
  '/depots/a-valider': [
    {
      id: 'dv1',
      status: 'soumis',
      title: 'Théâtre populaire et transmission orale',
      authorName: 'Sirima, Salif',
      documentType: 'memoire',
      year: 2025,
      fileName: 'memoire.pdf',
      submittedAt: '2026-09-01T00:00:00.000Z',
    },
  ],
  '/depots/mes-depots': [],
    '/encadrements/miens': {
      ficheLiee: true,
      nomDeLaFiche: 'Zongo, Pauline',
      total: 1,
      page: 1,
      totalPages: 1,
      encadrements: [
        {
          recordId: 'r-1',
          titre: 'Le régime foncier coutumier',
          type: 'these',
          annee: 2025,
          etudiant: 'Ouédraogo, Salif',
          universiteDeSoutenance: 'Université Joseph Ki-Zerbo',
        },
      ],
    },
  };
  const monterSeul = (a: Adresse) =>
    monterEcran(a, {
      fonctions: PERSONNELLES,
      modules: [...TOUS],
      reponses: REPONSES_PERSONNELLES,
    });

  it('témoin — la table en déclare bien (sinon ce bloc ne mesure rien)', () => {
    // ⚠ Un `it.each([])` ne lève pas : il n'engendre simplement AUCUN test, et
    // la suite reste verte. Ce témoin est ce qui empêche ce bloc d'être creux.
    expect(ADRESSES_HORS_COQUE.length).toBeGreaterThan(0);
  });

  it.each(ADRESSES_HORS_COQUE)('%s — un repère principal, et le lien qui y mène', async (adresse) => {
    monterSeul(adresse);
    await repos();
    const mains = document.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    const evitement = screen.getByRole('link', { name: LIBELLES.accessibilite.allerAuContenu });
    expect(evitement.getAttribute('href')).toBe(`#${mains[0].id}`);
    expect(mains[0].id).not.toBe('');
  });

  it.each(ADRESSES_HORS_COQUE)('%s — le lien d’évitement est le PREMIER au clavier', async (adresse) => {
    monterSeul(adresse);
    await repos();
    const focalisables = [...document.querySelectorAll('a[href], button, input, select, textarea')]
      .filter((e) => Number(e.getAttribute('tabindex') ?? 0) >= 0);
    expect(nomAccessible(focalisables[0])).toBe(LIBELLES.accessibilite.allerAuContenu);
  });

  /**
   * ⚠ AJOUTÉS LE 13 SEPTEMBRE 2026. Ces deux invariants étaient dans le bloc de
   * la COQUE, et n'ont jamais rien mesuré sur les écrans personnels.
   *
   * Or aucun des deux n'est une propriété de la coque : un bouton sans nom
   * accessible est un défaut partout, et une barre de navigation anonyme aussi
   * — l'en-tête que ces écrans portent EUX-MÊMES en contient.
   *
   * Trouvé en posant la question « sur quelle branche le test s'exécute-t-il ? »
   * puis, comme la réponse ne suffisait pas, par un contrôle négatif qui N'A PAS
   * tombé : un bouton rendu sans nom sur `/depots-a-valider` laissait la suite
   * verte. Le diagnostic n'était pas « l'écran ne rend rien » mais « aucun test
   * ne regarde ici ».
   */
  it.each(ADRESSES_HORS_COQUE)('%s — tout élément interactif a un nom', async (adresse) => {
    monterSeul(adresse);
    await repos();
    const anonymes = [...document.querySelectorAll('a[href], button')]
      .filter((e) => nomAccessible(e) === '')
      .map((e) => `${e.tagName.toLowerCase()} « ${e.outerHTML.slice(0, 60)} »`);
    expect(anonymes).toEqual([]);
  });

  it.each(ADRESSES_HORS_COQUE)('%s — chaque barre de navigation porte un nom distinct', async (adresse) => {
    monterSeul(adresse);
    await repos();
    const barres = [...document.querySelectorAll('nav')];
    const noms = barres.map((b) => b.getAttribute('aria-label') ?? '');
    expect(noms.filter((n) => n === '')).toEqual([]);
    expect(new Set(noms).size).toBe(noms.length);
  });
});
