/**
 * LA VERSION QUI TOURNE — et surtout : ce qui s'affiche quand on ne la sait pas.
 *
 * ⚠ LA GARANTIE QUE CE FICHIER DÉFEND n'est pas « la version s'affiche ». C'est
 * **« rien ne s'affiche quand on ne sait pas »**. Un numéro inventé, une valeur
 * par défaut ou un « version inconnue » dans un pied de page enverrait un
 * support diagnostiquer sur le mauvais code — et c'est précisément le défaut
 * qu'afficher la version existe pour corriger : trois `package.json` à `0.1.0`
 * sur 759 commits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { lireVersion } from '@/lib/version-qui-tourne';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/catalogue',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/functions', () => ({
  useMyFunctions: () => ({ functions: ['document.lire', 'catalogue.gerer'] }),
}));
/*
 * ⚠ `{ modulesActifs }`, ET PAS `{ actifs, chargement }` — c'est la forme RÉELLE
 * du hook (`lib/modules-actifs.ts` rend `{ modulesActifs }`). Ma première
 * doublure inventait deux champs qui n'existent pas, et le défaut a dormi
 * jusqu'au 8 octobre 2026 : ce jour-là le menu de compte a commencé à appeler
 * `moduleEteint()`, qui fait `modulesActifs !== null && !modulesActifs.includes(…)`.
 * Sur `undefined`, `!== null` est VRAI et `.includes` lève.
 *
 * ⭐ « Une doublure est une hypothèse » : celle-ci décrivait un hook qui n'existe
 * pas, et rien ne pouvait la démentir tant que personne ne lisait son retour.
 * `null` est la valeur juste — « on ne sait pas encore », qui laisse tout passer.
 */
vi.mock('@/lib/modules-actifs', () => ({
  useModulesActifs: () => ({ modulesActifs: null }),
}));

import { AdminShell } from '@/components/admin-shell';

describe('lireVersion — un seul endroit interprète /health', () => {
  it('rend la version et le commit quand l’API les dit', () => {
    expect(lireVersion({ version: '1.0.0', commit: 'abc1234' })).toEqual({
      version: '1.0.0',
      commit: 'abc1234',
    });
  });

  it('⚠ rend NULL sans version exploitable — jamais une chaîne vide', () => {
    // Les quatre formes qu'une charge inattendue peut prendre. Chacune doit
    // donner `null`, parce que l'appelant n'affiche alors RIEN.
    expect(lireVersion({ commit: 'abc1234' })).toBeNull();
    expect(lireVersion({ version: '', commit: 'abc' })).toBeNull();
    expect(lireVersion({ version: '   ' })).toBeNull();
    expect(lireVersion(null)).toBeNull();
    expect(lireVersion('1.0.0')).toBeNull();
  });

  it('⚠ `inconnu` quand le commit manque — une RÉPONSE, pas un trou', () => {
    // L'API emploie ce mot elle-même quand l'environnement ne porte pas le
    // commit. Une chaîne vide s'afficherait comme « commit  » : un trou que le
    // support lirait comme un défaut d'affichage.
    expect(lireVersion({ version: '1.0.0' })?.commit).toBe('inconnu');
    expect(lireVersion({ version: '1.0.0', commit: '  ' })?.commit).toBe('inconnu');
  });
});

describe('les libellés disent ce qu’ils doivent dire', () => {
  it('⚠ le pied PUBLIC porte la version et PAS le commit', () => {
    // La propriété, pas l'emploi : un visiteur de bibliothèque n'a rien à faire
    // d'un SHA, et la décision doit survivre à une réécriture du texte.
    const texte = LIBELLES.pied.version('1.2.3');
    expect(texte).toContain('1.2.3');
    expect(texte.toLowerCase()).not.toContain('commit');
  });

  it('⚠ la coque PROFESSIONNELLE porte les deux — c’est elle qui diagnostique', () => {
    const texte = LIBELLES.administration.version('1.2.3', 'abc1234');
    expect(texte).toContain('1.2.3');
    expect(texte).toContain('abc1234');
  });
});

describe('la coque affiche la version — et RIEN quand elle ne la sait pas', () => {
  beforeEach(() => ouvrirSession());
  afterEach(() => {
    fermerSession();
    vi.unstubAllGlobals();
  });

  function doubler(reponse: () => Promise<Response> | never) {
    vi.stubGlobal('fetch', (entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/health')) return reponse();
      throw new Error(`requête non couverte — ${url}`);
    });
  }
  const ok = (charge: unknown) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(charge) } as Response);

  it('l’affiche quand /health répond', async () => {
    doubler(() => ok({ version: '1.0.0', commit: 'abc1234' }));
    render(<AdminShell>contenu</AdminShell>);
    expect(
      await screen.findByText(LIBELLES.administration.version('1.0.0', 'abc1234')),
    ).toBeTruthy();
  });

  it('⚠ n’affiche RIEN quand /health est injoignable', async () => {
    doubler(() => Promise.reject(new Error('injoignable')));
    render(<AdminShell>contenu</AdminShell>);
    // ⚠ On attend une ancre STABLE que ce cas rend VRAIMENT, avant d'affirmer
    // une absence : sans elle, l'assertion passerait avant tout rendu et ne
    // mesurerait rien (leçon du 15 septembre).
    await waitFor(() => expect(screen.getByText('contenu')).toBeTruthy());
    expect(screen.queryByText(/Gafeso 1\.0\.0/)).toBeNull();
    expect(screen.queryByText(/inconnu/i)).toBeNull();
    expect(screen.queryByText(/version/i)).toBeNull();
  });

  /*
   * ⚠ CE QUE LE CONTRÔLE NÉGATIF A MESURÉ, et il a corrigé ma lecture du défaut.
   *
   * En sortant le `fetch` du `try` — donc en rétablissant l'ancien `.catch` —
   * ce cas RESTE VERT : `demander()` est une fonction `async`, et une exception
   * synchrone y devient un REJET, que le rendu absorbe. La suite sort pourtant
   * en 1, par la section `Errors` : « Unhandled Rejection ».
   *
   * ⭐ Donc ce cas-ci ne défend PAS le `try` : il défend l'enveloppe `async`.
   * Ce que le `try` défend est l'absence de rejet non rattrapé, et cela ne se
   * voit que dans le CODE DE SORTIE, jamais dans une assertion nommée. Quelqu'un
   * qui lirait « 9 passed » conclurait que tout va bien.
   *
   * ⚠ Et la forme ORIGINALE du défaut — un `fetch(...).then().catch()` appelé
   * directement dans le `useEffect`, hors de toute fonction `async` — fait
   * tomber SEPT autres fichiers, parce que l'exception traverse alors le rendu
   * de la coque entière. Elle est donc gardée, bruyamment, mais AILLEURS.
   *
   * Les trois protections, et chacune se voit à un endroit différent :
   *   · l'enveloppe `async`   → ce cas, nommé ;
   *   · le `try`              → le code de sortie, section `Errors` ;
   *   · ne pas appeler `fetch` nu dans l'effet → sept autres fichiers.
   */
  it('⚠ n’affiche RIEN quand /health lève SYNCHRONEMENT', async () => {
    // Le cas qui a cassé SEPT écrans sans rapport le 6 octobre 2026 : les
    // doublures de ce dépôt refusent bruyamment, et un `.catch` ne voit pas une
    // exception synchrone. Elle traversait le rendu de la coque entière.
    doubler(() => {
      throw new Error('doublure qui refuse');
    });
    render(<AdminShell>contenu</AdminShell>);
    await waitFor(() => expect(screen.getByText('contenu')).toBeTruthy());
    expect(screen.queryByText(/version/i)).toBeNull();
  });

  it('⚠ n’affiche RIEN quand /health répond une charge inattendue', async () => {
    doubler(() => ok({ status: 'ok', service: 'gafeso-api' }));
    render(<AdminShell>contenu</AdminShell>);
    await waitFor(() => expect(screen.getByText('contenu')).toBeTruthy());
    expect(screen.queryByText(/version/i)).toBeNull();
  });
});
