import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ⚠ UN FICHIER DE TEST HORS DU MOTIF D'INCLUSION EST UN TEST QUE PERSONNE NE
 * LANCE — et il ressemble exactement à un test.
 *
 * `vitest.config.ts` inclut `src/**\/*.spec.ts`. Un `.spec.ts` écrit ailleurs —
 * `test/`, `prisma/`, la racine du workspace — n'est jamais exécuté. Rien ne le
 * signale : la suite reste verte, le fichier est dans l'arbre, il est relu en
 * revue, il compile, et il n'a jamais rien mesuré.
 *
 * C'est la même famille que les trois gardes gatés `PG_LIVE=1` qui dormaient
 * depuis leur écriture : **un garde que personne ne lance ne garde rien.**
 * Celui-ci est plus traître encore, parce qu'il ne demande aucune condition —
 * il suffit qu'on se soit trompé de répertoire.
 *
 * Mesuré le 12 septembre 2026 avant d'écrire ce test : 111 fichiers `.spec.ts`
 * sur le disque, 111 exécutés. Aucun orphelin — et c'est précisément le moment
 * d'y mettre un garde, pas quand il y en aura un.
 */

const WORKSPACE = join(__dirname, '..', '..');

/** Le motif d'inclusion, LU dans la configuration plutôt que recopié. */
const CONFIG = readFileSync(join(WORKSPACE, 'vitest.config.ts'), 'utf8');

function specs(dir: string, ignorer: Set<string>): string[] {
  const trouves: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (ignorer.has(e.name)) continue;
    const chemin = join(dir, e.name);
    if (e.isDirectory()) trouves.push(...specs(chemin, ignorer));
    else if (/\.spec\.tsx?$/.test(e.name)) trouves.push(chemin.replace(WORKSPACE + '/', ''));
  }
  return trouves;
}

const IGNORER = new Set(['node_modules', 'dist', '.turbo', 'coverage']);

describe('⚠ Tout fichier de test est dans le périmètre exécuté', () => {
  it('l’instrument lit le motif d’inclusion RÉEL, il ne le recopie pas', () => {
    // Un garde qui compare une copie à une copie ne garde rien : il vérifie
    // qu'on s'est recopié soi-même.
    expect(CONFIG).toContain("include: ['src/**/*.spec.ts']");
  });

  it('⚠ TÉMOIN QUI COMPTE : il trouve bien les fichiers de test du workspace', () => {
    // « Au moins un » confirmerait que le parcours tourne. Un compte plancher
    // dit en plus qu'il regarde tout l'arbre et pas un sous-dossier.
    expect(specs(WORKSPACE, IGNORER).length).toBeGreaterThan(100);
  });

  it('⚠ aucun `.spec.ts` ne vit HORS de `src/`', () => {
    const orphelins = specs(WORKSPACE, IGNORER).filter((f) => !f.startsWith('src/'));
    expect(
      orphelins,
      'ces fichiers ne sont lancés par personne : `vitest.config.ts` n’inclut ' +
        'que `src/**/*.spec.ts`. Deux issues — déplacer le test dans `src/` à ' +
        'côté de ce qu’il éprouve, ou élargir le motif d’inclusion ET revenir ' +
        'ici. Le laisser où il est, c’est garder un test qui ne mesure rien.',
    ).toEqual([]);
  });

  it('⚠ et aucun `.spec.tsx` non plus — le motif ne couvre que `.ts`', () => {
    // Un `.spec.tsx` déposé dans `src/` serait ignoré en silence : le motif
    // d'inclusion s'arrête à `.spec.ts`. Ce cas mérite son assertion, parce
    // qu'il ne se voit pas du tout — le fichier est AU BON endroit.
    const tsx = specs(WORKSPACE, IGNORER).filter((f) => f.endsWith('.spec.tsx'));
    expect(
      tsx,
      'l’API n’a pas de JSX : un `.spec.tsx` ici n’est lancé par personne.',
    ).toEqual([]);
  });
});
