/**
 * L'écran de définition du mot de passe dit toujours la SORTIE.
 *
 * ⚠ TROUVÉ EN BALAYANT LA LEÇON « un faux qui retire le seul recours ». Le
 * critère n'est pas « est-ce vrai ? » mais « si c'est faux, que peut faire la
 * personne ? ». Ici l'énoncé était même EXACT — « Lien invalide ou expiré. » —
 * et c'était une impasse : cet écran est le SEUL chemin vers le compte, aucune
 * route publique ne régénère un lien, et le lien vaut 24 h. Un courriel lu le
 * lendemain suffit à immobiliser quelqu'un.
 *
 * ⚠ ET LA BRANCHE D'À CÔTÉ SAVAIT DÉJÀ LE DIRE. Le cas « jeton absent de
 * l'adresse » finit par « ou contactez le gestionnaire de votre établissement ».
 * Le cas « jeton refusé » s'arrêtait au constat. Deux portes du même écran, une
 * seule indiquait la sortie — et c'était la moins fréquente des deux.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageDefinir from '@/app/definir-mot-de-passe/page';
import { LIBELLES } from '@/lib/libelles';

const params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
  usePathname: () => '/definir-mot-de-passe',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function brancher(echec: { status: number; message: string } | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/tenancy/current')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: 'Université' }) } as Response);
      }
      if (url.includes('/accounts/set-password')) {
        if (!echec) return Promise.resolve({ ok: true, json: () => Promise.resolve({ userId: 'u1' }) } as Response);
        return Promise.resolve({
          ok: false,
          status: echec.status,
          statusText: 'Bad Request',
          json: () => Promise.resolve({ message: echec.message }),
        } as Response);
      }
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

async function soumettre() {
  render(<PageDefinir />);
  const champs = await screen.findAllByLabelText(/mot de passe/i);
  for (const c of champs) fireEvent.change(c, { target: { value: 'motdepasse123' } });
  fireEvent.click(screen.getByRole('button', { name: /Définir mon mot de passe/i }));
}

afterEach(() => vi.unstubAllGlobals());

describe('Définir mon mot de passe · la sortie', () => {
  /** ⚠ LE CAS QUI IMMOBILISE : un lien de 24 h lu le lendemain. */
  it('lien expiré : le fait ET le recours', async () => {
    params.set('token', 'jeton-perime');
    brancher({ status: 400, message: 'Lien invalide ou expiré.' });
    await soumettre();
    const boite = await screen.findByRole('alert');
    expect(boite.textContent).toContain('Lien invalide ou expiré.');
    expect(boite.textContent).toContain(LIBELLES.motDePasse.recours);
  });

  /**
   * ⚠ LE RECOURS S'AJOUTE À TOUT ÉCHEC, sans deviner lequel. Détecter le cas
   * précis demanderait de reconnaître un message français ou un code partagé
   * avec d'autres erreurs — pour un gain nul, la sortie étant la même.
   */
  it('panne quelconque : le recours aussi', async () => {
    params.set('token', 'jeton-valide');
    brancher({ status: 500, message: 'Erreur interne.' });
    await soumettre();
    expect((await screen.findByRole('alert')).textContent).toContain(
      LIBELLES.motDePasse.recours,
    );
  });

  /**
   * ⚠ ÉCRIT APRÈS UN CONTRÔLE NÉGATIF QUI N'A RIEN CASSÉ. Remplacer le recours
   * par « réessayez plus tard » ne faisait tomber aucun test : tous comparaient
   * au LIBELLÉ, donc ils suivaient sa dégradation sans broncher. Un test qui
   * restate la constante ne peut pas voir que la constante est devenue inutile.
   *
   * Ce qui se tient ici n'est pas le texte mais sa PROPRIÉTÉ : un recours doit
   * nommer à qui s'adresser. « Réessayez plus tard » n'est pas une sortie, c'est
   * une attente — et pour quelqu'un dont c'est le seul chemin vers son compte,
   * une attente sans destinataire est une impasse.
   */
  it('le recours NOMME à qui s’adresser — pas « réessayez »', () => {
    const texte = LIBELLES.motDePasse.recours;
    expect(texte).toMatch(/gestionnaire|bibliothèque|établissement/i);
    expect(texte).toMatch(/demandez|contactez/i);
  });

  it('succès : aucune alerte, donc aucun recours affiché', async () => {
    params.set('token', 'jeton-valide');
    brancher(null);
    await soumettre();
    // ⚠ On attend la DISPARITION du formulaire, pas un texte ambigu : « mot de
    // passe » apparaît sur les deux étiquettes et dans le titre. Un matcher qui
    // trouve trois éléments ne dit rien de l'état de l'écran.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Définir mon mot de passe/i })).toBeNull(),
    );
    expect(screen.queryByText(LIBELLES.motDePasse.recours)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * ⚠ Le cas « jeton absent » nommait DÉJÀ la sortie avant ce lot : ce test
   * existe pour qu'il ne la perde pas en chemin. C'est la branche qui avait
   * raison, et elle sert de témoin à l'autre.
   */
  it('jeton absent de l’adresse : la sortie était déjà nommée', async () => {
    params.delete('token');
    brancher(null);
    render(<PageDefinir />);
    const boite = await screen.findByRole('alert');
    expect(boite.textContent).toMatch(/contactez le gestionnaire/i);
  });
});
