import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ⚠ UN CONTRÔLEUR GARDÉ PAR UN MODULE VIT DANS UN MODULE QUI SAIT LE RÉSOUDRE.
 *
 * *Posé le 15 septembre 2026, après la DEUXIÈME occurrence du même défaut.*
 *
 * `ModuleActifGuard` a besoin de `ModulesService`. Nest le résout dans le
 * CONTEXTE du module qui déclare le contrôleur : si ce module n'importe pas
 * `ModulesModule`, l'application **refuse de démarrer** —
 * `Nest can't resolve dependencies of the ModuleActifGuard`.
 *
 * ⚠ ET AUCUN TEST UNITAIRE NE PEUT LE VOIR, par construction. Un test
 * construit le service à la main, avec des doublures ; il ne sait rien de ce
 * que le conteneur saura résoudre. Les deux fois, la suite était VERTE :
 *
 * | Quand | Le module | Ce qui était vert |
 * |---|---|---|
 * | 12 septembre 2026 | `DepotsModule` | 1 051 tests |
 * | 15 septembre 2026 | `MoissonnageModule` | 1 491 tests |
 *
 * La seconde fois, `main` a passé une nuit dans cet état. Deux fois n'est pas
 * une coïncidence : un motif qui se répète n'a pas besoin d'être mieux
 * expliqué, il a besoin d'être BARRÉ.
 *
 * ⚠ LE GESTE QUI LE REPRODUIRA, écrit d'avance parce qu'il est raisonnable :
 * quelqu'un déclarera un module au registre, posera `@ModuleRequis` sur son
 * contrôleur — le geste juste, celui que la règle d'activation exige — et
 * s'arrêtera là. Rien ne protestera : ni le compilateur, ni les tests, ni la
 * relecture. Seul le démarrage le dira, et seulement si quelqu'un démarre.
 */
describe('Un garde de module doit être RÉSOLVABLE là où il est posé', () => {
  const SRC = join(__dirname, '..');

  function fichiers(dossier: string, suffixe: string): string[] {
    return readdirSync(join(SRC, dossier), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? fichiers(join(dossier, e.name), suffixe)
        : e.name.endsWith(suffixe)
          ? [join(dossier, e.name)]
          : [],
    );
  }

  /** Les contrôleurs qui posent `@ModuleRequis`, quel qu'en soit le niveau. */
  const gardes = fichiers('', '.controller.ts').filter((f) =>
    readFileSync(join(SRC, f), 'utf-8').includes('@ModuleRequis('),
  );

  it('⚠ TÉMOIN DE COMPTE : il en trouve exactement SEPT', () => {
    // « Au moins un » confirmerait que le relevé tourne. Seul un compte exact
    // signale le huitième, écrit demain par quelqu'un qui n'aura pas lu ceci.
    expect(gardes.map((f) => f.replace(/\\/g, '/')).sort()).toEqual([
      'circulation/circulation.controller.ts',
      'depots/depots.controller.ts',
      'moissonnage/moissonnage.controller.ts',
      'oai/oai.controller.ts',
      'reminders/reminders.controller.ts',
      'sru/sru.controller.ts',
      'stats/stats.controller.ts',
    ]);
  });

  it('⚠ le module qui DÉCLARE un contrôleur gardé importe `ModulesModule`', () => {
    const manquants: string[] = [];

    for (const controleur of gardes) {
      const dossier = controleur.slice(0, controleur.lastIndexOf('/'));
      // Le module du même dossier — la convention de ce dépôt, vérifiée par le
      // fait que chaque contrôleur gardé en a un.
      const candidats = fichiers(dossier, '.module.ts');
      expect(candidats.length, `${controleur} : aucun module dans son dossier`).toBeGreaterThan(0);

      const declarant = candidats.find((m) =>
        readFileSync(join(SRC, m), 'utf-8').includes(
          controleur.slice(controleur.lastIndexOf('/') + 1).replace('.ts', ''),
        ),
      ) ?? candidats[0];

      // ⚠ DANS LE TABLEAU `imports`, PAS N'IMPORTE OÙ DANS LE FICHIER. La
      // première écriture cherchait la chaîne `ModulesModule` partout : la
      // ligne `import { ModulesModule } from …` SUBSISTE quand on le retire
      // des `imports`, et le contrôle négatif ne tombait pas. C'est la
      // famille qui se reproduit dans l'outil écrit pour la traquer —
      // cinquième fois dans ce dépôt, et trouvée par le contrôle négatif, pas
      // par la relecture.
      const source = readFileSync(join(SRC, declarant), 'utf-8');
      const tableau = /imports:\s*\[([\s\S]*?)\]/.exec(source)?.[1] ?? '';
      if (!tableau.includes('ModulesModule')) manquants.push(`${declarant} (pour ${controleur})`);
    }

    expect(
      manquants,
      'Module(s) qui déclarent un contrôleur gardé sans pouvoir résoudre son garde :\n' +
        manquants.map((m) => `  · ${m}`).join('\n') +
        '\n\nL’API REFUSERA DE DÉMARRER — `Nest can’t resolve dependencies of the ' +
        'ModuleActifGuard`. Aucun test unitaire ne peut le voir : il construit le ' +
        'service à la main, avec des doublures.\n' +
        'Le geste : ajouter `ModulesModule` aux `imports` du module.',
    ).toEqual([]);
  });
});
