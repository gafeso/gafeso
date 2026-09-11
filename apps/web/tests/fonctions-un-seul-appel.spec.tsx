/**
 * Les fonctions de l'utilisateur ne sont demandées qu'UNE fois par rendu.
 *
 * ⚠ Trois composants les consultent sur un même écran — la coque, l'écran, sa
 * garde — et chacun demandait les siennes : trois appels identiques par
 * chargement, mesurés au journal réseau le 11 septembre 2026 (backlog n° 11).
 *
 * ⚠ ET CE QUE CE TEST DÉFEND SURTOUT, C'EST CE QU'ON N'A PAS FAIT. Le remède
 * évident — mémoriser le résultat — aurait gardé un droit RÉVOQUÉ visible
 * jusqu'au prochain rechargement complet de l'onglet. Les fonctions sont
 * résolues en base à chaque requête côté API précisément pour qu'une révocation
 * prenne effet tout de suite. On ne partage donc que la requête EN VOL, et on
 * la relâche dès qu'elle aboutit : un second rendu redemande.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useMyFunctions } from '@/lib/functions';
import { fermerSession, ouvrirSession } from './aide-session';

let appels = 0;

function brancher(fonctions: string[]) {
  appels = 0;
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/auth/me/functions')) {
        appels += 1;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ functions: fonctions }),
        } as Response);
      }
      throw new Error(`Doublure : requête non couverte — ${url}`);
    }),
  );
}

/** Trois consommateurs, comme sur un écran réel. */
function Ecran() {
  const a = useMyFunctions();
  const b = useMyFunctions();
  const c = useMyFunctions();
  return (
    <p>
      {/* « ? » = pas encore chargé, « ∅ » = aucune fonction. Deux marqueurs
          distincts : une chaîne vide se normalise en rien et rend l'assertion
          introuvable — l'absence de résultat se lirait alors comme une absence
          de rendu. */}
      {[a, b, c]
        .map((r) => (r.functions === null ? '?' : r.functions.join('+') || '∅'))
        .join(' | ')}
    </p>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe('⚠ une seule requête pour trois consommateurs', () => {
  it('les trois obtiennent les mêmes fonctions, en un appel', async () => {
    brancher(['catalogue.gerer']);
    render(<Ecran />);

    await waitFor(() =>
      expect(screen.getByText('catalogue.gerer | catalogue.gerer | catalogue.gerer')).toBeInTheDocument(),
    );
    expect(appels).toBe(1);
  });
});

describe('⚠ le résultat n’est PAS mémorisé — une révocation doit se voir', () => {
  it('un rendu ultérieur redemande, et voit le droit retiré', async () => {
    brancher(['catalogue.gerer']);
    const premier = render(<Ecran />);
    await waitFor(() => expect(appels).toBe(1));
    premier.unmount();

    // Le droit est retiré côté serveur, sans rechargement de l'onglet.
    brancher([]);
    render(<Ecran />);

    await waitFor(() => expect(screen.getByText('∅ | ∅ | ∅')).toBeInTheDocument());
    // La preuve qui compte : l'API a bien été REDEMANDÉE. Si le résultat était
    // mémorisé, ce compteur resterait à zéro et l'écran montrerait encore un
    // droit que l'utilisateur n'a plus.
    expect(appels).toBe(1);
  });
});

describe('sans session, aucune requête', () => {
  it('ne dérange pas l’API sur une page publique', async () => {
    brancher(['catalogue.gerer']);
    fermerSession();
    render(<Ecran />);

    await waitFor(() => expect(screen.getByText('∅ | ∅ | ∅')).toBeInTheDocument());
    expect(appels).toBe(0);
  });
});
