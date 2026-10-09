/**
 * AUCUNE DOUBLURE DE `/modules` N'ÉNUMÈRE SES MODULES À LA MAIN.
 *
 * ⚠ TROIS FOIS LE MÊME MOTIF, le 8 octobre 2026 — et c'est pour ça que ce garde
 * existe plutôt qu'une quatrième correction à la main. Trois tests doublaient
 * `GET /modules` par `[{ id: 'depot', actif: true }]` : un seul module, celui
 * qui les intéressait. L'API, elle, rend TOUS les modules déclarés avec un
 * booléen, noyau compris (`ModulesService.etat()` :
 * `actif = noyau || !eteints.has(id)`).
 *
 * L'écart était invisible tant qu'aucune entrée de menu ne dépendait d'un autre
 * module. Le jour où « Mes prêts » a reçu `module: 'circulation'`, les trois
 * doublures ont masqué une entrée que le vrai produit affiche — et les trois
 * tests ont échoué **en accusant le produit**, qui allait bien.
 *
 * > ⭐ « Une doublure est une hypothèse, et un test vert ne confirme que moi. »
 * > Celles-ci décrivaient un établissement qui n'a qu'un module.
 *
 * ⚠ CE GARDE EST UN POINT DE PASSAGE, pas une leçon de plus : une règle écrite
 * protège de l'ignorance, jamais de la pente, et la forme courte — un littéral
 * sur place — se présente d'elle-même.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOSSIER = resolve(process.cwd(), 'tests');

function fichiersDeTest(): string[] {
  return readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.spec.ts') || f.endsWith('.spec.tsx'))
    .filter((f) => f !== 'doublure-des-modules.spec.ts');
}

/** Un littéral de réponse de modules : `[{ id: '…', actif: … }]`. */
const LITTERAL = /\[\s*\{\s*id:\s*'[^']+'\s*,\s*actif:/;

describe('la doublure de /modules ressemble à l’API', () => {
  it('⚠ témoin de COMPTE : le relevé a bien vu les fichiers de test', () => {
    // Sans lui, un chemin faux rendrait une population vide et « aucun fichier
    // ne viole la règle » passerait sur rien.
    expect(fichiersDeTest().length).toBeGreaterThan(80);
  });

  it('⚠ témoin d’ABSENCE : le motif reconnaît la forme fautive', () => {
    // La confusion plausible : une liste d'identifiants (légitime) ne doit PAS
    // être prise pour une réponse de modules.
    expect(LITTERAL.test("json: () => Promise.resolve([{ id: 'depot', actif: true }])")).toBe(true);
    expect(LITTERAL.test("const modules = ['depot', 'rappels'];")).toBe(false);
  });

  it('aucun fichier n’énumère une réponse de modules à la main', () => {
    const fautifs = fichiersDeTest().filter((f) => {
      const src = readFileSync(resolve(DOSSIER, f), 'utf-8');
      // On ne regarde que les fichiers qui doublent vraiment cette route.
      if (!src.includes("'/modules'") && !src.includes('/modules')) return false;
      return LITTERAL.test(src);
    });
    expect(
      fautifs,
      'Employez `reponseModules()` de `tests/aide-modules.ts` : elle part du ' +
        'REGISTRE RÉEL et rend ce que l’API rend, noyau compris. Un littéral ' +
        'décrit un établissement qui n’a qu’un module, et il masquera les ' +
        'entrées qui dépendent des autres — en accusant le produit.',
    ).toEqual([]);
  });
});
