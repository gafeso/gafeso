import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TENANT_TABLES } from './tenant-schema';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';

/**
 * LES SCHÉMAS D'ÉCOLE SONT-ILS À JOUR DU GABARIT ? — demandé AU SERVEUR.
 *
 * ## Pourquoi ce garde existe
 *
 * Une école est créée par copie du gabarit `public`
 * (`CREATE TABLE … LIKE public.t INCLUDING ALL`), puis RATTRAPÉE à chaque
 * démarrage par `sync-schema` pour les colonnes ajoutées depuis. Deux chemins,
 * donc deux occasions de diverger — et c'est la famille « deux sources qui
 * s'accordent par coïncidence » : l'accord observé ne prouve rien tant qu'on
 * n'a pas demandé au serveur.
 *
 * ⚠ ET LE RATTRAPAGE A DES TROUS CONNUS, ÉCRITS AILLEURS : il EXCLUT les
 * colonnes ENUM, et `LIKE` ne copie jamais les clés étrangères. Une colonne
 * ajoutée au gabarit sous un type enum n'arrive donc JAMAIS dans une école
 * existante — et rien ne le dit. C'est pour ça que le vocabulaire des dépôts
 * (`status`, `file_format`) est en TEXTE : décision prise en connaissance de ce
 * trou, et ce test est ce qui la rend vérifiable plutôt que promise.
 *
 * ## Comment le lancer
 *
 * ```
 * set -a; . ../../.env; set +a
 * PG_LIVE=1 npx vitest run src/tenancy/derive-des-schemas-en-base.spec.ts
 * ```
 *
 * ⚠ Il n'écrit RIEN : il ne lit que `information_schema`.
 */

const prisma = new PrismaClient();

interface Colonne {
  table_name: string;
  column_name: string;
}

describe.runIf(process.env.PG_LIVE === '1')('La dérive des schémas d’école, en base', () => {
  let joignable = false;
  let schemas: string[] = [];
  let duGabarit: Colonne[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
      schemas = (
        await prisma.$queryRawUnsafe<{ nspname: string }[]>(
          `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' ORDER BY 1`,
        )
      ).map((r) => r.nspname);
      duGabarit = await prisma.$queryRawUnsafe<Colonne[]>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [...TENANT_TABLES],
      );
    } catch {
      joignable = false;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Les colonnes du gabarit ABSENTES du schéma d'école. */
  async function manquantes(schema: string, colonnes: Colonne[]): Promise<Colonne[]> {
    const presentes = new Set(
      (
        await prisma.$queryRawUnsafe<Colonne[]>(
          `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1`,
          schema,
        )
      ).map((c) => `${c.table_name}.${c.column_name}`),
    );
    const tablesPresentes = new Set(
      (
        await prisma.$queryRawUnsafe<{ table_name: string }[]>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
          schema,
        )
      ).map((t) => t.table_name),
    );
    return colonnes.filter(
      (c) =>
        tablesPresentes.has(c.table_name) && !presentes.has(`${c.table_name}.${c.column_name}`),
    );
  }

  it('⚠ L’INSTRUMENT D’ABORD : il voit une colonne qu’il DOIT signaler', async () => {
    // ⚠ TÉMOIN POSITIF, et il passe en premier délibérément. Une sortie vide ne
    // prouve rien : sans ce cas, un relevé qui ne regarde nulle part rendrait
    // « aucune dérive » et personne ne saurait qu'il s'est tu.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(schemas.length, 'aucun schéma d’école trouvé').toBeGreaterThan(0);

    const inventee = [{ table_name: 'deposits', column_name: 'colonne_qui_nexiste_pas' }];
    for (const schema of schemas) {
      expect(await manquantes(schema, inventee), schema).toHaveLength(1);
    }
  });

  it('⚠ et il compare assez de colonnes pour que son silence veuille dire quelque chose', () => {
    // Un gabarit lu à vide donnerait « aucune dérive » sur zéro comparaison.
    expect(duGabarit.length).toBeGreaterThan(100);
    // Deux colonnes que je SAIS présentes, l'une ancienne, l'autre de P6 — si
    // le relevé les rate, c'est lui qui est faux, pas le schéma.
    const cles = duGabarit.map((c) => `${c.table_name}.${c.column_name}`);
    expect(cles).toContain('biblio_records.title');
    expect(cles).toContain('biblio_records.embargo_until');
    expect(cles).toContain('deposits.director_id');
  });

  it('⚠ AUCUNE école ne manque une colonne du gabarit', async () => {
    const dérives: string[] = [];
    for (const schema of schemas) {
      for (const c of await manquantes(schema, duGabarit)) {
        dérives.push(`${schema}.${c.table_name}.${c.column_name}`);
      }
    }
    expect(
      dérives,
      'une école existante ne verra JAMAIS ces colonnes arriver toute seule si ' +
        'elles sont de type ENUM — le rattrapage les exclut. Deux issues : ' +
        'passer la colonne en TEXTE dans le gabarit, ou écrire la migration qui ' +
        'la pose école par école.',
    ).toEqual([]);
  });
});
