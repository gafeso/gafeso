/**
 * LA VERSION PUBLIÉE A UNE SEULE SOURCE : l'étiquette git, posée au BUILD.
 *
 * ## Ce que ce garde remplace, et pourquoi (6 octobre 2026)
 *
 * Son prédécesseur — `version-unique.spec.ts` — affirmait que les trois
 * `package.json` S'ACCORDENT et que `VERSION_PUBLIEE` les reflète. Il était
 * juste sur sa propriété et il gardait la MAUVAISE : un nombre tenu à la main,
 * resté à `0.1.0` pendant 759 commits. Un garde d'accord ne peut pas voir
 * qu'une valeur n'est plus maintenue — il voit seulement qu'elle est la même
 * partout.
 *
 * ## ⭐ ET LA LEÇON QU'IL A COÛTÉE : il lisait l'ARBRE DE TRAVAIL
 *
 * L'étiquette `v1.0.0-rc1` a été posée sur un arbre où `apps/web/package.json`
 * portait encore `0.1.0` : un `git add -A apps/api` n'avait pas pris `apps/web`.
 * Le garde était VERT, parce qu'il lisait les fichiers du disque — où ma
 * modification était bien présente — et non ce que l'archive portait.
 *
 *   « Un garde d'égalité qui lit l'arbre de travail ne peut pas voir un commit
 *     PARTIEL : il mesure ce qu'on a écrit, jamais ce qu'on a archivé. »
 *
 * C'est l'archive qu'on étiquette et qu'on déploie. Tout ce qui décide d'une
 * version se lit donc dans HEAD, par `git show HEAD:<chemin>`.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SANS_COMMIT, SANS_ETIQUETTE, VERSION_PUBLIEE } from './version';

const RACINE = join(__dirname, '..', '..', '..', '..');
const SENTINELLE = '0.0.0-non-publie';
const MANIFESTES = ['package.json', 'apps/api/package.json', 'apps/web/package.json'] as const;

function duDisque(rel: string): string {
  return JSON.parse(readFileSync(join(RACINE, rel), 'utf-8')).version as string;
}

/** ⭐ Ce que l'ARCHIVE porte — la seule chose qu'on étiquette et qu'on déploie. */
function deHEAD(rel: string): string {
  const brut = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: RACINE, encoding: 'utf-8' });
  return JSON.parse(brut).version as string;
}

const source = (rel: string) => readFileSync(join(RACINE, rel), 'utf-8');

describe('la version publiée', () => {
  it('ne vient PAS de package.json : les trois portent la sentinelle, sur le disque', () => {
    // Le témoin de COUVERTURE d'abord : les trois ont bien été lus.
    const lus = MANIFESTES.map((rel) => [rel, duDisque(rel)] as const);
    expect(lus.map(([rel]) => rel)).toEqual([...MANIFESTES]);
    for (const [rel, v] of lus) {
      expect(v, `${rel} doit porter la sentinelle, pas un numéro tenu à la main`).toBe(SENTINELLE);
    }
  });

  it('⭐ et dans HEAD aussi — un commit partiel ne doit pas passer', () => {
    for (const rel of MANIFESTES) {
      expect(deHEAD(rel), `${rel} dans HEAD`).toBe(SENTINELLE);
    }
    // Le verrou aussi : c'est lui qui a dérivé en quelques minutes le 6 octobre.
    const verrou = JSON.parse(execFileSync('git', ['show', 'HEAD:package-lock.json'], {
      cwd: RACINE, encoding: 'utf-8',
    })) as { version?: string; packages: Record<string, { version?: string }> };
    expect(verrou.version, 'package-lock.json dans HEAD').toBe(SENTINELLE);
    for (const k of ['apps/api', 'apps/web']) {
      expect(verrou.packages[k]?.version, `verrou packages["${k}"]`).toBe(SENTINELLE);
    }
  });

  it('sans argument de build, elle DIT qu\'elle ne sait pas — jamais un numéro plausible', () => {
    // ⚠ Ce cas-ci est celui de la suite : aucun GAFESO_VERSION dans l'environnement
    // de test. Le témoin d'ABSENCE porte sur la confusion PLAUSIBLE — un numéro.
    if (!process.env.GAFESO_VERSION) {
      expect(VERSION_PUBLIEE.version).toBe(SANS_ETIQUETTE);
      expect(VERSION_PUBLIEE.version).not.toMatch(/^\d/);
    }
    if (!process.env.GAFESO_COMMIT) expect(VERSION_PUBLIEE.commit).toBe(SANS_COMMIT);
  });

  it('une chaîne VIDE est traitée comme une absence — un ARG non passé arrive vide', async () => {
    const avant = { v: process.env.GAFESO_VERSION, c: process.env.GAFESO_COMMIT };
    try {
      process.env.GAFESO_VERSION = '   ';
      process.env.GAFESO_COMMIT = '';
      const frais = await import(`./version?vide=${Date.now()}`);
      expect(frais.VERSION_PUBLIEE.version).toBe(SANS_ETIQUETTE);
      expect(frais.VERSION_PUBLIEE.commit).toBe(SANS_COMMIT);

      // et le TÉMOIN DE PRÉSENCE : une vraie valeur ressort telle quelle
      process.env.GAFESO_VERSION = 'v9.9.9';
      process.env.GAFESO_COMMIT = 'deadbee';
      const plein = await import(`./version?plein=${Date.now()}`);
      expect(plein.VERSION_PUBLIEE.version).toBe('v9.9.9');
      expect(plein.VERSION_PUBLIEE.commit).toBe('deadbee');
    } finally {
      if (avant.v === undefined) delete process.env.GAFESO_VERSION; else process.env.GAFESO_VERSION = avant.v;
      if (avant.c === undefined) delete process.env.GAFESO_COMMIT; else process.env.GAFESO_COMMIT = avant.c;
    }
  });

  it('aucun littéral de version ne subsiste dans le code — Swagger lit la source', () => {
    const main = source('apps/api/src/main.ts');
    expect(main, 'le Swagger doit lire VERSION_PUBLIEE').toContain('.setVersion(VERSION_PUBLIEE.version)');
    // ⚠ Témoin d'ABSENCE sur la confusion plausible : un numéro réécrit à la main.
    expect(main).not.toMatch(/\.setVersion\(\s*['"`]/);
  });

  it('⭐ UNE SEULE SOURCE : toute route qui publie « la version » lit VERSION_PUBLIEE', () => {
    // ⚠ POINT SOULEVÉ PAR LE FRONT le 6 octobre 2026, et il a raison :
    // « deux routes qui rendent la version sont deux sources qui s'accorderont
    // PAR COÏNCIDENCE — ce dépôt en a compté sept occurrences. »
    //
    // Les deux routes concernées sont `GET /health` et
    // `GET /installation/constat`. Le garde ÉNUMÈRE ses fichiers plutôt que de
    // balayer : un balayage ne voit que la forme qu'on a imaginée, et un
    // troisième consommateur doit obliger à revenir ici.
    const CONSOMMATEURS = [
      'apps/api/src/health/health.controller.ts',
      'apps/api/src/installation/installation.service.ts',
      'apps/api/src/main.ts', // le Swagger
    ] as const;
    const examines: string[] = [];
    for (const rel of CONSOMMATEURS) {
      const texte = source(rel);
      expect(texte, `${rel} doit importer VERSION_PUBLIEE`).toMatch(
        /import \{[^}]*VERSION_PUBLIEE[^}]*\} from '[^']*health\/version'|from '\.\/version'/,
      );
      expect(texte, `${rel} doit lire VERSION_PUBLIEE.version`).toContain('VERSION_PUBLIEE.version');
      examines.push(rel);
    }
    expect(examines).toEqual([...CONSOMMATEURS]);

    // ⚠ Témoin d'ABSENCE sur la confusion PLAUSIBLE : un second calcul local.
    // C'est ce qu'on écrirait de bonne foi — `version: pkg.version`,
    // `process.env.npm_package_version` — et chacun serait correct isolément.
    for (const rel of CONSOMMATEURS) {
      const texte = source(rel);
      expect(texte, `${rel} ne doit PAS recalculer la version`)
        .not.toMatch(/npm_package_version|require\(['"].*package\.json/);
    }

    // Et le COMPTE, qui convoque quand un quatrième apparaît.
    const tous = [...source('apps/api/src/installation/installation.service.ts').matchAll(/VERSION_PUBLIEE\./g)];
    expect(tous.length, 'le constat publie version ET commit').toBe(2);
  });

  it('la CHAÎNE du build est entière : ARG → ENV → code', () => {
    const dockerfile = source('apps/api/Dockerfile');
    for (const nom of ['GAFESO_VERSION', 'GAFESO_COMMIT']) {
      expect(dockerfile, `ARG ${nom}`).toMatch(new RegExp(`^ARG ${nom}=`, 'm'));
      expect(dockerfile, `ENV ${nom}`).toMatch(new RegExp(`^ENV ${nom}=\\$${nom}$`, 'm'));
    }
    // ⚠ CE TEST A ATTRAPÉ MON PROPRE CHANGEMENT, le 9 octobre 2026, et c'est
    // exactement son office. Il exigeait la forme `${GAFESO_VERSION:-…}` — avec
    // son DÉFAUT. Or c'est ce défaut qui a produit l'image muette de rc7 : il
    // rendait l'oubli indiscernable du choix, et il est parti.
    //
    // ⚠ Et l'assertion devait changer de SENS, pas seulement de motif : elle
    // exigeait un défaut, elle exige maintenant son ABSENCE. Un test qui aurait
    // seulement été « assoupli » (`\$\{GAFESO_VERSION`) aurait laissé revenir le
    // défaut sans rien dire. La propriété complète — le compose SANS défaut ET
    // le Dockerfile qui refuse — est tenue par `version-au-build.spec.ts`, avec
    // ses quatre contrôles négatifs ; celle-ci garde la CHAÎNE ARG → ENV → code.
    const compose = source('docker/docker-compose.prod.yml');
    const composeCode = compose.replace(/^\s*#.*$/gm, ' ');
    expect(composeCode, 'compose doit passer les deux arguments au build de l\'api')
      .toMatch(/args:\s*(?:\n\s*)+GAFESO_VERSION: \$\{GAFESO_VERSION\}/);
    expect(composeCode).toMatch(/GAFESO_COMMIT: \$\{GAFESO_COMMIT\}/);
    // Et le script qui les CALCULE existe, publié, exécutable.
    expect(source('scripts/version-du-depot.sh')).toContain('--exact-match');
  });
});
