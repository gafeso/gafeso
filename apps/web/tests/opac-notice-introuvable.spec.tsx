/**
 * « Notice introuvable » n'est pas un cul-de-sac.
 *
 * La fiche ne rendait QUE l'alerte : un identifiant périmé dans un lien
 * partagé menait à une page dont le seul recours était le bouton Précédent.
 * C'est le même défaut que le catalogue vide sans explication, en plus petit —
 * et il se trouve sur une page PUBLIQUE, atteignable par n'importe quel lien
 * qui a vieilli.
 *
 * Trouvé le 10 septembre 2026 pendant la passe sans cookie de la surface
 * publique, pas en relisant le code.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
// ⚠ Depuis le 11 septembre 2026, `page.tsx` est une enveloppe SERVEUR qui
// décide du code de réponse ; la fiche elle-même est ce composant client. Son
// message d'échec reste utile : il couvre la panne d'API, et la notice qui
// disparaît entre la vérification serveur et le chargement client.
import { FicheNotice } from '@/app/opac/[id]/fiche-notice';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'inexistant-xyz' }),
  usePathname: () => '/opac/inexistant-xyz',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => vi.unstubAllGlobals());

function brancherNotice(trouvee: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: trouvee,
        status: trouvee ? 200 : 404,
        statusText: 'Not Found',
        json: () =>
          Promise.resolve(
            trouvee
              ? { id: 'x', title: 'Un titre', membersOnly: true, digitalCopy: null }
              : { message: 'Notice introuvable.' },
          ),
      } as Response),
    ),
  );
}

describe('fiche d’une notice qui n’existe pas', () => {
  it('dit ce qui se passe ET permet de repartir', async () => {
    brancherNotice(false);
    render(<FicheNotice />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Notice introuvable.');
    // La sortie. Sans elle, l'écran ne rend que l'alerte.
    expect(screen.getByRole('link', { name: '← Retour au catalogue' })).toHaveAttribute(
      'href',
      '/opac',
    );
  });

  it('témoin : une notice trouvée ne montre AUCUNE alerte', async () => {
    // Sans ce témoin, « l'alerte porte le bon texte » resterait vrai sur une
    // page qui afficherait l'alerte tout le temps.
    brancherNotice(true);
    render(<FicheNotice />);

    expect(await screen.findByText('Un titre')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
