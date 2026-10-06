/**
 * L'INDEX D'UNICITÉ DU NOM EXISTE SUR LE SERVEUR, ET IL EST `NULLS NOT DISTINCT`.
 *
 * ## Pourquoi ce garde est VIVANT
 *
 * `collections_nom_unique_par_parent` n'est pas dans `schema.prisma` : Prisma
 * 5.22 n'exprime ni `NULLS NOT DISTINCT` ni les index partiels, et les deux sont
 * nécessaires. Il n'existe donc QUE par la migration.
 *
 * ⚠ Or le développement tient son schéma de `db push`, qui ne pose que ce que le
 * modèle décrit. L'index existe en production et pourrait ne pas exister en
 * développement — la divergence silencieuse que ce dépôt a déjà payée sur le
 * trigger de hiérarchie. Une garantie « en base » ne se vérifie jamais dans le
 * fichier qui la déclare.
 *
 * ## ⚠ ET LE NOM DE L'INDEX NE SUFFIT PAS
 *
 * Un index du bon nom mais SANS `NULLS NOT DISTINCT` laisserait passer deux
 * RACINES de même nom — c'est-à-dire le seul cas que la route de création sait
 * produire, puisqu'elle ne pose pas de `parentId`. Ce garde vérifie donc la
 * PROPRIÉTÉ, pas la présence : il éprouve le refus en l'obtenant.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();
const MESSAGE_BASE_INJOIGNABLE =
  'base injoignable : ce garde ne peut pas MESURER, donc il échoue. ' +
  'Un test qui ne peut pas mesurer n’est pas un test qui passe — c’est au ' +
  'crochet de pré-publication de faire la part des choses.';

const NOM = 'collections_nom_unique_par_parent';
/** Préfixe des lignes de ce fichier : le nettoyage se fait par différence. */
const MARQUE = 'ZZ-temoin-unicite-';

describe.runIf(process.env.PG_LIVE === '1')('Unicité du nom de collection, en base', () => {
  let joignable = false;
  let tenantId: string | null = null;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
      const t = await prisma.tenant.findFirst({ select: { id: true } });
      tenantId = t?.id ?? null;
    } catch {
      joignable = false;
    }
  });

  afterAll(async () => {
    // ⚠ NETTOYAGE PAR DIFFÉRENCE, sur la MARQUE : on retire ce que ce fichier a
    // écrit, pas « ce qu'on croit avoir créé ». Et il tourne même si un cas a
    // levé au milieu.
    if (joignable) {
      await prisma.collection.deleteMany({ where: { name: { startsWith: MARQUE } } });
    }
    await prisma.$disconnect();
  });

  it('⚠ L’INDEX EXISTE sur le serveur — la migration ne suffit pas à le prouver', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const lignes = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      NOM,
    );
    expect(
      lignes.length,
      `L’index « ${NOM} » est absent. En développement, c’est normal si vous ` +
        'tenez le schéma par `db push` : appliquez LE SQL DE LA MIGRATION\n' +
        '  apps/api/prisma/migrations/20260926140000_nom_de_collection_unique_par_parent/migration.sql',
    ).toBe(1);
  });

  it('⚠ et il est UNIQUE, PARTIEL et `NULLS NOT DISTINCT` — les trois comptent', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const [l] = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      NOM,
    );
    expect(l?.indexdef, 'index introuvable').toBeDefined();
    const def = l.indexdef;
    expect(def, 'il doit être UNIQUE').toMatch(/CREATE UNIQUE INDEX/);
    expect(def, 'sur (tenant_id, parent_id, name)').toMatch(/\(tenant_id, parent_id, name\)/);
    // ⚠ SANS CECI, deux RACINES de même nom passent : `parent_id` est nullable et
    // PostgreSQL traite chaque NULL comme distinct.
    expect(def, 'NULLS NOT DISTINCT manquant : deux racines homonymes passeraient').toMatch(
      /NULLS NOT DISTINCT/,
    );
    // ⚠ Et PARTIEL : les collections partagées (tenant_id null) n'appartiennent à
    // aucune école ; les contraindre ensemble mélangerait les catalogues.
    expect(def, 'la clause partielle manque').toMatch(/WHERE \(tenant_id IS NOT NULL\)/);
  });

  it('⭐ LE REFUS SE MESURE : deux RACINES de même nom sont refusées', async () => {
    // C'est l'assertion qui compte. Les deux précédentes lisent une DÉFINITION ;
    // celle-ci obtient le refus — et c'est le cas que la route de création sait
    // produire, donc celui qui arrive vraiment.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(tenantId, 'aucune école en base : ce garde ne mesure rien').not.toBeNull();
    const nom = `${MARQUE}racine`;
    await prisma.collection.create({ data: { name: nom, type: 'INTERNAL', tenantId } });
    await expect(
      prisma.collection.create({ data: { name: nom, type: 'INTERNAL', tenantId } }),
    ).rejects.toThrow();
  });

  it('⚠ TÉMOIN D’ABSENCE : deux COUSINS de même nom restent ACCEPTÉS', async () => {
    // La confusion plausible, et celle que le front avait nommée : « Thèses »
    // sous Droit ET sous Médecine est la structure NORMALE d'une université. Un
    // index trop large la refuserait — et ce serait pire que le défaut corrigé.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const a = await prisma.collection.create({
      data: { name: `${MARQUE}parentA`, type: 'INTERNAL', tenantId },
    });
    const b = await prisma.collection.create({
      data: { name: `${MARQUE}parentB`, type: 'INTERNAL', tenantId },
    });
    const nom = `${MARQUE}These`;
    await prisma.collection.create({
      data: { name: nom, type: 'INTERNAL', tenantId, parentId: a.id },
    });
    // Le même nom sous une AUTRE parente : légitime, et il doit passer.
    const cousin = await prisma.collection.create({
      data: { name: nom, type: 'INTERNAL', tenantId, parentId: b.id },
    });
    expect(cousin.id).toBeTruthy();
  });

  it('⚠ et deux FRÈRES de même nom sont refusés', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const p = await prisma.collection.create({
      data: { name: `${MARQUE}parentC`, type: 'INTERNAL', tenantId },
    });
    const nom = `${MARQUE}frere`;
    await prisma.collection.create({
      data: { name: nom, type: 'INTERNAL', tenantId, parentId: p.id },
    });
    await expect(
      prisma.collection.create({
        data: { name: nom, type: 'INTERNAL', tenantId, parentId: p.id },
      }),
    ).rejects.toThrow();
  });

  it('⚠ n’a RIEN laissé derrière lui', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    await prisma.collection.deleteMany({ where: { name: { startsWith: MARQUE } } });
    // Le contrôle porte sur la MARQUE, pas sur un compte : un compte ne dit pas
    // QUOI est resté.
    expect(
      await prisma.collection.count({ where: { name: { startsWith: MARQUE } } }),
      'des collections témoins survivent en base',
    ).toBe(0);
  });
});
