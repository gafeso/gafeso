/**
 * LE REFUS D'UNICITÉ SE TRADUIT EN 409, ET LE MESSAGE NOMME LA FRATRIE.
 *
 * L'index `collections_nom_unique_par_parent` refuse deux frères homonymes. Sans
 * traduction, la `P2002` de Prisma remonterait en **500** : l'écran dirait « une
 * erreur est survenue » sur un geste que le produit refuse pour une raison
 * précise et corrigeable.
 *
 * ⚠ ET LE MESSAGE COMPTE AUTANT QUE LE CODE. « Nom déjà utilisé » ferait chercher
 * dans toute l'arborescence — le nom est LIBRE ailleurs, il ne l'est pas ICI. La
 * contrainte porte sur la FRATRIE, et c'est ce que la phrase doit dire : sinon on
 * envoie quelqu'un renommer une collection qui n'a rien à voir.
 */
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AccessControlService } from './access-control.service';
import { CollectionType } from '@prisma/client';

const P2002 = new Prisma.PrismaClientKnownRequestError('unique', {
  code: 'P2002',
  clientVersion: '5.22.0',
});

function service(leve: boolean, existante?: { name: string; parentId: string | null }) {
  const create = vi.fn(async () => {
    if (leve) throw P2002;
    return { id: 'c1' };
  });
  const update = vi.fn(async () => {
    if (leve) throw P2002;
    return { id: 'c1' };
  });
  const findUnique = vi.fn(async () => existante ?? null);
  const prisma = {
    collection: { create, update, findUnique, findMany: vi.fn(async () => []) },
  } as never;
  return { svc: new AccessControlService(prisma), create, update };
}

const DTO = { name: 'Thèses', type: CollectionType.INTERNAL } as never;

describe('⚠ création : le refus devient un 409 qui nomme la RACINE', () => {
  it('🔴 un 409, jamais un 500', async () => {
    const { svc } = service(true);
    await expect(svc.createCollection(DTO, 't1')).rejects.toThrow(ConflictException);
  });

  it('⚠ le message nomme la collection ET dit « racine »', async () => {
    // La route ne pose pas de `parentId` : toute création est une racine, et le
    // message doit le dire — sinon on fait chercher une parente qui n'existe pas.
    const { svc } = service(true);
    await expect(svc.createCollection(DTO, 't1')).rejects.toThrow(/Thèses/);
    await expect(svc.createCollection(DTO, 't1')).rejects.toThrow(/racine/i);
  });

  it('⚠ et il DIT le coût — l’élargissement silencieux', async () => {
    // Le texte porte une propriété, il ne se contente pas d'exister : sans elle,
    // « nom déjà pris » se lirait comme une contrariété de nommage, alors que la
    // raison est un ACCÈS qui s'élargirait sans bruit.
    const { svc } = service(true);
    await expect(svc.createCollection(DTO, 't1')).rejects.toThrow(/élargirait|accès/i);
  });

  it('témoin POSITIF : sans collision, la création passe', async () => {
    // Sans ce cas, les trois précédents seraient satisfaits par un service qui
    // refuse TOUT — et plus personne ne pourrait créer de collection.
    const { svc, create } = service(false);
    await expect(svc.createCollection(DTO, 't1')).resolves.toEqual({ id: 'c1' });
    expect(create).toHaveBeenCalled();
  });

  it('⚠ témoin d’ABSENCE : une autre erreur n’est PAS convertie en 409', async () => {
    // La confusion plausible : avaler toute erreur en conflit masquerait une
    // panne de base derrière un message qui invite à renommer.
    const create = vi.fn(async () => {
      throw new Error('connexion perdue');
    });
    const prisma = { collection: { create } } as never;
    const svc = new AccessControlService(prisma);
    await expect(svc.createCollection(DTO, 't1')).rejects.toThrow(/connexion perdue/);
  });
});

describe('⚠ déplacement : la SECONDE porte, et le message change de forme', () => {
  it('sous une parente, le message parle de FRÈRES — pas de racine', async () => {
    const { svc } = service(true, { name: 'Thèses', parentId: 'p1' });
    await expect(
      svc.updateCollection('c1', 't1', { name: 'Thèses' } as never),
    ).rejects.toThrow(/même collection parente|FRÈRES|frères/i);
  });

  it('⚠ et il dit que le nom reste LIBRE ailleurs', async () => {
    // C'est la moitié qui évite le geste inutile : sans elle, on renomme une
    // collection alors qu'il suffisait de la déplacer.
    const { svc } = service(true, { name: 'Thèses', parentId: 'p1' });
    await expect(
      svc.updateCollection('c1', 't1', { name: 'Thèses' } as never),
    ).rejects.toThrow(/libre ailleurs/i);
  });

  it('⚠ le nom employé est celui d’APRÈS, pas celui d’avant', async () => {
    // Nommer l'ancien nom dans un refus de RENOMMAGE enverrait chercher la
    // mauvaise collection.
    const { svc } = service(true, { name: 'Ancien', parentId: 'p1' });
    await expect(
      svc.updateCollection('c1', 't1', { name: 'Nouveau' } as never),
    ).rejects.toThrow(/Nouveau/);
  });
});
