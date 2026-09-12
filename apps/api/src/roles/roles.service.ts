import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import {
  CATALOGUE_FONCTIONS,
  ROLES_SYSTEME,
  FONCTIONS_RESERVEES_ADMIN,
  TOUTES_LES_FONCTIONS,
} from '../auth/functions';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

/** Client Prisma lié au schéma d'un tenant (obtenu via PrismaService.forTenant). */
export type TenantDb = PrismaClient;

/** Ce qu'une réconciliation a changé sur UN rôle. */
export interface RoleReconcilie {
  name: string;
  /** Le rôle n'existait pas du tout dans cette école. */
  cree: boolean;
  ajoutees: string[];
  retirees: string[];
  /** Seul le libellé divergeait — le compte de fonctions serait alors nul. */
  descriptionMaj: boolean;
}

/**
 * Le compte rendu d'une école. ⚠ `roles` ne contient QUE ce qui a changé : une
 * liste vide veut dire « rien ne divergeait », et c'est le cas normal.
 */
export interface ReconciliationEcole {
  roles: RoleReconcilie[];
  ajoutees: number;
  retirees: number;
}

@Injectable()
export class RolesService {
  /**
   * Seed des rôles système de l'école.
   *
   * ⚠ UN SEUL CHEMIN D'ÉCRITURE, ET C'EST DÉLIBÉRÉ. Cette méthode délègue à
   * `reconcilierRolesSysteme` plutôt que de refaire l'upsert de son côté : deux
   * mécanismes qui écrivent la même chose finissent par diverger, et l'accord
   * qu'on observe entre eux est une coïncidence jusqu'au jour où l'un change.
   */
  async ensureSystemRoles(db: TenantDb): Promise<void> {
    await this.reconcilierRolesSysteme(db);
  }

  /**
   * RÉCONCILIE LES RÔLES SYSTÈME DE L'ÉCOLE AVEC LEUR DÉFINITION, et rend le
   * compte de ce qu'elle a changé.
   *
   * ⚠ POURQUOI ELLE EXISTE. Les fonctions étaient réaffirmées à chaque passage,
   * et le commentaire d'origine annonçait « une mise à jour se propage ainsi
   * sans migration ». C'était vrai de la MÉTHODE et faux du PRODUIT : ses deux
   * seuls appelants étaient le provisioning d'une école et l'ouverture de
   * l'écran des rôles. Une école restait donc figée à la dernière visite de cet
   * écran — mesuré le 12 septembre 2026 : `Étudiant` portait `{}` en base sur
   * les DEUX écoles là où le code lui donnait `depot.deposer`, et le circuit de
   * dépôt était inerte pour tout le monde.
   *
   * ⚠ Une propagation qui attend une visite n'est pas une propagation, et le
   * mécanisme garantissait que les écoles les moins visitées soient les plus
   * périmées — l'inverse de ce qu'on veut.
   *
   * ⚠ ELLE N'ÉCRIT QUE CE QUI DIVERGE. L'ancienne forme réécrivait les cinq
   * rôles à chaque passage ; appelée au démarrage, elle produirait une écriture
   * à chaque redémarrage, sans rien changer. Un rapport qui dit « réconcilié »
   * alors que rien ne divergeait est un faux événement, et un journal rempli de
   * faux événements ne se lit plus.
   */
  async reconcilierRolesSysteme(db: TenantDb): Promise<ReconciliationEcole> {
    // ⚠ Lus par NOM, sans filtrer sur `isSystem` : un rôle personnalisé qui
    // occuperait le nom d'un rôle système doit être vu, pas contourné par un
    // `create` qui violerait la contrainte d'unicité.
    const existants = await db.role.findMany({
      select: { name: true, description: true, functions: true, isSystem: true },
    });
    const parNom = new Map(existants.map((r) => [r.name, r]));

    const changes: RoleReconcilie[] = [];
    for (const def of ROLES_SYSTEME) {
      const actuel = parNom.get(def.name);

      if (!actuel) {
        await db.role.create({
          data: {
            name: def.name,
            description: def.description,
            functions: def.functions,
            isSystem: true,
          },
        });
        changes.push({
          name: def.name,
          cree: true,
          ajoutees: [...def.functions],
          retirees: [],
          descriptionMaj: false,
        });
        continue;
      }

      const porte = new Set(actuel.functions);
      const ajoutees = def.functions.filter((f) => !porte.has(f));
      const retirees = actuel.functions.filter((f) => !def.functions.includes(f as string));
      const descriptionMaj = actuel.description !== def.description;
      const flagPerdu = !actuel.isSystem;

      // ⚠ L'IDEMPOTENCE EST ICI, et elle est la seule chose qui empêche un
      // redémarrage d'écrire pour rien.
      if (!ajoutees.length && !retirees.length && !descriptionMaj && !flagPerdu) continue;

      await db.role.update({
        where: { name: def.name },
        data: { description: def.description, functions: def.functions, isSystem: true },
      });
      changes.push({ name: def.name, cree: false, ajoutees, retirees, descriptionMaj });
    }

    return {
      roles: changes,
      ajoutees: changes.reduce((n, r) => n + r.ajoutees.length, 0),
      retirees: changes.reduce((n, r) => n + r.retirees.length, 0),
    };
  }

  /** Rôles de l'école (système + personnalisés) avec le nombre de comptes assignés. */
  async list(db: TenantDb) {
    await this.ensureSystemRoles(db);
    return db.role.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  /** Catalogue des fonctions disponibles (codes + libellés français). */
  listFunctions() {
    return CATALOGUE_FONCTIONS;
  }

  async create(db: TenantDb, dto: CreateRoleDto) {
    this.assertKnownFunctions(dto.functions);
    const name = dto.name.trim();
    const existing = await db.role.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException('Un rôle existe déjà avec ce nom.');
    }
    return db.role.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        functions: dedupe(dto.functions),
        isSystem: false,
      },
    });
  }

  async update(db: TenantDb, id: string, dto: UpdateRoleDto) {
    const role = await this.requireRole(db, id);
    if (role.isSystem) {
      throw new BadRequestException(
        'Les rôles système ne sont pas modifiables : créez un rôle personnalisé.',
      );
    }
    if (dto.functions) this.assertKnownFunctions(dto.functions);
    if (dto.name) {
      const clash = await db.role.findUnique({ where: { name: dto.name.trim() } });
      if (clash && clash.id !== id) {
        throw new ConflictException('Un rôle existe déjà avec ce nom.');
      }
    }
    return db.role.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.functions ? { functions: dedupe(dto.functions) } : {}),
      },
    });
  }

  async remove(db: TenantDb, id: string) {
    const role = await this.requireRole(db, id);
    if (role.isSystem) {
      throw new BadRequestException('Les rôles système ne sont pas supprimables.');
    }
    const assigned = await db.user.count({ where: { roleId: id } });
    if (assigned > 0) {
      throw new ConflictException(
        `Ce rôle est assigné à ${assigned} compte(s) : réassignez-les d’abord.`,
      );
    }
    await db.role.delete({ where: { id } });
    return { removed: true };
  }

  /**
   * Données de mise à jour pour assigner un rôle (roleId null = retirer le
   * rôle dynamique). Quand le rôle est un rôle système, l'enum historique est
   * synchronisé : les comportements qui filtrent encore par enum (ex.
   * notification des gestionnaires) restent cohérents. Valide l'existence du
   * rôle (404 sinon) — réutilisé par l'activation de compte.
   */
  async buildAssignmentPatch(
    db: TenantDb,
    roleId: string | null,
  ): Promise<{ roleId: string | null; role?: UserRole }> {
    if (roleId === null) return { roleId: null };
    const role = await this.requireRole(db, roleId);
    const systemDef = ROLES_SYSTEME.find((def) => def.name === role.name);
    if (role.isSystem && systemDef) {
      return { roleId, role: systemDef.legacyRole };
    }
    return { roleId };
  }

  /** Assigne un rôle à un compte (roleId null = retour au rôle système implicite). */
  async assignRole(db: TenantDb, userId: string, roleId: string | null) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Compte introuvable.');

    const patch = await this.buildAssignmentPatch(db, roleId);

    const updated = await db.user.update({
      where: { id: userId },
      data: patch,
      select: {
        id: true,
        email: true,
        role: true,
        roleId: true,
        customRole: { select: { name: true, functions: true } },
      },
    });
    return updated;
  }

  /**
   * Rôle par id (404 si introuvable). Public : réutilisé par le contrôleur
   * pour connaître les fonctions ACTUELLES d'un rôle avant modification
   * (anti-escalade à l'édition — voir RolesController.update).
   */
  async findOne(db: TenantDb, id: string) {
    return this.requireRole(db, id);
  }

  // ───────────────────────────────────────────────────────────
  private async requireRole(db: TenantDb, id: string) {
    const role = await db.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rôle introuvable.');
    return role;
  }

  /**
   * ⚠ N'est atteinte que pour les rôles PERSONNALISÉS : `create` les pose
   * toujours en `isSystem: false`, et `update` refuse un rôle système avant
   * d'arriver ici. C'est donc le bon endroit pour le verrou d'escalade.
   */
  private assertKnownFunctions(functions: string[]): void {
    const unknown = functions.filter((f) => !TOUTES_LES_FONCTIONS.includes(f));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Fonction(s) inconnue(s) : ${unknown.join(', ')}. Voir GET /roles/fonctions.`,
      );
    }
    // `securite.roles` ouvre l'écran qui distribue toutes les autres fonctions.
    // La poser sur un rôle personnalisé permettrait à son porteur de
    // s'attribuer n'importe quoi : l'escalade se ferait par composition, sans
    // qu'aucune règle ne soit enfreinte. Elle reste sur l'Administrateur seul.
    const reservees = functions.filter((f) => FONCTIONS_RESERVEES_ADMIN.includes(f));
    if (reservees.length > 0) {
      throw new BadRequestException(
        `Fonction(s) réservée(s) au rôle Administrateur : ${reservees.join(', ')}. ` +
          'Un rôle personnalisé ne peut pas les recevoir.',
      );
    }
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
