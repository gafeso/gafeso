/**
 * Saisie des diapositives dans /admin/accueil.
 *
 * Trois règles que ce lot doit tenir, et qui se cassent en silence :
 *  - la limite de cinq se DIT dans l'interface, elle ne se découvre pas au refus ;
 *  - une image est OBLIGATOIRE, et son absence se voit avant l'enregistrement ;
 *  - AUCUN champ sans effet ne reste affiché — les trois champs historiques
 *    disparaissent dès qu'une liste existe, parce qu'ils n'agissent plus.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AccueilAdminPage from '@/app/admin/accueil/page';
import { MAX_DIAPOSITIVES } from '@/lib/hero-slides';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/accueil',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const T = LIBELLES.adminBandeau;

function contenu(identite: Record<string, unknown>) {
  return {
    content: {
      identity: {
        fullName: '', acronym: '', brandMark: '', subtitle: '', tagline: '',
        heroTitle: '', heroTitleAccent: '', lead: '', searchHint: '',
        logoUrl: null, heroImageUrl: null, heroImageKicker: '', heroImageCaption: '',
        heroSlides: [],
        ...identite,
      },
      stats: [], espaces: [], services: [],
      hours: { note: '', lines: [] }, resources: [],
      contact: { description: '', partnerNote: '', address: '', phones: '', email: '', socials: [], copyright: '' },
    },
    primaryColor: '#0F2B46', themeTokens: {}, latticeEnabled: false,
  };
}

function brancher(identite: Record<string, unknown> = {}) {
  ouvrirSession();
  // ⚠ LE TÉMOIN EST POSÉ PAR LA DOUBLURE : c'est ce qui rend l'attente
  // dépendante de la RÉPONSE. Un appelant qui fixe `fullName` lui-même passe sa
  // valeur à `attendreEcran`.
  const avecTemoin = 'fullName' in identite ? identite : { ...identite, fullName: TEMOIN_NOM };
  vi.stubGlobal('fetch', vi.fn((e: RequestInfo | URL) => {
    const url = String(e);
    const corps = url.includes('/auth/me/functions')
      ? { functions: ['etablissement.apparence'] }
      : contenu(avecTemoin);
    // ⚠ REPRODUCTION : 200 ms, comme un coureur de CI chargé.
    return new Promise<Response>((r) =>
      setTimeout(() => r({ ok: true, json: () => Promise.resolve(corps) } as Response), 200),
    );
  }));
}

/**
 * ⭐⭐ ON ATTEND UNE DONNÉE DE LA RÉPONSE, JAMAIS UN ÉLÉMENT STATIQUE.
 *
 * ## 🔴 CE QUE CET AUXILIAIRE FAISAIT, et ce que la CI a montré
 *
 * Il attendait `findByText(T.titre)` — le titre, présent dès le PREMIER rendu.
 * Il résolvait donc avant que le `fetch` ne réponde, et les six cas qui lisent
 * des valeurs lisaient un écran VIDE.
 *
 * ⚠ Sur nos machines, la doublure résolvait dans le même tour de boucle : les
 * douze cas passaient. Le coureur de la CI est plus lent, et c'est tout — le
 * DOM capturé là-bas montrait `value=""` partout et aucune diapositive.
 *
 * > ⭐ **Un test qui attend un élément présent au premier rendu n'attend rien.**
 * > C'est « le signal d'ATTENTE d'un test ne doit jamais être indépendant de ce
 * > qu'il mesure », pris par l'autre bout : ici le signal est indépendant de la
 * > réponse, donc il ne signale pas son arrivée.
 *
 * ## ⭐ CE QU'IL ATTEND MAINTENANT
 *
 * `findByDisplayValue` d'une valeur que SEULE la doublure peut produire. Tant
 * que la réponse n'est pas arrivée, cette valeur n'existe nulle part — et
 * depuis le correctif du produit, le formulaire lui-même n'existe pas encore.
 *
 * ⚠ La valeur est passée par l'appelant quand il remplace l'identité, sinon le
 * défaut `TEMOIN_NOM` sert : une chaîne qu'aucun rendu initial ne porte.
 */
const TEMOIN_NOM = 'Université témoin de chargement';

const attendreEcran = (valeur: string = TEMOIN_NOM) => screen.findByDisplayValue(valeur);

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe('limite de diapositives', () => {
  it('la limite est ANNONCÉE avant d’être atteinte', async () => {
    brancher();
    render(<AccueilAdminPage />);
    await attendreEcran();
    // Le nombre est écrit dès l'ouverture, pas au moment du refus.
    expect(screen.getByText(T.limite(MAX_DIAPOSITIVES))).toBeInTheDocument();
  });

  it('à cinq diapositives, le bouton d’ajout disparaît et la limite se redit', async () => {
    const cinq = Array.from({ length: MAX_DIAPOSITIVES }, (_, i) => ({
      imageUrl: `https://ex.bf/${i}.jpg`, titre: '', surtitre: '',
    }));
    brancher({ heroSlides: cinq });
    render(<AccueilAdminPage />);
    await attendreEcran();

    expect(screen.queryByRole('button', { name: T.ajouter })).toBeNull();
    expect(screen.getByText(T.limiteAtteinte(MAX_DIAPOSITIVES))).toBeInTheDocument();
  });

  it('en dessous de la limite, on peut ajouter', async () => {
    brancher({ heroSlides: [{ imageUrl: 'https://ex.bf/1.jpg', titre: '', surtitre: '' }] });
    render(<AccueilAdminPage />);
    await attendreEcran();
    expect(screen.getByRole('button', { name: T.ajouter })).toBeInTheDocument();
  });
});

describe('image obligatoire', () => {
  it('une diapositive sans image le SIGNALE, sans attendre l’enregistrement', async () => {
    brancher({ heroSlides: [{ imageUrl: '', titre: 'Un titre', surtitre: '' }] });
    render(<AccueilAdminPage />);
    await attendreEcran();
    expect(screen.getByRole('alert')).toHaveTextContent(T.imageObligatoire);
  });

  it('avec une image, aucun signalement', async () => {
    brancher({ heroSlides: [{ imageUrl: 'https://ex.bf/1.jpg', titre: '', surtitre: '' }] });
    render(<AccueilAdminPage />);
    await attendreEcran();
    expect(screen.queryByText(T.imageObligatoire)).toBeNull();
  });
});

describe('l’ordre est écrit, pas deviné', () => {
  it('la première diapositive porte la mention « affichée sur téléphone »', async () => {
    brancher({
      heroSlides: [
        { imageUrl: 'https://ex.bf/1.jpg', titre: 'A', surtitre: '' },
        { imageUrl: 'https://ex.bf/2.jpg', titre: 'B', surtitre: '' },
      ],
    });
    render(<AccueilAdminPage />);
    await attendreEcran();
    // Une seule fois : c'est la PREMIÈRE, pas « chacune ».
    expect(screen.getAllByText(T.premiereMobile)).toHaveLength(1);
    expect(screen.getByText(T.ordreCompte)).toBeInTheDocument();
  });
});

describe('aucun champ sans effet ne reste affiché', () => {
  it('sans liste, l’ancienne image est proposée à la reprise', async () => {
    brancher({ heroImageUrl: 'https://ex.bf/vieille.jpg', heroImageCaption: 'Légende', heroImageKicker: 'SUR' });
    render(<AccueilAdminPage />);
    await attendreEcran();
    expect(screen.getByText(T.ancienneTitre)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.ancienneReprendre })).toBeInTheDocument();
    // Et surtout : elle n'est PAS présentée comme inactive, puisqu'elle agit.
    expect(screen.queryByText(T.ancienneInactiveTitre)).toBeNull();
  });

  it('dès qu’une liste existe, l’ancienne image n’est plus un CHAMP mais un fait', async () => {
    brancher({
      heroImageUrl: 'https://ex.bf/vieille.jpg',
      heroImageCaption: 'Légende',
      heroImageKicker: 'SUR',
      heroSlides: [{ imageUrl: 'https://ex.bf/1.jpg', titre: '', surtitre: '' }],
    });
    render(<AccueilAdminPage />);
    await attendreEcran();

    // ⚠ LE CŒUR DU LOT : plus aucun champ éditable pour les trois historiques.
    expect(screen.queryByLabelText('Sur-titre de la photo')).toBeNull();
    expect(screen.queryByLabelText('Légende de la photo')).toBeNull();
    expect(screen.queryByLabelText('Photo du hero')).toBeNull();
    // Leur existence est DITE, et leur suppression laissée à un geste explicite.
    expect(screen.getByText(T.ancienneInactiveTitre)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.ancienneSupprimer })).toBeInTheDocument();
  });

  it('la reprise est NON DESTRUCTIVE : elle copie, elle ne perd rien', async () => {
    brancher({ heroImageUrl: 'https://ex.bf/vieille.jpg', heroImageCaption: 'Légende', heroImageKicker: 'SUR' });
    render(<AccueilAdminPage />);
    await attendreEcran();

    fireEvent.click(screen.getByRole('button', { name: T.ancienneReprendre }));
    await waitFor(() => expect(screen.getByText(T.diapositive(1))).toBeInTheDocument());
    // Les textes de l'ancienne configuration sont repris, pas jetés.
    expect(screen.getByDisplayValue('Légende')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SUR')).toBeInTheDocument();
  });
});

/**
 * Valeurs par défaut du produit — affichées, JAMAIS enregistrées.
 *
 * Un défaut posé en VALEUR serait enregistré au premier « Enregistrer » et
 * deviendrait le texte de l'établissement sans qu'il l'ait écrit. Il le
 * retrouverait un jour dans son formulaire sans savoir d'où il vient — et il
 * ne pourrait plus le distinguer de sa propre saisie.
 */
describe('valeurs par défaut du produit', () => {
  it('sont proposées en INDICATION de saisie, jamais en valeur', async () => {
    brancher();
    render(<AccueilAdminPage />);
    await attendreEcran();

    for (const defaut of [
      LIBELLES.defauts.accroche,
      LIBELLES.defauts.presentation,
      LIBELLES.defauts.indiceRecherche,
    ]) {
      const champ = screen.getByPlaceholderText(defaut);
      // Le cœur de la règle : l'indication est là, la valeur reste vide.
      expect((champ as HTMLInputElement).value).toBe('');
    }
  });

  it('ne concernent QUE des textes vrais pour toute bibliothèque', () => {
    // Rien de propre à l'établissement n'a de défaut : ni nom, ni contact, ni
    // adresse, ni image. Absent plutôt que faux.
    expect(Object.keys(LIBELLES.defauts).sort()).toEqual([
      'accroche',
      'indiceRecherche',
      'presentation',
    ]);
  });

  it('n’affirment aucun chiffre', () => {
    // « plus de 10 000 références » serait une affirmation, pas un défaut :
    // fausse pour la bibliothèque qui démarre, et invérifiable pour nous.
    for (const texte of Object.values(LIBELLES.defauts)) {
      expect(texte, texte).not.toMatch(/\d/);
    }
  });
});

/**
 * ⭐⭐ AUCUN FORMULAIRE MODIFIABLE AVANT LES DONNÉES — et c'est un défaut de
 * PRODUIT, pas de test.
 *
 * ## 🔴 CE QU'IL POUVAIT COÛTER
 *
 * L'écran rendait son formulaire dès le premier rendu, alimenté par
 * `EMPTY_CONTENT` : « Nom complet » à `""`, aucune diapositive, et
 * « Enregistrer » ACTIF. Un administrateur sur une connexion lente pouvait
 * donc écrire ces vides par-dessus la configuration de son école.
 *
 * > ⚠ **Le faux n'était pas seulement affiché : il était ENREGISTRABLE.** C'est
 * > « une non-réponse écrite comme un fait » dans sa forme la plus chère — un
 * > zéro affiché se corrige au rechargement, une page d'accueil effacée ne se
 * > retrouve pas.
 *
 * ## ⚠ ET C'EST LA CI QUI L'A TROUVÉ, pas une relecture
 *
 * Son coureur est plus lent que nos machines : six cas lisaient l'écran avant
 * la réponse, et le DOM capturé là-bas montrait `value=""` partout. Le test
 * était faux ET le produit l'était — et c'est le produit qui coûtait.
 */
describe('⭐⭐ pendant le chargement, rien n’est enregistrable', () => {
  /** Une doublure qu'on résout À LA MAIN : c'est le seul moyen d'observer l'attente. */
  function brancherEnAttente(identite: Record<string, unknown> = {}) {
    ouvrirSession();
    let resoudre: (() => void) | null = null;
    const pret = new Promise<void>((r) => {
      resoudre = r;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (e: RequestInfo | URL) => {
        const url = String(e);
        if (url.includes('/auth/me/functions')) {
          return { ok: true, json: async () => ({ functions: ['etablissement.apparence'] }) } as Response;
        }
        await pret;
        return {
          ok: true,
          json: async () => contenu({ fullName: TEMOIN_NOM, ...identite }),
        } as Response;
      }),
    );
    return () => resoudre?.();
  }

  it('⭐ réponse retardée : aucun « Enregistrer », aucun champ modifiable', async () => {
    const livrer = brancherEnAttente();
    render(<AccueilAdminPage />);

    /*
     * ⚠ ON ATTEND UNE ANCRE QUI DOIT ÊTRE LÀ avant d'affirmer une absence. Une
     * assertion d'absence posée trop tôt passe toujours — « il faut d'abord
     * attendre quelque chose qui, lui, DOIT y être ».
     */
    /*
     * ⚠ LE LIBELLÉ PROPRE À L'ÉCRAN A DISPARU AVEC LA MIGRATION, et c'est voulu :
     * `FormulaireCharge` rend un « Chargement… » partagé PLUS le motif, qui est
     * le seul texte qui apprenne quelque chose. Garder « Chargement de la
     * configuration… » aurait demandé de maintenir un libellé qu'aucun écran
     * n'affiche — un libellé sans lecteur, tenu en vie par un test.
     */
    await screen.findByText(LIBELLES.formulaireCharge.chargement);

    /*
     * ⚠ `queryAllByRole` ET NON `queryByRole` : le formulaire chargé porte DEUX
     * « Enregistrer », en haut et en bas — il est long.
     *
     * ⭐ Et cette duplication-là est LÉGITIME, contrairement aux deux
     * « Annuler » qu'un test a refusé de départager en septembre : les deux
     * boutons soumettent le MÊME formulaire, donc un lecteur d'écran qui entend
     * « Enregistrer » deux fois n'a aucun choix à faire. Ce qui est ambigu,
     * c'est deux noms identiques pour deux ACTIONS différentes.
     */
    expect(
      screen.queryAllByRole('button', { name: /enregistrer/i }),
      '⚠ « Enregistrer » est présent avant les données : un clic écraserait la ' +
        'page d’accueil avec des vides',
    ).toHaveLength(0);
    /*
     * ⚠ AUCUN CHAMP, et on le compte sur le DOM entier : un champ désactivé
     * serait déjà mieux, mais un champ VIDE se lit comme une valeur — et c'est
     * le faux qu'on évite.
     */
    expect(document.querySelectorAll('input, textarea, select')).toHaveLength(0);
    // ⚠ Et l'écran DIT pourquoi : un titre seul se lirait comme une page cassée.
    expect(screen.getByText(LIBELLES.accueilAdmin.chargementMotif)).toBeInTheDocument();

    /* ── puis les données arrivent ── */
    livrer();
    await screen.findByDisplayValue(TEMOIN_NOM);
    const enregistrer = screen.getAllByRole('button', { name: /enregistrer/i });
    expect(enregistrer.length, 'le formulaire long en porte deux').toBeGreaterThan(0);
    for (const b of enregistrer) expect(b).toBeEnabled();
    expect(document.querySelectorAll('input, textarea, select').length).toBeGreaterThan(5);
  });

  /**
   * ⚠ ET UN ÉCHEC DE CHARGEMENT NE BLOQUE PAS SUR « Chargement… ». Sans ce cas,
   * la correction remplacerait un formulaire dangereux par une attente sans
   * fin — « une prudence qui annule sa propre raison d'être ».
   */
  it('⚠ un échec de chargement AFFICHE l’erreur, il n’attend pas indéfiniment', async () => {
    ouvrirSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (e: RequestInfo | URL) =>
        String(e).includes('/auth/me/functions')
          ? ({ ok: true, json: async () => ({ functions: ['etablissement.apparence'] }) } as Response)
          : ({ ok: false, status: 500, json: async () => ({ message: 'Panne' }) } as Response),
      ),
    );
    render(<AccueilAdminPage />);
    await screen.findByText(/Panne|Chargement impossible/i);
    expect(screen.queryByText(LIBELLES.formulaireCharge.chargement)).toBeNull();
  });
});
