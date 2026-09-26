/**
 * ⚠ « ADMINISTRATION » NE CONTIENT PLUS « ADMINISTRATION ».
 *
 * *Refonte du 15 septembre 2026.* Le titre de la barre latérale reprenait le
 * libellé de l'onglet ACTIF : le mot s'affichait donc deux fois, l'une sous
 * l'autre — et pour les SIX onglets, pas seulement celui-ci. Sur Statistiques
 * il apparaissait TROIS fois : onglet, titre de barre, et une entrée qui porte
 * ce nom. Si un sous-menu répète le nom de son parent, il y a un niveau de
 * trop.
 *
 * ⚠ LA FORME VIENT DE KOHA, vérifiée dans son gabarit source `admin-home.tt`
 * et non dans sa documentation : deux colonnes, aucune barre latérale, un titre
 * par rubrique, des liens DÉCRITS. Un paramétrage se cherche par ce qu'on veut
 * obtenir, pas par le nom que le logiciel a donné à son écran.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdministrationPage from '@/app/admin/administration/page';
import { LIBELLES } from '@/lib/libelles';
import { NAVIGATION_PERSONNEL, destinationOnglet, ongletDe } from '@/lib/navigation';
import { fermerSession, ouvrirSession } from './aide-session';
import { invaliderModulesActifs } from '@/lib/modules-actifs';
import { toutesLesFonctions } from './aide-roles-systeme';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/administration',
  useRouter: () => routeur,
}));
const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };

const ADMIN = toutesLesFonctions();

function brancher(fonctions: string[], modules: string[] | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('/modules')) {
        return modules === null
          ? Promise.reject(new Error('injoignable'))
          : Promise.resolve({
              ok: true,
              json: () => Promise.resolve(modules.map((id) => ({ id, actif: true }))),
            } as Response);
      }
      if (u.includes('/functions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ functions: fonctions }) } as Response);
      }
      // ⚠ JAMAIS de repli silencieux : un oubli de doublure doit se voir.
      return Promise.reject(new Error(`requête non couverte — ${u}`));
    }),
  );
}

const repos = () => new Promise((r) => setTimeout(r, 40));

async function monter(fonctions: string[] = ADMIN, modules: string[] | null = ['interoperabilite']) {
  ouvrirSession();
  brancher(fonctions, modules);
  render(<AdministrationPage />);
  await repos();
}

beforeEach(() => invaliderModulesActifs());
afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('la structure de la navigation', () => {
  it('⚠ l’onglet Administration porte une page de rubriques, et lui seul', () => {
    // Un COMPTE, pas une présence : le jour où un deuxième onglet en prend une,
    // ce test convoque quelqu'un pour décider si c'est la bonne forme pour lui.
    const avecPage = NAVIGATION_PERSONNEL.filter((o) => o.pageDeRubriques);
    expect(avecPage.map((o) => o.id)).toEqual(['administration']);
    expect(avecPage[0].pageDeRubriques).toBe('/admin/administration');
  });

  it('⚠ l’onglet mène à sa page, pas à son premier écran', () => {
    const admin = NAVIGATION_PERSONNEL.find((o) => o.id === 'administration')!;
    expect(destinationOnglet(admin)).toBe('/admin/administration');
    // Le témoin inversé : un onglet SANS page de rubriques mène bien à son
    // premier écran. Sans lui, faire mener tous les onglets à la même page
    // passerait ce fichier.
    const catalogue = NAVIGATION_PERSONNEL.find((o) => o.id === 'catalogue')!;
    expect(destinationOnglet(catalogue)).toBe(catalogue.entrees[0].href);
  });

  it('⚠ la page appartient à son onglet — sinon elle s’afficherait nue', () => {
    // `ongletDe` ne connaît que les ENTRÉES. Sans un passage explicite par les
    // pages de rubriques, `/admin/administration` n'aurait appartenu à aucun
    // onglet : la coque du personnel ne se serait pas rendue.
    expect(ongletDe('/admin/administration')?.id).toBe('administration');
  });

  it('⚠ chaque écran d’administration porte sa DESCRIPTION', () => {
    // C'est ce qui distingue cette page d'une barre latérale déplacée. Une
    // entrée neuve sans description laisserait un lien nu au milieu des autres.
    const admin = NAVIGATION_PERSONNEL.find((o) => o.id === 'administration')!;
    const muettes = admin.entrees.filter((e) => !e.description).map((e) => e.href);
    expect(
      muettes,
      'Un écran d’administration sans description : la page de rubriques ' +
        'redeviendrait une liste de liens. Décrivez son EFFET, pas son contenu.',
    ).toEqual([]);
    // ⚠ 8 depuis le 26 septembre 2026 : `/admin/regles-de-circulation` est
    // arrivé de Guichet avec sa fonction (`etablissement.regles`). Un compte
    // exact ne dit pas que le code est juste — il oblige à revenir le regarder,
    // et c'est ce qu'il a fait.
    expect(admin.entrees.length).toBe(8);
  });
});

describe('ce que la page affiche', () => {
  it('les rubriques et leurs écrans, décrits', async () => {
    await monter();
    for (const titre of ['Établissement', 'Diffusion', 'Sécurité']) {
      expect(screen.getByRole('heading', { name: titre })).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: 'Modules' }).getAttribute('href')).toBe('/admin/modules');
    expect(screen.getByText('Allumer ou éteindre les fonctions de l’école.')).toBeTruthy();
  });

  it('⚠ elle refait le MÊME filtre que la barre — droits et modules', async () => {
    // Une page d'index qui referait le filtre à sa façon finirait par proposer
    // un écran que l'API refuse.
    await monter(ADMIN, []); // interoperabilite éteint
    expect(screen.queryByRole('link', { name: 'Interopérabilité' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Modules' })).toBeTruthy();
  });

  it('⚠ sans le droit, l’écran n’est pas proposé', async () => {
    await monter(['securite.audit'], ['interoperabilite']);
    expect(screen.queryByRole('link', { name: 'Modules' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Journal d’audit' })).toBeTruthy();
  });

  it('⚠ droits PAS ENCORE SUS : ni rubriques, ni « aucun réglage »', async () => {
    // Un vide qui invite à demander des droits, affiché avant la réponse,
    // envoie quelqu'un réclamer ce qu'il possède déjà.
    ouvrirSession();
    brancher([], ['interoperabilite']);
    render(<AdministrationPage />);
    // Pas de `repos()` : on regarde AVANT que les fonctions soient arrivées.
    expect(screen.queryByText(LIBELLES.administration.aucuneRubrique)).toBeNull();
    expect(screen.getByRole('heading', { name: LIBELLES.administration.titre })).toBeTruthy();
  });

  it('aucun droit du tout : la phrase le dit, et dit à qui parler', async () => {
    await monter(['document.lire'], ['interoperabilite']);
    expect(screen.getByText(LIBELLES.administration.aucuneRubrique)).toBeTruthy();
  });
});

describe('⚠ ce que le texte DOIT dire', () => {
  it('« aucun réglage » nomme la CAUSE et le RECOURS', () => {
    // Assertion de PROPRIÉTÉ, séparée de son emploi : lire la constante à
    // l'écran teste qu'on affiche la bonne variable, jamais ce qu'elle dit.
    // Un paramétrage entièrement vide se lit comme un logiciel cassé.
    const texte = LIBELLES.administration.aucuneRubrique;
    expect(texte, 'la cause : des droits ou un module, jamais une panne').toMatch(
      /droits|modules?/i,
    );
    expect(texte, 'le recours : à qui s’adresser').toMatch(/demandez|administrateur/i);
    expect(texte, 'et surtout pas un ton de panne').not.toMatch(/erreur|indisponible|réessay/i);
  });
});
