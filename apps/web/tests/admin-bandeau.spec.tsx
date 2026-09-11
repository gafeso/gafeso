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
  vi.stubGlobal('fetch', vi.fn((e: RequestInfo | URL) => {
    const url = String(e);
    const corps = url.includes('/auth/me/functions')
      ? { functions: ['etablissement.apparence'] }
      : contenu(identite);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(corps) } as Response);
  }));
}

const attendreEcran = () => screen.findByText(T.titre);

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
