import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLLATION,
  COLONNES_COLLATIONNEES,
  COLONNES_COLLATIONNEES_PUBLIC,
  COLONNES_NON_COLLATIONNEES,
} from './collation-francaise';
import {
  buildCollationIntrospectionQuery,
  buildCollationStatements,
} from './tenant-schema';

const MIGRATION = join(
  __dirname,
  '../../prisma/migrations/20260911230000_collation_francaise/migration.sql',
);

describe('collation française — la déclaration', () => {
  it('la collation est `fr-x-icu`, pas la variante nationale', () => {
    // Les règles de collation françaises sont identiques ; `fr-BF-x-icu`
    // surprendrait dans un déploiement multi-pays.
    expect(COLLATION).toBe('fr-x-icu');
  });

  it('⚠ AUCUNE clé de comparaison ni aucun CODE n’est collationné', () => {
    // Collationner `authors.normalized_name` changerait la sémantique d'une clé
    // de déduplication ; `users.class_name` est comparée telle quelle à
    // `school_classes.name` par access-control ; un code-barres n'a pas d'ordre
    // alphabétique. Ces exclusions sont DÉCLARÉES pour ne pas être prises pour
    // des oublis à la prochaine relecture.
    const collationnees = new Set(
      [...COLONNES_COLLATIONNEES, ...COLONNES_COLLATIONNEES_PUBLIC].map(
        (c) => `${c.table}.${c.colonne}`,
      ),
    );
    for (const exclue of Object.keys(COLONNES_NON_COLLATIONNEES)) {
      expect(collationnees.has(exclue), `${exclue} ne doit PAS être collationnée`).toBe(false);
    }
    // Témoins nommés : deux cas dont je connais la réponse.
    expect(collationnees.has('biblio_records.title')).toBe(true);
    expect(collationnees.has('authors.normalized_name')).toBe(false);
  });

  it('chaque exclusion porte un motif lisible', () => {
    for (const [cle, motif] of Object.entries(COLONNES_NON_COLLATIONNEES)) {
      expect(motif.length, cle).toBeGreaterThan(20);
    }
  });
});

/**
 * ⚠ LE VOCABULAIRE EST DANS LE SQL AUSSI — CINQUIÈME OCCURRENCE DE CETTE CLASSE.
 *
 * La migration recopie la liste des colonnes : elle ne peut pas importer le
 * TypeScript. Une divergence serait SILENCIEUSE — une colonne déclarée mais
 * absente du SQL ne serait jamais collationnée, et un tri sur elle classerait
 * mal sans que rien ne le signale.
 */
describe('collation française — le SQL de migration dit la même chose que le code', () => {
  const sql = readFileSync(MIGRATION, 'utf-8');

  it('la migration existe et liste bien des colonnes (témoin positif)', () => {
    expect(sql).toContain("COLLATE \"fr-x-icu\"");
    expect(sql).toContain('VALUES');
  });

  it('⚠ les colonnes du SQL sont EXACTEMENT celles du code', () => {
    const bloc = sql.slice(sql.indexOf('VALUES'), sql.indexOf(') AS t(tbl, col)'));
    const paires = [...bloc.matchAll(/\('(\w+)',\s*'(\w+)'\)/g)].map((m) => `${m[1]}.${m[2]}`);
    const attendu = [...COLONNES_COLLATIONNEES, ...COLONNES_COLLATIONNEES_PUBLIC].map(
      (c) => `${c.table}.${c.colonne}`,
    );
    // Témoin de COMPTE, pas de présence.
    expect(paires.length).toBe(attendu.length);
    expect([...paires].sort()).toEqual([...attendu].sort());
  });

  it('la migration est idempotente : elle saute ce qui porte déjà la collation', () => {
    expect(sql).toContain("collation_actuelle = 'fr-x-icu'");
    expect(sql).toContain('CONTINUE');
  });
});

describe('collation française — le garde interroge LA BASE', () => {
  it('⚠ la requête lit `pg_collation`, pas le schéma Prisma', () => {
    // C'est toute la raison d'être de ce garde : le schéma NE PORTE PAS la
    // collation, donc un test de source ne vérifierait que l'intention et
    // passerait au vert sur une base où elle a déjà été perdue.
    const q = buildCollationIntrospectionQuery('tenant_zinda');
    expect(q).toContain('pg_collation');
    expect(q).toContain('pg_attribute');
    expect(q).toContain("nspname = 'tenant_zinda'");
  });

  it('ne signale RIEN quand tout porte la collation', () => {
    const presentes = COLONNES_COLLATIONNEES.map((c) => ({
      table_name: c.table,
      column_name: c.colonne,
      collation: COLLATION,
    }));
    const { statements, ecarts } = buildCollationStatements('zinda', presentes);
    expect(ecarts).toEqual([]);
    expect(statements).toEqual([]);
  });

  it('⚠ signale ET RATTRAPE une colonne retombée sur la collation par défaut', () => {
    // Le cas mesuré sur base jetable : un `ALTER COLUMN … SET DATA TYPE` futur
    // la perd, la migration réussit, et l'ordre redevient faux en silence.
    const presentes = COLONNES_COLLATIONNEES.map((c, i) => ({
      table_name: c.table,
      column_name: c.colonne,
      collation: i === 0 ? 'default' : COLLATION,
    }));
    const { statements, ecarts } = buildCollationStatements('zinda', presentes);
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]).toContain('(default)');
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('COLLATE "fr-x-icu"');
    expect(statements[0]).toContain('"tenant_zinda"');
  });

  it('⚠ une colonne ABSENTE du schéma n’est pas un écart', () => {
    // `collections` est publique seulement. Signaler son absence de chaque
    // schéma tenant ferait crier le garde à chaque passage — et on cesserait de
    // le lire.
    const { ecarts } = buildCollationStatements('zinda', []);
    expect(ecarts).toEqual([]);
  });
});

/**
 * LE GARDE DE SOURCE, EN PLUS du garde de base — ils ne voient pas la même
 * chose. Celui-ci attrape le défaut à la RELECTURE ; l'autre à l'exécution.
 */
describe('collation française — aucune migration ne retire la collation', () => {
  const dossier = join(__dirname, '../../prisma/migrations');
  const collationnees = new Set(
    [...COLONNES_COLLATIONNEES, ...COLONNES_COLLATIONNEES_PUBLIC].map(
      (c) => `${c.table}.${c.colonne}`,
    ),
  );

  const migrations = readdirSync(dossier, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(dossier, e.name, 'migration.sql'));

  it('le relevé voit bien les migrations (témoin de compte)', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(5);
  });

  it('⚠ aucun `ALTER COLUMN … TYPE` sur une colonne collationnée SANS `COLLATE`', () => {
    // Mesuré sur base jetable : Prisma ne modélise pas la collation, donc un
    // changement de TYPE écrit pour une autre raison la retire — sans erreur,
    // sans trace, et l'ordre redevient faux.
    const fautives: string[] = [];
    for (const chemin of migrations) {
      const sql = readFileSync(chemin, 'utf-8');
      for (const m of sql.matchAll(/ALTER COLUMN\s+"?(\w+)"?\s+(?:SET DATA )?TYPE\s+([^\n;]+)/gi)) {
        const colonne = m[1];
        const suite = m[2];
        const concernee = [...collationnees].some((c) => c.endsWith(`.${colonne}`));
        if (concernee && !/COLLATE/i.test(suite)) {
          fautives.push(`${chemin.split('/').slice(-2)[0]} → ${colonne}`);
        }
      }
    }
    expect(fautives, 'changements de type retirant la collation').toEqual([]);
  });
});
