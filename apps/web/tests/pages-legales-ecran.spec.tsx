/**
 * L'ÉDITEUR DES PAGES LÉGALES, MESURÉ PAR SON EFFET — pas par sa source.
 *
 * `tests/pages-legales.spec.ts` garde les PROPRIÉTÉS DES TEXTES (ce qu'un refus
 * doit dire). Ce fichier-ci garde les GESTES, et il existe parce qu'une borne
 * déclarée là-bas était fausse :
 *
 * > « La garde est `if (!pages) { … return; }` — une sortie AVANT tout appel.
 * >   On lit la source : **un test de rendu ne peut pas prouver qu'aucune
 * >   requête ne part.** »
 *
 * ⚠ IL PEUT. Il suffit de COMPTER les requêtes de la doublure. La borne n'était
 * pas infermable : elle n'avait pas été essayée — « une borne se DÉCLARE quand
 * on ne peut pas la fermer, pas quand on n'a pas essayé ».
 *
 * ⚠ Et le garde de source avait un second défaut, celui de sa famille : il
 * épinglait le littéral `if (!pages)`. Élargir la garde en
 * `if (!pages || version === null)` — pour la MÊME garantie, étendue à la
 * version qu'exige rc9 — l'a fait crier sur un code plus juste que celui qu'il
 * défendait.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.pagesLegales;

/**
 * ⚠ ON CIBLE PAR LE NOM ANNONCÉ, PAGE PAR PAGE — et ce n'est pas une
 * commodité de test.
 *
 * Ma première écriture prenait `getAllByRole(…, { name: 'Enregistrer' })[0]`,
 * et `cibler-par-le-nom-accessible.spec.ts` l'a REFUSÉ. Il avait raison : deux
 * sections portaient deux boutons au MÊME nom accessible, donc indiscernables
 * pour qui n'a pas l'écran. Le défaut était au PRODUIT, pas au test — les trois
 * commandes portent maintenant leur nom annoncé.
 *
 * ⭐ Le harnais a trouvé un défaut d'interface gratuitement, en cherchant tout
 * autre chose.
 */
const NOM_ENREGISTRER = T.enregistrerPage(T.mentions);

/** Les fonctions de l'écran : l'écriture exige `etablissement.apparence`. */
const FONCTIONS = { functions: ['etablissement.apparence'] as string[] | null };
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => FONCTIONS }));

/* Une page légale minimale mais CONFORME au contrat de rc9. */
const BLOC = (cle: string, texte: string) => ({ cle, texte });
const PAGE = { blocs: [BLOC('editeur', 'Université d’Exemple')], publieeLe: null };

interface Appel {
  url: string;
  methode: string;
  corps: unknown;
}
let appels: Appel[] = [];

/**
 * ⚠ LA DOUBLURE ÉCHOUE BRUYAMMENT sur ce qui n'est pas prévu.
 * Un repli silencieux transformerait un oubli de doublure en défaut apparent
 * du produit, et la recherche partirait du mauvais côté.
 */
function brancher(options: {
  /**
   * `sansVersion` : le GET réussit et ne porte PAS `version`. Ce n'est pas un
   * cas inventé — c'est un front plus récent que son API, ou une régression du
   * contrat. Et c'est le SEUL état où l'éditeur s'affiche sans pouvoir
   * enregistrer, donc le seul où la garde de `envoyer()` est ATTEIGNABLE.
   */
  lecture: 'ok' | 'echec' | 'sansVersion';
  version?: number;
  ecriture?: 'ok' | 409;
}) {
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const methode = init?.method ?? 'GET';
      appels.push({
        url: String(url),
        methode,
        corps: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (String(url).endsWith('/tenancy/settings') && methode === 'GET') {
        if (options.lecture === 'echec') {
          return new Response(JSON.stringify({ message: 'injoignable' }), { status: 503 });
        }
        return new Response(
          JSON.stringify(
            options.lecture === 'sansVersion'
              ? { pagesLegales: { mentions: PAGE, confidentialite: PAGE } }
              : {
                  pagesLegales: { mentions: PAGE, confidentialite: PAGE },
                  version: options.version ?? 0,
                },
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/tenancy/settings') && methode === 'PATCH') {
        if (options.ecriture === 409) {
          return new Response(
            JSON.stringify({
              message:
                'Ces pages légales ont été modifiées entre-temps (vous avez lu la ' +
                'version 0, la version actuelle est 1). RELISEZ la page avant ' +
                'd’enregistrer : votre écriture remplacerait tout.',
              statusCode: 409,
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ id: 's1' }), { status: 200 });
      }
      throw new Error(`requête non couverte — ${methode} ${url}`);
    }),
  );
}

async function monter() {
  const { default: Ecran } = await import('@/app/admin/pages-legales/page');
  return render(<Ecran />);
}

beforeEach(() => {
  FONCTIONS.functions = ['etablissement.apparence'];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const patchs = () => appels.filter((a) => a.methode === 'PATCH');

describe('⚠⚠ ON N’ÉCRIT JAMAIS SANS AVOIR LU — mesuré par les requêtes', () => {
  /**
   * ⚠ LA GARANTIE A DEUX COUCHES, et il faut le dire pour ne pas croire qu'une
   * seule la tient.
   *
   * ① Sans `pages`, l'éditeur n'est PAS RENDU (`{pages && …}`) : il n'y a pas
   *    de bouton « Enregistrer », donc aucun PATCH n'est possible.
   * ② La garde de `envoyer()` est une défense en profondeur, pour le jour où
   *    un bouton apparaîtrait ailleurs.
   *
   * Ce cas-ci mesure ①. Le suivant mesure ② — et il a fallu trouver un état
   * où elle est ATTEIGNABLE, sans quoi j'aurais écrit un test qui ne mesure
   * rien en croyant garder la garde.
   */
  it('lecture en échec : aucun éditeur, donc aucun PATCH possible', async () => {
    brancher({ lecture: 'echec' });
    await monter();

    // L'écran dit l'erreur du SERVEUR — pas « Chargement… », qui serait un
    // faux, et pas le refus d'écriture, qui ne concerne que le geste.
    await waitFor(() => expect(screen.getByText(/injoignable/)).toBeTruthy());

    expect(
      screen.queryByRole('button', { name: NOM_ENREGISTRER }),
      'un bouton « Enregistrer » sur un écran qui n’a rien lu : il écraserait tout',
    ).toBeNull();
    // Témoin de PRÉSENCE sur l'instrument : la doublure a bien enregistré.
    expect(appels.filter((a) => a.methode === 'GET').length).toBeGreaterThan(0);
    // ⭐ ET C'EST LA MESURE QUE LA BORNE CROYAIT IMPOSSIBLE.
    expect(patchs(), 'un PATCH est parti alors que la lecture a échoué').toEqual([]);
  });

  /**
   * ⭐ LA GARDE ELLE-MÊME, et son cas est RÉEL : un GET qui réussit sans
   * porter `version`. L'éditeur s'affiche — il a le contenu — et il ne peut
   * pas écrire, parce qu'écrire sans version serait refusé par le serveur avec
   * un 400 que rien n'explique.
   *
   * ⚠ C'est pour cela que la garde dit `!pages || version === null` et non
   * `!pages` : la même garantie, étendue à ce que rc9 exige. Le garde de
   * SOURCE qui épinglait `if (!pages)` a crié sur ce changement — il gardait
   * un littéral, pas une propriété.
   */
  it('contenu lu mais version ABSENTE : l’écran refuse, et aucun PATCH ne part', async () => {
    brancher({ lecture: 'sansVersion' });
    await monter();
    const bouton = await waitFor(() =>
      screen.getByRole('button', { name: NOM_ENREGISTRER }),
    );

    bouton.click();

    await waitFor(() =>
      expect(
        screen.getByText(T.refusEnregistrerSansLecture, { exact: false }),
      ).toBeTruthy(),
    );
    expect(
      patchs(),
      '⚠ un PATCH est parti sans `pagesLegalesVersion` : rc9 le refuserait, et ' +
        'un serveur plus ancien l’ACCEPTERAIT en écrasant tout',
    ).toEqual([]);
  });

  it('lecture réussie : le PATCH porte `pagesLegalesVersion`, la version LUE', async () => {
    brancher({ lecture: 'ok', version: 7 });
    await monter();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: NOM_ENREGISTRER })).toBeTruthy(),
    );

    screen.getByRole('button', { name: NOM_ENREGISTRER }).click();

    await waitFor(() => expect(patchs().length).toBe(1));
    const corps = patchs()[0].corps as { pagesLegalesVersion?: number };
    expect(
      corps.pagesLegalesVersion,
      '⚠ sans la version, rc9 rend 400 — et l’écran ne pourrait plus jamais enregistrer',
    ).toBe(7);
  });

  /**
   * ⭐ ON RELIT APRÈS AVOIR ÉCRIT, ON N'INCRÉMENTE PAS.
   *
   * Mesuré contre l'API : la réponse du PATCH rend les réglages ENTIERS et ne
   * porte AUCUNE `version`. Poser `version + 1` supposerait le pas du
   * compteur. Sans relecture, le SECOND enregistrement d'une même session
   * repartirait avec une version périmée et récolterait un 409 inexplicable.
   */
  it('après un enregistrement réussi, l’écran RELIT la version', async () => {
    brancher({ lecture: 'ok', version: 3 });
    await monter();
    await waitFor(() => expect(appels.filter((a) => a.methode === 'GET').length).toBe(1));

    screen.getByRole('button', { name: NOM_ENREGISTRER }).click();
    await waitFor(() => expect(patchs().length).toBe(1));

    // Un SECOND GET, après le PATCH — c'est la relecture.
    await waitFor(() =>
      expect(
        appels.filter((a) => a.methode === 'GET').length,
        'aucune relecture après l’écriture : la version en mémoire est périmée',
      ).toBe(2),
    );
    const ordre = appels.map((a) => a.methode);
    expect(ordre.indexOf('PATCH')).toBeLessThan(ordre.lastIndexOf('GET'));
  });
});

describe('le 409 — le message du serveur, et sa SORTIE', () => {
  it('affiche le message du serveur TEL QUEL, avec un bouton pour relire', async () => {
    brancher({ lecture: 'ok', version: 0, ecriture: 409 });
    await monter();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: NOM_ENREGISTRER })).toBeTruthy(),
    );

    screen.getByRole('button', { name: NOM_ENREGISTRER }).click();
    await waitFor(() => expect(patchs().length).toBe(1));

    // ⚠ TEL QUEL : le serveur nomme les DEUX versions, et l'écran ne réécrit
    // pas le refus. Deux formulations du même refus divergeraient.
    await waitFor(() =>
      expect(screen.getByText(/vous avez lu la version 0/)).toBeTruthy(),
    );
    expect(screen.getByText(/la version actuelle est 1/)).toBeTruthy();
    expect(screen.getByText(T.conflitTitre)).toBeTruthy();
    // ⭐ LA SORTIE : sans elle, « Enregistrer » ne marcherait PLUS JAMAIS —
    // la version en mémoire est périmée pour toujours.
    expect(screen.getByRole('button', { name: T.conflitRelire })).toBeTruthy();
    // Et elle dit ce qu'elle coûte.
    expect(screen.getByText(T.conflitPerte)).toBeTruthy();
  });

  it('« Relire » déclenche une vraie RELECTURE, et retire le conflit', async () => {
    brancher({ lecture: 'ok', version: 0, ecriture: 409 });
    await monter();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: NOM_ENREGISTRER })).toBeTruthy(),
    );
    screen.getByRole('button', { name: NOM_ENREGISTRER }).click();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: T.conflitRelire })).toBeTruthy(),
    );
    const avant = appels.filter((a) => a.methode === 'GET').length;

    screen.getByRole('button', { name: T.conflitRelire }).click();

    await waitFor(() =>
      expect(appels.filter((a) => a.methode === 'GET').length).toBe(avant + 1),
    );
    await waitFor(() =>
      expect(screen.queryByText(T.conflitTitre), 'le conflit reste affiché après relecture')
        .toBeNull(),
    );
  });

  /**
   * ⚠ TÉMOIN D'ABSENCE : un écran qui afficherait le bloc de conflit TOUT LE
   * TEMPS passerait les deux cas ci-dessus. Sans celui-ci, ils ne distinguent
   * pas « le 409 s'affiche » de « le bloc est toujours là ».
   */
  it('sans conflit, ni le titre ni le bouton « Relire » n’existent', async () => {
    brancher({ lecture: 'ok', version: 0 });
    await monter();
    // On attend une ANCRE qui DOIT être là, avant d'affirmer une absence.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: NOM_ENREGISTRER })).toBeTruthy(),
    );
    expect(screen.queryByText(T.conflitTitre)).toBeNull();
    expect(screen.queryByRole('button', { name: T.conflitRelire })).toBeNull();
  });
});
