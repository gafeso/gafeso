import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PROFONDEUR_MAX } from './hierarchie';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';

/**
 * LE TRIGGER, TEL QUE LA BASE L'APPLIQUE — P6-1, dans les DEUX sens.
 *
 * ⚠ UNE GARANTIE « EN BASE » NE SE VÉRIFIE PAS DANS LE CODE QUI LA DÉCLARE.
 * C'est la leçon de la collation ICU : le lot devait porter un garde qui
 * interroge LA BASE, pas le schéma. Un trigger déclaré dans un fichier de
 * migration et absent du serveur ne protège rien — et `prisma db push`, qui
 * pilote le développement, ne le crée PAS (Prisma ne modélise pas les
 * triggers). Les deux chemins peuvent donc diverger, et seul un test qui
 * demande au serveur le dit.
 *
 * ## Gaté, et pourquoi
 *
 *   PG_LIVE=1 npx vitest run src/collections/hierarchie-en-base.spec.ts
 *
 * Il exige une base joignable. Le versant non gaté est `hierarchie.spec.ts` :
 * il vérifie que la borne du code et celle du SQL s'accordent, et couvre la
 * hauteur de sous-arbre que le trigger ne voit pas. Les deux sont nécessaires —
 * le SQL peut être juste et absent du serveur, le serveur peut être réglé et le
 * service écrire n'importe quoi.
 *
 * ## Il n'écrit RIEN
 *
 * Tout se passe dans une transaction ANNULÉE. Une exception attendue avorte la
 * transaction courante, donc chaque cas a la sienne.
 */

const prisma = new PrismaClient();
/** Préfixe reconnaissable : si un jour une ligne survit, on sait d'où elle vient. */
const P = 'essai-hierarchie-';

/** Exécute `travail` dans une transaction systématiquement annulée. */
async function dansUneTransactionAnnulee(
  travail: (tx: PrismaClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await travail(tx as unknown as PrismaClient);
      throw new Error('ROLLBACK_VOULU');
    });
  } catch (error) {
    if ((error as Error).message !== 'ROLLBACK_VOULU') throw error;
  }
}

const creer = (tx: PrismaClient, id: string, parentId: string | null) =>
  tx.collection.create({
    data: { id: P + id, name: `Essai ${id}`, type: 'INTERNAL', parentId: parentId && P + parentId },
  });

describe.runIf(process.env.PG_LIVE === '1')('Le trigger de hiérarchie, en base', () => {
  let joignable = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
    } catch {
      console.warn('[hiérarchie] base injoignable — scénarios ignorés.');
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⚠ le trigger EXISTE sur le serveur — la migration ne suffit pas à le prouver', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM pg_trigger
       WHERE tgname = 'collections_hierarchie_valide_trigger'`,
    );
    // ⚠ Si ce test échoue en développement, c'est probablement `prisma db push`
    // qui a reconstruit la table sans le trigger. Rejouer le SQL de la
    // migration `collections_hierarchie` (il est idempotent) le remet.
    expect(Number(n)).toBe(1);
  });

  it(`accepte une hiérarchie légitime de ${PROFONDEUR_MAX} niveaux`, async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    await dansUneTransactionAnnulee(async (tx) => {
      await creer(tx, 'fac', null);
      await creer(tx, 'dep', 'fac');
      await creer(tx, 'typ', 'dep');
      const n = await tx.collection.count({ where: { id: { startsWith: P } } });
      expect(n).toBe(3);
    });
  });

  it(`⚠ REFUSE un ${PROFONDEUR_MAX + 1}ᵉ niveau`, async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    await dansUneTransactionAnnulee(async (tx) => {
      await creer(tx, 'fac', null);
      await creer(tx, 'dep', 'fac');
      await creer(tx, 'typ', 'dep');
      await expect(creer(tx, 'trop', 'typ')).rejects.toThrow(/[Pp]rofondeur/);
    });
  });

  it('⚠ REFUSE une collection sa propre parente', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    await dansUneTransactionAnnulee(async (tx) => {
      await creer(tx, 'seule', null);
      await expect(
        tx.collection.update({
          where: { id: P + 'seule' },
          data: { parentId: P + 'seule' },
        }),
      ).rejects.toThrow(/propre parente/);
    });
  });

  it('⚠ REFUSE un cycle créé par MISE À JOUR — pas seulement à l’insertion', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    await dansUneTransactionAnnulee(async (tx) => {
      await creer(tx, 'fac', null);
      await creer(tx, 'dep', 'fac');
      // Un trigger posé sur le seul INSERT laisserait passer celui-ci.
      await expect(
        tx.collection.update({ where: { id: P + 'fac' }, data: { parentId: P + 'dep' } }),
      ).rejects.toThrow(/[Cc]ycle/);
    });
  });

  it('accepte de remonter une collection en racine', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    await dansUneTransactionAnnulee(async (tx) => {
      await creer(tx, 'fac', null);
      await creer(tx, 'dep', 'fac');
      const remontee = await tx.collection.update({
        where: { id: P + 'dep' },
        data: { parentId: null },
      });
      expect(remontee.parentId).toBeNull();
    });
  });

  it('⚠ n’a RIEN laissé derrière lui', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    // Le contrôle qui rend les six cas ci-dessus acceptables sur une base
    // partagée : chaque transaction a été annulée, donc aucune ligne d'essai
    // ne subsiste. Sans cette vérification, « en transaction annulée » serait
    // une intention, pas un fait.
    const restes = await prisma.collection.count({ where: { id: { startsWith: P } } });
    expect(restes).toBe(0);
  });
});
