/**
 * L'état de l'index de recherche, sur l'écran d'interopérabilité.
 *
 * ⚠ TROIS PIÈGES NOMMÉS D'AVANCE PAR LA SESSION BACK, et ce fichier existe pour
 * eux. Aucun ne se voit à l'écran en développement : Meilisearch répond, l'index
 * est aligné, et les trois cas dangereux ne se produisent jamais. Les provoquer
 * demanderait d'arrêter un conteneur que l'autre session partage — donc ils se
 * tiennent ici, ou nulle part.
 *
 * 1. `indisponible` ne s'écrit JAMAIS « 0 sur 8 000 ». Le moteur ne répond pas :
 *    on ne sait pas ce qu'il contient. Écrire zéro fabriquerait l'invitation à
 *    réindexer que toute la route existe pour éviter — et reconstruire un index
 *    qu'on croit vide alors qu'il est seulement injoignable, c'est le détruire.
 * 2. L'écart est SIGNÉ : positif, des notices manquent à l'index ; négatif,
 *    l'index porte des documents que la base n'a plus. Les deux appellent la
 *    même réparation mais ne décrivent pas le même incident, et un « écart de
 *    12 » sans son sens laisse croire au premier quand c'est le second.
 * 3. `dansIndex` vaut `null` quand le moteur est injoignable, jamais 0.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession } from './aide-session';
import { monterEcran } from './aide-ecran';

vi.mock('next/navigation', async () => (await import('./aide-navigation')).navigationDeTest());

const TOUT = ['document.lire', 'diffusion.gerer', 'catalogue.gerer'];
const SANS_CATALOGUE = ['document.lire', 'diffusion.gerer'];

const monter = (fonctions: string[], sante: unknown) =>
  monterEcran('/admin/interoperabilite', {
    fonctions,
    modules: ['amendes', 'interoperabilite', 'rappels'],
    reponses: {
      '/cataloging/index-sante': sante,
      '/oai/sources': [],
      '/interoperabilite': {},
    },
  });

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Santé de l’index', () => {
  it('aligné : il le dit, et sans ton d’alerte', async () => {
    monter(TOUT, { etat: 'aligne', enBase: 8000, dansIndex: 8000, ecart: 0 });
    const ligne = await screen.findByText(LIBELLES.indexSante.aligne(8000));
    // ⚠ Un état normal annoncé comme une alerte apprend à ignorer les alertes.
    expect(ligne.getAttribute('role')).toBeNull();
  });

  it('écart POSITIF : des notices manquent à l’index', async () => {
    monter(TOUT, { etat: 'derive', enBase: 8000, dansIndex: 7988, ecart: 12 });
    expect(await screen.findByText(LIBELLES.indexSante.manquantes(12, 8000))).toBeTruthy();
    expect(screen.queryByText(/ne correspondent plus/)).toBeNull();
  });

  it('écart NÉGATIF : l’index mène à des notices supprimées', async () => {
    monter(TOUT, { etat: 'derive', enBase: 8000, dansIndex: 8012, ecart: -12 });
    expect(await screen.findByText(LIBELLES.indexSante.fantomes(12))).toBeTruthy();
    // ⚠ Le piège : afficher « 12 notices absentes » dans ce cas serait l'exact
    // contraire de ce qui se passe, et enverrait chercher la mauvaise panne.
    expect(screen.queryByText(/absentes de l’index/)).toBeNull();
  });

  /**
   * ⚠ LE CAS QUI COMPTE LE PLUS. Le moteur ne répond pas : `dansIndex` et
   * `ecart` valent `null`. L'écran dit ce qu'il sait — le compte en base — et
   * dit qu'il ne sait pas le reste. Aucun zéro, aucune invitation à reconstruire.
   */
  it('indisponible : aucun chiffre d’index, aucune invitation à réindexer', async () => {
    monter(TOUT, { etat: 'indisponible', enBase: 8000, dansIndex: null, ecart: null });
    const ligne = await screen.findByText(LIBELLES.indexSante.indisponible(8000));
    const texte = ligne.textContent ?? '';
    // Le compte en base est dit ; aucun compte d'index ne l'est.
    expect(texte).toContain('8000');
    expect(texte).not.toMatch(/\b0\b/);
    expect(texte).not.toMatch(/0 sur/);
    // Et surtout : rien qui pousse au geste.
    expect(screen.queryByRole('button', { name: /réindex/i })).toBeNull();
    expect(texte).toMatch(/ne dit que l’index soit vide|pas le reconstruire/);
  });

  it('rien n’est affirmé avant la réponse', async () => {
    monterEcran('/admin/interoperabilite', {
      fonctions: TOUT,
      modules: ['amendes', 'interoperabilite', 'rappels'],
      reponses: { '/oai/sources': [], '/interoperabilite': {} },
    });
    expect(await screen.findByText(LIBELLES.indexSante.chargement)).toBeTruthy();
    expect(screen.queryByText(/notice\(s\) en base/)).toBeNull();
  });

  /**
   * ⚠ L'ÉCRAN S'OUVRE SUR `diffusion.gerer`, LA ROUTE EXIGE `catalogue.gerer`.
   * Quelqu'un peut donc voir la page sans droit sur ce bloc. On ne l'appelle
   * pas, et on n'affiche pas un échec : ce serait signaler une panne là où il y
   * a une permission.
   */
  it('sans catalogue.gerer : le bloc n’existe pas, et rien n’échoue', async () => {
    const { appels } = monter(SANS_CATALOGUE, null);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Interopérabilité/ })).toBeTruthy());
    expect(screen.queryByText(LIBELLES.indexSante.titre)).toBeNull();
    expect(screen.queryByText(LIBELLES.indexSante.echec)).toBeNull();
    expect(appels.some((u) => u.includes('index-sante'))).toBe(false);
  });
});

describe('Réindexation', () => {
  /**
   * ⚠ LE BOUTON N'EXISTE QU'EN ÉTAT « DERIVE », et les deux autres cas sont les
   * vrais tests. Sur « indisponible », proposer de reconstruire un index dont on
   * ignore le contenu serait l'invitation que toute la route existe pour éviter.
   * Sur « aligne », il n'y aurait rien à réparer.
   */
  it('état ALIGNÉ : pas de bouton', async () => {
    monter(TOUT, { etat: 'aligne', enBase: 8000, dansIndex: 8000, ecart: 0 });
    await screen.findByText(LIBELLES.indexSante.aligne(8000));
    expect(screen.queryByRole('button', { name: LIBELLES.indexSante.reindexer })).toBeNull();
  });

  it('état INDISPONIBLE : pas de bouton non plus', async () => {
    monter(TOUT, { etat: 'indisponible', enBase: 8000, dansIndex: null, ecart: null });
    await screen.findByText(LIBELLES.indexSante.indisponible(8000));
    expect(screen.queryByRole('button', { name: LIBELLES.indexSante.reindexer })).toBeNull();
  });

  it('état DÉRIVE : le bouton est là', async () => {
    monter(TOUT, { etat: 'derive', enBase: 8000, dansIndex: 7988, ecart: 12 });
    expect(
      await screen.findByRole('button', { name: LIBELLES.indexSante.reindexer }),
    ).toBeTruthy();
  });

  /**
   * ⚠ LA CONFIRMATION DIT LE COÛT RÉEL, ET CE N'EST PAS LA DURÉE : mesuré à
   * 0,5–0,8 s pour 8 000 notices. Ce qui coûte, c'est que l'index est VIDÉ
   * d'abord — pendant l'opération la recherche publique ne rend rien, et un
   * échec en chemin la laisse vide.
   */
  it('la confirmation annonce le vidage, pas une durée', async () => {
    monter(TOUT, { etat: 'derive', enBase: 8000, dansIndex: 7988, ecart: 12 });
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.indexSante.reindexer }));
    const boite = await screen.findByRole('group', {
      name: LIBELLES.indexSante.reindexerTitre,
    });
    const texte = boite.textContent ?? '';
    expect(texte).toMatch(/VIDÉ/);
    expect(texte).toMatch(/ne rend aucun résultat/);
    expect(texte).toContain('8000');
    // Aucune promesse de durée : elle dépend du serveur de l'école.
    expect(texte).not.toMatch(/minute|seconde|long/i);
    // Et le focus est allé sur la boîte — sinon le clavier n'apprend rien.
    await waitFor(() => expect(document.activeElement).toBe(boite));
  });

  /**
   * ⚠ TROUVÉ EN RECETTE, ET C'ÉTAIT CE BOUTON QUI LE PRODUISAIT. `reindexAll`
   * VIDE l'index puis le remplit, et Meilisearch indexe de façon ASYNCHRONE :
   * relire la santé dans la foulée tombe au milieu de la propagation. L'écran a
   * affiché « 8001 notice(s) absentes de l'index sur 8001 » une seconde après
   * une réindexation RÉUSSIE — mesuré, puis aligné à 8001/8001 dès la lecture
   * suivante.
   *
   * C'est exactement l'invitation à réindexer que cette route existe pour
   * éviter. Pendant l'attente, l'état est INCONNU : l'écran dit qu'il vérifie,
   * il n'affirme pas une dérive.
   */
  it('pendant la propagation : aucune dérive affirmée', async () => {
    monter(TOUT, { etat: 'derive', enBase: 8000, dansIndex: 7999, ecart: 1 });
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.indexSante.reindexer }));
    await screen.findByRole('group', { name: LIBELLES.indexSante.reindexerTitre });
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.indexSante.reindexerConfirmer }));

    await waitFor(() => expect(screen.getByText(LIBELLES.indexSante.chargement)).toBeTruthy());
    // ⚠ `queryBy*` : on affirme une absence, elle se constate.
    expect(screen.queryByText(/absentes de l’index/)).toBeNull();
    expect(screen.queryByText(/ne correspondent plus/)).toBeNull();
  });

  it('Échap annule, et rien n’est lancé', async () => {
    const { appels } = monter(TOUT, { etat: 'derive', enBase: 8000, dansIndex: 7988, ecart: 12 });
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.indexSante.reindexer }));
    const boite = await screen.findByRole('group', { name: LIBELLES.indexSante.reindexerTitre });
    fireEvent.keyDown(boite, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('group')).toBeNull());
    expect(appels.some((u) => u.includes('/cataloging/reindex'))).toBe(false);
  });
});
