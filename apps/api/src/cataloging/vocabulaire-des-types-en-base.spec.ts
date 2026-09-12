import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { estUnTypeDeNotice } from './description-profiles';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';

/**
 * ── LE VERSANT « EN BASE » ─────────────────────────────────────────────────
 *
 *   set -a; . ../../.env; set +a
 *   PG_LIVE=1 npx vitest run src/cataloging/vocabulaire-des-types.spec.ts
 *
 * ⚠ L'ENVIRONNEMENT EST NÉCESSAIRE, et la première ligne n'est pas décorative :
 * `vitest` ne charge pas `.env`, donc sans elle le client Prisma n'a pas
 * d'URL et le test échoue en disant « base injoignable ». C'est le bon
 * comportement — un test qui ne peut pas mesurer doit être ROUGE — mais la
 * cause serait cherchée dans le vocabulaire.
 *
 * ⚠ IL NE LIT AUCUNE NOTICE ET N'EN ÉCRIT AUCUNE : il demande au serveur les
 * valeurs DISTINCTES de la colonne, école par école. C'est la seule mesure qui
 * dise si la fermeture a un objet — une liste juste sur une base pleine de
 * valeurs qu'elle ignore ne garde rien.
 */
const prisma = new PrismaClient();

describe.runIf(process.env.PG_LIVE === '1')('Le vocabulaire, tel que la base le porte', () => {
  let joignable = false;
  let schemas: string[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
      const lignes = await prisma.$queryRawUnsafe<{ schema_name: string }[]>(
        `SELECT schema_name FROM information_schema.schemata
          WHERE schema_name = 'public' OR schema_name LIKE 'tenant_%' ORDER BY 1`,
      );
      schemas = lignes.map((l) => l.schema_name);
    } catch {
      joignable = false;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⚠ aucune école ne porte un type hors vocabulaire', async () => {
    // ⚠ LE SIGNAL D'ATTENTE N'EST PAS LA GRANDEUR MESURÉE : on assère que la
    // base est joignable, on ne sort pas en silence. Un test qui ne peut pas
    // mesurer doit être ROUGE — l'infrastructure absente est une information.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(schemas.length, 'aucun schéma trouvé').toBeGreaterThan(0);

    const horsVocabulaire: { schema: string; valeur: string; notices: number }[] = [];
    for (const schema of schemas) {
      const lignes = await prisma.$queryRawUnsafe<{ record_type: string; n: bigint }[]>(
        `SELECT record_type, count(*) AS n FROM "${schema}".biblio_records GROUP BY 1`,
      );
      for (const l of lignes) {
        if (!estUnTypeDeNotice(l.record_type)) {
          horsVocabulaire.push({ schema, valeur: l.record_type, notices: Number(l.n) });
        }
      }
    }

    expect(
      horsVocabulaire,
      'des notices portent un type que le vocabulaire ignore — décidez de leur ' +
        'sort AVANT d’élargir la liste : les rattacher, ou ajouter la valeur ' +
        'avec sa raison dans RECORD_TYPES.',
    ).toEqual([]);
  });
});
