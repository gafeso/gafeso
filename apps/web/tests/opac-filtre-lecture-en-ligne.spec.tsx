/**
 * LE FILTRE PUBLIC « Lecture en ligne disponible ».
 *
 * ## ⭐ POURQUOI IL N'EXISTAIT PAS : un COMMENTAIRE disait qu'il était impossible
 *
 * `app/opac/page.tsx` portait, à côté du mode parcours :
 *
 * > « C'est un mode, pas un filtre de recherche. /opac/search ne peut pas
 * >   porter ce filtre — il se lit en base, le moteur n'en sait rien, et le
 * >   post-filtrer rendrait totalHits et les compteurs faux. »
 *
 * C'était **EXACT**, et rc8 l'a rendu faux : `hasDigital` est devenu un
 * attribut filtrable de l'index, et le DTO de la route le dit mot pour mot —
 * « Filtré PAR LE MOTEUR (attribut `hasDigital`) […] c'est ce qui rend
 * `totalHits` et les facettes EXACTS sur une recherche plein texte. »
 *
 * ⚠ C'est « un avertissement exact devient un mensonge quand sa condition
 * disparaît », appliqué non pas à un texte d'écran mais à un COMMENTAIRE qui
 * DÉCOURAGEAIT d'écrire le code. Personne ne relit un commentaire qui a l'air
 * juste — et celui-là a empêché une fonctionnalité pendant une version entière.
 * La phrase vivait à DEUX endroits : l'écran, et l'en-tête de
 * `opac-parcours-numerique.spec.tsx`. Les deux sont corrigés.
 *
 * ## ⭐ LE COMPTE EXACT, mesuré sur zinda avant d'écrire une ligne
 *
 * | Requête | le matin | le soir |
 * |---|---|---|
 * | `/opac/search` | 480 | **481** |
 * | `/opac/search?avecFichier=true` | 155 | **156** |
 * | `/opac/search?avecFichier=false` | 325 | **325** |
 *
 * **156 + 325 = 481** — le filtre ne perd rien, et il ne l'a pas perdu non
 * plus le matin (155 + 325 = 480). Le témoin d'ABSENCE de la mesure :
 * `avecFichier=lol` rend **400**, il ne vaut PAS « non » en silence.
 *
 * ⚠ ET LE +1 S'EXPLIQUE PAR L'ARITHMÉTIQUE, pas par une supposition : « sans
 * fichier » est resté à 325, donc la notice ajoutée dans la journée porte un
 * fichier. (Le backend a ajouté « Gafeso — Guide d'utilisation » à chaque
 * école de développement le 9 octobre 2026.) Un chiffre qui bouge sur une base
 * PARTAGÉE n'est pas une dérive : c'est une mesure à redater.
 *
 * ⚠ Les nombres ci-dessous sont des ENTRÉES DE DOUBLURE, pas ces mesures : ils
 * sont choisis pour que le total du serveur ne puisse pas se confondre avec le
 * nombre de lignes reçues.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import OpacPage from '@/app/opac/page';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.filtreNumerique;

let parametres = new URLSearchParams();
/** ⚠ Fabriqué UNE FOIS, hors de la fabrique : un objet neuf à chaque rendu
 *  relancerait les effets indéfiniment (worker mort, pas test rouge). */
const ROUTEUR = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };

vi.mock('next/navigation', () => ({
  useSearchParams: () => parametres,
  usePathname: () => '/opac',
  useRouter: () => ROUTEUR,
}));

let urls: string[] = [];

/**
 * La doublure rend des totaux DIFFÉRENTS selon le filtre, et un nombre de
 * `hits` qui n'égale NI l'un NI l'autre.
 *
 * ⚠ C'est ce qui permet de distinguer « l'écran affiche le total du SERVEUR »
 * de « l'écran compte ce qu'il a reçu ». Un jeu d'essai où les deux
 * coïncideraient ne mesurerait rien.
 */
const TOTAL_SANS_FILTRE = 480;
const TOTAL_AVEC_FICHIER = 155;
const HITS_RENDUS = 3;

/**
 * ⚠ `zeroSousFiltre` : la liste « Filtres actifs » n'est rendue QU'À ZÉRO
 * RÉSULTAT — c'est sa raison d'être, sortir du cul-de-sac où les facettes
 * disparaissent au moment où il faudrait les décocher. Mon premier jeu d'essai
 * rendait 155 résultats : il n'atteignait donc jamais le chemin des pastilles.
 */
function brancher(zeroSousFiltre = false) {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      urls.push(url);
      const p = new URL(url, 'http://x').searchParams;
      const filtre = p.get('avecFichier');
      const total =
        filtre === 'true'
          ? zeroSousFiltre
            ? 0
            : TOTAL_AVEC_FICHIER
          : TOTAL_SANS_FILTRE;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            hits: Array.from({ length: total === 0 ? 0 : HITS_RENDUS }, (_, i) => ({
              id: `n-${i}`,
              title: `Document ${i}`,
              author: 'Ouédraogo, Awa',
              publishYear: 2024,
              category: 'droit',
              publishYear2: null,
            })),
            totalHits: total,
            page: Number(p.get('page') ?? 1),
            totalPages: Math.ceil(total / 20),
            facets: { category: { droit: total } },
          }),
      } as Response);
    }),
  );
}

const derniereRecherche = () => urls.filter((u) => u.includes('/opac/search')).at(-1) ?? '';
const parametreFiltre = (u: string) => new URL(u, 'http://x').searchParams.get('avecFichier');

beforeEach(() => {
  parametres = new URLSearchParams();
  // ⚠ Le routeur est fabriqué UNE FOIS hors de la fabrique (identité stable) :
  // ses appels s'accumuleraient donc d'un cas à l'autre. On les remet à zéro
  // ici — sans recréer l'objet, ce qui relancerait les effets en boucle.
  ROUTEUR.push.mockClear();
  brancher();
});
afterEach(() => {
  vi.unstubAllGlobals();
  parametres = new URLSearchParams();
});

async function monter() {
  render(<OpacPage />);
  // ⚠ ANCRE : on attend une PRÉSENCE avant toute affirmation d'absence.
  await waitFor(() => expect(screen.getByLabelText(T.libelle, { exact: false })).toBeTruthy());
}

describe('la case existe, et elle ne filtre rien par défaut', () => {
  it('décochée au départ, et la requête ne porte PAS `avecFichier`', async () => {
    await monter();
    const case_ = screen.getByLabelText(T.libelle, { exact: false }) as HTMLInputElement;
    expect(case_.checked).toBe(false);
    await waitFor(() => expect(derniereRecherche()).toContain('/opac/search'));
    expect(
      parametreFiltre(derniereRecherche()),
      'un filtre envoyé alors que personne ne l’a demandé',
    ).toBeNull();
  });

  it('⚠ elle DIT ce que « disponible » ne promet pas — l’accès reste gardé', () => {
    // Le texte porte une propriété, et c'est elle qu'on garde : sans elle,
    // « disponible » se lirait comme « lisible par vous », et le clic suivant
    // serait un refus qu'on n'a pas annoncé.
    expect(T.aide).toMatch(/classe/i);
    expect(T.aide).toMatch(/abonnement/i);
    expect(T.libelle).not.toMatch(/télécharg/i);
  });
});

describe('cochée, elle filtre PAR LE MOTEUR', () => {
  it('la requête porte `avecFichier=true` — la forme explicite, pas « 1 »', async () => {
    await monter();
    fireEvent.click(screen.getByLabelText(T.libelle, { exact: false }));

    await waitFor(() => expect(parametreFiltre(derniereRecherche())).toBe('true'));
    // ⚠ Le DTO ne reconnaît QUE les formes explicites et refuse le reste par
    // une 400 — « une faute de frappe doit se voir ». Envoyer autre chose
    // casserait la recherche au lieu de la filtrer.
    expect(parametreFiltre(derniereRecherche())).not.toBe('1');
  });

  /**
   * ⭐ LE COMPTE EXACT VIENT DU SERVEUR, jamais d'un comptage local.
   *
   * La doublure rend 3 `hits` pour un `totalHits` de 155 : un écran qui
   * compterait ce qu'il a reçu afficherait 3. C'est la seule façon de prouver
   * que le total est celui du MOTEUR — et c'est tout l'apport de rc8, qui a
   * rendu `hasDigital` filtrable au lieu de post-filtrer.
   */
  it('le total affiché est celui du MOTEUR, pas le nombre de lignes reçues', async () => {
    await monter();
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`${TOTAL_SANS_FILTRE} résultats`))).toBeTruthy(),
    );

    fireEvent.click(screen.getByLabelText(T.libelle, { exact: false }));

    await waitFor(() =>
      expect(screen.getByText(new RegExp(`${TOTAL_AVEC_FICHIER} résultats`))).toBeTruthy(),
    );
    // Témoin d'ABSENCE : ni l'ancien total, ni le nombre de lignes.
    expect(screen.queryByText(new RegExp(`${TOTAL_SANS_FILTRE} résultats`))).toBeNull();
    expect(screen.queryByText(new RegExp(`^${HITS_RENDUS} résultats`))).toBeNull();
  });

  /**
   * ⚠ À ZÉRO RÉSULTAT, et c'est là que ça compte : les facettes du moteur sont
   * vides, donc les pastilles de domaine et de type disparaissent — au moment
   * précis où il faudrait pouvoir les décocher. La liste « Filtres actifs »
   * est construite depuis L'ÉTAT pour cette raison, et elle doit être
   * COMPLÈTE : une liste nommée « Filtres actifs » qui omet un filtre actif
   * est une liste qui ment.
   */
  it('à zéro résultat, une pastille le signale, et la retirer relance SANS le filtre', async () => {
    brancher(true);
    await monter();
    fireEvent.click(screen.getByLabelText(T.libelle, { exact: false }));
    await waitFor(() => expect(parametreFiltre(derniereRecherche())).toBe('true'));

    /*
     * ⚠ PAR SON NOM ANNONCÉ, pas par son texte : la pastille rend
     * « Disponibilité · Lecture en ligne ✕ » en TROIS nœuds, et `getByText`
     * échoue en disant « broken up by multiple elements ». Le nom accessible,
     * lui, est la phrase entière — et c'est ce qu'une personne entend.
     */
    const nom = LIBELLES.opac.retirerFiltre(
      LIBELLES.opac.champs.avecFichier,
      T.pastille,
    );
    const pastille = await waitFor(() => screen.getByRole('button', { name: nom }));
    fireEvent.click(pastille);

    await waitFor(() => expect(parametreFiltre(derniereRecherche())).toBeNull());
    expect((screen.getByLabelText(T.libelle, { exact: false }) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  /**
   * ⚠ TOUT CHANGEMENT DE CRITÈRE RAMÈNE EN PAGE 1 — sinon affiner depuis la
   * page 7 demande la page 7 d'un résultat qui en compte huit : une liste vide
   * sur une recherche qui trouve.
   */
  it('cocher ramène en page 1', async () => {
    parametres = new URLSearchParams('q=droit');
    await monter();
    fireEvent.click(screen.getByLabelText(T.libelle, { exact: false }));
    await waitFor(() => expect(parametreFiltre(derniereRecherche())).toBe('true'));
    expect(new URL(derniereRecherche(), 'http://x').searchParams.get('page')).toBe('1');
  });
});

describe('le filtre SURVIT à une recherche', () => {
  /**
   * ⚠ CE CAS EXISTE PARCE QUE `onSubmit` NE PORTE PAS LE FILTRE DANS L'URL.
   *
   * L'écran pousse `/opac?q=…&dans=…` et rien d'autre : `avecFichier`,
   * `category` et `recordType` sont des ÉTATS, lus de l'URL au montage et
   * jamais réécrits dedans. C'est le comportement de cet écran AVANT ce lot —
   * les trois filtres se comportent pareil —, et ce n'est pas ce qu'on corrige
   * ici.
   *
   * ⭐ Mais il y a deux défauts possibles, et UN SEUL serait de moi :
   *
   * | | de qui | ce que ça fait |
   * |---|---|---|
   * | l'URL ne porte pas le filtre | de l'écran, avant ce lot | l'URL n'est pas partageable AVEC le filtre |
   * | le filtre se PERD à la recherche | serait de moi | la case reste cochée et ne filtre plus |
   *
   * Le second serait grave : une case cochée qui ne filtre rien est un faux
   * silencieux — l'écran AFFIRME un filtre qu'il n'applique pas. Ce cas le
   * barre.
   */
  /**
   * ⚠ ET LE CHEMIN ÉPROUVÉ EST CELUI QUI RELANCE DANS LE PROCESSUS.
   *
   * `onSubmit` a deux branches : requête INCHANGÉE → `search()` directement ;
   * requête NEUVE → `router.push`, et c'est l'URL qui relance. Ma première
   * écriture tapait une requête neuve, donc elle attendait un appel qui ne
   * pouvait pas venir — `push` est une doublure, elle ne navigue pas.
   *
   * ⭐ Le second cas ne se mesure pas ici sans modéliser la navigation, et le
   * cas suivant le couvre autrement : par ce que l'URL POUSSÉE contient.
   */
  it('une recherche relancée porte TOUJOURS `avecFichier=true`', async () => {
    await monter();
    fireEvent.click(screen.getByLabelText(T.libelle, { exact: false }));
    await waitFor(() => expect(parametreFiltre(derniereRecherche())).toBe('true'));
    const avant = urls.length;

    const champ = screen.getByRole('textbox');
    fireEvent.submit(champ.closest('form')!);

    await waitFor(() => expect(urls.length).toBeGreaterThan(avant));
    expect(
      parametreFiltre(derniereRecherche()),
      '⚠ la case est cochée et le filtre a disparu de la requête : l’écran ' +
        'affirmerait un filtre qu’il n’applique pas',
    ).toBe('true');
    expect(
      (screen.getByLabelText(T.libelle, { exact: false }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  /**
   * ⚠ L'URL POUSSÉE NE PORTE PAS LE FILTRE, et c'est DÉCLARÉ ici plutôt que tu.
   *
   * `onSubmit` pousse `/opac?q=…&dans=…` : les TROIS filtres de cet écran —
   * `avecFichier`, `category`, `recordType` — sont des états lus de l'URL au
   * montage et jamais réécrits dedans. L'URL n'est donc pas partageable AVEC un
   * filtre, et c'est le comportement de l'écran AVANT ce lot.
   *
   * ⚠ Ce n'est pas corrigé ici : changer la sémantique de l'URL sur l'écran le
   * plus public du produit, à quelques jours de la V1, n'est pas une correction
   * de défaut. C'est rapporté.
   *
   * ⭐ Et ce cas le rend MÉCANIQUE : le jour où quelqu'un rend le filtre
   * partageable, cette assertion tombe et le convoque pour réécrire la note —
   * au lieu de laisser un commentaire qui aurait vieilli en silence.
   */
  it('⚠ l’URL poussée NE porte PAS le filtre — manque déclaré, pas corrigé', async () => {
    await monter();
    fireEvent.click(screen.getByLabelText(T.libelle, { exact: false }));
    await waitFor(() => expect(parametreFiltre(derniereRecherche())).toBe('true'));

    const champ = screen.getByRole('textbox');
    fireEvent.change(champ, { target: { value: 'droit' } });
    fireEvent.submit(champ.closest('form')!);

    await waitFor(() => expect(ROUTEUR.push).toHaveBeenCalled());
    const poussee = String((ROUTEUR.push as unknown as { mock: { calls: string[][] } }).mock.calls.at(-1)?.[0]);
    expect(poussee, 'témoin : l’URL poussée porte bien la requête').toContain('q=droit');
    expect(
      poussee,
      'l’URL poussée porte maintenant le filtre : RÉÉCRIVEZ la note de ce cas, ' +
        'et vérifiez que `category` et `recordType` la portent aussi — les trois ' +
        'filtres de cet écran doivent se comporter pareil.',
    ).not.toContain('avecFichier');
  });

});

describe('⚠ et PAS en mode parcours — une case inerte est un défaut', () => {
  it('le mode parcours ne rend pas la case : la liste y est déjà numérique', async () => {
    parametres = new URLSearchParams('numeriques=1');
    render(<OpacPage />);

    // ⚠ ANCRE D'ABORD : on attend que le parcours ait VRAIMENT appelé sa route,
    // sinon l'absence mesurerait un écran pas encore rendu.
    await waitFor(() => expect(urls.some((u) => u.includes('/opac/parcourir'))).toBe(true));

    expect(
      screen.queryByLabelText(T.libelle, { exact: false }),
      'une case qui ne filtre rien sur une liste déjà entièrement numérique',
    ).toBeNull();
    expect(urls.some((u) => u.includes('/opac/search'))).toBe(false);
  });
});

describe('⚠ la phrase qui disait le filtre IMPOSSIBLE ne peut plus être écrite AU PRÉSENT', () => {
  /**
   * Le texte explique ; seul le test se souvient. Sans ce cas, rien n'empêche
   * de réécrire « /opac/search ne peut pas porter ce filtre » dans six mois,
   * avec les mêmes bonnes raisons qu'à la première fois — et de RETIRER le
   * filtre en conséquence.
   *
   * ⚠ ET MA PREMIÈRE ÉCRITURE INTERDISAIT LA PHRASE TOUT COURT. Elle a
   * signalé mes DEUX corrections, qui la CITENT pour dire qu'elle est périmée
   * — c'est « plus aucune mention de redis », à l'identique : un contrôle de
   * disparition qui dénonce le texte expliquant la disparition.
   *
   * ⭐ La forme juste n'interdit pas la phrase : elle exige qu'elle soit
   * DATÉE. Toute occurrence doit se trouver à moins de six lignes d'une marque
   * de péremption (`rc8`, « RENDUE FAUSSE », « ÉTAIT »). Une citation
   * historique passe ; une justification neuve est refusée.
   *
   * ⚠ Sa borne, déclarée : quelqu'un pourrait écrire la phrase ET la marque,
   * puis retirer le filtre. Ce n'est pas ce garde qui l'attraperait — c'est
   * « la requête porte avecFichier=true », ci-dessus, qui mesure l'EFFET.
   */
  const MARQUES = /rc8|RENDUE FAUSSE|rendue fausse|ÉTAIT EXACT|était exact|subsiste/;

  it('toute occurrence de la phrase est DATÉE, dans les deux fichiers', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    let occurrences = 0;
    for (const f of ['app/opac/page.tsx', 'tests/opac-parcours-numerique.spec.tsx']) {
      const lignes = fs
        .readFileSync(path.resolve(process.cwd(), f), 'utf8')
        .split('\n');
      // Témoin de LECTURE sur la MATIÈRE : le fichier a bien été ouvert.
      expect(lignes.length, `${f} n’a pas été lu`).toBeGreaterThan(50);

      lignes.forEach((ligne, i) => {
        if (!/ne peut pas (le |)porter ce filtre|ne peut pas le porter sans/.test(ligne)) return;
        occurrences += 1;
        const voisinage = lignes.slice(Math.max(0, i - 6), i + 7).join('\n');
        expect(
          MARQUES.test(voisinage),
          `⚠ ${f}:${i + 1} affirme que le filtre est impossible, sans dire que ` +
            `rc8 l’a rendu possible. Si vous rétablissez cette phrase, datez-la — ` +
            `et si vous croyez qu’elle est vraie, mesurez : ` +
            `GET /opac/search?avecFichier=true rend 155 sur 480.`,
        ).toBe(true);
      });
    }

    // ⚠ TÉMOIN DE COMPTE, et il est la moitié qui compte : si les deux
    // citations disparaissaient, la boucle ne tournerait sur RIEN et ce cas
    // serait vert sur l'ensemble vide. Deux citations historiques, exactement.
    /*
     * ⚠ TÉMOIN DE COMPTE, et il est la moitié qui compte : si la citation
     * disparaissait, la boucle tournerait sur l'ensemble VIDE et ce cas serait
     * vert sans rien mesurer.
     *
     * ⚠ UNE SEULE, et c'est mon témoin qui me l'a appris : j'en attendais deux.
     * Dans `opac-parcours-numerique.spec.tsx`, j'avais récrit la phrase AU
     * PASSÉ (« ne pouvait pas le porter »), qui est déjà la forme juste et que
     * ce motif ne cherche pas. Un compte exact ne dit pas qu'un code est
     * faux — il oblige à revenir le regarder.
     */
    expect(
      occurrences,
      'aucune occurrence lue : ce garde ne mesure plus rien (ou la citation a été retirée)',
    ).toBe(1);
  });
});
