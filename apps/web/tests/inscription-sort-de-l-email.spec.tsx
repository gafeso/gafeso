/**
 * L'inscription publique ne déclare plus un envoi qu'elle ne connaît pas.
 *
 * ⚠ L'API REND LE SORT DE L'EMAIL DEPUIS TOUJOURS, avec un commentaire qui dit
 * pourquoi : « l'interface doit pouvoir dire la vérité, et proposer le lien
 * quand l'envoi n'a pas abouti ». L'écran public ne déclarait même pas le champ
 * dans son type et affichait « un email vous a été envoyé » dans tous les cas.
 *
 * ⚠ ET LE PUBLIC N'A AUCUN RECOURS, contrairement à l'écran d'administration qui
 * a tranché ce point le premier. Un gestionnaire à qui l'envoi échoue voit le
 * lien et le transmet. Un étudiant qui lit « un email vous a été envoyé » alors
 * que rien n'est parti attend une messagerie muette — et le lien de définition
 * de mot de passe est le SEUL chemin vers son compte. Le faux ne le trompe pas
 * seulement : il l'immobilise.
 *
 * Trouvé en cherchant la famille désignée par la leçon du jour : un écran qui
 * affirme un effet que le serveur produit peut-être plus tard, ou pas du tout.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PageInscription from '@/app/inscription/page';
import { LIBELLES } from '@/lib/libelles';

vi.mock('next/navigation', () => ({
  usePathname: () => '/inscription',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function brancher(mail: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      const ok = (corps: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(corps) } as Response);
      if (url.includes('/tenancy/current')) return ok({ name: 'Université d’Exemple' });
      if (url.includes('/accounts/register')) {
        return ok({
          userId: 'u1',
          status: 'ACTIVE',
          autoActivated: true,
          ...(mail === undefined ? {} : { mail }),
        });
      }
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

async function inscrire() {
  render(<PageInscription />);
  fireEvent.change(await screen.findByPlaceholderText('ETU-2026-0142'), {
    target: { value: 'ETU-2026-0001' },
  });
  fireEvent.change(screen.getByPlaceholderText(/@/), { target: { value: 'a@b.bf' } });
  for (const champ of screen.getAllByRole('textbox')) {
    if (!(champ as HTMLInputElement).value) {
      fireEvent.change(champ, { target: { value: 'Awa' } });
    }
  }
  fireEvent.click(screen.getByRole('button', { name: /Créer mon compte|S’inscrire|Inscription/i }));
}

afterEach(() => vi.unstubAllGlobals());

describe('Inscription · sort de l’email', () => {
  it('envoi RÉUSSI : on annonce l’email', async () => {
    brancher({ sent: true });
    await inscrire();
    expect(await screen.findByText(new RegExp(LIBELLES.inscription.emailParti.slice(0, 40)))).toBeTruthy();
    expect(screen.queryByText(/N’A PAS PU ÊTRE ENVOYÉ/)).toBeNull();
  });

  /**
   * ⚠ LE CAS QUI COMPTE. Messagerie absente : l'écran disait « un email vous a
   * été envoyé » et laissait l'étudiant devant une boîte vide, sans recours.
   */
  it('messagerie ABSENTE : on le dit, et on dit quoi faire', async () => {
    brancher({ sent: false, reason: 'smtp_absent' });
    await inscrire();
    const ligne = await screen.findByText(LIBELLES.inscription.emailNonParti);
    expect(ligne).toBeTruthy();
    // ⚠ L'information sans issue ne sert à rien : la phrase doit porter la sortie.
    expect(ligne.textContent).toMatch(/Contactez votre bibliothèque/);
    expect(screen.queryByText(new RegExp(LIBELLES.inscription.emailParti.slice(0, 40)))).toBeNull();
  });

  it('envoi EN ÉCHEC : même traitement', async () => {
    brancher({ sent: false, reason: 'smtp_error', detail: 'connexion refusée' });
    await inscrire();
    expect(await screen.findByText(LIBELLES.inscription.emailNonParti)).toBeTruthy();
  });

  /**
   * ⚠ Champ ABSENT : on garde la formulation d'envoi, comme `/admin/comptes` l'a
   * tranché le premier. Ce test existe pour que ce choix reste un CHOIX — si
   * quelqu'un le change, il le changera en connaissance de cause.
   */
  it('champ absent : convention de /admin/comptes, on annonce l’envoi', async () => {
    brancher(undefined);
    await inscrire();
    expect(await screen.findByText(new RegExp(LIBELLES.inscription.emailParti.slice(0, 40)))).toBeTruthy();
  });
});
