import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ⭐⭐ TOUT FICHIER LU PAR UN SCRIPT APPELÉ DANS `DEPLOY.md` DOIT EXISTER DANS
 * L'IMAGE.
 *
 * ## 🔴 CE QUE ÇA A COÛTÉ, et comment ça a été trouvé
 *
 * Le 12 octobre 2026, sur la démonstration, `remplacer-documents-demo.mjs` a
 * planté DANS le conteneur de production :
 *
 * ```
 * ENOENT '/app/apps/api/src/cataloging/corpus-demonstration'
 * ```
 *
 * L'image copie `dist`, `prisma`, `package.json` et `scripts` — **jamais
 * `src/`**. Le corpus de documents vivait sous `src/`.
 *
 * ⚠ **Et ma recette ne pouvait pas le voir** : elle avait tourné HORS
 * conteneur, dans l'arbre du dépôt, où `src/` existe. « Une recette qui fournit
 * l'environnement qu'elle éprouve ne mesure que sa propre fixture » — et c'est
 * la deuxième fois que cette famille coûte une panne de production, après le
 * refus de démarrage de rc4.
 *
 * ## ⚠ CE QUE CE GARDE FAIT, ET CE QU'IL NE FAIT PAS
 *
 * Il relève les chemins LITTÉRAUX que ces scripts lisent, et vérifie que chacun
 * tombe sous un répertoire que l'étape `runner` du Dockerfile copie. C'est un
 * garde de SOURCE : il ne suit pas les variables, et sa borne est écrite plutôt
 * que découverte.
 *
 * ⭐ La vraie mesure est l'EFFET — lancer le script DANS le conteneur construit
 * par le compose de production, ce que fait `recette-voie-demo-dans-le-conteneur.sh`.
 * Ce garde-ci est ce qui tourne à chaque commit, sans docker.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const DEPLOY = readFileSync(join(RACINE, 'DEPLOY.md'), 'utf-8');
const DOCKERFILE = readFileSync(join(RACINE, 'apps', 'api', 'Dockerfile'), 'utf-8');

/** Les scripts que `DEPLOY.md` fait exécuter dans le conteneur. */
function scriptsAppelés(): string[] {
  return [...new Set([...DEPLOY.matchAll(/node (scripts\/[A-Za-z0-9_./-]+\.mjs)/g)].map((m) => m[1]))];
}

/**
 * Les répertoires que l'étape `runner` copie, exprimés en chemins du dépôt.
 *
 * ⚠ LUS DANS LE DOCKERFILE, jamais recopiés ici : « un garde qui compare une
 * copie à une copie ne garde rien ».
 */
function copiesDuRunner(): string[] {
  const runner = DOCKERFILE.slice(DOCKERFILE.indexOf('AS runner'));
  const copies: string[] = [];
  for (const m of runner.matchAll(/^COPY (?:--from=\S+ )?(\S+) (\S+)$/gm)) {
    const source = m[1].replace(/^\/app\//, '');
    copies.push(source);
  }
  return copies;
}

/**
 * Les chemins du dépôt qu'un script lit — LUI ET SES IMPORTS LOCAUX.
 *
 * ⚠ SUIVRE LES IMPORTS N'EST PAS UN RAFFINEMENT : c'est le cas RÉEL. La panne
 * de production venait d'un chemin qui n'est pas dans
 * `remplacer-documents-demo.mjs` mais dans `engendrer-document-demo.mjs`, qu'il
 * importe. Une première rédaction qui ne regardait que le script appelé a rendu
 * **zéro chemin examiné** — et c'est le témoin de COMPTE qui l'a dit, pas la
 * relecture : sans lui, ce garde aurait été vert sur l'ensemble vide,
 * c'est-à-dire exactement le défaut qu'il traque.
 */
function cheminsLus(scriptRelatif: string, vus = new Set<string>()): string[] {
  if (vus.has(scriptRelatif)) return [];
  vus.add(scriptRelatif);
  const source = readFileSync(join(RACINE, scriptRelatif), 'utf-8');
  const trouves = new Set<string>();

  // Les chemins écrits en clair : `join(RACINE, 'scripts/dev/x')`.
  for (const m of source.matchAll(/'((?:apps|scripts|docs|docker)\/[A-Za-z0-9_./-]+)'/g)) {
    trouves.add(m[1]);
  }

  // Et les imports LOCAUX, suivis — la récursion s'arrête d'elle-même sur `vus`.
  //
  // ⚠ LE MOTIF ACCEPTE LES SOUS-RÉPERTOIRES ET LES PARENTS. Ma première
  // rédaction était `\.\/[A-Za-z0-9_.-]+\.mjs` : elle excluait le `/`, donc
  // elle ratait `./lib/load-env.mjs` ET `../lib/base-tenant.mjs` — SIX imports
  // sur cinq scripts. Le témoin de COMPTE l'a dit ; le relevé, lui, rendait
  // deux chemins plausibles et se taisait sur le reste.
  const dossier = scriptRelatif.slice(0, scriptRelatif.lastIndexOf('/'));
  for (const m of source.matchAll(/from '(\.\.?\/[A-Za-z0-9_./-]+\.mjs)'/g)) {
    const importe = posix.normalize(`${dossier}/${m[1]}`);
    trouves.add(importe);
    for (const c of cheminsLus(importe, vus)) trouves.add(c);
  }
  return [...trouves];
}

describe('🔴 les scripts de DEPLOY.md trouvent ce qu’ils lisent, DANS l’image', () => {
  it('⚠ TÉMOIN : les deux fichiers sont lus, et le relevé voit des scripts', () => {
    expect(DEPLOY.length, 'DEPLOY.md').toBeGreaterThan(5000);
    expect(DOCKERFILE.length, 'le Dockerfile').toBeGreaterThan(2000);
    // ⚠ TÉMOIN DE COMPTE : cinq scripts aujourd'hui. Un de plus demain convoque
    // quelqu'un ici — c'est le moment où l'on sait ce qu'il lit.
    expect(
      scriptsAppelés().length,
      'DEPLOY.md doit nommer les scripts d’exploitation',
    ).toBe(5);
    expect(copiesDuRunner().length, 'le runner doit copier quelque chose').toBeGreaterThan(5);
  });

  it('🔴 chaque chemin LU par ces scripts tombe sous un répertoire que l’image copie', () => {
    const copies = copiesDuRunner();
    const couvert = (chemin: string) =>
      copies.some((c) => chemin === c || chemin.startsWith(`${c.replace(/\/$/, '')}/`));

    const absents: string[] = [];
    let examines = 0;
    for (const script of scriptsAppelés()) {
      // ⚠ Le script LUI-MÊME doit être dans l'image — sinon rien d'autre ne compte.
      expect(couvert(script), `${script} n’est pas copié dans l’image`).toBe(true);
      for (const lu of cheminsLus(script)) {
        examines += 1;
        if (!couvert(lu)) absents.push(`${script} → ${lu}`);
      }
    }

    // ⚠ TÉMOIN DE COMPTE : le relevé a bien examiné des chemins. Zéro rendrait
    // ce cas vert sur l'ensemble vide — exactement le défaut qu'il traque.
    expect(examines, 'le relevé doit examiner des chemins lus').toBeGreaterThan(2);

    expect(
      absents,
      'Ces chemins sont lus par un script que DEPLOY.md fait exécuter DANS le ' +
        'conteneur, et l’image ne les contient pas. Le script plantera en ENOENT ' +
        'sur la machine du client, au moment de la commande.\n' +
        '· la donnée appartient au script → déplacez-la sous `scripts/`, que le ' +
        'Dockerfile copie EN ENTIER (la dépendance devient structurelle) ;\n' +
        '· elle doit rester où elle est → ajoutez un `COPY` à l’étape `runner`, ' +
        'en sachant que c’est une liste à tenir.',
    ).toEqual([]);
  });

  it('⚠ TÉMOIN D’ABSENCE : un chemin sous `src/` serait bien REFUSÉ', () => {
    // Sans ce cas, un garde qui déclarerait tout couvert serait indiscernable
    // d'un garde juste — et plus rassurant, puisqu'il ne trouve jamais rien.
    const copies = copiesDuRunner();
    const couvert = (chemin: string) =>
      copies.some((c) => chemin === c || chemin.startsWith(`${c.replace(/\/$/, '')}/`));
    expect(
      couvert('apps/api/src/cataloging/corpus-demonstration'),
      'le chemin EXACT qui a planté en production doit être refusé par ce garde',
    ).toBe(false);
    // Et le chemin où il vit désormais, lui, est couvert.
    expect(couvert('scripts/dev/corpus-demonstration'), 'le nouveau chemin').toBe(true);
  });
});
