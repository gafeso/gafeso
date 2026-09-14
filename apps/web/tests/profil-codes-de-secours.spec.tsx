/**
 * L'écran `/profil` — les codes de secours, et l'activité récente.
 *
 * ⚠ CET ÉCRAN N'AVAIT AUCUN FILET. Relevé le 14 septembre 2026 en dressant la
 * carte des écrans qu'aucun test ne monte : 7 sur 45. C'est en lisant le premier
 * de cette liste — `/login` — qu'a été trouvé le défaut du repli par courriel.
 *
 * ⚠ CE FICHIER NE RÉPARE RIEN : `/profil` a été LU pour les familles connues et
 * il est propre. Trois états bien distingués sur l'activité, une réponse lue et
 * non supposée à la régénération, un avertissement présent sur l'affichage
 * unique. Ce qui manquait n'était pas la correction, c'était la MÉMOIRE — rien
 * n'empêchait de perdre ces propriétés au prochain passage.
 *
 * ⚠ POURQUOI CET ÉCRAN PLUTÔT QU'UN AUTRE : les codes de secours sont le recours
 * de dernier ressort de quelqu'un qui perd son téléphone. C'est la même
 * population, et le même enjeu, que le repli par courriel corrigé ce soir.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * ⚠ LE ROUTEUR EST UN SINGLETON, ET C'EST INDISPENSABLE — la doublure naïve a
 * fait TOMBER LE WORKER À COURT DE MÉMOIRE.
 *
 * L'effet de cet écran dépend de `[load, loadActivity, router]`. Une fabrique
 * qui rend `{ push: vi.fn() }` produit un objet NEUF à chaque rendu : les
 * dépendances changent, l'effet se relance, il appelle `setUser`, on re-rend —
 * boucle infinie, puis OOM.
 *
 * ⚠ Le produit est correct : le vrai `useRouter` rend un objet stable. C'était
 * une hypothèse d'identité dans MA doublure, et son symptôme — un worker qui
 * meurt — ne ressemble pas du tout à sa cause.
 */
const ROUTEUR = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => ROUTEUR,
  usePathname: () => '/profil',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/session', () => ({
  getToken: () => 'jeton',
  getUser: () => ({ id: 'u1', email: 'bib@exemple.bf', firstName: 'A', lastName: 'B', role: 'LIBRARIAN' }),
}));
vi.mock('@/components/two-factor-setup', () => ({ TwoFactorSetup: () => <div /> }));

const CODES = ['AAAA-1111', 'BBBB-2222', 'CCCC-3333'];

/**
 * ⚠ CE QUI N'EST PAS PRÉVU ÉCHOUE BRUYAMMENT : un repli discret transformerait
 * un oubli de doublure en défaut apparent du produit.
 */
function brancher({ activite = [] as unknown[], codes = CODES } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const ok = (c: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(c) } as Response);
      const u = String(url);
      if (u.includes('/auth/2fa/status')) return ok({ enabled: true, backupCodesLeft: 2 });
      if (u.includes('/auth/me/activity')) return ok({ entries: activite });
      if (u.includes('/auth/2fa/backup-codes')) return ok({ backupCodes: codes });
      throw new Error(`requête non couverte — ${u}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function monter() {
  const { default: PageProfil } = await import('@/app/profil/page');
  render(<PageProfil />);
  return screen.findByText(/Activité récente/);
}

describe('Activité récente — trois états, jamais deux', () => {
  it('⚠ pendant le chargement : « Chargement… », PAS « aucune activité »', async () => {
    // Le zéro affirmé pendant un chargement est la famille la plus répandue du
    // dépôt. Ici la distinction existe ; ce test l'empêche de disparaître.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    await monter();
    expect(screen.getByText('Chargement…')).toBeTruthy();
    expect(screen.queryByText(/Aucune activité/)).toBeNull();
  });

  it('réponse VIDE : là seulement, « aucune activité »', async () => {
    brancher({ activite: [] });
    await monter();
    expect(await screen.findByText(/Aucune activité enregistrée/)).toBeTruthy();
  });

  it('réponse pleine : les entrées sont rendues', async () => {
    brancher({ activite: [{ label: 'Connexion réussie', at: '2026-09-14T10:00:00Z' }] });
    await monter();
    expect(await screen.findByText('Connexion réussie')).toBeTruthy();
  });
});

/**
 * ⚠ ON CIBLE PAR LE NOM, JAMAIS PAR LA POSITION — et j'ai commencé par
 * l'oublier. L'écran porte QUATRE champs de mot de passe et DEUX formulaires :
 * trois champs appartiennent au changement de mot de passe, un seul à la
 * régénération. `querySelector('input[type=password]')` prenait le premier,
 * donc je soumettais le mauvais formulaire — et le test échouait en disant
 * « code introuvable », c'est-à-dire en accusant le produit.
 *
 * C'est la leçon du clic ciblé par position, appliquée à un CHAMP.
 */
function formulaireDeRegeneration(): HTMLFormElement {
  const form = [...document.querySelectorAll('form')].find((f) =>
    [...f.querySelectorAll('button')].some((b) => /Régénérer|Confirmer|Valider/.test(b.textContent ?? '')),
  );
  if (!form) throw new Error('formulaire de régénération introuvable');
  return form as HTMLFormElement;
}

async function regenerer() {
  fireEvent.click(screen.getByRole('button', { name: /Régénérer les codes/ }));
  const form = await waitFor(formulaireDeRegeneration);
  const champ = form.querySelector('input[type=password]');
  if (!champ) throw new Error('champ de confirmation introuvable dans le formulaire');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'mdp');
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  fireEvent.submit(form);
}

describe('Codes de secours — le recours de dernier ressort', () => {
  it('⚠ les codes affichés sont ceux que l’API a RENDUS, jamais des inventés', async () => {
    brancher({ codes: ['ZZZZ-9999'] });
    await monter();
    await regenerer();
    expect(await screen.findByText('ZZZZ-9999')).toBeTruthy();
  });

  it('⚠ l’écran AVERTIT que les codes ne seront plus montrés', async () => {
    // Sans cet avertissement, on quitte la page et on perd le seul recours qui
    // reste quand le téléphone est perdu. C'est la propriété, pas la formulation.
    brancher();
    await monter();
    await regenerer();
    await screen.findByText(CODES[0]);
    expect(document.body.textContent).toMatch(/une seule fois/i);
  });
});
