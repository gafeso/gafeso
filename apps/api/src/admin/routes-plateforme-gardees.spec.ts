/**
 * TOUTE ROUTE DE PLATEFORME EST GARDÉE, OU DÉCLARÉE OUVERTE AVEC SON MOTIF.
 *
 * ## D'où vient ce test
 *
 * `GET /admin/tenants/:slug/socle` répondait **200 SANS AUCUNE CLÉ**, pendant
 * que ses onze voisines rendaient 401. Mesuré le 22/09/2026 — en cherchant
 * autre chose.
 *
 * Ce qu'elle laissait fuir n'était pas une donnée personnelle : des comptes de
 * configuration. Mais elle CONFIRMAIT QU'UN SLUG EXISTE, donc elle offrait un
 * oracle d'énumération des écoles d'une instance à qui essaie des noms.
 *
 * ⚠ AUCUN GARDE NE POUVAIT LA VOIR, et ce n'est pas un oubli.
 * `gardes-declarees.spec.ts` n'examine que les contrôleurs portant
 * `@RequiresFunctions` — les routes de TENANT, gardées par une fonction. Les
 * routes de PLATEFORME sont gardées autrement, par `ApiKeyGuard`, donc elles
 * étaient hors de sa population. Deux familles de gardes, un seul inventaire.
 *
 * ## La forme
 *
 * L'OBLIGATION : chaque route porte `@UseGuards(ApiKeyGuard)`, ou figure dans
 * `OUVERTES` avec son motif. Une route neuve n'est dans aucune des deux listes,
 * et le message d'échec nomme les deux issues.
 *
 * ⚠ Et il refuse dans l'autre sens aussi : une déclaration d'ouverture qui a
 * reçu un garde devient périmée, et une exception qu'on ne relit jamais finit
 * par couvrir autre chose.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ICI = __dirname;

/**
 * Les routes de plateforme délibérément OUVERTES.
 *
 * ⚠ Une seule aujourd'hui, et son motif tient en une phrase : c'est la porte.
 * Exiger la clé sur la connexion rendrait la connexion impossible sans la clé,
 * donc la clé remplacerait le mot de passe.
 */
const OUVERTES: { route: string; motif: string }[] = [
  {
    route: "@Post('login')",
    motif:
      'la connexion du super-admin lui-même : exiger la clé plateforme ici ' +
      'ferait de la clé un substitut du mot de passe. Protégée par un ' +
      'throttle (5 essais / minute) plutôt que par un garde.',
  },
];

/** Les contrôleurs du module de plateforme. */
function controleurs(): string[] {
  return readdirSync(ICI)
    .filter((f) => f.endsWith('.controller.ts'))
    .map((f) => join(ICI, f));
}

/**
 * Les routes d'un contrôleur, avec le bloc de décorateurs qui les suit.
 *
 * ⚠ LA FENÊTRE ACCEPTE LES COMMENTAIRES DANS LES DEUX SENS. Un garde voisin de
 * ce dépôt s'arrêtait, en descendant, au premier ligne qui n'est pas un `@` : un
 * commentaire glissé entre deux décorateurs le rendait aveugle à tout ce qui
 * suivait, et il ACCUSAIT du code correct. Un détecteur qui signale du juste se
 * fait désactiver.
 */
function routes(chemin: string): { verbe: string; bloc: string }[] {
  const lignes = readFileSync(chemin, 'utf8').split('\n');
  const trouvees: { verbe: string; bloc: string }[] = [];
  lignes.forEach((l, i) => {
    const m = /^\s*@(Get|Post|Patch|Put|Delete)\(/.exec(l);
    if (!m) return;
    let fin = i;
    while (fin + 1 < lignes.length) {
      const t = lignes[fin + 1].trim();
      if (t.startsWith('@') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t === '') {
        fin += 1;
      } else break;
    }
    // On remonte aussi, pour les décorateurs posés AVANT le verbe.
    let debut = i;
    while (debut > 0) {
      const t = lignes[debut - 1].trim();
      if (t.startsWith('@') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t === '') {
        debut -= 1;
      } else break;
    }
    trouvees.push({ verbe: l.trim(), bloc: lignes.slice(debut, fin + 1).join('\n') });
  });
  return trouvees;
}

const toutes = controleurs().flatMap(routes);

describe("L'instrument, avant ce qu'il mesure", () => {
  it('⚠ il trouve des routes — sinon son silence ne vaut rien', () => {
    // « Toutes les routes sont gardées » est VRAI sur l'ensemble vide.
    expect(controleurs().length).toBeGreaterThan(0);
    expect(toutes.length).toBeGreaterThan(10);
  });

  it('témoin de PRÉSENCE : il voit la route qui a motivé ce test', () => {
    expect(toutes.map((r) => r.verbe)).toContain("@Get('tenants/:slug/socle')");
  });

  it('⚠ témoin d’ABSENCE : sa fenêtre ne déborde pas sur la route suivante', () => {
    // La confusion PLAUSIBLE : une fenêtre trop large emprunterait le
    // `@UseGuards` du voisin, et le garde passerait vert sur une route nue.
    const socle = toutes.find((r) => r.verbe.includes('socle'))!;
    expect(socle.bloc).not.toMatch(/@Post\('tenants\/:slug\/sync-schema'\)/);
  });

  it('⚠ témoin d’ABSENCE : un commentaire entre décorateurs ne coupe pas la vue', () => {
    // C'est exactement ce qui a rendu un garde voisin faux. La route du socle
    // PORTE un commentaire entre son verbe et son `@UseGuards` : si la fenêtre
    // s'arrêtait dessus, l'assertion principale tomberait à tort.
    const socle = toutes.find((r) => r.verbe.includes('socle'))!;
    expect(socle.bloc, 'la route du socle doit porter son commentaire').toMatch(/⚠ LE GARDE MANQUAIT/);
    expect(socle.bloc, 'et le garde qui le suit').toMatch(/@UseGuards\(ApiKeyGuard\)/);
  });
});

describe('⚠ L’OBLIGATION : gardée, ou ouverte avec son motif', () => {
  it('chaque route de plateforme est gardée par la clé, ou DÉCLARÉE ouverte', () => {
    const nues = toutes
      .filter((r) => !/@UseGuards\(\s*ApiKeyGuard\s*\)/.test(r.bloc))
      .filter((r) => !OUVERTES.some((o) => r.verbe.includes(o.route)))
      .map((r) => r.verbe);

    expect(
      nues,
      'Route(s) de plateforme sans garde et non déclarées ouvertes.\n' +
        'DEUX ISSUES :\n' +
        '  · elle doit être réservée → ajoutez `@UseGuards(ApiKeyGuard)` et\n' +
        '    `@ApiSecurity(\'admin-api-key\')` ;\n' +
        '  · elle doit être PUBLIQUE → déclarez-la dans OUVERTES avec son MOTIF.\n' +
        '⚠ Ne la laissez pas nue : `GET /admin/tenants/:slug/socle` a répondu\n' +
        '  200 sans aucune clé, et elle confirmait qu’un slug existe.',
    ).toEqual([]);
  });

  it('⚠ une déclaration d’ouverture PÉRIMÉE est refusée', () => {
    const perimees = OUVERTES.filter((o) => {
      const r = toutes.find((x) => x.verbe.includes(o.route));
      return !r || /@UseGuards\(\s*ApiKeyGuard\s*\)/.test(r.bloc);
    }).map((o) => o.route);

    expect(
      perimees,
      'Déclaration(s) d’ouverture qui ne correspondent plus : la route a reçu ' +
        'un garde, ou elle a disparu. Retirez la ligne — une exception qu’on ne ' +
        'relit jamais finit par couvrir autre chose.',
    ).toEqual([]);
  });

  it('chaque ouverture porte un motif qui dit quelque chose', () => {
    for (const o of OUVERTES) {
      expect(o.motif.length, `motif trop court pour ${o.route}`).toBeGreaterThan(40);
    }
  });

  // ⚠ LE COMPTE EXACT. Il ne dit pas que les gardes sont justes : il OBLIGE à
  // revenir les regarder. Une route de plateforme en plus convoque quelqu'un.
  it('je SAIS combien il y a de routes de plateforme', () => {
    expect(
      toutes.length,
      'Le nombre de routes de plateforme a changé. Ce n’est pas un échec : ' +
        'c’est une convocation. La route neuve est-elle gardée à bon droit ?',
    ).toBe(14);
    // ⚠ 13 à l'écriture de ce garde, le 22/09/2026. Puis 14 : la route de
    // reprise du super-admin (backlog n° 48). Le compte a fait son office —
    // il a obligé à revenir vérifier qu'elle est gardée par la clé.
  });
});
