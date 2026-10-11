/**
 * LES DEUX ÉCRANS DU LECTEUR, MONTÉS — les branches que les DONNÉES n'exercent pas.
 *
 * ## ⚠ CE FICHIER EXISTE PARCE QUE J'AI AFFIRMÉ UN TÉMOIN QUI N'EXISTAIT PAS
 *
 * La recette au navigateur déclare deux bornes honnêtes : le jeu de données ne
 * porte qu'une valeur de `nature` (`TELECHARGEMENT`) et aucun `titre` nul. Elle
 * ajoutait « témoin tenu par doublure dans les tests » — et **c'était faux**.
 * `espace-lecteur-pas-encore.spec.ts` garde les PROPRIÉTÉS DES LIBELLÉS (les
 * deux natures se disent différemment, un titre nul SE DIT) ; il ne monte
 * aucun écran, donc il n'exerce aucune branche de rendu.
 *
 * ⭐ C'est la cinquième lecture d'une mutation qui ne casse rien, prise par
 * l'autre bout : *« ai-je seulement écrit un test ? »* — posée non pas après un
 * contrôle négatif muet, mais après m'être entendu l'affirmer dans un rapport.
 *
 * Ce que ce fichier tient, et que rien ne tenait :
 *
 * | branche | pourquoi les données ne l'exercent pas |
 * |---|---|
 * | `nature: 'CONSULTATION'` | les comptes de recette n'ont que des téléchargements |
 * | `titre: null` | aucune notice n'a été supprimée après consultation |
 * | liste VIDE | les comptes de recette portent désormais des données |
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { LIBELLES } from '@/lib/libelles';
import { PALETTE, fnv1a32 } from '@/lib/couverture-composee';

const C = LIBELLES.espaceLecteur.consultations;
const H = LIBELLES.espaceLecteur.horsLigne;

/** ⚠ Objets fabriqués UNE FOIS : un routeur neuf à chaque rendu relance les
 *  effets indéfiniment — worker mort, pas test rouge. */
const ROUTEUR = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => ROUTEUR,
  usePathname: () => '/mes-consultations',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => ({ functions: [] as string[] }) }));

/**
 * ⚠ LA DOUBLURE ÉCHOUE BRUYAMMENT sur ce qui n'est pas prévu : un repli
 * silencieux transformerait un oubli de doublure en défaut apparent du
 * produit, et la recherche partirait du mauvais côté.
 */
function brancher(parRoute: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      for (const [cle, charge] of Object.entries(parRoute)) {
        if (u.includes(cle)) {
          return new Response(JSON.stringify(charge), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      throw new Error(`requête non couverte — ${u}`);
    }),
  );
}

beforeEach(() => ROUTEUR.push.mockClear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const QUAND = '2026-10-09T22:14:54.039Z';

describe('Mes consultations', () => {
  async function monter(consultations: unknown[], retentionMois = 12) {
    brancher({ '/reader/consultations': { consultations, retentionMois } });
    const { default: Ecran } = await import('@/app/mes-consultations/page');
    render(<Ecran />);
  }

  /**
   * ⭐ LA BRANCHE QUE LES DONNÉES N'EXERCENT PAS. Les comptes de recette ne
   * portent que des `TELECHARGEMENT` : sans ce cas, un écran qui afficherait
   * `CONSULTATION` brut — ou le mot « lue », que le produit refuse — serait
   * indiscernable d'un écran juste.
   */
  it('⚠ `nature: CONSULTATION` se dit DANS LES MOTS DU LECTEUR, jamais en brut', async () => {
    await monter([
      { recordId: 'r1', titre: 'Précis de droit', nature: 'CONSULTATION', quand: QUAND },
    ]);
    await waitFor(() => expect(screen.getByText(C.natureConsultation)).toBeTruthy());
    // Témoin d'ABSENCE : l'identifiant d'énumération ne sort pas à l'écran.
    expect(screen.queryByText('CONSULTATION')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\blue?\b/i);
  });

  it('les deux natures se distinguent à l’écran', async () => {
    await monter([
      { recordId: 'r1', titre: 'A', nature: 'CONSULTATION', quand: QUAND },
      { recordId: 'r2', titre: 'B', nature: 'TELECHARGEMENT', quand: QUAND },
    ]);
    await waitFor(() => expect(screen.getByText(C.natureConsultation)).toBeTruthy());
    expect(screen.getByText(C.natureTelechargement)).toBeTruthy();
    // ⚠ Les confondre perdrait la seule distinction que cet écran porte.
    expect(C.natureConsultation).not.toBe(C.natureTelechargement);
  });

  /**
   * ⭐ L'AUTRE BRANCHE QUE LES DONNÉES N'EXERCENT PAS : une notice supprimée
   * depuis la consultation. Un `null` affiché en BLANC serait une ligne muette
   * dont le lecteur ne peut rien faire.
   */
  it('⚠ un `titre` nul SE DIT, et ne devient pas un lien vers rien', async () => {
    await monter([{ recordId: 'r1', titre: null, nature: 'TELECHARGEMENT', quand: QUAND }]);
    await waitFor(() => expect(screen.getByText(H.noticeRetiree)).toBeTruthy());
    // Pas de lien : il mènerait à une notice qui n'existe plus.
    expect(document.querySelectorAll('a[href^="/opac/"]')).toHaveLength(0);
  });

  it('un titre PRÉSENT est un lien vers sa notice', async () => {
    await monter([
      { recordId: 'r42', titre: 'Précis de droit', nature: 'TELECHARGEMENT', quand: QUAND },
    ]);
    const lien = await waitFor(() =>
      screen.getByRole('link', { name: 'Précis de droit' }),
    );
    expect(lien.getAttribute('href')).toBe('/opac/r42');
  });

  it('la RÉTENTION s’affiche — elle explique ce qui a disparu', async () => {
    await monter([], 12);
    await waitFor(() => expect(screen.getByText(C.retention(12))).toBeTruthy());
  });

  it('⚠ une liste vide ne prétend pas « vous n’avez jamais rien lu »', async () => {
    await monter([]);
    await waitFor(() => expect(screen.getByText(C.aucune)).toBeTruthy());
    // Témoin d'ABSENCE : aucune ligne inventée.
    expect(document.querySelectorAll('tbody tr')).toHaveLength(0);
  });
});

describe('Mes documents hors ligne', () => {
  async function monter(documents: unknown[]) {
    brancher({ '/reader/hors-ligne': { documents } });
    const { default: Ecran } = await import('@/app/mes-documents-hors-ligne/page');
    render(<Ecran />);
  }
  const BAIL = {
    recordId: 'r1',
    titre: 'Textiles et motifs',
    appareilId: '84613168-4ce9-4f1a-9a3e-000000000000',
    expireLe: '2026-10-23T12:00:00.000Z',
    // ⚠ Le domaine fait partie du contrat depuis le 11 octobre 2026 : la TEINTE
    // de la couverture en dépend.
    domaine: 'arts' as string | null,
  };

  it('un bail porte son titre en LIEN et son échéance', async () => {
    await monter([BAIL]);
    const lien = await waitFor(() => screen.getByRole('link', { name: 'Textiles et motifs' }));
    expect(lien.getAttribute('href')).toBe('/opac/r1');
    expect(screen.getByText(H.expireLe(new Date(BAIL.expireLe)))).toBeTruthy();
  });

  it('⚠ un `titre` nul SE DIT ici aussi, sans lien', async () => {
    await monter([{ ...BAIL, titre: null }]);
    await waitFor(() => expect(screen.getByText(H.noticeRetiree)).toBeTruthy());
    expect(document.querySelectorAll('a[href^="/opac/"]')).toHaveLength(0);
  });

  /**
   * ⚠ DEUX BAUX SUR LE MÊME DOCUMENT, DEUX APPAREILS — c'est le cas RÉEL des
   * comptes de recette, et il ne doit pas se replier en une ligne.
   * L'identifiant d'appareil est la seule chose qui dise au lecteur SUR QUEL
   * appareil le document est posé.
   */
  it('deux appareils pour un même document font DEUX lignes distinctes', async () => {
    await monter([
      BAIL,
      { ...BAIL, appareilId: '47bb607e-5c91-4a2b-8d77-111111111111' },
    ]);
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Textiles et motifs' })).toHaveLength(2),
    );
    expect(screen.getByText(/84613168-4ce/)).toBeTruthy();
    expect(screen.getByText(/47bb607e-5c9/)).toBeTruthy();
  });

  /* ───────────── LA COUVERTURE COMPOSÉE SUR L'ÉTAGÈRE ───────────── */

  const teinteDe = (n: number) => PALETTE[n];
  const fondsRendus = () =>
    [...document.querySelectorAll('svg[aria-hidden="true"]')].map(
      (svg) => svg.querySelector('rect[fill^="#"]')?.getAttribute('fill') ?? null,
    );

  /**
   * ⭐ LES CINQ BAUX DE `recette-etu@` PORTENT LEUR COUVERTURE — le cas que
   * Jean a demandé, avec les domaines RÉELS mesurés sur la base le 11 octobre
   * 2026 : deux `arts`, deux `litterature`, un `informatique`.
   */
  it('les cinq baux portent leur couverture, à la teinte de LEUR domaine', async () => {
    await monter([
      { ...BAIL, titre: 'Textiles et motifs', domaine: 'arts' },
      { ...BAIL, appareilId: '47bb607e-x', titre: 'Textiles et motifs', domaine: 'arts' },
      { ...BAIL, recordId: 'r2', titre: 'Contes et transmission', domaine: 'litterature' },
      { ...BAIL, recordId: 'r2', appareilId: '47bb607e-x', titre: 'Contes', domaine: 'litterature' },
      { ...BAIL, recordId: 'r3', titre: 'Gafeso — Guide', domaine: 'informatique' },
    ]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(5));
    // arts → 7, litterature → 10, informatique → 2 (table de la spécification)
    expect(fondsRendus()).toEqual([
      teinteDe(7), teinteDe(7), teinteDe(10), teinteDe(10), teinteDe(2),
    ]);
    // ⚠ Témoin d'ABSENCE : aucune requête d'image pour ces cinq couvertures.
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  /**
   * ⭐ LE CONTRÔLE NÉGATIF DEMANDÉ, ET IL A DEUX CAS QUE LA SPÉCIFICATION
   * SÉPARE — Jean les a nommés ensemble (« un bail sans domaine → hachage de
   * repli »), et la spécification tranche autrement :
   *
   * | le domaine | ce que la spécification dit |
   * |---|---|
   * | **absent, nul ou blanc** | teinte **0** — pas le hachage |
   * | **présent mais hors table** | FNV-1a → `palette[h mod 12]` |
   *
   * Les deux comptent, et dans les deux cas : **jamais de case vide**. C'est
   * ça, le fond de la demande.
   */
  /**
   * ⭐ L'ÉTAGÈRE REND UNE COUVERTURE À L'INITIALE SEULE, et c'est ce cas qui
   * tient le choix des 56×76 — pas la règle de redondance, qui resterait vraie
   * si on agrandissait (l'appel ne passe ni auteur ni année). Mesuré par
   * contrôle négatif.
   *
   * ⚠ Au-delà de 80 px de haut, la spécification affiche le TEXTE COMPLET :
   * quatre lignes de titre en 6 px sur une ligne d'étagère seraient illisibles.
   * Si ce cas tombe, c'est que la vignette a grandi — relisez la lisibilité
   * avant de mettre le compte à jour.
   */
  it('⚠ l’étagère rend une couverture à l’INITIALE SEULE — sous le seuil des 80 px', async () => {
    await monter([{ ...BAIL, titre: 'Textiles et motifs', domaine: 'arts' }]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(1));
    const textes = [...document.querySelectorAll('svg[aria-hidden="true"] text')];
    expect(textes, 'une couverture d’étagère porte UN seul bloc de texte').toHaveLength(1);
    expect(textes[0].textContent, 'et ce bloc est une INITIALE, pas un titre').toHaveLength(1);
    // Témoin d'ABSENCE : aucune ligne de titre découpée en tspan.
    expect(document.querySelectorAll('svg[aria-hidden="true"] tspan')).toHaveLength(0);
  });

  it('⚠ un domaine NUL rend la teinte 0 — jamais une case vide', async () => {
    await monter([{ ...BAIL, domaine: null }]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(1));
    expect(fondsRendus()[0]).toBe(teinteDe(0));
    // Et la couverture porte bien son initiale : une teinte sans initiale
    // serait précisément la « case vide ».
    expect(document.querySelector('svg[aria-hidden="true"] text')?.textContent).toBe('T');
  });

  it('⚠ un domaine HORS TABLE passe par le hachage de repli, et reste dans la palette', async () => {
    await monter([{ ...BAIL, domaine: 'agronomie' }]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(1));
    const fond = fondsRendus()[0]!;
    expect(PALETTE as readonly string[]).toContain(fond);
    // ⚠ Témoin d'ABSENCE : ce n'est PAS la teinte du domaine vide. Sans lui, un
    // repli qui rendrait 0 pour tout serait indiscernable du hachage.
    expect(fond).toBe(teinteDe(fnv1a32('agronomie') % PALETTE.length));
    expect(fond).not.toBe(teinteDe(0));
  });

  it('⚠ et un titre NUL ne laisse pas une couverture muette', async () => {
    // Pas d'initiale à inventer — mais la teinte du domaine reste, et c'est
    // elle qui distingue la ligne. Une case BLANCHE serait le défaut.
    await monter([{ ...BAIL, titre: null, domaine: 'arts' }]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(1));
    expect(fondsRendus()[0]).toBe(teinteDe(7));
    expect(document.querySelector('svg[aria-hidden="true"] text')).toBeNull();
  });

  it('⚠ l’état vide ne prétend PAS « jamais rien emporté »', async () => {
    await monter([]);
    await waitFor(() => expect(screen.getByText(H.aucunEnCours)).toBeTruthy());
    expect(document.querySelectorAll('a[href^="/opac/"]')).toHaveLength(0);
  });
});
