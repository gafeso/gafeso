import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

/**
 * LES TROIS ÉTATS D'UNE SESSION DE RÉCOLEMENT, et les deux sorties qui
 * manquaient.
 *
 *   OPEN ──clore──▶ CLOSED ──marquer les manquants──▶ APPLIED
 *     ▲                │
 *     └────rouvrir─────┘
 *
 * 🔴 TROIS DÉFAUTS, ET LE PREMIER EST LE PLUS COÛTEUX :
 *
 * 1. `mark-missing` NE VÉRIFIAIT PAS le statut. Sur une session OUVERTE,
 *    « les manquants » sont tout ce qui n'a pas ENCORE été scanné : au milieu
 *    d'un récolement de huit mille exemplaires, ce geste en marque sept mille
 *    comme introuvables. Et l'écran offrait le bouton dès qu'un manquant
 *    apparaissait — c'est-à-dire dès le premier scan.
 *
 * 2. UNE SESSION CLOSE NE SE ROUVRAIT PAS. `scan` refuse en disant « rouvrez-en
 *    une NOUVELLE » : un clic de trop coûtait des jours de scan.
 *
 * 3. UN SCAN NE S'ANNULAIT PAS. Un code-barres pointé par mégarde marque
 *    l'exemplaire vu POUR TOUJOURS ; le récolement échoue alors à sa seule
 *    raison d'être, sur cet exemplaire-là, sans rien dire.
 */

function service(session: Record<string, unknown> | null, scansSupprimes = 1) {
  const update = vi.fn(async (a: { where: unknown; data: Record<string, unknown> }) => ({
    ...session,
    ...a.data,
  }));
  const deleteMany = vi.fn(async () => ({ count: scansSupprimes }));
  const db = {
    inventorySession: { findUnique: vi.fn(async () => session), update },
    inventoryScan: { deleteMany, findMany: vi.fn(async () => []) },
    item: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
  } as never;
  return {
    svc: new InventoryService({ log: vi.fn() } as never),
    db,
    update,
    deleteMany,
  };
}

const OUVERTE = { id: 's1', name: 'Récolement 2026', scope: 'ALL', location: null, status: 'OPEN' };

describe('⚠ MARQUER LES MANQUANTS exige une session CLOSE', () => {
  it('🔴 sur une session OUVERTE : refusé, et le refus dit pourquoi', async () => {
    // « Manquant » sur une session ouverte veut dire « pas encore scanné ».
    const { svc, db } = service(OUVERTE);
    await expect(
      svc.markMissing(db, { id: 't1' } as never, 's1', { sub: 'u' } as never),
    ).rejects.toThrow(/Clôturez la session/);
  });

  it('sur une session DÉJÀ APPLIQUÉE : refusé aussi', async () => {
    const { svc, db } = service({ ...OUVERTE, status: 'APPLIED' });
    await expect(
      svc.markMissing(db, { id: 't1' } as never, 's1', { sub: 'u' } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('⚠ sur une session CLOSE : appliqué, et la session passe à APPLIED', async () => {
    const { svc, db, update } = service({ ...OUVERTE, status: 'CLOSED' });
    await svc.markMissing(db, { id: 't1' } as never, 's1', { sub: 'u' } as never);
    expect(update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { status: 'APPLIED' } });
  });
});

describe('⚠ ROUVRIR — un clic de trop ne coûte plus des jours de scan', () => {
  it('une session CLOSE se rouvre, et la date de clôture est effacée', async () => {
    const { svc, db, update } = service({ ...OUVERTE, status: 'CLOSED' });
    await svc.reopenSession(db, 's1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'OPEN', closedAt: null },
    });
  });

  it('⚠ une session APPLIQUÉE ne se rouvre PAS — le catalogue a changé', async () => {
    // Un second marquage porterait sur un fonds déjà modifié, et plus personne
    // ne saurait ce que le premier avait constaté.
    const { svc, db, update } = service({ ...OUVERTE, status: 'APPLIED' });
    await expect(svc.reopenSession(db, 's1')).rejects.toThrow(/déjà été marqués/);
    expect(update).not.toHaveBeenCalled();
  });

  it('rouvrir une session déjà ouverte ne fait rien', async () => {
    const { svc, db, update } = service(OUVERTE);
    await expect(svc.reopenSession(db, 's1')).resolves.toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('⚠ ANNULER UN SCAN — l’erreur qui défaisait le récolement en silence', () => {
  it('le scan est retiré de la session', async () => {
    const { svc, db, deleteMany } = service(OUVERTE);
    await expect(svc.annulerScan(db, 's1', ' ZK-1 ')).resolves.toEqual({
      annule: true,
      barcode: 'ZK-1',
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { sessionId: 's1', barcode: 'ZK-1' } });
  });

  it('⚠ un code-barres jamais scanné le DIT, au lieu de répondre « fait »', async () => {
    // « Annulé » sur un scan qui n'existe pas laisserait croire qu'on a corrigé
    // une erreur qu'on n'a pas corrigée — et on chercherait ailleurs.
    const { svc, db } = service(OUVERTE, 0);
    await expect(svc.annulerScan(db, 's1', 'ZK-9')).rejects.toThrow(NotFoundException);
  });

  it('⚠ session CLOSE : refusé — le rapport a déjà été lu', async () => {
    const { svc, db, deleteMany } = service({ ...OUVERTE, status: 'CLOSED' });
    await expect(svc.annulerScan(db, 's1', 'ZK-1')).rejects.toThrow(ConflictException);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('⚠ CLORE ne touche qu’une session OUVERTE', () => {
  it('une session APPLIQUÉE n’est pas ramenée à CLOSED', async () => {
    // Le garde d'origine testait `=== 'CLOSED'` : une session APPLIED serait
    // repassée à CLOSED, et serait redevenue rouvrable. Le troisième état a
    // obligé à relire ce garde.
    const { svc, db, update } = service({ ...OUVERTE, status: 'APPLIED' });
    await svc.closeSession(db, 's1');
    expect(update).not.toHaveBeenCalled();
  });
});
