import { Injectable } from '@nestjs/common';
import { AccountStatus, PrismaClient } from '@prisma/client';
import { functionsForLegacyRole } from './functions';

/**
 * Résolution des fonctions effectives d'un utilisateur — la source de vérité
 * du contrôle d'accès fonctionnel. Résolue à CHAQUE requête (pas figée dans
 * le JWT) : retirer une fonction à un rôle prend effet immédiatement.
 *
 * Règles :
 *  - compte inexistant ou non ACTIVE (suspendu, en attente) → aucune fonction ;
 *  - rôle dynamique assigné (users.role_id) → ses fonctions ;
 *  - sinon → repli historique sur l'enum users.role (fonctions du rôle
 *    système équivalent, voir ROLES_SYSTEME).
 */
@Injectable()
export class AuthzService {
  async getFunctions(
    db: Pick<PrismaClient, 'user'>,
    userId: string,
  ): Promise<string[]> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        status: true,
        customRole: { select: { functions: true } },
      },
    });
    if (!user || user.status !== AccountStatus.ACTIVE) return [];
    return user.customRole?.functions ?? functionsForLegacyRole(user.role);
  }

  async hasFunction(
    db: Pick<PrismaClient, 'user'>,
    userId: string,
    fonction: string,
  ): Promise<boolean> {
    return (await this.getFunctions(db, userId)).includes(fonction);
  }
}
