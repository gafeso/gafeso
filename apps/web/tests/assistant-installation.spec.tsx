/**
 * L'ASSISTANT D'INSTALLATION — ses garanties, et surtout celle qui enferme
 * dehors si elle tombe.
 *
 * ⚠ CE QUE CE FICHIER DÉFEND EN PREMIER : le LIEN de définition du mot de passe
 * est affiché, avec son avertissement, **que le courriel soit parti ou non**.
 * Sans SMTP c'est le SEUL chemin vers le SEUL compte de l'instance — une page
 * rechargée sans l'avoir copié laisse l'installateur dehors, et ce dépôt a déjà
 * payé ce faux une fois sur l'inscription publique.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/installation',
  useSearchParams: () => new URLSearchParams(),
}));

import InstallationPage from '@/app/installation/page';

const T = LIBELLES.installation;

const CONSTAT = {
  appUrl: 'https://biblio.exemple.org',
  smtp: { configure: false, hote: null },
  version: '1.0.0-rc6',
  commit: 'abc1234',
  horsPortee: ['APP_URL et les trois domaines servis par Caddy'],
};
const MODULES = [
  { id: 'catalogue', libelle: 'Catalogue', description: 'Les notices.', noyau: true, dependances: [] },
  { id: 'rappels', libelle: 'Rappels', description: 'Courriels de retard.', noyau: false, dependances: ['circulation'] },
];

let envois: { url: string; methode: string; entetes: Record<string, string>; corps: unknown }[] = [];
let etat: { requise: boolean } | 'panne' = { requise: true };
let termine: Record<string, unknown> = {
  termine: true,
  etablissement: { nom: 'Université d’Exemple', slug: 'uex' },
  administrateur: { email: 'admin@exemple.org' },
  lienMotDePasse: 'https://biblio.exemple.org/definir-mot-de-passe?token=XYZ',
  courrielEnvoye: false,
  motifCourriel: 'smtp_absent',
};

function doubler() {
  envois = [];
  vi.stubGlobal('fetch', (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    const entetes = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    );
    envois.push({ url, methode: init?.method ?? 'GET', entetes, corps: init?.body });
    const ok = (c: unknown) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(c) } as Response);
    if (url.includes('/installation/etat')) {
      if (etat === 'panne') return Promise.reject(new Error('injoignable'));
      return ok(etat);
    }
    if (url.includes('/installation/jeton')) return ok({ sessionAssistant: 'SESSION-COURTE' });
    if (url.includes('/installation/constat')) return ok(CONSTAT);
    if (url.includes('/installation/modules')) return ok(MODULES);
    if (url.includes('/installation/test-courriel'))
      return ok({ envoye: false, motif: 'smtp_absent', message: 'Aucun serveur SMTP.', geste: 'Renseignez SMTP_HOST.' });
    if (url.includes('/installation/terminer')) return ok(termine);
    throw new Error(`requête non couverte — ${url}`);
  });
}

beforeEach(doubler);
afterEach(() => vi.unstubAllGlobals());

async function ouvrirLAssistant() {
  render(<InstallationPage />);
  const champ = await screen.findByLabelText(T.jetonChamp);
  fireEvent.change(champ, { target: { value: 'un-jeton' } });
  fireEvent.click(screen.getByRole('button', { name: T.jetonValider }));
  await waitFor(() => expect(screen.getByText(T.constatTitre)).toBeTruthy());
}

describe('le titre de l’onglet ne nomme AUCUNE école', () => {
  it('⚠ `absolute` : le gabarit racine n’y ajoute rien', async () => {
    /*
     * ⚠ TROUVÉ PAR UNE RECETTE le 9 octobre 2026, pas par ces tests. L'onglet
     * affichait « Installer Gafeso · Université d'Exemple — Bibliothèque
     * universitaire » : une chaîne nue est passée au `template` du gabarit
     * PARENT. Sur une instance NEUVE il n'existe pas d'école — et c'est
     * exactement le cas que cet écran existe pour traiter.
     *
     * ⭐ Le commentaire du fichier disait déjà « hériter du gabarit racine ferait
     * apparaître un nom vide ». Il avait raison, et il décrivait une protection
     * que le code ne fournissait pas : un texte qui décrit une sauvegarde est un
     * test qui n'a pas été écrit.
     */
    const { metadata } = await import('@/app/installation/layout');
    expect(metadata.title).toEqual({ absolute: 'Installer Gafeso' });
  });
});

describe('TROIS états, pas deux', () => {
  it('⚠ `requise` inconnu : NI l’assistant NI « déjà installée »', async () => {
    etat = 'panne';
    render(<InstallationPage />);
    await waitFor(() => expect(screen.getByText(LIBELLES.commun.chargement)).toBeTruthy());
    // Une panne ne vaut pas « déjà installée » : ce serait envoyer un
    // installateur croire son instance déjà prise.
    expect(screen.queryByText(T.dejaInstallee)).toBeNull();
    expect(screen.queryByLabelText(T.jetonChamp)).toBeNull();
    etat = { requise: true };
  });

  it('déjà installée : aucun formulaire, et une sortie', async () => {
    etat = { requise: false };
    render(<InstallationPage />);
    expect(await screen.findByText(T.dejaInstallee)).toBeTruthy();
    expect(screen.getByText(T.dejaInstalleeSortie)).toBeTruthy();
    expect(screen.queryByLabelText(T.jetonChamp)).toBeNull();
    etat = { requise: true };
  });
});

describe('le jeton s’échange contre une SESSION', () => {
  it('⚠ le jeton ne voyage QU’UNE FOIS ; la suite porte l’en-tête', async () => {
    await ouvrirLAssistant();
    const avecJeton = envois.filter((e) => String(e.corps ?? '').includes('un-jeton'));
    expect(avecJeton, 'le jeton d’amorçage ne part qu’à /installation/jeton').toHaveLength(1);
    expect(avecJeton[0].url).toContain('/installation/jeton');

    // ⚠ Et les appels gardés portent la SESSION, pas le jeton.
    const gardes = envois.filter((e) => /constat|modules/.test(e.url));
    expect(gardes.length).toBeGreaterThan(0);
    for (const g of gardes) {
      expect(g.entetes['x-installation-session']).toBe('SESSION-COURTE');
      expect(String(g.corps ?? '')).not.toContain('un-jeton');
    }
  });
});

describe('⚠ LE LIEN DE MOT DE PASSE — la garantie qui enferme dehors', () => {
  async function terminerLInstallation() {
    await ouvrirLAssistant();
    for (const [libelle, valeur] of [
      [T.champNom, 'Université d’Exemple'],
      [T.champSlug, 'uex'],
      [T.champDomaine, 'biblio.exemple.org'],
      [T.champEmail, 'admin@exemple.org'],
      [T.champPrenom, 'Awa'],
      [T.champNom2, 'Traoré'],
    ] as const) {
      fireEvent.change(screen.getByLabelText(libelle), { target: { value: valeur } });
    }
    fireEvent.click(screen.getByLabelText(new RegExp(T.confirmer.slice(0, 20))));
    fireEvent.click(screen.getByRole('button', { name: T.terminer }));
    await waitFor(() => expect(screen.getByText(T.finiTitre)).toBeTruthy());
  }

  it('⚠ affiché même quand le courriel N’EST PAS parti', async () => {
    termine = { ...termine, courrielEnvoye: false };
    await terminerLInstallation();
    expect(screen.getByText('https://biblio.exemple.org/definir-mot-de-passe?token=XYZ')).toBeTruthy();
    expect(screen.getByText(T.lienAvertissement)).toBeTruthy();
    expect(screen.getByText(T.courrielPasParti)).toBeTruthy();
  });

  it('⚠ affiché AUSSI quand le courriel est parti — « accepté » n’est pas « arrivé »', async () => {
    termine = { ...termine, courrielEnvoye: true };
    await terminerLInstallation();
    expect(screen.getByText('https://biblio.exemple.org/definir-mot-de-passe?token=XYZ')).toBeTruthy();
    expect(screen.getByText(T.lienAvertissement)).toBeTruthy();
    expect(screen.getByText(T.courrielParti)).toBeTruthy();
    termine = { ...termine, courrielEnvoye: false };
  });

  it('⚠ SECOND GESTE : sans la confirmation, le bouton n’agit pas', async () => {
    await ouvrirLAssistant();
    const bouton = screen.getByRole('button', { name: T.terminer });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    const avant = envois.length;
    fireEvent.click(bouton);
    expect(envois.length, 'aucun appel ne part sans la confirmation').toBe(avant);
  });
});

describe('le test de courriel dit la VÉRITÉ', () => {
  it('⚠ un échec donne le MOTIF et le GESTE, et n’est pas une panne d’écran', async () => {
    await ouvrirLAssistant();
    fireEvent.change(screen.getByLabelText(T.courrielChamp), { target: { value: 'moi@exemple.org' } });
    fireEvent.click(screen.getByRole('button', { name: T.courrielEnvoyer }));
    expect(await screen.findByText('Aucun serveur SMTP.')).toBeTruthy();
    expect(screen.getByText('Renseignez SMTP_HOST.')).toBeTruthy();
  });
});

describe('la PROPRIÉTÉ des textes, pas leur emploi', () => {
  it('⚠ l’aide du test de courriel distingue ACCEPTÉ d’ARRIVÉ', () => {
    expect(T.courrielAide).toMatch(/accept/i);
    expect(T.courrielAide).toMatch(/vérifi/i);
    // Elle ne doit jamais affirmer la livraison.
    expect(T.courrielAide).not.toMatch(/\ba été (envoyé|livré|reçu)\b/i);
  });

  it('⚠ l’avertissement du lien dit UNE FOIS, et que la page ne le réaffichera pas', () => {
    expect(T.lienAvertissement).toMatch(/une fois/i);
    expect(T.lienAvertissement).toMatch(/seul chemin/i);
  });

  it('⚠ l’aide du jeton dit OÙ le lire — deux endroits', () => {
    expect(T.jetonAide).toMatch(/journal|logs/i);
    expect(T.jetonAide).toMatch(/fichier|amorcage/i);
  });

  it('⚠ la confirmation dit que ce n’est pas défaisable', () => {
    expect(T.confirmerAide).toMatch(/pas défaisable|irréversible/i);
  });

  it('⚠ et l’écran NOMME ce qu’il ne peut pas changer', () => {
    expect(T.horsPorteeAide).toMatch(/\.env\.prod/);
    expect(T.horsPorteeAide).toMatch(/redémarr/i);
  });
});
