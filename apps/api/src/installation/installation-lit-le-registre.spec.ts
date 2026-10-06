/**
 * L'ASSISTANT LIT LE REGISTRE — il n'en recopie rien.
 *
 * ⚠ POURQUOI UN GARDE ET PAS UNE RELECTURE. `ModulesService.etat` et
 * `InstallationService.modules` projettent la MÊME structure (`ecrans[].quoi`)
 * et ne peuvent pas être fondues : `etat` exige un `tenantId`, et l'assistant
 * n'a pas encore d'école. Deux projections d'une même source, c'est
 * exactement « deux tableaux qui se ressemblent » — elles divergeront le jour
 * où l'une change, et chacune sera correcte isolément.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES } from '../modules/registre-modules';
import { InstallationService } from './installation.service';

/**
 * ⚠ `modules()` n'utilise AUCUNE dépendance injectée — on peut donc
 * l'instancier à vide et mesurer son EFFET, plutôt que lire sa source.
 * Si elle en prend une un jour, ce test lèvera, et c'est le bon moment pour
 * le savoir.
 */
const service = new InstallationService(
  null as never, null as never, null as never, null as never, null as never, null as never,
);

describe('la liste des modules de l’assistant', () => {
  const liste = service.modules();

  it('porte EXACTEMENT les modules du registre, dans le même ordre', () => {
    expect(liste.map((m) => m.id)).toEqual(MODULES.map((m) => m.id));
    // Témoin de non-vacuité : un relevé qui s'effondre à zéro rendrait vraies
    // toutes les assertions « pour chaque élément trouvé ».
    expect(liste.length).toBeGreaterThan(8);
  });

  it('⭐ chaque champ vient du registre — rien n’est recopié ni inventé', () => {
    const examines: string[] = [];
    for (const m of MODULES) {
      const vu = liste.find((x) => x.id === m.id)!;
      expect(vu, `module ${m.id} absent de la liste de l’assistant`).toBeTruthy();
      expect(vu.libelle).toBe(m.libelle);
      expect(vu.description).toBe(m.description);
      expect(vu.noyau).toBe(m.noyau);
      expect(vu.dependances).toEqual([...m.dependances]);
      expect(vu.ecransPerdus).toEqual(m.ecrans.map((e) => e.quoi));
      examines.push(m.id);
    }
    // ⚠ Le témoin ÉNUMÈRE : un compte global prouve que l'instrument tourne,
    // jamais qu'il tourne sur chaque élément (leçon du 22 septembre, où un
    // `toBeGreaterThan(20)` masquait une colonne jamais lue).
    expect(examines).toEqual(MODULES.map((m) => m.id));
  });

  it('⚠ et la projection des écrans est la MÊME que celle de ModulesService', () => {
    // La seule chose qu'un test puisse comparer sans base : que les deux
    // projettent le même champ. Si `etat` passait à `e.chemin`, ce test le dit.
    const autre = readFileSync(
      join(__dirname, '..', 'modules', 'modules.service.ts'),
      'utf-8',
    );
    expect(autre, 'ModulesService.etat doit projeter ecrans[].quoi').toContain(
      'ecrans: ecrans.map((e) => e.quoi)',
    );
    const mien = readFileSync(join(__dirname, 'installation.service.ts'), 'utf-8');
    expect(mien, 'l’assistant doit projeter le MÊME champ').toContain(
      'ecransPerdus: m.ecrans.map((e) => e.quoi)',
    );
  });

  it('les modules de NOYAU sont marqués — l’assistant ne doit pas les offrir', () => {
    const noyaux = liste.filter((m) => m.noyau).map((m) => m.id);
    expect(noyaux.length, 'il y a bien des modules de noyau').toBeGreaterThan(0);
    expect(noyaux.sort()).toEqual(MODULES.filter((m) => m.noyau).map((m) => m.id).sort());
  });
});
