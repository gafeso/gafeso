import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SELECTION_DES_FONCTIONS, fonctionsEffectives } from './functions';

/**
 * Résolution des fonctions effectives d'un utilisateur — la source de vérité
 * du contrôle d'accès fonctionnel. Résolue à CHAQUE requête (pas figée dans
 * le JWT) : retirer une fonction à un rôle prend effet immédiatement.
 *
 * ⚠ LA RÈGLE ELLE-MÊME N'EST PLUS ICI : elle est dans `fonctionsEffectives`
 * (functions.ts), parce qu'un second appelant la demande — la liste des
 * directeurs désignables, qui pose la question dans l'autre sens (« QUI porte
 * cette fonction ? »). Ce service est le chemin « une personne, une réponse » ;
 * il ne décide rien de plus que l'autre.
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
      select: SELECTION_DES_FONCTIONS,
    });
    return fonctionsEffectives(user);
  }

  async hasFunction(
    db: Pick<PrismaClient, 'user'>,
    userId: string,
    fonction: string,
  ): Promise<boolean> {
    return (await this.getFunctions(db, userId)).includes(fonction);
  }
}
