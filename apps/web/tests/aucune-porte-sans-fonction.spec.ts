/**
 * ⚠ AUCUNE PORTE SANS FONCTION — l'inverse du garde qui existait.
 *
 * *Demandé par Jean le 16 septembre 2026, après un défaut que rien ne pouvait
 * voir.*
 *
 * `couverture-des-roles.spec.ts` vérifie qu'aucune fonction d'un rôle système
 * n'est donnée SANS PORTE — un droit accordé sans l'écran qui l'exerce. Le
 * défaut de la vitrine était l'exact opposé : **une porte sans fonction.**
 * L'en-tête portait `href="/guichet"` sous le prénom de n'importe quel
 * connecté, si bien qu'une étudiante cliquant son propre nom lisait « cet
 * espace est réservé au personnel de la bibliothèque ».
 *
 * ⚠ CE QUE CE GARDE PEUT, ET CE QU'IL NE PEUT PAS — écrit plutôt que tu.
 *
 * Il ne fait PAS d'analyse de flot : « ce lien est-il rendu sous une
 * condition ? » se répond en suivant des variables, des états et des
 * chargements, et un balayage de source n'en est pas capable. Ce qu'il fait
 * est plus étroit et mécanique : dans l'HABILLAGE — l'en-tête, la coque, le
 * menu de compte, et la source qui les alimente —, **toute adresse littérale
 * menant à un écran GARDÉ doit être déclarée ici avec la fonction qui la
 * conditionne**. Un lien neuf n'est dans aucune liste, et le test dit les deux
 * issues.
 *
 * ⚠ SA BORNE, et elle est réelle : il ne regarde que l'habillage. Un lien
 * écrit au milieu d'un écran lui échappe. C'est délibéré — l'habillage est
 * rendu sur TOUTES les pages, y compris publiques, donc c'est là qu'une porte
 * s'offre à quelqu'un qui n'a rien demandé. Un écran, lui, est déjà derrière
 * la garde de sa propre route.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NAVIGATION_PERSONNEL, ROUTES_HORS_MENU } from '@/lib/navigation';

/** L'habillage : ce qui se rend sur toutes les pages, publiques comprises. */
const HABILLAGE = [
  'components/header.tsx',
  'components/home/home-header.tsx',
  'components/admin-shell.tsx',
  'components/menu-compte.tsx',
  'lib/entrees-de-compte.ts',
] as const;

/**
 * Les liens littéraux de l'habillage qui mènent à un écran gardé, et LA
 * CONDITION qui les rend.
 *
 * ⚠ « passe-par-la-navigation » n'est pas une valeur acceptable ici : un lien
 * qui passe par la navigation n'est pas LITTÉRAL, il n'apparaît donc pas dans
 * ce relevé. Tout ce qui est listé ci-dessous est écrit en dur, et doit donc
 * porter sa condition à la main.
 */
const LIENS_CONDITIONNES: Record<string, { fonction: string; motif: string }> = {
  '/mon-depot': {
    fonction: 'depot.deposer',
    motif:
      'menu de compte — rendu seulement si la fonction est portée ET le module ' +
      '`depot` actif (lib/entrees-de-compte.ts)',
  },
  '/mes-encadrements': {
    fonction: 'encadrements.voir',
    motif:
      'menu de compte — rendu seulement si la fonction est portée. Pas de ' +
      'condition de module : le service lit le CATALOGUE, pas les dépôts',
  },
};

/**
 * ⚠ `/admin` N'EST PAS DANS CETTE LISTE, et ce n'est pas un oubli : il n'est
 * écrit nulle part comme un `href` littéral. Il est CALCULÉ par
 * `useCompteCourant`, qui rend `null` quand `premiereEntreeAccessible` ne rend
 * rien — donc le lien « Espace professionnel » n'existe pas pour qui n'a
 * aucune entrée métier. Ce relevé ne voit que les littéraux ; la condition de
 * `/admin` est gardée par `coque-personnel.spec.tsx` et
 * `vitrine-passage-vers-le-metier.spec.tsx`.
 */

/** Les écrans qu'une fonction garde, lus dans la navigation — jamais recopiés. */
function routesGardees(): Set<string> {
  // ⚠ Les adresses DÉCLARÉES en font partie : un écran personnel comme
  // `/mes-encadrements` n'est dans aucune barre — c'est sa fonction qui le
  // garde, pas un onglet. Les inclure ne relâche rien : l'invariant porte sur
  // ce qui est écrit en dur SANS être déclaré.
  const gardees = new Set<string>(Object.keys(LIENS_CONDITIONNES));
  for (const onglet of NAVIGATION_PERSONNEL) {
    for (const e of onglet.entrees) gardees.add(e.href);
  }
  for (const href of Object.keys(ROUTES_HORS_MENU)) gardees.add(href);
  return gardees;
}

/** Les adresses écrites EN DUR dans une source. */
function adressesLitterales(source: string): string[] {
  const sansCommentaires = source
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  return [
    ...new Set(
      [...sansCommentaires.matchAll(/href[=:]\s*['"`](\/[a-z0-9/-]*)['"`]/g)].map((m) => m[1]),
    ),
  ];
}

function portesDeLHabillage(): string[] {
  const gardees = routesGardees();
  const vues = new Set<string>();
  for (const fichier of HABILLAGE) {
    const source = readFileSync(resolve(__dirname, '..', fichier), 'utf-8');
    for (const href of adressesLitterales(source)) if (gardees.has(href)) vues.add(href);
  }
  return [...vues].sort();
}

describe('l’instrument, avant ce qu’il mesure', () => {
  it('⚠ témoin de COMPTE : il lit bien tout l’habillage', () => {
    // Sans lui, un chemin cassé rendrait une liste vide et le test suivant
    // passerait sans avoir rien regardé.
    const total = HABILLAGE.reduce(
      (n, f) => n + adressesLitterales(readFileSync(resolve(__dirname, '..', f), 'utf-8')).length,
      0,
    );
    expect(total).toBeGreaterThan(6);
    expect(routesGardees().size).toBeGreaterThan(20);
  });

  it('⚠ témoin d’ABSENCE : il RECONNAÎT la porte qui a causé le défaut', () => {
    // Le cas réel, pas un cas inventé : c'est exactement ce que la vitrine
    // portait. Sans ce témoin, un motif cassé rendrait « aucune porte » pour
    // toujours, et serait indiscernable d'un produit sain.
    const habillageSynthetique = `<a href="/guichet" className={btn}>{prenom}</a>`;
    const trouvees = adressesLitterales(habillageSynthetique).filter((h) =>
      routesGardees().has(h),
    );
    expect(trouvees).toEqual(['/guichet']);
  });

  it('⚠ et il ne signale PAS une adresse publique', () => {
    // La confusion plausible : `/opac` et `/login` sont écrits en dur dans
    // l'habillage, et c'est normal — ils ne sont gardés par rien.
    const publiques = adressesLitterales(`href="/opac" href="/login" href="/inscription"`);
    expect(publiques.filter((h) => routesGardees().has(h))).toEqual([]);
  });
});

describe('⚠ aucune porte sans fonction', () => {
  it('toute adresse gardée écrite en dur dans l’habillage déclare sa condition', () => {
    const nonDeclarees = portesDeLHabillage().filter((h) => !LIENS_CONDITIONNES[h]);
    expect(
      nonDeclarees,
      'Un lien de l’HABILLAGE mène à un écran gardé. DEUX ISSUES, et la ' +
        'première est presque toujours la bonne : faites-le passer par la ' +
        'navigation (`ongletsVisibles`), qui filtre déjà sur la fonction ET le ' +
        'module — il cesse alors d’être littéral et disparaît de ce relevé. ' +
        'Sinon, déclarez-le dans LIENS_CONDITIONNES avec la fonction qui le ' +
        'conditionne, et vérifiez qu’un test le prouve. ⚠ L’habillage est rendu ' +
        'sur TOUTES les pages, publiques comprises : une porte offerte là est ' +
        'offerte à quelqu’un qui n’a rien demandé, et le refus arrive au bout.',
    ).toEqual([]);
  });

  it('⚠ une déclaration PÉRIMÉE est refusée', () => {
    // Le jour où le lien disparaît de l'habillage, sa ligne devient fausse.
    // Une dette qui ne se rappelle pas d'elle-même est un oubli en attente.
    const reelles = new Set(portesDeLHabillage());
    const perimees = Object.keys(LIENS_CONDITIONNES).filter((h) => !reelles.has(h));
    expect(
      perimees,
      'Ces liens ne sont plus écrits en dur dans l’habillage : retirez leur ligne.',
    ).toEqual([]);
  });

  it('⚠ et `/guichet` n’y est PAS — c’est le défaut du 16 septembre', () => {
    // Le cas nommé, en plus de l'invariant. L'invariant couvre le lien écrit
    // demain ; celui-ci se souvient de celui d'hier.
    expect(portesDeLHabillage()).not.toContain('/guichet');
  });
});
