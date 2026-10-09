/**
 * 🔴 UN BROUILLON DE PAGE LÉGALE NE SORT JAMAIS SUR UNE ROUTE PUBLIQUE — et sa
 * lecture demande le droit de l'ÉCRIRE.
 *
 * *Posé le 9 octobre 2026, après une recette du front. Et le danger n'était pas
 * l'affichage : c'était l'ÉCRITURE.*
 *
 * ## Les deux routes, et pourquoi elles ne peuvent pas être la même
 *
 * | Route | Qui | Ce qu'elle rend |
 * |---|---|---|
 * | `GET /tenancy/home` | **tout le monde** | les pages légales passées par `pourLePublic()` — toute page non publiée devient VIDE |
 * | `GET /tenancy/settings` | `etablissement.apparence` | l'état BRUT, brouillons compris |
 *
 * ⚠ **La seconde n'existait pas**, et l'éditeur du front ne pouvait donc pas
 * lire ce qu'il allait remplacer. Or `PATCH /tenancy/settings` fait un
 * REMPLACEMENT COMPLET de `pagesLegales` : un écran qui enregistre sans avoir lu
 * ÉCRASE une page publiée que personne ne voulait retirer.
 *
 * > ⭐ Le front a fait le bon geste — il REFUSE d'enregistrer tant qu'il n'a pas
 * > lu — et ce refus rendait l'éditeur inutilisable. Un garde qui empêche une
 * > destruction en bloquant la fonctionnalité est juste, et c'est un signal :
 * > il manquait une route, pas une tolérance.
 *
 * ## Ce que ce fichier tient, et qui ne se vérifie pas en relisant
 *
 * ① la route PUBLIQUE filtre — un brouillon n'en sort jamais ;
 * ② la route BRUTE exige la MÊME fonction que l'écriture, ni plus ni moins.
 */
import { describe, expect, it, vi } from 'vitest';
import { FONCTIONS } from '../auth/functions';
import { FUNCTIONS_KEY } from '../auth/functions.decorator';
import { normaliserPagesLegales, pourLePublic } from './pages-legales';
import { TenancyController } from './tenancy.controller';

/** Un état où UNE page est publiée et l'autre est un BROUILLON. */
const AVEC_BROUILLON = {
  mentions: {
    blocs: { fr: 'Mentions PUBLIÉES de l’établissement.' },
    publieeLe: '2026-10-01T00:00:00.000Z',
  },
  confidentialite: {
    blocs: { fr: 'BROUILLON — ne doit JAMAIS sortir sur une route publique.' },
    publieeLe: null,
  },
};

const TENANT = { id: 't1', slug: 'zinda', name: 'Zinda' } as never;

function controleur(pagesLegales: unknown) {
  return new TenancyController(
    {
      tenant: {
        findUnique: vi.fn(async () => ({
          name: 'Zinda',
          settings: { pagesLegales, homepageContent: null },
        })),
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => 'http://localhost:4000' } as never,
    { estActif: async () => true } as never,
  );
}

describe('① la route PUBLIQUE ne laisse PAS sortir un brouillon', () => {
  it('🔴 `GET /tenancy/home` rend la page publiée et VIDE la non publiée', async () => {
    // ⚠ On relit la charge ENTIÈRE, pas une propriété typée : ce test mesure
    // ce qui SORT, et un `as` trop précis ferait mentir le compilateur sur une
    // réponse qui porte bien d'autres champs.
    const r = (await controleur(AVEC_BROUILLON).home(TENANT)) as unknown as Record<
      string,
      unknown
    >;
    expect(
      JSON.stringify(r.pagesLegales),
      'le texte du brouillon ne doit apparaître NULLE PART dans la charge publique',
    ).not.toContain('BROUILLON');
    // Témoin de présence : la page PUBLIÉE sort, sinon ce test passerait sur
    // une route qui ne rend rien du tout.
    expect(JSON.stringify(r.pagesLegales)).toContain('Mentions PUBLIÉES');
  });

  it('⚠ et `pourLePublic` est la seule chose qui le garantit — éprouvée seule', () => {
    const filtre = pourLePublic(normaliserPagesLegales(AVEC_BROUILLON));
    expect(filtre.mentions.publieeLe, 'la publiée garde sa date').not.toBeNull();
    expect(filtre.confidentialite.publieeLe, 'la non publiée reste vide').toBeNull();
    expect(JSON.stringify(filtre.confidentialite.blocs)).not.toContain('BROUILLON');
  });
});

describe('② la route BRUTE exige la même fonction que l’ÉCRITURE', () => {
  /** Les fonctions exigées par une méthode du contrôleur, via les métadonnées. */
  // ⚠ LA CLÉ VIENT DU PRODUIT, elle n'est PAS recopiée : `FUNCTIONS_KEY`.
  //
  // Ma première rédaction écrivait `'gafeso:functions'`, inventé — et le témoin
  // ci-dessous l'a dit immédiatement, en rendant une liste VIDE sur l'écriture
  // dont je SAIS qu'elle exige une fonction. Sans ce témoin, les deux
  // assertions suivantes auraient comparé deux listes vides : `[] === []`,
  // donc VRAI, sur un relevé qui ne lisait rien.
  const fonctionsDe = (methode: string): string[] =>
    (Reflect.getMetadata(
      FUNCTIONS_KEY,
      (TenancyController.prototype as unknown as Record<string, unknown>)[methode] as never,
    ) as string[]) ?? [];

  it('⚠ TÉMOIN : le relevé des métadonnées fonctionne', () => {
    // Sans lui, un nom de clé de métadonnée erroné rendrait des listes VIDES, et
    // les deux assertions ci-dessous passeraient sur du vide.
    expect(
      fonctionsDe('updateSettings'),
      'le relevé ne trouve rien sur l’ÉCRITURE : c’est l’instrument qu’il faut ' +
        'regarder, pas le contrôleur',
    ).not.toEqual([]);
  });

  it('🔴 lire le brut demande EXACTEMENT ce que demande l’écrire', () => {
    expect(
      fonctionsDe('readSettings'),
      'Un brouillon est un texte que l’établissement n’a pas voulu publier. Le ' +
        'lire doit demander le droit de l’ÉCRIRE — ni plus (ce serait une porte ' +
        'de plus), ni moins (qui peut écrire doit pouvoir relire ce qu’il va ' +
        'remplacer).',
    ).toEqual(fonctionsDe('updateSettings'));
    // Et on NOMME la fonction, pour qu'un renommage des deux côtés à la fois ne
    // passe pas inaperçu.
    expect(fonctionsDe('readSettings')).toContain(FONCTIONS.ETABLISSEMENT_APPARENCE);
  });

  it('⚠ et `home`, elle, n’exige AUCUNE fonction — c’est une page publique', () => {
    // Témoin d'ABSENCE : sans lui, une garde posée sur le contrôleur entier
    // fermerait la vitrine, et les deux assertions ci-dessus resteraient vraies.
    expect(
      fonctionsDe('home'),
      '`home` sert la page d’accueil publique : une fonction exigée ici la ' +
        'fermerait aux visiteurs ET aux moteurs qui l’indexent.',
    ).toEqual([]);
  });
});
