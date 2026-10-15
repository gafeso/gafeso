import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { enAttentePar, souffler } from './aide-formulaire-charge';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
/*
 * ⚠ ON GARDE LES AUTRES EXPORTS DU MODULE. Une doublure qui n'énumère que ce
 * dont on croit avoir besoin casse au premier export qu'on avait oublié —
 * `getUser` ici — et vitest accuse « le mock », ce qui est juste mais envoie
 * chercher dans le produit si on le lit vite.
 */
vi.mock('@/lib/session', async () => {
  const reel = await vi.importActual<typeof import('@/lib/session')>('@/lib/session');
  return {
    ...reel,
    getToken: () => 'jeton-de-test',
    // ⚠ La forme ENTIÈRE de `SessionUser`, lue dans `lib/session.ts` : la coque
    // compose ses initiales avec `firstName.charAt(0)`, donc une doublure
    // partielle lève — et l'erreur ne nomme ni le champ ni le module.
    getUser: () => ({
      id: 'u1',
      email: 'zongo@exemple.test',
      firstName: 'Pauline',
      lastName: 'Zongo',
      role: 'STAFF',
      className: null,
    }),
  };
});
vi.mock('next/navigation', () => {
  // ⚠ Objet STABLE, et TOUS les exports que les écrans lisent : `usePathname`
  // manquait, et vitest accuse alors « le mock », pas l'écran — c'est juste, et
  // il faut le lire comme tel plutôt que de chercher dans le produit.
  const routeur = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} };
  return {
    useParams: () => ({ id: 'a1' }),
    useRouter: () => routeur,
    usePathname: () => '/mes-encadrements',
    useSearchParams: () => new URLSearchParams(),
  };
});

import { FicheAuteur } from '@/app/opac/auteurs/[id]/fiche-auteur';
import MesEncadrements from '@/app/mes-encadrements/page';

/**
 * ⭐ LES VIGNETTES v3 SUR LES DEUX ÉCRANS QUI VIENNENT DE LES RECEVOIR.
 *
 * ⚠ POURQUOI UN TEST ET PAS SEULEMENT UNE CAPTURE. `/mes-encadrements` ne
 * montre ses lignes qu'à un compte RATTACHÉ à une fiche d'auteur ; les comptes
 * de recette ne le sont pas, et aucun mot de passe de seed n'est posé dans
 * l'environnement. La capture de cet écran montre donc sa branche honnête
 * « compte non rattaché » — c'est un état vrai, ce n'est pas celui qu'on
 * éprouve ici. Ce test monte la branche à lignes avec des données.
 *
 * ⚠ ET ON LIT LA STRUCTURE DU SVG, pas un `contains` : une couleur se compare
 * sous sa forme NORMALISÉE (jsdom rend `#8A4A00` en `rgb(138, 74, 0)`), et une
 * vignette se reconnaît à son `viewBox`, jamais à une chaîne de classe.
 */
const TEINTES = {
  droit: 'rgb(138, 74, 0)',
  medecine: 'rgb(163, 32, 46)',
  informatique: 'rgb(0, 97, 107)',
};

const vignettes = () => [...document.querySelectorAll('svg[viewBox="0 0 500 700"]')];
const teintes = () =>
  vignettes().map((s) => getComputedStyle(s.closest('div')!).backgroundColor);

describe('fiche d’auteur publique', () => {
  const AUTEUR = {
    id: 'a1',
    displayName: 'Ouédraogo, Aïcha',
    bio: null,
    birthYear: null,
    deathYear: null,
    totalWorks: 2,
    worksByRole: [
      {
        role: 'author',
        count: 2,
        works: [
          {
            recordId: 'n1',
            title: 'Droit foncier au Burkina',
            year: 2024,
            recordType: 'ouvrage',
            coverTemplate: 'ouvrage',
            coverDomain: 'droit',
          },
          {
            recordId: 'n2',
            title: 'Santé publique et districts',
            year: 2023,
            recordType: 'these',
            coverTemplate: 'these',
            coverDomain: 'medecine',
          },
        ],
      },
    ],
  };

  it('⚠ une vignette v3 par œuvre, à la TEINTE DE SON DOMAINE', () => {
    // ⚠ La fiche RAFRAÎCHIT depuis l'API au montage : sans implémentation, le
    // `api()` rend `undefined` et l'écran lève sur `.then`. L'erreur accuse
    // alors l'écran d'une faute qui est dans la doublure.
    enAttentePar(api);
    render(<FicheAuteur initial={AUTEUR} />);
    expect(vignettes()).toHaveLength(2);
    expect(teintes()).toEqual([TEINTES.droit, TEINTES.medecine]);
  });

  it('⚠ elle est DÉCORATIVE : le titre reste lisible à côté, en texte', () => {
    enAttentePar(api);
    render(<FicheAuteur initial={AUTEUR} />);
    // ⚠ Le lien doit rester atteignable PAR SON NOM — une vignette qui avalerait
    // le titre le rendrait invisible à qui n'a pas l'écran.
    expect(screen.getByRole('link', { name: 'Droit foncier au Burkina' })).toBeTruthy();
    for (const s of vignettes()) {
      expect(s.closest('div')!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('⚠ TÉMOIN D’ABSENCE : un domaine inconnu ne peint PAS une teinte de domaine', () => {
    enAttentePar(api);
    render(
      <FicheAuteur
        initial={{
          ...AUTEUR,
          worksByRole: [
            {
              role: 'author',
              count: 1,
              works: [
                {
                  ...AUTEUR.worksByRole[0].works[0],
                  coverDomain: 'domaine-qui-nexiste-pas',
                },
              ],
            },
          ],
        }}
      />,
    );
    // Le repli prescrit est « autre », jamais la teinte d'un autre domaine.
    expect(teintes()[0]).not.toBe(TEINTES.droit);
    expect(teintes()[0]).toBe('rgb(61, 74, 84)');
  });
});

describe('mes encadrements', () => {
  const ENCADREMENTS = {
    ficheLiee: true,
    nomDeLaFiche: 'Zongo, Pauline',
    total: 1,
    page: 1,
    totalPages: 1,
    encadrements: [
      {
        recordId: 'n9',
        titre: 'Systèmes répartis et tolérance aux pannes',
        type: 'these',
        annee: 2025,
        etudiant: 'Traoré, Awa',
        universiteDeSoutenance: 'Université d’Exemple',
        coverTemplate: 'these',
        coverDomain: 'informatique',
      },
    ],
  };

  it('⚠ la ligne porte sa vignette, à la teinte du domaine servi', async () => {
    const attente = enAttentePar(api);
    render(<MesEncadrements />);
    await souffler(40);
    /*
     * ⚠ LA COQUE D'ABORD. Cet écran ne demande ses encadrements qu'APRÈS avoir
     * reçu ses fonctions, ses modules et son établissement — mesuré : au
     * premier tour, les seuls chemins appelés sont ceux de la coque. Résoudre
     * `/encadrements/miens` à cet instant ne résout rien, et le test accuse
     * l'écran de ne rien rendre.
     */
    attente.resoudre('/auth/me/functions', { functions: ['encadrements.voir'] });
    attente.resoudre('/modules', { modules: [] });
    attente.resoudre('/tenancy/current', { name: 'Université d’Exemple', slug: 'zinda' });
    await souffler(60);
    attente.resoudre('/encadrements/miens', ENCADREMENTS);
    await souffler(80);

    expect(vignettes()).toHaveLength(1);
    expect(teintes()[0]).toBe(TEINTES.informatique);
    expect(screen.getByRole('link', { name: ENCADREMENTS.encadrements[0].titre })).toBeTruthy();
  });

  it('⚠ et la colonne de la vignette n’a PAS d’intitulé : il doublerait le titre', async () => {
    const attente = enAttentePar(api);
    render(<MesEncadrements />);
    await souffler(40);
    /*
     * ⚠ LA COQUE D'ABORD. Cet écran ne demande ses encadrements qu'APRÈS avoir
     * reçu ses fonctions, ses modules et son établissement — mesuré : au
     * premier tour, les seuls chemins appelés sont ceux de la coque. Résoudre
     * `/encadrements/miens` à cet instant ne résout rien, et le test accuse
     * l'écran de ne rien rendre.
     */
    attente.resoudre('/auth/me/functions', { functions: ['encadrements.voir'] });
    attente.resoudre('/modules', { modules: [] });
    attente.resoudre('/tenancy/current', { name: 'Université d’Exemple', slug: 'zinda' });
    await souffler(60);
    attente.resoudre('/encadrements/miens', ENCADREMENTS);
    await souffler(80);

    const entetes = [...document.querySelectorAll('thead th')].map((t) => t.textContent?.trim());
    expect(entetes[0], 'un en-tête ferait annoncer deux fois le même document').toBe('');
  });
});
