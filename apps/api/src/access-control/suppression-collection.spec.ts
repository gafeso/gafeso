import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccessControlService } from './access-control.service';

/**
 * SUPPRIMER UNE COLLECTION — et refuser si elle n'est pas VIDE.
 *
 * ⚠ ELLE NE POUVAIT PAS ÊTRE SUPPRIMÉE DU TOUT. Trois suppressions existaient —
 * ses documents, ses titres, ses règles d'accès — et pas la collection
 * elle-même, ni côté API ni côté écran. Une collection créée sur une faute de
 * frappe restait pour toujours, et P6-1 a augmenté le coût : avec la
 * hiérarchie, une sous-collection mal créée est permanente et l'arbre la montre
 * à chaque visite.
 *
 * Trois propriétés, décidées avec Jean :
 *  1. REFUS plutôt que cascade — une cascade emporterait des RÈGLES D'ACCÈS,
 *     c'est-à-dire des décisions que quelqu'un a prises ;
 *  2. « vide » INCLUT les règles d'accès — une collection sans document mais
 *     portant des règles porte quand même des décisions, et l'écran la montre
 *     vide ;
 *  3. le refus COMPTE ce qui bloque — un refus qui ne compte pas envoie
 *     chercher à l'aveugle.
 */

function service(
  collection: Record<string, unknown> | null,
  compteurs: { notices?: number; regles?: number; enfants?: number } = {},
) {
  const del = vi.fn(async () => ({}));
  const prisma = {
    collection: {
      findUnique: vi.fn(async () => collection),
      count: vi.fn(async () => compteurs.enfants ?? 0),
      delete: del,
    },
    collectionTitle: { count: vi.fn(async () => compteurs.notices ?? 0) },
    accessRule: { count: vi.fn(async () => compteurs.regles ?? 0) },
  } as never;
  return { svc: new AccessControlService(prisma), del, prisma };
}

const VIDE = {
  id: 'c1',
  name: 'Droit L1',
  type: 'INTERNAL',
  tenantId: 't1',
  isDefault: false,
};

describe('⚠ Une collection VIDE se supprime', () => {
  it('elle est supprimée, et son nom est rendu pour la trace', async () => {
    const { svc, del } = service(VIDE);
    await expect(svc.removeCollection('c1', 't1')).resolves.toEqual({
      deleted: true,
      name: 'Droit L1',
    });
    expect(del).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('une collection d’une AUTRE école est « introuvable »', async () => {
    const { svc, del } = service({ ...VIDE, tenantId: 'une-autre' });
    await expect(svc.removeCollection('c1', 't1')).rejects.toThrow(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });
});

describe('⚠ Le refus COMPTE ce qui bloque', () => {
  it('des documents : le nombre est dans le message', async () => {
    const { svc, del } = service(VIDE, { notices: 12 });
    await expect(svc.removeCollection('c1', 't1')).rejects.toThrow(/12 document\(s\)/);
    expect(del).not.toHaveBeenCalled();
  });

  it('⚠ des RÈGLES D’ACCÈS SEULES suffisent à bloquer', async () => {
    // C'est la forme qu'on ne voit pas : l'écran montre la collection vide —
    // aucun document — et elle porte des décisions.
    const { svc, del } = service(VIDE, { regles: 3 });
    await expect(svc.removeCollection('c1', 't1')).rejects.toThrow(/3 règle\(s\) d’accès/);
    expect(del).not.toHaveBeenCalled();
  });

  it('⚠ des SOUS-COLLECTIONS aussi — l’arbre de P6-1', async () => {
    const { svc } = service(VIDE, { enfants: 2 });
    await expect(svc.removeCollection('c1', 't1')).rejects.toThrow(/2 sous-collection\(s\)/);
  });

  it('⚠ les TROIS causes sont nommées ENSEMBLE, pas la première seulement', async () => {
    // Un refus qui ne nomme que le premier blocage fait retirer les documents,
    // recommencer, découvrir les règles, recommencer encore. Trois allers pour
    // une information qu'on avait dès le premier.
    const { svc } = service(VIDE, { notices: 12, regles: 3, enfants: 2 });
    await expect(svc.removeCollection('c1', 't1')).rejects.toThrow(
      /12 document\(s\), 3 règle\(s\) d’accès, 2 sous-collection\(s\)/,
    );
  });
});

describe('⚠ La collection SOCLE ne se supprime pas, même vide', () => {
  it('le refus dit POURQUOI, et ce que ça casserait', async () => {
    // `DigitalCopyService` y rattache chaque document numérisé et sort EN
    // SILENCE s'il n'y a pas de socle : sans elle, un document téléversé
    // n'entre dans aucune collection et n'est visible de personne — sans
    // erreur, sans trace.
    const { svc, del } = service({ ...VIDE, isDefault: true });
    await expect(svc.removeCollection('c1', 't1')).rejects.toThrow(BadRequestException);
    await expect(svc.removeCollection('c1', 't1')).rejects.toThrow(/socle/i);
    expect(del).not.toHaveBeenCalled();
  });

  it('⚠ et le socle est refusé AVANT le comptage — vide ou non, la réponse est la même', async () => {
    // Compter d'abord rendrait « retirez les 12 documents » sur une collection
    // qu'on ne pourra pas supprimer ensuite : un refus qui envoie travailler
    // pour rien.
    const { svc, prisma } = service({ ...VIDE, isDefault: true }, { notices: 12 });
    await expect(svc.removeCollection('c1', 't1')).rejects.toThrow(/socle/i);
    const titres = (prisma as unknown as { collectionTitle: { count: ReturnType<typeof vi.fn> } })
      .collectionTitle;
    expect(titres.count).not.toHaveBeenCalled();
  });
});
