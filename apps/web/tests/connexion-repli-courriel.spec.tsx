/**
 * Le repli de double authentification ne ment JAMAIS sur l'envoi.
 *
 * ⚠ CE QUI ÉTAIT FAUX, mesuré le 14 septembre 2026. L'écran affichait « Code
 * envoyé par email ✓ » dès que l'appel rendait 200, **sans lire la réponse**.
 * L'API rend pourtant le sort réel depuis le 12 septembre, et son commentaire
 * dit exactement pourquoi : « quelqu'un qui a perdu son appareil TOTP n'a plus
 * que ce chemin ».
 *
 * ⚠ LE BACKEND AVAIT LIVRÉ SA MOITIÉ ; LA NÔTRE N'A JAMAIS ÉTÉ BRANCHÉE. Deux
 * autres écrans — `/inscription`, `/admin/comptes` — lisaient déjà ce champ. Le
 * seul qui l'ignorait était celui où le faux coûte le plus cher : la personne
 * ne peut pas se connecter, attend devant une boîte vide, et rien ne lui dit
 * qu'il faut demander de l'aide.
 *
 * ⚠ LE GESTE QUI VIOLERA CE FICHIER : quelqu'un simplifiera en
 * `await api(...); setEmailSent(true)`. C'est plus court, ça se lit bien, et
 * c'est vrai tant qu'un serveur SMTP répond — c'est-à-dire partout sauf là où
 * ça compte.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageConnexion from '@/app/login/page';
import { LIBELLES } from '@/lib/libelles';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

/**
 * ⚠ CE QUI N'EST PAS EXPLICITEMENT PRÉVU ÉCHOUE BRUYAMMENT. Un repli discret
 * transformerait un oubli de doublure en défaut apparent du produit, et on
 * chercherait dans le code ce qui n'y est pas.
 */
function brancher(issueCourriel: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { body?: string }) => {
      const ok = (corps: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as Response);
      if (String(url).includes('/auth/login/2fa/email')) return ok(issueCourriel);
      if (String(url).includes('/auth/login'))
        return ok({
          twoFactorRequired: true,
          twoFactorToken: 'jeton-d-etape',
          // ⚠ Sans 'email', l'écran n'offre PAS le repli : la doublure aurait
          // décrit un monde où le bouton n'existe pas.
          methods: ['totp', 'email'],
        });
      if (String(url).includes('/tenancy')) return ok({ name: 'Zinda' });
      throw new Error(`requête non couverte — ${url} ${init?.body ?? ''}`);
    }),
  );
}

/** Franchit le mot de passe pour atteindre l'étape à deux facteurs. */
async function atteindreLeRepli() {
  render(<PageConnexion />);
  const champs = document.querySelectorAll('input');
  const poser = (el: Element, v: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  poser(champs[0], 'bib@exemple.bf');
  poser(champs[1], 'peu-importe');
  fireEvent.submit(champs[0].closest('form')!);
  return screen.findByRole('button', { name: LIBELLES.connexion.codeDemander });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Repli par courriel — l’écran dit ce qui est ARRIVÉ', () => {
  it('envoi réussi : il l’annonce', async () => {
    brancher({ sent: true });
    fireEvent.click(await atteindreLeRepli());
    expect(await screen.findByRole('button', { name: LIBELLES.connexion.codeEnvoye })).toBeTruthy();
  });

  it('⚠ messagerie NON CONFIGURÉE : il ne dit pas « envoyé », et il ne dit pas « réessayez »', async () => {
    // `smtp_absent` : rien ne partira jamais. Proposer un nouvel essai serait
    // une impasse polie — le texte nomme donc une sortie humaine.
    brancher({ sent: false, reason: 'smtp_absent' });
    fireEvent.click(await atteindreLeRepli());
    expect(await screen.findByText(LIBELLES.connexion.codeNonPartiDefinitif)).toBeTruthy();
    expect(screen.queryByRole('button', { name: LIBELLES.connexion.codeEnvoye })).toBeNull();
  });

  it('⚠ messagerie EN ERREUR : un nouvel essai a du sens, et il est proposé', async () => {
    brancher({ sent: false, reason: 'smtp_error' });
    fireEvent.click(await atteindreLeRepli());
    expect(await screen.findByText(LIBELLES.connexion.codeNonPartiReessayable)).toBeTruthy();
  });

  it('motif inconnu : on ne devine pas, et la sortie reste nommée', async () => {
    brancher({ sent: false, reason: 'un_motif_que_nous_ne_connaissons_pas' });
    fireEvent.click(await atteindreLeRepli());
    expect(await screen.findByText(LIBELLES.connexion.codeNonParti)).toBeTruthy();
  });
});

describe('Ce que les textes DOIVENT dire', () => {
  /**
   * ⚠ Ces assertions portent sur le CONTENU, pas sur l'emploi de la constante.
   * Comparer un écran à `LIBELLES.x` vérifie qu'il affiche la bonne VARIABLE —
   * et suit sa dégradation sans broncher. Ici, c'est la propriété qui est
   * écrite : un recours doit NOMMER à qui s'adresser.
   */
  it('⚠ les trois phrases d’échec nomment un RECOURS humain', () => {
    for (const [nom, texte] of Object.entries({
      codeNonPartiDefinitif: LIBELLES.connexion.codeNonPartiDefinitif,
      codeNonPartiReessayable: LIBELLES.connexion.codeNonPartiReessayable,
      codeNonParti: LIBELLES.connexion.codeNonParti,
    })) {
      expect(texte, `${nom} doit nommer à qui s'adresser`).toMatch(
        /bibliothèque|administrateur/i,
      );
      expect(texte, `${nom} doit dire que l'envoi a ÉCHOUÉ`).toMatch(/n’a PAS pu|n'a PAS pu/);
    }
  });

  it('⚠ la phrase DÉFINITIVE ne propose pas de réessayer', () => {
    // Le cœur de la distinction : « réessayez » devant une messagerie non
    // configurée envoie quelqu'un attendre indéfiniment.
    expect(LIBELLES.connexion.codeNonPartiDefinitif).not.toMatch(/[Rr]éessayez/);
    expect(LIBELLES.connexion.codeNonPartiReessayable).toMatch(/[Rr]éessayez/);
  });
});
