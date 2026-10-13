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
import { TEINTE_DU_DOMAINE } from '@/lib/couvertures-v3.generated';

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
    /*
     * ⭐ LES DEUX CLÉS v3, telles que la route les sert (mesuré). `domaine`
     * SUBSISTE : il est servi aussi, et il alimente d'autres cas de ce fichier.
     * Ce qui décide de la TEINTE est désormais `coverDomain`.
     */
    coverTemplate: 'manuel',
    coverDomain: 'arts',
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

  /**
   * ⭐⭐ L'ÉTAGÈRE PORTE LA v3 DEPUIS LE 12 OCTOBRE 2026, et la mesure change de
   * forme : la v3 est un `<div aria-hidden>` dont le FOND est en CSS, non un
   * `<rect fill>` dans un SVG.
   *
   * 🔴 ET UNE GARANTIE EST PERDUE, il faut le dire : ces cas affirmaient « la
   * teinte de LEUR domaine ». `GET /reader/hors-ligne` ne sert PAS encore
   * `coverDomain` (mesuré), donc le repli PRESCRIT s'applique — `manuel` /
   * `autre` — et toutes les vignettes de cette étagère partagent la teinte
   * neutre.
   *
   * ⚠ C'est voulu plutôt que subi : « un fond de domaine FAUX est pire qu'un
   * fond neutre, il AFFIRME ». Le jour où la route sert la clé, ces cas
   * redeviennent per-domaine — et le témoin ci-dessous TOMBE pour le rappeler,
   * au lieu de laisser la garantie perdue en silence.
   */
  const fondsRendus = () =>
    [...document.querySelectorAll('div[aria-hidden="true"]')].map(
      (n) => (n as HTMLElement).style.background || null,
    );
  /** ⚠ jsdom rend les couleurs en `rgb(...)` : on convertit plutôt que de recopier. */
  const rgb = (hex: string) =>
    `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  /** `#3D4A54`, la teinte du repli `autre`. */
  const NEUTRE = rgb(TEINTE_DU_DOMAINE.autre);

  /**
   * ⭐ LES CINQ BAUX DE `recette-etu@` PORTENT LEUR COUVERTURE — le cas que
   * Jean a demandé, avec les domaines RÉELS mesurés sur la base le 11 octobre
   * 2026 : deux `arts`, deux `litterature`, un `informatique`.
   */
  it('les cinq baux portent leur couverture, à la teinte de LEUR domaine', async () => {
    await monter([
      { ...BAIL, titre: 'Textiles et motifs', domaine: 'arts', coverDomain: 'arts' },
      { ...BAIL, appareilId: '47bb607e-x', titre: 'Textiles et motifs', domaine: 'arts', coverDomain: 'arts' },
      { ...BAIL, recordId: 'r2', titre: 'Contes et transmission', domaine: 'litterature', coverDomain: 'litterature' },
      { ...BAIL, recordId: 'r2', appareilId: '47bb607e-x', titre: 'Contes', domaine: 'litterature', coverDomain: 'litterature' },
      { ...BAIL, recordId: 'r3', titre: 'Gafeso — Guide', domaine: 'informatique', coverDomain: 'informatique' },
    ]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(5));
    /*
     * ⭐⭐ LA DETTE S'EST EFFACÉE LE JOUR MÊME. `/reader/hors-ligne` sert
     * désormais `coverDomain` (mesuré : `{ documents: [{ …, coverTemplate,
     * coverDomain }] }`), donc chaque vignette porte la teinte de SON domaine —
     * et non plus le neutre du repli.
     *
     * ⚠ Et le jeu d'essai le porte, sans quoi ce cas mesurerait encore le
     * repli : « une doublure est une hypothèse, et un test vert ne confirme
     * que moi ».
     */
    expect(fondsRendus()).toEqual([
      rgb(TEINTE_DU_DOMAINE.arts),
      rgb(TEINTE_DU_DOMAINE.arts),
      rgb(TEINTE_DU_DOMAINE.litterature),
      rgb(TEINTE_DU_DOMAINE.litterature),
      rgb(TEINTE_DU_DOMAINE.informatique),
    ]);
    /*
     * ⚠ TÉMOIN D'ABSENCE : aucune n'est le NEUTRE du repli. Sans lui, un repli
     * qui mangerait les clés rendrait cinq fois `autre` — et cinq fonds
     * identiques passeraient pour « la teinte de leur domaine » si les trois
     * domaines du jeu d'essai venaient à partager leur teinte.
     */
    expect(fondsRendus()).not.toContain(NEUTRE);
    /*
     * ⚠ Témoin d'ABSENCE : aucune requête d'image pour ces cinq couvertures —
     * et il est SCOPÉ à `main`.
     *
     * ⭐ Il comptait les `<img>` du DOCUMENT, et il est tombé le 12 octobre 2026
     * quand cet écran est entré dans la coque de l'espace lecteur : l'en-tête
     * porte le logo de l'établissement. Le produit allait bien ; c'est le
     * périmètre du témoin qui était trop large.
     *
     * C'est la deuxième fois exactement : « mon compte d'images disait "aucune
     * image (1)" en comptant le logo de la coque d'administration ». Un témoin
     * d'absence se scope à ce dont il parle.
     */
    /*
     * ⭐⭐ L'INVARIANT A CHANGÉ PAR DÉCISION, et il est plus fort. La v3 porte un
     * logo — le fournisseur le répétait dans ses HUIT gabarits, 9 670 octets
     * chacun. « Logo défini une seule fois » (décision).
     *
     * > ⭐ **Cinq vignettes ne demandent qu'UNE image.** Même adresse pour
     * > toutes : une requête, puis le cache. C'est la seule chose qui rendait
     * > « zéro requête » désirable.
     */
    const liste = document.querySelector('main');
    expect(liste, 'la coque de l’espace lecteur doit fournir un <main>').not.toBeNull();
    const adresses = new Set(
      [...liste!.querySelectorAll('img')].map((n) => n.getAttribute('src')),
    );
    expect(adresses.size, 'plus d’une adresse : le cache ne sert plus').toBe(1);
    // ⚠ Et c'est le logo SYMBOLE, variante de miniature, DÉJÀ public.
    expect([...adresses][0]).toBe('/marque/gafeso_icone_simplifiee.svg');
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
  /**
   * ⭐⭐ LA v3 NE PORTE AUCUN TEXTE EN MINIATURE, et c'est plus franc que
   * l'initiale.
   *
   * ⚠ Mesuré : à 56 px de large, le titre de la v3 ferait **3,7 px**
   * (33 × 56/500). La v2 répondait « l'initiale seule » ; la v3 répond « rien
   * du tout » — une initiale seule est encore une information que personne ne
   * lit à cette taille, et le titre est affiché en texte juste à côté.
   */
  it('⚠ l’étagère rend une MINIATURE sans aucun texte — sous le seuil des 80 px', async () => {
    await monter([BAIL]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(1));
    const couv = document.querySelector('div[aria-hidden="true"]')!;
    expect(
      (couv.textContent ?? '').trim(),
      'la miniature porte du texte, illisible à cette taille',
    ).toBe('');
    /*
     * ⚠ Témoin d'ABSENCE sur la confusion PLAUSIBLE : « aucun texte » ne doit
     * pas vouloir dire « aucune couverture ». Le motif, lui, est bien là.
     */
    expect(couv.querySelector('svg g'), 'la miniature ne porte pas son motif').not.toBeNull();
  });

  it('⚠ un domaine NUL rend le fond NEUTRE — jamais une case vide', async () => {
    await monter([{ ...BAIL, domaine: null, coverDomain: 'autre' }]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(1));
    expect(fondsRendus()[0]).toBe(NEUTRE);
    /*
     * ⚠ L'INITIALE N'EXISTE PLUS EN MINIATURE (v3) : ce qui distingue une
     * vignette d'une case vide est son MOTIF, pas une lettre. Le témoin porte
     * donc là — et il reste un témoin d'absence de case vide.
     */
    const couv = document.querySelector('div[aria-hidden="true"]')!;
    expect(couv.querySelector('svg g'), 'une case vide : ni teinte ni motif').not.toBeNull();
  });

  /**
   * ⭐⭐ LE HACHAGE DE REPLI A DISPARU, ET C'EST UNE DÉCISION.
   *
   * La v2 hachait un domaine hors table pour lui donner UNE des douze teintes.
   * La v3 ne hache pas : `coverDomain` est **résolu par le serveur** — NFC,
   * minuscules, table et repli déjà appliqués, « jamais hors liste ».
   *
   * > ⚠ « Vous n'avez donc plus à normaliser ni à replier. Si vous le refaites,
   * >   vous le referez autrement — et trois clients composeraient trois
   * >   couvertures pour un même document. » *(session backend)*
   *
   * ⭐ Un hachage côté front rendrait donc une teinte QUE LE WEB CONNAÎT : le
   * mobile en afficherait une autre pour la même notice. Le repli est
   * désormais une CLÉ NOMMÉE — `autre` — et son fond est neutre exprès.
   */
  it('⚠ un domaine hors table ne HACHE plus : il rend le fond neutre d’`autre`', async () => {
    await monter([{ ...BAIL, domaine: 'agronomie', coverDomain: 'agronomie' }]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(1));
    expect(fondsRendus()[0]).toBe(NEUTRE);
    /*
     * ⚠ Témoin d'ABSENCE sur la confusion PLAUSIBLE : aucune des dix autres
     * teintes ne doit sortir d'un domaine inconnu. Sans lui, un hachage
     * réintroduit en douce serait indiscernable du repli.
     */
    const autres = Object.entries(TEINTE_DU_DOMAINE)
      .filter(([c]) => c !== 'autre' && c !== 'economie')
      .map(([, h]) => h);
    for (const h of autres) {
      expect(fondsRendus()[0], `le domaine inconnu a pris la teinte ${h}`).not.toBe(h);
    }
  });

  it('⚠ et un titre NUL ne laisse pas une couverture muette', async () => {
    // Pas d'initiale à inventer — mais la teinte du domaine reste, et c'est
    // elle qui distingue la ligne. Une case BLANCHE serait le défaut.
    await monter([{ ...BAIL, titre: null, domaine: 'arts', coverDomain: 'arts' }]);
    await waitFor(() => expect(fondsRendus()).toHaveLength(1));
    // ⚠ La teinte est celle du DOMAINE, pas le neutre : la route sert la clé.
    expect(fondsRendus()[0]).toBe(rgb(TEINTE_DU_DOMAINE.arts));
    // ⚠ Et AUCUN texte à 56×78 : la v3 n'en porte pas à cette taille.
    expect(document.querySelector('div[aria-hidden="true"] span')).toBeNull();
  });

  it('⚠ l’état vide ne prétend PAS « jamais rien emporté »', async () => {
    await monter([]);
    await waitFor(() => expect(screen.getByText(H.aucunEnCours)).toBeTruthy());
    expect(document.querySelectorAll('a[href^="/opac/"]')).toHaveLength(0);
  });
});
