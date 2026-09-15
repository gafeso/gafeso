/**
 * LE GUICHET DIT QUAND LE RÉSERVATAIRE N'A PAS ÉTÉ PRÉVENU.
 *
 * ⚠ CE QUI ÉTAIT FAUX, relevé le 14 septembre 2026. Au retour d'un document
 * réservé, l'écran affichait :
 *
 *     « À mettre de côté — le réservataire a N jours pour venir le retirer. »
 *
 * Ce qui **laisse croire qu'il a été prévenu**. L'API rend pourtant
 * `nonPrevenus` depuis qu'elle a cessé de jeter l'issue de la notification, et
 * son commentaire disait déjà tout le dégât : « la bibliothécaire met un
 * document de côté, croit le lecteur prévenu, et le document repart au suivant
 * à l'expiration sans que celui qui l'attendait ait jamais rien su ».
 *
 * ⚠ LE FRONT NE DÉCLARAIT MÊME PAS LE CHAMP. Zéro occurrence de `nonPrevenus`
 * dans tout `apps/web` — c'est « une colonne SERVIE que personne ne montre »,
 * sur l'écran où l'ignorer coûte une réservation perdue.
 *
 * ⚠ DEUXIÈME FOIS LE MÊME SOIR : le backend livre la moitié qui RAPPORTE, et la
 * nôtre n'est jamais branchée. La première était « Code envoyé par email ✓ » sur
 * l'écran de connexion.
 *
 * ⚠ ET C'EST « DEUX SILENCES QUI SE CUMULENT » dans sa forme canonique : le
 * courriel échoue sans bruit, l'écran ne dit rien. Chacun seul est rattrapable
 * — l'écran compenserait le courriel, le courriel compenserait l'écran.
 * Ensemble, ils ferment la porte.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GuichetPage from '@/app/guichet/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

const ROUTEUR = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  usePathname: () => '/guichet',
  useRouter: () => ROUTEUR,
  useSearchParams: () => new URLSearchParams(),
}));

const HOLD = { holdId: 'h1', patronId: 'p1', pickupDays: 3 };
const TITRE = 'Droit constitutionnel burkinabè';

/**
 * ⚠ Ce qui n'est pas explicitement prévu échoue BRUYAMMENT : un repli discret
 * ferait chercher dans le produit un défaut qui n'y est pas.
 */
function brancher(retour: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const ok = (c: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(c) } as Response);
      const u = String(url);
      if (u.includes('/circulation/return')) return ok(retour);
      if (u.includes('/auth/me/functions'))
        return ok({ functions: ['circulation.faire', 'document.lire'] });
      if (u.includes('/circulation/holds')) return ok([]);
      if (u.includes('/modules')) return ok({ modules: {} });
      // ⚠ ET J'AI COMMENCÉ PAR ÉCRIRE `return ok({})` ICI — le repli discret que
      // l'en-tête de ce fichier dénonce. Il a rendu `{}` pour la route de retour,
      // que j'avais mal nommée (`/checkins` au lieu de `/return`), et le test a
      // échoué en disant « texte introuvable » : il accusait le produit.
      throw new Error(`requête non couverte — ${u}`);
    }),
  );
}

/**
 * ⚠ ON CIBLE PAR LE NOM, JAMAIS PAR LA POSITION NI PAR UN MARQUE-PLACE. Les
 * marques-place du guichet sont des EXEMPLES de codes-barres (« BIB-000123 ») :
 * chercher « code » ou « barre » dedans ne trouve rien. Et les deux onglets
 * portent chacun un champ, donc « le premier input » est faux une fois sur deux.
 *
 * Le formulaire se trouve par SON BOUTON — c'est la seule chose qui le nomme.
 */
async function enregistrerUnRetour() {
  render(<GuichetPage />);
  fireEvent.click(await screen.findByRole('tab', { name: /Retour/i }));
  const form = await waitFor(() => {
    const f = [...document.querySelectorAll('form')].find((x) =>
      [...x.querySelectorAll('button')].some((b) => /Enregistrer le retour/.test(b.textContent ?? '')),
    );
    if (!f) throw new Error('formulaire de retour introuvable');
    return f as HTMLFormElement;
  });
  const champ = form.querySelector('input');
  if (!champ) throw new Error('champ du formulaire de retour introuvable');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'BIB-1');
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  fireEvent.submit(form);
}


beforeEach(() => ouvrirSession());
afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Retour d’un document réservé', () => {
  it('lecteur PRÉVENU : rien de plus que la mise de côté', async () => {
    brancher({ returned: true, fine: { overdueDays: 0, amountXof: 0 }, holdReady: HOLD, nonPrevenus: [] });
    await enregistrerUnRetour();
    expect(await screen.findByText(/Ne pas remettre en rayon/)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.reservations.nonPrevenuDefinitif)).toBeNull();
    expect(screen.queryByText(LIBELLES.reservations.nonPrevenuRetente)).toBeNull();
  });

  it('⚠ AUCUNE adresse exploitable : on le dit, et on dit que personne ne le fera', async () => {
    // `aucun_destinataire` garde `notifiedAt` posé : il n'y aura AUCUNE nouvelle
    // tentative. Si la bibliothécaire ne le prévient pas, personne ne le fera.
    brancher({
      returned: true, fine: { overdueDays: 0, amountXof: 0 }, holdReady: HOLD,
      nonPrevenus: [{ holdId: 'h1', titre: TITRE, motif: 'aucun_destinataire' }],
    });
    await enregistrerUnRetour();
    expect(await screen.findByText(LIBELLES.reservations.nonPrevenuDefinitif)).toBeTruthy();
  });

  it('⚠ échec SMTP : on le dit AUTREMENT, parce qu’un nouvel envoi aura lieu', async () => {
    brancher({
      returned: true, fine: { overdueDays: 0, amountXof: 0 }, holdReady: HOLD,
      nonPrevenus: [{ holdId: 'h1', titre: TITRE, motif: 'smtp_error' }],
    });
    await enregistrerUnRetour();
    expect(await screen.findByText(LIBELLES.reservations.nonPrevenuRetente)).toBeTruthy();
  });

  it('⚠ un échec sur une AUTRE réservation ne concerne pas ce retour', async () => {
    // Le rapprochement se fait sur `holdId`. Sans lui, on alarmerait la
    // bibliothécaire à propos d'un lecteur qui n'a rien à voir avec ce document
    // — et le bruit use ce qui doit être lu le jour où il compte.
    brancher({
      returned: true, fine: { overdueDays: 0, amountXof: 0 }, holdReady: HOLD,
      nonPrevenus: [{ holdId: 'h-AUTRE', titre: 'Autre ouvrage', motif: 'aucun_destinataire' }],
    });
    await enregistrerUnRetour();
    await screen.findByText(/Ne pas remettre en rayon/);
    expect(screen.queryByText(LIBELLES.reservations.nonPrevenuDefinitif)).toBeNull();
  });

  it('champ ABSENT de la réponse : on n’invente aucune alerte', async () => {
    // Une API antérieure au champ ne doit pas faire crier l'écran.
    brancher({ returned: true, fine: { overdueDays: 0, amountXof: 0 }, holdReady: HOLD });
    await enregistrerUnRetour();
    await screen.findByText(/Ne pas remettre en rayon/);
    expect(screen.queryByText(LIBELLES.reservations.nonPrevenuDefinitif)).toBeNull();
  });
});

describe('Ce que les deux phrases DOIVENT dire', () => {
  it('⚠ chacune prescrit un GESTE, et le bon', () => {
    // Assertions de propriété : comparer l'écran à la constante ne vérifie que
    // la variable, et suivrait sa dégradation sans broncher.
    expect(LIBELLES.reservations.nonPrevenuDefinitif).toMatch(/comptoir|téléphone/i);
    expect(LIBELLES.reservations.nonPrevenuDefinitif).toMatch(/ne le sera pas|jamais/i);
    expect(LIBELLES.reservations.nonPrevenuRetente).toMatch(/retent/i);
  });

  it('⚠ la phrase DÉFINITIVE dit la conséquence si personne n’agit', () => {
    // Sans elle, « prévenez-le autrement » est une consigne sans enjeu, et on
    // ne s'y arrête pas au comptoir un jour de presse.
    expect(LIBELLES.reservations.nonPrevenuDefinitif).toMatch(/repartira|suivant/i);
  });
});
