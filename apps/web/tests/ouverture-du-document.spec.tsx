/**
 * OUVRIR LE DOCUMENT D'UN DÉPÔT — trois issues, et elles étaient indiscernables.
 *
 * ⚠ CE QUI ÉTAIT FAUX, signalé par la session backend le 15 septembre 2026 :
 *
 *     const res = await api(`/depots/${id}/document`, …);
 *     window.open(res.url, '_blank', …);        ← APRÈS l'attente
 *
 * Un `window.open` placé après un `await` a perdu le contexte du geste
 * utilisateur — c'est précisément le motif que les bloqueurs de fenêtres
 * surgissantes visent. Selon le navigateur il passe ou il est refusé, et s'il
 * est refusé **le clic ne produit RIEN** : ni document, ni message. Le directeur
 * recommence, conclut que le bouton est cassé, et abandonne — sur le geste qui
 * lui sert à décider d'un dépôt.
 *
 * ⚠ ET LE MOTIF ÉTAIT À DEUX ENDROITS. Le backend en avait trouvé un ; le
 * balayage a montré que `/admin/depots-a-cataloguer` portait le même. Trois
 * `window.open` dans tout le front, deux fautifs — le troisième est synchrone
 * dans un `onClick`, et il va bien.
 *
 * ⚠ ET LA FORME D'ABORD PROPOSÉE ÉTAIT INAPPLICABLE. Elle ouvrait l'onglet avec
 * `noopener` dans les options ; or la spécification fait alors rendre `null` à
 * `window.open`, puisque le lien entre les deux fenêtres est coupé dans les
 * deux sens. Le correctif aurait pris la branche « bloqué » à tous les coups.
 * On garde la poignée et on coupe le lien nous-mêmes — `opener = null`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageDepotsAValider from '@/app/depots-a-valider/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';
import { modulesDuRegistre } from './aide-modules';

const ROUTEUR = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  usePathname: () => '/depots-a-valider',
  useRouter: () => ROUTEUR,
  useSearchParams: () => new URLSearchParams(),
}));

const T = LIBELLES.depotsAValider;

const DEPOT = {
  id: 'd1',
  status: 'soumis',
  title: 'Le contentieux électoral au Sahel',
  authorName: 'Sanogo, Alain',
  documentType: 'these',
  year: 2026,
  fileName: 'these.pdf',
  submittedAt: '2026-09-01T00:00:00.000Z',
  studentName: 'Awa Traoré',
};

/** L'ordre dans lequel les choses se produisent — c'est TOUT l'objet du test. */
let journal: string[] = [];

function brancher({ echoue = false }: { echoue?: boolean } = {}) {
  journal = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const u = String(url);
      const ok = (c: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(c) } as Response);
      if (u.includes('/document')) {
        journal.push('appel');
        return echoue
          ? Promise.resolve({
              ok: false, status: 500, statusText: 'Erreur',
              json: () => Promise.resolve({ message: 'Document indisponible.' }),
            } as Response)
          : ok({ url: 'https://exemple.test/signe' });
      }
      if (u.includes('/auth/me/functions')) return ok({ functions: ['depot.valider', 'document.lire'] });
      if (u.includes('/depots/a-valider')) return ok([DEPOT]);
      // ⚠ TOUS LES MODULES ACTIFS, LUS DANS LE REGISTRE. Rendre `[]` les
      // déclarait tous ÉTEINTS : l'écran montait alors sur « ce module est
      // désactivé », et le test échouait en disant « bouton introuvable »
      // — c'est-à-dire en accusant le produit. La doublure était seule fautive.
      if (u.includes('/modules'))
        return ok(modulesDuRegistre().map((m) => ({ id: m.id, actif: true })));
      return ok({});
    }),
  );
}

/** Une fausse fenêtre, qui note ce qu'on lui fait. */
function fenetreQuiSOuvre() {
  const onglet = {
    opener: {} as unknown,
    _location: '',
    set location(v: string) { journal.push(`adresse posée: ${v}`); this._location = v; },
    get location() { return this._location; },
    close: () => journal.push('fermée'),
  };
  vi.stubGlobal('open', vi.fn(() => { journal.push('ouverture'); return onglet; }));
  return onglet;
}

function fenetreRefusee() {
  vi.stubGlobal('open', vi.fn(() => { journal.push('ouverture refusée'); return null; }));
}

beforeEach(() => vi.stubGlobal('open', vi.fn(() => null)));
afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function cliquerLire() {
  render(<PageDepotsAValider />);
  const bouton = await screen.findByRole('button', { name: T.lire });
  fireEvent.click(bouton);
}

describe('⚠ l’onglet s’ouvre AU CLIC, pas après l’attente', () => {
  it('l’ouverture précède l’appel — c’est l’ordre qui compte', async () => {
    brancher();
    fenetreQuiSOuvre();
    await cliquerLire();
    await waitFor(() => expect(journal).toContain('adresse posée: https://exemple.test/signe'));
    // ⚠ LE TÉMOIN EST L'ORDRE. « ouverture » AVANT « appel » : c'est la seule
    // chose qui distingue un clic que le navigateur accepte d'un clic qu'il
    // bloque, et aucune assertion sur le résultat ne peut la remplacer.
    expect(journal.indexOf('ouverture')).toBeLessThan(journal.indexOf('appel'));
  });

  it('⚠ `noopener` n’est PAS passé en options — sinon la poignée serait nulle', () => {
    brancher();
    fenetreQuiSOuvre();
    void cliquerLire();
    return waitFor(() => {
      const options = (globalThis.open as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
      expect(String(options[2] ?? '')).not.toContain('noopener');
    });
  });

  it('le lien vers l’ouvreur est coupé à la main', async () => {
    brancher();
    const onglet = fenetreQuiSOuvre();
    await cliquerLire();
    await waitFor(() => expect(onglet.opener).toBeNull());
  });
});

describe('⚠ les trois issues se distinguent', () => {
  it('fenêtre BLOQUÉE : on le dit, et on ne demande même pas l’URL', async () => {
    // ⚠ Ne pas appeler l'API est délibéré : l'URL est signée et vit cinq
    // minutes. En demander une qu'on ne peut pas ouvrir la brûle pour rien.
    brancher();
    fenetreRefusee();
    await cliquerLire();
    expect(await screen.findByText(LIBELLES.depotsAValider.fenetreBloquee)).toBeTruthy();
    expect(journal).not.toContain('appel');
  });

  it('APPEL en échec : le message de l’API, et l’onglet vide est REFERMÉ', async () => {
    // Le laisser ouvert ferait croire que quelque chose s'est passé, alors que
    // le message d'erreur est sur l'autre écran.
    brancher({ echoue: true });
    fenetreQuiSOuvre();
    await cliquerLire();
    await waitFor(() => expect(journal).toContain('fermée'));
    expect(await screen.findByText('Document indisponible.')).toBeTruthy();
  });

  it('SUCCÈS : aucun message, et l’adresse est posée', async () => {
    brancher();
    fenetreQuiSOuvre();
    await cliquerLire();
    await waitFor(() => expect(journal).toContain('adresse posée: https://exemple.test/signe'));
    expect(screen.queryByText(LIBELLES.depotsAValider.fenetreBloquee)).toBeNull();
    expect(journal).not.toContain('fermée');
  });
});

describe('Ce que le texte DOIT dire', () => {
  it('⚠ il nomme le GESTE, pas la panne', () => {
    // « Le document n'a pas pu être ouvert » enverrait chercher un défaut du
    // produit. Ici la cause est le navigateur, et la sortie est à portée.
    expect(LIBELLES.depotsAValider.fenetreBloquee).toMatch(/navigateur/i);
    expect(LIBELLES.depotsAValider.fenetreBloquee).toMatch(/autoris/i);
  });
});
