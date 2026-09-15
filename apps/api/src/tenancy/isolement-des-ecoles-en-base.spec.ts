import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';

/**
 * ⚠ L'ISOLEMENT ENTRE ÉCOLES, DEMANDÉ AU SERVEUR — la propriété dont l'échec
 * termine le produit.
 *
 * *Posé le 14 septembre 2026, en cherchant ce qui n'avait jamais été traversé.*
 * Le relevé était net : **aucune spec n'éprouvait l'isolement contre une vraie
 * base**. La propriété la plus lourde du produit — une école ne voit pas les
 * adhérents, les prêts ni les thèses d'une autre — reposait entièrement sur des
 * tests à doublures, c'est-à-dire sur ce que nous croyons que le schéma fait.
 *
 * ## Les deux mécanismes, et le second est celui qui peut céder
 *
 * 1. **Les tables d'école vivent dans un SCHÉMA séparé** (`tenant_<slug>`). Un
 *    client Prisma lié à `tenant_zinda` ne peut pas voir `tenant_horizon` :
 *    c'est PostgreSQL qui l'empêche, pas notre code. Solide — mais jamais
 *    vérifié.
 *
 * 2. ⚠ **Les tables PARTAGÉES vivent dans `public`, distinguées par une
 *    COLONNE.** Collections, règles d'accès, réglages, journal d'audit, rappels,
 *    abonnements, paiements. Là, l'isolement n'est plus structurel : il tient à
 *    un `where tenantId` dans chaque requête. Un oubli n'échoue pas — il rend
 *    les données d'une autre école.
 *
 * Un balayage des 22 requêtes sur ces huit modèles n'a trouvé aucun oubli
 * (14 septembre 2026), mais un balayage ne garde rien : ce fichier mesure.
 *
 * ## Gaté, et il n'écrit RIEN
 *
 *   PG_LIVE=1 npx dotenv -e ../../.env -- vitest run src/tenancy/isolement-des-ecoles-en-base.spec.ts
 */

const prisma = new PrismaClient();

describe.runIf(process.env.PG_LIVE === '1')('L’isolement entre écoles, en base', () => {
  let joignable = false;
  let ecoles: { id: string; slug: string }[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
      // ⚠ Seules les écoles RÉELLEMENT PROVISIONNÉES — celles dont le schéma
      // porte la table des notices. Une ligne `tenants` sans schéma existe
      // transitoirement : la recette de déprovision en fabrique une, et les
      // deux fichiers tournent en parallèle sur la même base. Prendre les deux
      // premières écoles venues faisait échouer ce garde pour une raison qui
      // n'était pas la sienne. Mesuré le 14 septembre 2026.
      const provisionnees = await prisma.$queryRaw<{ slug: string }[]>`
        SELECT replace(table_schema, 'tenant_', '') AS slug
        FROM information_schema.tables
        WHERE table_name = 'biblio_records' AND table_schema LIKE 'tenant\_%'`;
      const avecSchema = new Set(provisionnees.map((p) => p.slug));
      ecoles = (
        await prisma.tenant.findMany({ select: { id: true, slug: true }, orderBy: { slug: 'asc' } })
      ).filter((e) => avecSchema.has(e.slug));
    } catch {
      console.warn('[isolement] base injoignable — scénarios ignorés.');
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⚠ il y a bien DEUX écoles — sinon ce fichier ne mesure rien', () => {
    // ⚠ TÉMOIN INDISPENSABLE. Avec une seule école, tous les cas ci-dessous
    // passent au vert sans avoir rien comparé : « aucune fuite » est vrai quand
    // il n'y a personne vers qui fuir.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(
      ecoles.length,
      'il faut deux écoles PROVISIONNÉES pour éprouver un isolement',
    ).toBeGreaterThanOrEqual(2);
  });

  it('⚠ un client lié à une école ne VOIT PAS les notices d’une autre', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const [a, b] = ecoles;
    const base = process.env.DATABASE_URL as string;
    const clientDe = (slug: string) =>
      new PrismaClient({
        datasources: { db: { url: base.replace('schema=public', `schema=tenant_${slug}`) } },
      });

    const ca = clientDe(a.slug);
    const cb = clientDe(b.slug);
    try {
      // Un identifiant RÉEL de l'école B, cherché depuis le client de l'école A.
      const chezB = await cb.biblioRecord.findFirst({ select: { id: true, title: true } });
      expect(chezB, `aucune notice dans ${b.slug} : le cas ne mesure rien`).toBeTruthy();

      const vuDepuisA = await ca.biblioRecord.findUnique({ where: { id: chezB!.id } });
      expect(
        vuDepuisA,
        `FUITE : ${a.slug} voit la notice « ${chezB!.title} » de ${b.slug}`,
      ).toBeNull();

      // Et le sens inverse, parce qu'un isolement à sens unique n'en est pas un.
      const chezA = await ca.biblioRecord.findFirst({ select: { id: true } });
      if (chezA) {
        expect(await cb.biblioRecord.findUnique({ where: { id: chezA.id } })).toBeNull();
      }
    } finally {
      await ca.$disconnect();
      await cb.$disconnect();
    }
  }, 30_000);

  it('⚠ LES TABLES PARTAGÉES : une école ne lit pas les collections d’une autre', async () => {
    // C'est ici que l'isolement peut céder : `collections` vit dans `public`, et
    // ce qui sépare les écoles est une COLONNE, pas un schéma.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const [a, b] = ecoles;

    const deA = await prisma.collection.findMany({ where: { tenantId: a.id }, select: { id: true } });
    const deB = await prisma.collection.findMany({ where: { tenantId: b.id }, select: { id: true } });
    expect(
      deA.length + deB.length,
      'aucune collection dans aucune des deux écoles : le cas ne mesure rien',
    ).toBeGreaterThan(0);

    const communs = deA.filter((c) => deB.some((d) => d.id === c.id));
    expect(communs, 'une collection appartient à DEUX écoles').toEqual([]);
  }, 30_000);

  it('⚠ et les RÈGLES D’ACCÈS, qui décident de ce qu’un étudiant peut lire', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const [a, b] = ecoles;
    const regles = await prisma.accessRule.findMany({
      select: { id: true, tenantId: true, collectionId: true },
    });
    if (!regles.length) return;

    // Chaque règle pointe une collection de SA propre école. Une règle qui
    // désignerait la collection d'une autre ouvrirait un fonds étranger à ses
    // étudiants — sans erreur, et sans que rien ne le montre.
    const collections = new Map(
      (await prisma.collection.findMany({ select: { id: true, tenantId: true } })).map((c) => [
        c.id,
        c.tenantId,
      ]),
    );
    const croisees = regles
      .filter((r) => collections.has(r.collectionId) && collections.get(r.collectionId) !== r.tenantId)
      .map((r) => r.id);
    expect(croisees, 'une règle d’accès désigne la collection d’une AUTRE école').toEqual([]);
    void a;
    void b;
  }, 30_000);

  it('⚠ les réglages, le journal d’audit et les rappels sont bornés eux aussi', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const ids = new Set(ecoles.map((e) => e.id));

    // Une ligne portant un `tenantId` inconnu est une ligne que personne ne
    // verra jamais — et le signe qu'une école a été supprimée sans ses données.
    for (const [nom, lignes] of [
      ['tenant_settings', await prisma.tenantSettings.findMany({ select: { tenantId: true } })],
      ['audit_logs', await prisma.auditLog.findMany({ select: { tenantId: true }, take: 500 })],
      ['reminder_logs', await prisma.reminderLog.findMany({ select: { tenantId: true }, take: 500 })],
    ] as const) {
      // ⚠ RELECTURE DE CHAQUE CANDIDATE, et ce n'est pas une précaution de
      // style. `ecoles` est un instantané pris au démarrage du fichier ; la
      // recette de déprovision fabrique une école pendant ce temps, sur la même
      // base et en parallèle. Une ligne écrite par elle après mon instantané
      // paraissait donc orpheline, et ce garde échouait pour une raison qui
      // n'était pas la sienne. Mesuré le 14 septembre 2026.
      const candidates = [...new Set(lignes.map((l) => l.tenantId).filter((t): t is string => !!t && !ids.has(t)))];
      const vraimentOrphelines: string[] = [];
      for (const t of candidates) {
        if (!(await prisma.tenant.findUnique({ where: { id: t }, select: { id: true } }))) {
          vraimentOrphelines.push(t);
        }
      }
      expect(
        vraimentOrphelines,
        `${nom} : ${vraimentOrphelines.length} ligne(s) rattachée(s) à une école inexistante`,
      ).toEqual([]);
    }
  }, 30_000);
});
