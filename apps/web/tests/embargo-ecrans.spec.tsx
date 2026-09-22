/**
 * L'EMBARGO À L'ÉCRAN — les DEUX moitiés, éprouvées ensemble.
 *
 * ⚠ Ce fichier existe pour que la moitié « poser » ne puisse pas être livrée
 * seule. Voir `embargo.spec.tsx` pour le motif complet : un champ sans
 * affichage fabrique un document que la bibliothécaire croit protégé et qui,
 * pour le lecteur, refuse sans rien dire.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { dateLisible } from '@/lib/embargo';
import { fermerSession, ouvrirSession } from './aide-session';

const ID = 'rec-embargo';
const DANS_UN_AN = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const IL_Y_A_UN_AN = new Date(Date.now() - 365 * 24 * 3600 * 1000);

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: ID }),
  usePathname: () => `/admin/catalogue/${ID}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import FicheNoticePage from '@/app/admin/catalogue/[id]/page';
import { FicheNotice } from '@/app/opac/[id]/fiche-notice';

const NOTICE = {
  id: ID,
  title: 'Cryptographie appliquée — thèse',
  titleComplement: null,
  author: 'Sanogo, Alain',
  /*
    ⚠ CE JEU D'ESSAI EST COMPLET EXPRÈS, et ma première version ne l'était pas :
    `saveRecord` refuse AVANT d'envoyer quand il manque un auteur principal, un
    directeur (le type est `these`) ou trois mots-clés. Le formulaire ne partait
    donc pas, et les deux cas d'envoi échouaient en accusant le produit — c'est
    la cinquième lecture d'une mutation qui ne casse rien : le chemin existe, le
    code s'exécute, et le jeu d'essai n'arrive jamais jusqu'à lui.
  */
  contributors: [
    { name: 'Sanogo, Alain', role: 'AUTEUR_PRINCIPAL', position: 0 },
    { name: 'Zongo, Pauline', role: 'DIRECTEUR_MEMOIRE', position: 1 },
  ],
  isbn: null,
  publishYear: 2026,
  category: 'informatique',
  recordType: 'these',
  publisher: null,
  publicationCity: null,
  // ⚠ RENSEIGNÉS, parce que le type est `these` : le formulaire rend alors
  // « Université de soutenance » OBLIGATOIRE, et jsdom applique la validation
  // HTML — un champ requis vide empêche l'événement `submit` de partir. Le
  // clic semblait alors sans effet, et mes deux cas d'envoi échouaient en
  // accusant le produit. Un jeu d'essai ne vaut que s'il ressemble au réel.
  defenseUniversity: 'Université d’Exemple',
  defensePlace: 'Ouagadougou',
  summary: null,
  keywords: ['cryptographie', 'sécurité', 'réseaux'],
  items: [],
  embargoUntil: null as string | null,
};

const envois: { url: string; corps: unknown }[] = [];

function brancher(embargoUntil: string | null) {
  ouvrirSession();
  envois.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      if (init?.method && init.method !== 'GET') {
        envois.push({ url, corps: init.body ? JSON.parse(String(init.body)) : null });
      }
      const rendre = (corps: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as Response);
      if (url.includes('/auth/me/functions')) return rendre({ functions: ['catalogue.gerer'] });
      if (url.includes(`/cataloging/records/${ID}`)) return rendre({ ...NOTICE, embargoUntil });
      if (url.includes('/cataloging/records')) {
        return rendre({ total: 0, page: 1, totalPages: 1, records: [] });
      }
      if (url.includes('/cataloging/keywords')) return rendre([]);
      if (url.includes('/categories')) return rendre([]);
      return rendre({});
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('MOITIÉ 2 — la fiche PROFESSIONNELLE dit l’embargo sans entrer en édition', () => {
  it('un embargo en cours s’affiche avec sa date', async () => {
    brancher(DANS_UN_AN.toISOString());
    render(<FicheNoticePage />);
    expect(
      await screen.findByText(LIBELLES.embargo.enCours(dateLisible(DANS_UN_AN))),
    ).toBeTruthy();
  });

  it('⚠ un embargo ÉCHU ne se dit pas « sous embargo »', async () => {
    brancher(IL_Y_A_UN_AN.toISOString());
    render(<FicheNoticePage />);
    expect(await screen.findByText(LIBELLES.embargo.echu(dateLisible(IL_Y_A_UN_AN)))).toBeTruthy();
    expect(screen.queryByText(LIBELLES.embargo.enCours(dateLisible(IL_Y_A_UN_AN)))).toBeNull();
  });

  it('aucun embargo : rien n’est dit', async () => {
    brancher(null);
    render(<FicheNoticePage />);
    await screen.findByText(/Cryptographie appliquée/);
    expect(screen.queryByText(/embargo/i)).toBeNull();
  });
});

describe('MOITIÉ 1 — le champ POSE la date, et son effacement la LÈVE', () => {
  async function ouvrirLeFormulaire() {
    render(<FicheNoticePage />);
    await screen.findByText(/Cryptographie appliquée/);
    fireEvent.click(await screen.findByRole('button', { name: /Modifier/i }));
    return (await screen.findByLabelText(new RegExp(LIBELLES.embargo.champ, 'i'))) as HTMLInputElement;
  }

  it('le champ est pré-rempli par la date servie', async () => {
    brancher(DANS_UN_AN.toISOString());
    const champ = await ouvrirLeFormulaire();
    // ⚠ Local, pas UTC : un décalage rendrait la veille.
    expect(champ.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(champ.value + 'T12:00:00').getFullYear()).toBe(DANS_UN_AN.getFullYear());
  });

  it('🔴 vider le champ envoie `null` — PAS `undefined`', async () => {
    brancher(DANS_UN_AN.toISOString());
    const champ = await ouvrirLeFormulaire();
    fireEvent.change(champ, { target: { value: '' } });
    // La levée se DIT avant d'enregistrer.
    expect(screen.getByText(LIBELLES.embargo.lever)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/ }));
    await new Promise((r) => setTimeout(r, 250));
    await waitFor(() => expect(envois.length).toBeGreaterThan(0));

    const charge = envois.find((e) => e.url.includes('/cataloging/records/'))!.corps as Record<
      string,
      unknown
    >;
    // ⚠ L'ASSERTION QUI PORTE LE LOT. Le DTO distingue les deux : `undefined`
    // LAISSE la valeur en place. Avec lui, la bibliothécaire croirait avoir
    // levé l'embargo et il tiendrait toujours — un faux silencieux sur une
    // restriction d'accès.
    expect(charge).toHaveProperty('embargoUntil');
    expect(charge.embargoUntil).toBeNull();
  });

  it('une date saisie part telle quelle', async () => {
    brancher(null);
    const champ = await ouvrirLeFormulaire();
    fireEvent.change(champ, { target: { value: '2028-03-01' } });
    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/ }));
    await waitFor(() => expect(envois.length).toBeGreaterThan(0));
    const charge = envois.find((e) => e.url.includes('/cataloging/records/'))!.corps as Record<
      string,
      unknown
    >;
    expect(charge.embargoUntil).toBe('2028-03-01');
  });
});

describe('MOITIÉ 2 — la notice PUBLIQUE dit pourquoi le fichier n’est pas lisible', () => {
  const BASE = {
    id: ID,
    title: 'Cryptographie appliquée — thèse',
    titleComplement: null,
    author: 'Sanogo, Alain',
    contributors: [],
    isbn: null,
    publishYear: 2026,
    language: 'fr',
    category: 'informatique',
    recordType: 'these',
    publisher: null,
    publicationCity: null,
    defenseUniversity: null,
    defensePlace: null,
    summary: null,
    keywords: [],
    items: [],
    digitalCopy: null,
    membersOnly: false,
    availability: { totalItems: 0, available: 0, borrowable: false },
  };

  function monter(embargoUntil: string | null) {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    return render(<FicheNotice initial={{ ...BASE, embargoUntil } as never} />);
  }

  it('un embargo en cours est dit, avec sa date et la suite', () => {
    monter(DANS_UN_AN.toISOString());
    expect(screen.getByText(LIBELLES.embargo.enCours(dateLisible(DANS_UN_AN)))).toBeTruthy();
    expect(screen.getByText(LIBELLES.embargo.enCoursSuite)).toBeTruthy();
  });

  it('⚠ et il est dit SANS session et SANS fichier — le refus de lecture n’y suffirait pas', () => {
    // `access.message` ne s'affiche que pour un lecteur connecté ET sur une
    // notice qui porte un fichier. La notice ci-dessus n'en a aucun : sans cet
    // affichage, un visiteur n'a AUCUN moyen de savoir pourquoi.
    monter(DANS_UN_AN.toISOString());
    expect(screen.queryByText(/Vérification de l’accès/)).toBeNull();
    expect(screen.getByText(LIBELLES.embargo.enCoursSuite)).toBeTruthy();
  });

  it('un embargo échu ne dit rien au lecteur : le document est lisible', () => {
    monter(IL_Y_A_UN_AN.toISOString());
    expect(screen.queryByText(/[Ss]ous embargo/)).toBeNull();
  });

  it('aucun embargo : rien', () => {
    monter(null);
    expect(screen.queryByText(/embargo/i)).toBeNull();
  });
});
