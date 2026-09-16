/**
 * ⚠ CE QUE LE LECTEUR APPREND QUAND SA RÉSERVATION EST MISE DE CÔTÉ.
 *
 * *Trouvé et corrigé le 15 septembre 2026, en cherchant pourquoi le MOMENT 4 du
 * script de démonstration ne pouvait pas se jouer.*
 *
 * L'écran disait : « Un exemplaire vous est mis de côté : passez le retirer au
 * comptoir. » Sans l'ÉCHÉANCE, et sans savoir si la confirmation était partie.
 * L'API rend pourtant `pickupDays` ET `nonPrevenus` sur la pose de réservation ;
 * le type du front ne déclarait ni l'un ni l'autre.
 *
 * ⚠ C'EST « UNE MOITIÉ LIVRÉE N'EST PAS UNE CORRECTION ». Le guichet a été
 * branché sur `nonPrevenus` le 14 septembre — le côté qui RAPPORTE. Le côté qui
 * LIT, pour la seule personne qui perd quelque chose, est resté muet un jour de
 * plus. Le signe qui le désigne à coup sûr : le champ est SERVI et absent du
 * TYPE du front.
 *
 * ⚠ ET C'EST LA CHAÎNE DES DEUX SILENCES, vue du lecteur : le courriel échoue
 * sans bruit, l'écran ne dit pas l'échéance — et le document repart à la
 * personne suivante sans que celui qui l'attendait ait jamais rien su.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FicheNotice } from '@/app/opac/[id]/fiche-notice';
import { LIBELLES } from '@/lib/libelles';

vi.mock('@/lib/session', () => ({
  getUser: () => ({ id: 'u1', email: 'awa@exemple.bf', role: 'STUDENT' }),
  getToken: () => 'jeton',
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'r1' }),
  usePathname: () => '/opac/r1',
  useRouter: () => routeur,
  useSearchParams: () => new URLSearchParams(),
}));
const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };

const BASE = {
  id: 'r1',
  title: 'Photographie sociale — travaux dirigés',
  titleComplement: null,
  author: 'Traoré, Awa',
  contributors: [],
  isbn: null,
  publishYear: 2024,
  language: 'fr',
  category: 'arts',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  summary: null,
  keywords: [],
  items: [],
  digitalCopy: null,
  membersOnly: false,
  availability: { totalItems: 2, available: 0, borrowable: false },
};

const T = LIBELLES.reservations;

/** La réponse de `POST /reader/holds`, telle que l'API la rend. */
function monter(reponse: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/reader/holds') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(reponse) } as Response);
      }
      // Tout le reste ne répond jamais : on mesure le rendu initial, pas un
      // chargement — et un oubli de doublure ne doit pas se déguiser en défaut.
      return new Promise<Response>(() => {});
    }),
  );
  return render(<FicheNotice initial={BASE as never} />);
}

afterEach(() => vi.unstubAllGlobals());

const reserver = () => screen.getByRole('button', { name: /Réserver ce document/i });

describe('un exemplaire mis de côté', () => {
  it('⚠ l’écran DIT le délai de retrait', async () => {
    monter({ readyForPickup: true, queuePosition: 1, pickupDays: 7, nonPrevenus: [] });
    reserver().click();
    await waitFor(() => expect(screen.getByText(T.misDeCoteAvecDelai(7))).toBeTruthy());
  });

  it('⚠ sans délai servi, il n’en invente pas', async () => {
    // Trois états, pas deux. Une échéance inventée est pire que pas d'échéance :
    // elle se retient, et elle est fausse.
    monter({ readyForPickup: true, queuePosition: 1, nonPrevenus: [] });
    reserver().click();
    await waitFor(() => expect(screen.getByText(T.misDeCoteSansDelai)).toBeTruthy());
  });

  it('⚠ courriel NON PARTI : l’écran le dit, dans la même phrase', async () => {
    // C'est le cas qui ferme la porte. Sans cette phrase, la personne attend un
    // courriel qui ne viendra jamais et laisse expirer ce qu'elle a réservé.
    monter({
      readyForPickup: true,
      queuePosition: 1,
      pickupDays: 7,
      nonPrevenus: [{ holdId: 'h1', titre: 'Photographie sociale', motif: 'smtp_absent' }],
    });
    reserver().click();
    await waitFor(() =>
      expect(screen.getByText(new RegExp(T.confirmationNonEnvoyee.slice(0, 40)))).toBeTruthy(),
    );
  });

  it('⚠ témoin INVERSÉ : courriel parti, on n’inquiète personne', async () => {
    // Sans lui, afficher l'avertissement POUR TOUT LE MONDE passerait le cas
    // ci-dessus — et le produit annoncerait un échec qui n'a pas eu lieu.
    monter({ readyForPickup: true, queuePosition: 1, pickupDays: 7, nonPrevenus: [] });
    reserver().click();
    await waitFor(() => expect(screen.getByText(T.misDeCoteAvecDelai(7))).toBeTruthy());
    expect(screen.queryByText(new RegExp(T.confirmationNonEnvoyee.slice(0, 40)))).toBeNull();
  });
});

describe('une place dans la file', () => {
  it('la position est dite, et aucune échéance ne l’est', async () => {
    // Rien n'est mis de côté : une date de retrait n'aurait aucun sens.
    monter({ readyForPickup: false, queuePosition: 3 });
    reserver().click();
    await waitFor(() => expect(screen.getByText(/position 3 dans la file/)).toBeTruthy());
    expect(screen.queryByText(new RegExp(T.confirmationNonEnvoyee.slice(0, 40)))).toBeNull();
  });
});

describe('⚠ ce que le texte DOIT dire', () => {
  it('« confirmation non envoyée » annonce l’ABSENCE et donne une suite', () => {
    // Assertion de PROPRIÉTÉ, séparée de son emploi : lire la constante à
    // l'écran teste qu'on affiche la bonne variable, jamais ce qu'elle dit.
    const texte = T.confirmationNonEnvoyee;
    expect(texte, 'doit dire que le courriel n’arrivera pas').toMatch(/pas pu|n’arrivera|ne .{0,12}retrouverez/i);
    expect(texte, 'doit donner une suite : retenir, ou demander').toMatch(/notez|demandez/i);
    expect(texte, 'et ne doit pas promettre un nouvel envoi').not.toMatch(/renvoy|réessay/i);
  });

  it('le délai de retrait s’accorde en nombre', () => {
    expect(T.misDeCoteAvecDelai(1)).toContain('1 jour ');
    expect(T.misDeCoteAvecDelai(7)).toContain('7 jours');
  });
});
