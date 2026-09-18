import { describe, expect, it, vi } from 'vitest';
import { DigitalCopyService } from './digital-copy.service';

/**
 * ⚠ LE FONDS PAR DÉFAUT N'OUVRE PAS CE QUI EST DÉJÀ RÉSERVÉ.
 *
 * `DigitalCopyService.upload` rattache tout document téléversé à la collection
 * SOCLE de l'école, pour qu'il soit lisible sans manipulation. Les règles
 * d'accès étant un **OU**, ce rattachement ANNULE toute réserve de classe
 * portée par une autre collection — et la règle restrictive reste AFFICHÉE,
 * donc personne n'a de raison de la relire.
 *
 * Mesuré le 16 septembre 2026 sur l'école de démonstration : 155 documents
 * numériques sur 155 dans le fonds ouvert, dont 28 aussi réservés à une
 * classe. AUCUNE restriction de classe n'avait d'effet sur la lecture — sur le
 * moment que la démonstration présente comme la promesse centrale du produit.
 *
 * ⚠ CE QUE CE TEST NE DIT PAS : il éprouve la DÉCISION, pas la requête. La
 * clause qui sélectionne « une collection non-socle portant une règle qui nomme
 * une classe ou un palier » est exercée ici par des doublures ; c'est le tamis
 * (`fonds-conforme-en-base`) qui mesure l'état réel en base.
 */
function prismaDouble(reservee: { name: string } | null) {
  return {
    tenant: { findUnique: vi.fn(async () => ({ id: 't1' })) },
    collection: { findFirst: vi.fn(async () => ({ id: 'socle', name: 'Fonds général' })) },
    collectionTitle: {
      // 1er appel : déjà dans le socle ? non. 2e : déjà réservée ailleurs ?
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(reservee ? { collection: { name: reservee.name } } : null),
      create: vi.fn(async () => ({ id: 'ct-1' })),
    },
  };
}

/** `attachToDefaultCollection` est privée : on l'atteint par son nom. */
const rattacher = (prisma: unknown) =>
  (
    new DigitalCopyService(
      {} as never, {} as never, {} as never, {} as never, prisma as never,
    ) as unknown as {
      attachToDefaultCollection: (slug: string, recordId: string) => Promise<void>;
    }
  ).attachToDefaultCollection('zinda', 'rec-1');

describe('⚠ le fonds par défaut ÉPARGNE une notice déjà réservée', () => {
  it('⚠ notice RÉSERVÉE à une classe : elle n’est PAS ouverte à tous', async () => {
    const prisma = prismaDouble({ name: 'Travaux de recherche — Informatique' });
    await rattacher(prisma);
    expect(
      prisma.collectionTitle.create,
      'l’ouvrir annulerait la réserve, et la règle resterait AFFICHÉE',
    ).not.toHaveBeenCalled();
  });

  it('⚠ TÉMOIN D’ABSENCE : une notice SANS réserve est bien rattachée', async () => {
    // Sans lui, un service qui ne rattache JAMAIS rien serait indiscernable
    // d'un service juste — et plus rassurant, puisqu'il n'ouvrirait jamais rien.
    const prisma = prismaDouble(null);
    await rattacher(prisma);
    expect(prisma.collectionTitle.create).toHaveBeenCalledTimes(1);
  });

  it('la réserve est cherchée hors du SOCLE et sur une règle qui NOMME quelqu’un', async () => {
    // ⚠ Une règle sans classe ni palier ouvre à tous : elle ne réserve rien, et
    // la prendre pour une réserve fermerait le fonds général à lui-même.
    const prisma = prismaDouble(null);
    await rattacher(prisma);
    const requete = prisma.collectionTitle.findFirst.mock.calls[1]?.[0] as {
      where: { collection: { isDefault: boolean; accessRules: { some: { OR: unknown[] } } } };
    };
    expect(requete.where.collection.isDefault).toBe(false);
    expect(requete.where.collection.accessRules.some.OR).toHaveLength(2);
  });
});
