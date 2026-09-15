import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AdminService } from './admin.service';
import { LIGNES_PARTAGEES, proprietePrisma } from './lignes-partagees-d-une-ecole';
import type { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';

/**
 * ⚠ LA DÉPROVISION MESURÉE PAR SON EFFET — pas par sa présence.
 *
 * *Posé le 14 septembre 2026. `deprovision-complet.spec.ts` lit la SOURCE et
 * vérifie que rien n'est écrit en dur ; il ne peut pas dire ce qui reste en
 * base. C'est la moitié que seul un serveur peut rendre.*
 *
 * ## Ce qu'il fait, et pourquoi dans cet ordre
 *
 * 1. **RECENSEMENT** des identifiants préexistants dans les huit tables
 *    partagées — les identifiants, pas leur nombre : un compte ne dit pas QUOI
 *    retirer.
 * 2. Fabrique une école jetable et **une ligne dans CHACUNE des sept tables que
 *    la déprovision doit emporter**. C'est plus exigeant que de provisionner
 *    pour de vrai : le provisioning n'écrit ni rappel ni audit, donc il ne
 *    pourrait pas montrer que ces deux-là sont nettoyées.
 * 3. Appelle **la vraie méthode** `AdminService.deprovisionTenant`. Une copie
 *    de sa boucle dans ce fichier ne prouverait que mon accord avec moi-même.
 * 4. **Confronte au recensement** : la différence d'ensembles doit être vide,
 *    et le schéma `tenant_<slug>` doit avoir disparu.
 *
 * ## Discipline : `nettoyage-recense`
 *
 * Ce fichier ÉCRIT dans la base de développement. Son nettoyage est la
 * déprovision elle-même — c'est précisément ce qu'il mesure. Un `finally`
 * rattrape le cas où la déprovision échoue, sinon un échec laisserait derrière
 * lui exactement les lignes dont ce test dénonce la survie.
 *
 *   PG_LIVE=1 npx dotenv -e ../../.env -- vitest run src/admin/deprovision-en-base.spec.ts
 */

const SLUG = 'recette-deprovision-jetable';
const prisma = new PrismaClient();

/** Les sept tables que la déprovision doit vider. */
const A_SUPPRIMER = Object.entries(LIGNES_PARTAGEES)
  .filter(([, v]) => v.sort === 'supprimee')
  .map(([k]) => k);

async function identifiants(tenantId?: string): Promise<Map<string, Set<string>>> {
  const carte = new Map<string, Set<string>>();
  for (const modele of Object.keys(LIGNES_PARTAGEES)) {
    const delegue = (prisma as unknown as Record<string, { findMany(a: unknown): Promise<{ id: string }[]> }>)[
      proprietePrisma(modele)
    ];
    const lignes = await delegue.findMany(tenantId ? { where: { tenantId }, select: { id: true } } : { select: { id: true } });
    carte.set(modele, new Set(lignes.map((l) => l.id)));
  }
  return carte;
}

describe.runIf(process.env.PG_LIVE === '1')('Déprovision : ce qu’elle LAISSE en base', () => {
  let avant: Map<string, Set<string>>;
  let tenantId = '';
  let joignable = false;

  beforeAll(async () => {
    // ⚠ ROUGE si la base ne répond pas — jamais un saut silencieux. Le crochet
    // de pré-publication lit cette constante pour distinguer « la propriété est
    // violée » de « la base est injoignable ».
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
    } catch {
      joignable = false;
    }
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    // Une école jetable qui traînerait d'une exécution interrompue.
    const reste = await prisma.tenant.findUnique({ where: { slug: SLUG } });
    expect(reste, `une école « ${SLUG} » traîne : une exécution précédente a échoué`).toBeNull();
    avant = await identifiants();
  }, 30_000);

  afterAll(async () => {
    // ⚠ LE RATTRAPAGE PORTE SUR CE QUE CE FICHIER A PRODUIT — l'identifiant
    // retenu à la fabrique — et JAMAIS sur la ligne `tenants`.
    //
    // Sa première écriture cherchait `tenant.findUnique({ slug })` pour décider
    // s'il fallait nettoyer. Or la déprovision supprime TOUJOURS cette ligne,
    // même quand elle oublie les sept autres tables : le rattrapage ne pouvait
    // donc jamais voir le cas exact qu'il existe pour rattraper. Mesuré le
    // 14 septembre 2026 — le contrôle négatif de ce fichier a laissé quatre
    // lignes en base, et c'est un relevé d'orphelines qui les a trouvées, pas
    // ce filet. « L'entrée et la sortie ne sont pas le même ensemble. »
    const reste = tenantId
      ? await prisma.tenant.findUnique({ where: { id: tenantId } })
      : null;
    let rattrape = 0;
    if (tenantId) {
      for (const modele of A_SUPPRIMER) {
        const d = (prisma as unknown as Record<string, { deleteMany(a: unknown): Promise<{ count: number }> }>)[
          proprietePrisma(modele)
        ];
        rattrape += (await d.deleteMany({ where: { tenantId } })).count;
      }
      if (reste) await prisma.tenant.delete({ where: { id: tenantId } });
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "tenant_${SLUG}" CASCADE`);
    }
    if (rattrape > 0 || reste) {
      console.warn(
        `[déprovision] RATTRAPAGE : ${rattrape} ligne(s) partagée(s)` +
          `${reste ? ' + la ligne tenants' : ''} que la méthode n’a pas emportées.`,
      );
    }
    await prisma.$disconnect();
  }, 30_000);

  it('⚠ une ligne dans CHACUNE des sept tables, puis plus rien', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    // ── fabrique
    const tenant = await prisma.tenant.create({
      data: { slug: SLUG, name: 'École jetable (recette de déprovision)' },
    });
    tenantId = tenant.id;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "tenant_${SLUG}"`);

    const collection = await prisma.collection.create({
      data: { name: 'Socle jetable', type: 'INTERNAL', tenantId, isDefault: true },
    });
    await prisma.accessRule.create({
      data: { collectionId: collection.id, tenantId, className: null, subscriptionTier: null },
    });
    await prisma.tenantSettings.create({ data: { tenantId } });
    await prisma.domain.create({ data: { tenantId, domain: `${SLUG}.invalide.test` } });
    await prisma.subscription.create({
      data: { tenantId, name: 'Abonnement jetable', priceXof: 0, startDate: new Date() },
    });
    await prisma.reminderLog.create({
      data: {
        tenantId,
        checkoutId: 'jetable',
        type: 'retard',
        stageKey: 'j1',
        recipientEmail: 'jetable@invalide.test',
        recipientName: 'Adhérent jetable',
        status: 'SENT',
      },
    });
    await prisma.auditLog.create({
      data: { tenantId, action: 'recette.deprovision', actorEmail: 'jetable@invalide.test', ip: '127.0.0.1' },
    });

    // ⚠ TÉMOIN : les sept tables portent bien une ligne. Sans lui, une
    // fabrique qui échoue rendrait le nettoyage trivialement « complet ».
    const pose = await identifiants(tenantId);
    for (const modele of A_SUPPRIMER) {
      expect(pose.get(modele)!.size, `${modele} : rien n’a été posé, ce cas ne mesure rien`).toBe(1);
    }

    // ── l'acte : la VRAIE méthode
    const admin = new AdminService(
      prisma as unknown as PrismaService,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );
    const resultat = await admin.deprovisionTenant(SLUG);

    // ── confrontation au recensement
    expect(resultat.deprovisioned).toBe(true);
    for (const modele of A_SUPPRIMER) {
      expect(resultat.retire[modele], `${modele} : la déprovision ne dit pas l’avoir retiré`).toBe(1);
    }

    const apres = await identifiants();
    for (const modele of Object.keys(LIGNES_PARTAGEES)) {
      const survivantes = [...apres.get(modele)!].filter((id) => !avant.get(modele)!.has(id));
      expect(
        survivantes,
        `${modele} : ${survivantes.length} ligne(s) d’une école supprimée survivent dans public`,
      ).toEqual([]);
      const disparues = [...avant.get(modele)!].filter((id) => !apres.get(modele)!.has(id));
      expect(disparues, `${modele} : la déprovision a emporté des lignes d’AUTRES écoles`).toEqual([]);
    }

    expect(await prisma.tenant.findUnique({ where: { slug: SLUG } })).toBeNull();
    const schemas = await prisma.$queryRawUnsafe<{ nspname: string }[]>(
      `SELECT nspname FROM pg_namespace WHERE nspname = 'tenant_${SLUG}'`,
    );
    expect(schemas, 'le schéma de l’école n’a pas été supprimé').toEqual([]);
  }, 60_000);
});
