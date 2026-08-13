import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { AuthzService } from '../auth/authz.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { ClientIp } from '../audit/client-ip.decorator';
import { RolesService, TenantDb } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.ROLES_GERER)
@Controller('roles')
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly authz: AuthzService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Contexte d'audit commun à ce contrôleur. */
  private auditBase(tenant: ResolvedTenant | null, user: JwtPayload, ip?: string) {
    return {
      tenantId: tenant?.id ?? null,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      ip,
    };
  }

  private db(tenant: ResolvedTenant | null): TenantDb {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return this.prisma.forTenant(tenant.slug);
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les rôles de l’école (système + personnalisés)',
    description:
      'Seed les rôles système au passage (idempotent). Chaque rôle porte ses ' +
      'fonctions et le nombre de comptes assignés.',
  })
  async list(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.roles.list(this.db(tenant));
  }

  @Get('fonctions')
  @ApiOperation({
    summary: 'Catalogue des fonctions disponibles (codes + libellés français)',
  })
  listFunctions() {
    return this.roles.listFunctions();
  }

  @Post()
  @ApiOperation({
    summary: 'Créer un rôle personnalisé',
    description: 'Les codes de fonctions sont validés contre le catalogue.',
  })
  async create(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRoleDto,
    @ClientIp() ip?: string,
  ) {
    const role = await this.roles.create(this.db(tenant), dto);
    void this.audit.log({
      ...this.auditBase(tenant, user, ip),
      action: AUDIT_ACTIONS.ROLE_CREATE,
      targetType: 'role',
      targetId: role.id,
      targetLabel: role.name,
      metadata: { functions: dto.functions },
    });
    return role;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier un rôle personnalisé (nom, description, fonctions)',
    description:
      'Les rôles système ne sont pas modifiables. Anti-escalade : AJOUTER une ' +
      'fonction qu’un rôle ne détenait pas encore exige EN PLUS la fonction ' +
      'comptes.gerer — sans quoi un titulaire de roles.gerer seul pourrait ' +
      'éditer un rôle qu’il détient déjà pour s’y ajouter comptes.gerer/ ' +
      'roles.gerer (ou toute autre fonction) et s’élever immédiatement ' +
      '(les fonctions sont résolues EN BASE à chaque requête). Retirer une ' +
      'fonction reste possible avec roles.gerer seul.',
  })
  async update(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @ClientIp() ip?: string,
  ) {
    const db = this.db(tenant);
    if (dto.functions) {
      const current = await this.roles.findOne(db, id);
      const added = dto.functions.filter((f) => !current.functions.includes(f));
      if (added.length > 0) {
        const canManageAccounts = await this.authz.hasFunction(
          db,
          user.sub,
          FONCTIONS.COMPTES_GERER,
        );
        if (!canManageAccounts) {
          throw new ForbiddenException(
            `Ajouter une fonction à un rôle exige la fonction comptes.gerer ` +
              `(anti-escalade) : ${added.join(', ')}.`,
          );
        }
      }
    }
    const role = await this.roles.update(db, id, dto);
    void this.audit.log({
      ...this.auditBase(tenant, user, ip),
      action: AUDIT_ACTIONS.ROLE_UPDATE,
      targetType: 'role',
      targetId: id,
      targetLabel: role.name,
      metadata: { functions: dto.functions, name: dto.name, description: dto.description },
    });
    return role;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Supprimer un rôle personnalisé',
    description:
      'Refusé pour un rôle système ou un rôle encore assigné à des comptes.',
  })
  async remove(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
  ) {
    const result = await this.roles.remove(this.db(tenant), id);
    void this.audit.log({
      ...this.auditBase(tenant, user, ip),
      action: AUDIT_ACTIONS.ROLE_DELETE,
      targetType: 'role',
      targetId: id,
    });
    return result;
  }
}
