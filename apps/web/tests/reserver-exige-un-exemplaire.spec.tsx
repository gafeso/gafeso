/**
 * ⚠ « RÉSERVER » N'APPARAÎT PAS SUR UNE NOTICE SANS EXEMPLAIRE.
 *
 * Décision de Jean, 15 septembre 2026. Trois motifs, et le troisième est le
 * plus lourd :
 *
 * 1. Un document purement NUMÉRIQUE ne se réserve pas — il se lit ou il ne se
 *    lit pas. Une file d'attente sur un fichier n'a aucun sens.
 * 2. Une notice sans exemplaire n'est pas « en attente d'acquisition », c'est
 *    une notice sans exemplaire. Rien ne permet de distinguer les deux — la
 *    date d'acquisition n'est même pas enregistrée, c'est une réserve écrite en
 *    tête du rapport annuel.
 * 3. ⚠ Une file qui ne peut JAMAIS se vider est un FAUX DISPOSITIF : le lecteur
 *    croit avoir une place dans une file, et il n'en a pas.
 *
 * ⚠ CE QUI ÉTAIT FAUX. La condition était `!borrowable` — vraie aussi quand il
 * n'y a AUCUN exemplaire. Mesuré : 139 notices sur 480 sont dans ce cas, dont
 * 20 avec une copie numérique et 119 sans rien du tout.
 *
 * ⚠ ET PAS UN BOUTON GRISÉ. Un bouton désactivé se lit comme une panne, et un
 * lecteur d'écran n'annonce qu'« bouton, non disponible ». La phrase prend sa
 * place et dit ce qui EST.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FicheNotice } from '@/app/opac/[id]/fiche-notice';
import { LIBELLES } from '@/lib/libelles';

/**
 * ⚠ UNE SESSION EST NÉCESSAIRE POUR VOIR LE BOUTON, et je l'avais oublié : sans
 * elle, la fiche propose « connectez-vous pour réserver » au lieu du bouton, et
 * mon témoin inversé tombait en accusant le produit. Troisième fois aujourd'hui
 * qu'une doublure incomplète fait échouer un test sur du code juste.
 */
vi.mock('@/lib/session', () => ({
  getUser: () => ({ id: 'u1', email: 'awa@exemple.bf', role: 'STUDENT' }),
  getToken: () => 'jeton',
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'r1' }),
  usePathname: () => '/opac/r1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const BASE = {
  id: 'r1',
  title: 'Sécurité des systèmes — actes du colloque',
  titleComplement: null,
  author: 'Sanogo, Alain',
  contributors: [],
  isbn: null,
  publishYear: 2025,
  language: 'fr',
  category: 'informatique',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  summary: null,
  keywords: [],
  items: [],
  digitalCopy: null,
  membersOnly: false,
};

/** ⚠ Le réseau ne répond jamais : on mesure le rendu SERVEUR, pas un chargement. */
function monter(availability: { totalItems: number; available: number; borrowable: boolean }) {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  return render(<FicheNotice initial={{ ...BASE, availability } as never} />);
}

afterEach(() => vi.unstubAllGlobals());

const bouton = () => screen.queryByRole('button', { name: /Réserver ce document/i });

describe('⚠ aucun exemplaire : pas de réservation, et on dit pourquoi', () => {
  it('le bouton n’apparaît pas', () => {
    monter({ totalItems: 0, available: 0, borrowable: false });
    expect(bouton()).toBeNull();
  });

  it('⚠ et il n’est pas remplacé par un bouton GRISÉ', () => {
    // Un bouton désactivé se lit comme une panne. Il ne doit pas exister du
    // tout — c'est la règle du dépôt : pas de bouton sans effet.
    monter({ totalItems: 0, available: 0, borrowable: false });
    const grises = [...document.querySelectorAll('button')].filter((b) =>
      /Réserver/i.test(b.textContent ?? ''),
    );
    expect(grises).toEqual([]);
  });

  it('la phrase dit POURQUOI, en toutes lettres', () => {
    monter({ totalItems: 0, available: 0, borrowable: false });
    expect(screen.getByText(LIBELLES.ficheNotice.sansExemplaire)).toBeTruthy();
  });
});

describe('⚠ des exemplaires existent mais aucun n’est libre : la file a un sens', () => {
  it('le bouton est là — c’est le cas que la réservation sert', () => {
    // ⚠ TÉMOIN INVERSÉ, et il est indispensable : sans lui, retirer la
    // réservation POUR TOUT LE MONDE passerait les trois cas ci-dessus, et
    // plus personne ne pourrait réserver quoi que ce soit.
    monter({ totalItems: 3, available: 0, borrowable: false });
    expect(bouton()).toBeTruthy();
  });

  it('et la phrase « aucun exemplaire » ne s’affiche PAS', () => {
    monter({ totalItems: 3, available: 0, borrowable: false });
    expect(screen.queryByText(LIBELLES.ficheNotice.sansExemplaire)).toBeNull();
  });
});

describe('un exemplaire est empruntable : ni bouton ni phrase', () => {
  it('rien n’est proposé — on va le chercher en rayon', () => {
    monter({ totalItems: 3, available: 2, borrowable: true });
    expect(bouton()).toBeNull();
    expect(screen.queryByText(LIBELLES.ficheNotice.sansExemplaire)).toBeNull();
  });
});

describe('Ce que le texte DOIT dire', () => {
  it('⚠ il nomme l’EXEMPLAIRE physique, pas une indisponibilité vague', () => {
    // « Document indisponible » se lirait « revenez plus tard » — or il n'y a
    // rien à attendre. La phrase doit fermer la porte, pas la laisser
    // entrouverte.
    expect(LIBELLES.ficheNotice.sansExemplaire).toMatch(/exemplaire/i);
    expect(LIBELLES.ficheNotice.sansExemplaire).toMatch(/physique/i);
    expect(LIBELLES.ficheNotice.sansExemplaire).not.toMatch(/bientôt|plus tard|attente/i);
  });
});

/**
 * ⚠ LE BADGE CONNAISSAIT DEUX ÉTATS LÀ OÙ LA FICHE EN DISTINGUE TROIS.
 *
 * Trouvé le 16 septembre 2026 en recettant LE PARCOURS du 21 — pas l'écran. Sur
 * la notice du MOMENT 3 (purement numérique), le badge en tête disait
 * « Indisponible » pendant que le bloc de lecture en ligne s'affichait vingt
 * lignes plus bas. Deux phrases de la même page qui se contredisent.
 *
 * ⭐ La distinction existait DÉJÀ dans le corps de la fiche — `totalItems === 0`
 * d'un côté, « des exemplaires mais aucun libre » de l'autre. C'est le badge
 * qui collapsait les deux, en tête, là où on lit en premier.
 */
describe('⚠ le badge de disponibilité porte les TROIS états, comme le corps de la fiche', () => {
  const badge = () =>
    [LIBELLES.ficheNotice.badgeDisponible, LIBELLES.ficheNotice.badgeIndisponible, LIBELLES.ficheNotice.badgeSansExemplaire]
      .filter((t) => screen.queryAllByText(t).length > 0);

  it('aucun exemplaire : « sans exemplaire », jamais « indisponible »', () => {
    monter({ totalItems: 0, available: 0, borrowable: false });
    expect(badge()).toEqual([LIBELLES.ficheNotice.badgeSansExemplaire]);
  });

  it('des exemplaires, aucun libre : « indisponible » — et c’est vrai', () => {
    monter({ totalItems: 3, available: 0, borrowable: false });
    expect(badge()).toEqual([LIBELLES.ficheNotice.badgeIndisponible]);
  });

  it('un exemplaire libre : « disponible »', () => {
    monter({ totalItems: 3, available: 1, borrowable: true });
    expect(badge()).toEqual([LIBELLES.ficheNotice.badgeDisponible]);
  });

  it('⚠ et le badge ne contredit plus la phrase du dessous', () => {
    // La contradiction mesurée à l'écran : « Indisponible » en tête, « aucun
    // exemplaire physique » plus bas, et la lecture en ligne offerte.
    monter({ totalItems: 0, available: 0, borrowable: false });
    expect(screen.getByText(LIBELLES.ficheNotice.sansExemplaire)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.ficheNotice.badgeIndisponible)).toBeNull();
  });

  it('témoin — les trois libellés sont DISTINCTS, sinon ce test ne mesure rien', () => {
    const trois = [
      LIBELLES.ficheNotice.badgeDisponible,
      LIBELLES.ficheNotice.badgeIndisponible,
      LIBELLES.ficheNotice.badgeSansExemplaire,
    ];
    expect(new Set(trois).size).toBe(3);
  });
});
