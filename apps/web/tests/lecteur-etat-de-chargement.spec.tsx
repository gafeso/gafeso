/**
 * Le lecteur DIT qu'il ouvre le document — il ne montre pas une page blanche.
 *
 * ⚠ CE QUI ÉTAIT FAUX, relevé le 14 septembre 2026. `if (!data) return null` :
 * l'écran ne rendait RIEN entre le clic et l'affichage, c'est-à-dire pendant
 * qu'il obtient une URL signée PUIS télécharge le document ENTIER (les deux
 * lecteurs chargent tout à l'ouverture — voir CLAUDE.md, TTL de 5 min).
 *
 * ⚠ UN ÉCRAN BLANC N'AFFIRME RIEN DE FAUX, et c'est pour ça qu'il échappe à la
 * famille des non-réponses écrites comme des faits. Il n'est pas un mensonge :
 * il est une absence. Mais sur une connexion lente — le contexte de ce produit
 * — il se lit comme une PANNE, et la personne recharge ou s'en va.
 *
 * Le produit portait déjà dix libellés de chargement ailleurs : trois écrans de
 * détail dérogeaient à sa propre convention.
 *
 * ⚠ CE QUE CE FICHIER NE COUVRE PAS, et c'est mesuré : les deux autres écrans
 * corrigés — `/admin/catalogue/[id]` et `/admin/collections/[id]` — ne sont
 * tenus que par l'assertion de PROPRIÉTÉ sur leurs libellés, plus bas. Monter
 * un écran d'administration demande session, tenant et navigation ; ce n'est
 * pas une raison de ne rien écrire, c'en est une de dire ce qui manque.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'r1' }) }));
vi.mock('@/lib/session', () => ({ getUser: () => ({ id: 'u1', role: 'STUDENT' }) }));
// Les deux lecteurs tirent des dépendances lourdes (pdf.js, epub.js) qui n'ont
// rien à faire ici : ce test porte sur l'état AVANT qu'ils soient montés.
vi.mock('@/components/epub-reader', () => ({ EpubReader: () => <div>epub</div> }));
vi.mock('@/components/pdf-reader', () => ({ PdfReader: () => <div>pdf</div> }));

afterEach(() => vi.unstubAllGlobals());

describe('Le lecteur pendant qu’il charge', () => {
  it('⚠ dit qu’il ouvre le document — il ne rend pas une page vide', async () => {
    // ⚠ LE RÉSEAU NE RÉPOND JAMAIS : c'est exactement l'état qu'on éprouve.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const { default: LirePage } = await import('@/app/opac/[id]/lire/page');
    render(<LirePage />);
    expect(await screen.findByText(LIBELLES.chargements.document)).toBeTruthy();
  });
});

describe('Ce que les libellés de chargement DOIVENT dire', () => {
  /**
   * ⚠ Assertions de PROPRIÉTÉ, pas d'emploi. Comparer l'écran à `LIBELLES.x`
   * vérifie qu'il affiche la bonne VARIABLE, et suit sa dégradation sans
   * broncher — un libellé vidé passerait.
   */
  it('chacun nomme CE QU’on attend, pas seulement qu’on attend', () => {
    expect(LIBELLES.chargements.document).toMatch(/document/i);
    expect(LIBELLES.chargements.notice).toMatch(/notice/i);
    expect(LIBELLES.chargements.collection).toMatch(/collection/i);
  });

  it('⚠ aucun n’AFFIRME un état du système', () => {
    // « Aucun résultat », « vide », « indisponible » pendant un chargement sont
    // des faits qu'on ne connaît pas encore. Un libellé de chargement dit
    // l'ATTENTE, jamais son issue.
    for (const [cle, texte] of Object.entries(LIBELLES.chargements)) {
      expect(texte, `${cle} ne doit pas affirmer une issue`).not.toMatch(
        /aucun|vide|introuvable|indisponible|erreur/i,
      );
      expect(texte, `${cle} doit marquer l'attente`).toMatch(/…|\.\.\./);
    }
  });
});
