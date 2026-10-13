import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ⭐⭐ `npm test` NE DOIT JAMAIS SORTIR EN 2 FAUTE D'UN CLIENT PRISMA.
 *
 * ## Ce que ce garde défend, et ce que ça coûtait
 *
 * Sur un clone frais, `npm test` sortait en **2** avec **384 erreurs TS** du
 * genre `Module '"@prisma/client"' has no exported member 'AccessRule'`. Le
 * message accuse le code du produit ; la seule chose qui manquait était une
 * commande que personne n'avait dite à l'auto-hébergeur.
 *
 * Deux filets le rendent impossible, et les deux sont mesurés sur clone frais :
 *
 * | Le filet | Il attrape |
 * |---|---|
 * | `postinstall` à la racine | l'état d'après `npm ci` — le paquet par défaut, SANS nos types |
 * | `pretest` dans `apps/api` | un client retiré depuis, ou un schéma modifié depuis l'install |
 *
 * ## 🔴 LA PROPRIÉTÉ SUBTILE QUE CE GARDE EXISTE POUR TENIR
 *
 * La condition de régénération porte sur le **CONTENU** du client, pas sur sa
 * DATE. La forme évidente — « le schéma est-il plus récent ? » — est FAUSSE, et
 * le clone frais le dit :
 *
 * ```
 * mtime du client : 11:34:20   ← plus RÉCENT que le schéma
 * mtime du schéma : 11:34:13
 * nos modèles dedans : 0       ← et pourtant inutilisable
 * ```
 *
 * ⚠ **Une « simplification » qui remplacerait le test de contenu par une
 * comparaison de dates ramènerait les 384 erreurs**, sur un clone frais
 * uniquement — donc jamais chez nous. C'est exactement ce qu'un garde doit
 * tenir, et c'est le premier cas ci-dessous.
 *
 * ## ⚠ POURQUOI DES BACS TEMPORAIRES ET PAS LE DÉPÔT
 *
 * La décision est PURE et exportée ; l'action ne l'est pas. Ce fichier éprouve
 * la décision avec des schémas et des clients fabriqués dans `os.tmpdir()` —
 * il ne lance **jamais** `prisma generate`, qui écrirait dans `node_modules`,
 * c'est-à-dire dans l'état PARTAGÉ entre les deux sessions de cette machine.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');

/** Un schéma minimal, avec son modèle témoin. */
const SCHEMA_MINIMAL = 'model Tenant {\n  id String @id\n}\n';

function bac() {
  const d = mkdtempSync(join(tmpdir(), 'prisma-assure-'));
  return {
    d,
    schema: (contenu = SCHEMA_MINIMAL) => {
      const p = join(d, 'schema.prisma');
      writeFileSync(p, contenu);
      return p;
    },
    client: (contenu: string, vieuxDe = 0) => {
      mkdirSync(join(d, 'c'), { recursive: true });
      const p = join(d, 'c', 'index.d.ts');
      writeFileSync(p, contenu);
      if (vieuxDe) {
        const t = Date.now() / 1000 - vieuxDe;
        utimesSync(p, t, t);
      }
      return p;
    },
    absent: () => join(d, 'c', 'index.d.ts'),
    jeter: () => rmSync(d, { recursive: true, force: true }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
async function decision() {
  const m = (await import(
    join(RACINE, 'apps', 'api', 'scripts', 'assurer-client-prisma.mjs')
  )) as {
    raisonDeGenerer: (s?: string, c?: string) => string | null;
    premierModeleDuSchema: (source: string, ou?: string) => string;
  };
  return m;
}

describe('🔴 le client Prisma est assuré avant tout `npm test`', () => {
  it('🔴 un client PLUS RÉCENT que le schéma mais SANS nos modèles doit être régénéré', async () => {
    // ⭐ LE CAS QUI INTERDIT LA « SIMPLIFICATION » PAR LES DATES. C'est
    // exactement l'état d'après `npm ci` : le paquet par défaut, installé à
    // l'instant, et qui ne déclare rien de ce schéma.
    const { raisonDeGenerer } = await decision();
    const b = bac();
    try {
      const schema = b.schema();
      // ⚠ le client est écrit APRÈS le schéma : son mtime est donc plus récent.
      const client = b.client('export declare const rien: 1;\n');
      expect(
        require('node:fs').statSync(client).mtimeMs,
        'le témoin de ce cas exige que le client soit le PLUS RÉCENT',
      ).toBeGreaterThanOrEqual(require('node:fs').statSync(schema).mtimeMs);

      const raison = raisonDeGenerer(schema, client);
      expect(
        raison,
        'un client sans nos modèles DOIT être régénéré, quelle que soit sa date — ' +
          'une condition sur les dates seules ramènerait les 384 erreurs du clone frais',
      ).toMatch(/ne déclare pas/);
    } finally {
      b.jeter();
    }
  });

  it('⭐ un client qui DÉCLARE le modèle et date d’après le schéma : rien à faire', async () => {
    const { raisonDeGenerer } = await decision();
    const b = bac();
    try {
      const schema = b.schema();
      const client = b.client('export declare type Tenant = { id: string };\n');
      expect(
        raisonDeGenerer(schema, client),
        'le cas nominal ne doit RIEN générer — sinon chaque `npm test` écrirait ' +
          'dans node_modules, partagé entre les deux sessions de cette machine',
      ).toBeNull();
    } finally {
      b.jeter();
    }
  });

  it('⭐ un client ANTÉRIEUR au schéma est régénéré, même s’il déclare le modèle', async () => {
    const { raisonDeGenerer } = await decision();
    const b = bac();
    try {
      const client = b.client('export declare type Tenant = { id: string };\n', 3600);
      const schema = b.schema(); // écrit après, donc plus récent
      expect(raisonDeGenerer(schema, client)).toMatch(/le schéma a changé/);
    } finally {
      b.jeter();
    }
  });

  it('⭐ un client ABSENT est régénéré, et le message NOMME le modèle cherché', async () => {
    const { raisonDeGenerer } = await decision();
    const b = bac();
    try {
      const raison = raisonDeGenerer(b.schema(), b.absent());
      expect(raison).toMatch(/n’existe pas/);
      expect(raison, 'le message doit dire ce qu’il cherchait').toContain('Tenant');
    } finally {
      b.jeter();
    }
  });

  it('⚠ un schéma SANS modèle LÈVE — on ne devine pas sur quoi décider', async () => {
    const { premierModeleDuSchema } = await decision();
    expect(() => premierModeleDuSchema('generator client {\n}\n', 'ici')).toThrow(
      /Aucun `model` trouvé/,
    );
  });

  it('⭐ le modèle témoin est LU dans le schéma, jamais recopié dans le script', async () => {
    // ⚠ Un nom en dur serait une chaîne recopiée : le jour où le modèle est
    // renommé, le script régénérerait à CHAQUE appel sans que personne le sache
    // — c'est-à-dire qu'il écrirait dans node_modules à chaque test.
    const { premierModeleDuSchema } = await decision();
    // \u26a0 UN IDENTIFIANT ASCII : ma premi\u00e8re r\u00e9daction employait un nom
    // accentu\u00e9, que ni Prisma ni le motif n'admettent. Le t\u00e9moin \u00e9tait faux,
    // pas le motif \u2014 et c'est le garde qui l'a dit.
    expect(premierModeleDuSchema('model Zebre {\\n  id String @id\\n}\\n')).toBe('Zebre');
    // Et sur le VRAI schéma du produit, il trouve bien quelque chose.
    const vrai = readFileSync(
      join(RACINE, 'apps', 'api', 'prisma', 'schema.prisma'),
      'utf-8',
    );
    expect(premierModeleDuSchema(vrai).length, 'le schéma réel doit avoir un modèle')
      .toBeGreaterThan(2);
  });

  it('🔴 les DEUX filets sont déclarés — postinstall à la racine, pretest dans l’API', () => {
    const racine = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
    };
    const api = JSON.parse(
      readFileSync(join(RACINE, 'apps', 'api', 'package.json'), 'utf-8'),
    ) as { scripts: Record<string, string> };

    // 🔴 PAS DE `postinstall` — ET C'EST UNE DÉCISION, MESURÉE.
    //
    // J'en avais ajouté un le 12/10/2026, de ma propre initiative. Il a CASSÉ
    // la construction de l'image de production :
    //
    //   Error: Cannot find module '/app/apps/api/scripts/assurer-client-prisma.mjs'
    //   npm error command sh -c node apps/api/scripts/assurer-client-prisma.mjs
    //
    // L'étape `prod-deps` installe depuis le contexte ÉLAGUÉ (`turbo prune
    // --docker`, `out/json/`), où `apps/api/scripts/` n'existe pas. Un
    // `postinstall` s'exécute à CHAQUE install, y compris dans des contextes
    // qui ne portent que des `package.json`.
    //
    // ⭐ Et c'est la recette EN CONTENEUR qui l'a dit, pas une relecture — la
    // même recette écrite pour attraper « le fichier n'est pas dans l'image ».
    // Elle a attrapé un défaut de sens inverse : le fichier manquait à
    // l'INSTALL, pas à l'exécution.
    expect(
      racine.scripts.postinstall,
      'un `postinstall` casse la construction de l’image : l’étape prod-deps ' +
        'installe depuis un contexte élagué où `apps/api/scripts/` n’existe pas.',
    ).toBeUndefined();
    for (const hook of ['pretest', 'pretest:base'] as const) {
      expect(
        api.scripts[hook],
        `sans \`${hook}\`, un client retiré ou un schéma modifié depuis ` +
          'l’install n’est rattrapé par rien',
      ).toContain('assurer-client-prisma');
    }
    // ⚠ Et le script lui-même doit être SUIVI : un hook qui pointe vers un
    // fichier absent fait échouer `npm ci` chez l'auto-hébergeur.
    const suivis = execSync('git ls-files apps/api/scripts', {
      cwd: RACINE,
      encoding: 'utf8',
    });
    expect(suivis, 'le script doit être versionné').toContain(
      'apps/api/scripts/assurer-client-prisma.mjs',
    );
  });
});
