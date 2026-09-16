/**
 * ⚠ ACCÈS REFUSÉ : PAS DE BOUTON GRISÉ, LA PHRASE PREND SA PLACE.
 *
 * *Trouvé en recette le 16 septembre 2026, avec la vraie session `awa@` — celle
 * du MOMENT 2 du script, la promesse centrale du produit.*
 *
 * La fiche rendait un `<p>` MAQUILLÉ EN BOUTON : mêmes formes, même taille,
 * grisé, portant `aria-disabled="true"`, au-dessus de « Réservé aux étudiants
 * de L1_INFO ». C'est exactement ce que ce produit a tranché trois jours plus
 * tôt sur « Réserver ce document » — **pas un bouton grisé : il n'existe pas.**
 * Un bouton désactivé se lit comme une panne, et sur l'écran qui porte la
 * promesse du produit, il la retourne : on croit voir une fonction cassée là où
 * il y a une règle d'accès qui fonctionne.
 *
 * ⚠ Et l'`aria-disabled` sur un `<p>` ne disait rien à personne : un paragraphe
 * n'est pas focalisable, donc jamais atteint au clavier. L'attribut rassurait
 * celui qui l'a écrit.
 *
 * ⚠ CE QUI RESTE, parce qu'il INFORME et n'appelle aucun geste : le refus, et
 * sous quelle forme le document existe.
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

const REFUS = 'Réservé aux étudiants de L1_INFO.';

const BASE = {
  id: 'r1',
  title: 'Traitement d’images au Burkina Faso',
  titleComplement: null,
  author: 'Diallo, Boureima',
  contributors: [],
  isbn: null,
  publishYear: 2014,
  language: 'fr',
  category: 'informatique',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  summary: null,
  keywords: [],
  items: [],
  digitalCopy: { fileFormat: 'pdf' },
  membersOnly: false,
  availability: { totalItems: 1, available: 1, borrowable: true },
};

/** `granted` pilote la réponse de la route d'accès. */
function monter(granted: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('/access')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ granted, message: granted ? '' : REFUS }),
        } as Response);
      }
      // Le reste ne répond jamais : on mesure le rendu, pas un chargement.
      return new Promise<Response>(() => {});
    }),
  );
  return render(<FicheNotice initial={BASE as never} />);
}

afterEach(() => vi.unstubAllGlobals());

describe('accès refusé', () => {
  it('⚠ AUCUN élément ne ressemble à un bouton « Lire en ligne »', async () => {
    monter(false);
    await waitFor(() => expect(screen.getByText(REFUS)).toBeTruthy());

    const faux = [...document.querySelectorAll('*')].filter((e) => {
      const t = (e.textContent || '').trim();
      return (
        e.children.length <= 1 &&
        t.startsWith('Lire en ligne') &&
        t.length < 40 &&
        e.tagName !== 'A' &&
        e.tagName !== 'BUTTON'
      );
    });
    expect(
      faux.map((e) => e.tagName.toLowerCase()),
      'un élément maquillé en bouton de lecture : il se lit comme une panne',
    ).toEqual([]);
  });

  it('⚠ et aucun `aria-disabled` sur un élément non focalisable', async () => {
    // Un paragraphe n'est jamais atteint au clavier : l'attribut ne dit rien à
    // personne, et il donne l'illusion d'avoir traité l'accessibilité.
    monter(false);
    await waitFor(() => expect(screen.getByText(REFUS)).toBeTruthy());
    const inertes = [...document.querySelectorAll('[aria-disabled]')].filter(
      (e) => !['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName),
    );
    expect(inertes.map((e) => e.tagName.toLowerCase())).toEqual([]);
  });

  it('la phrase du refus est là, et elle nomme la classe', async () => {
    monter(false);
    await waitFor(() => expect(screen.getByText(REFUS)).toBeTruthy());
  });

  it('le format existant est dit — le document EXISTE, il est fermé', async () => {
    // C'est la moitié qui informe : sans elle, on ne sait pas de quoi on est
    // privé. Elle n'appelle aucun geste, donc elle n'est pas un faux bouton.
    monter(false);
    await waitFor(() =>
      expect(screen.getByText(LIBELLES.lectureRefusee.formatExistant('pdf'))).toBeTruthy(),
    );
  });
});

describe('⚠ témoin INVERSÉ : accès accordé', () => {
  it('le VRAI bouton de lecture est là, et c’est un lien', async () => {
    // Sans lui, supprimer la lecture en ligne pour TOUT LE MONDE passerait les
    // quatre cas ci-dessus — et personne ne pourrait plus lire un document.
    monter(true);
    const lien = await screen.findByRole('link', { name: /Lire en ligne/i });
    expect(lien.getAttribute('href')).toBe('/opac/r1/lire');
  });
});

describe('⚠ ce que le texte DOIT dire', () => {
  it('le format annonce une EXISTENCE, jamais une disponibilité', () => {
    // « disponible » serait faux : le document existe et reste fermé à cette
    // personne. Le mot compte, c'est tout l'écart que le MOMENT 2 démontre.
    const texte = LIBELLES.lectureRefusee.formatExistant('pdf');
    expect(texte).toContain('PDF');
    expect(texte, 'ne pas annoncer une disponibilité qui n’existe pas').not.toMatch(
      /disponible|accessible/i,
    );
  });
});
