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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
import { RolesService } from '../roles/roles.service';
import { AssignRoleDto } from '../roles/dto/assign-role.dto';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { ClientIp } from '../audit/client-ip.decorator';
import { AccountsService, TenantDb } from './accounts.service';
import { RegisterDto } from './dto/register.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly roles: RolesService,
    private readonly authz: AuthzService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private auditBase(tenant: ResolvedTenant | null, user: JwtPayload, ip?: string) {
    return {
      tenantId: tenant?.id ?? null,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      ip,
    };
  }

  /** Résout le client Prisma du tenant courant (400 si domaine inconnu). */
  private db(tenant: ResolvedTenant | null): TenantDb {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return this.prisma.forTenant(tenant.slug);
  }

  @Post('expected-students/import')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.ETUDIANTS_IMPORTER)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Importer la liste pré-chargée des étudiants (CSV)',
    description:
      'Réservé au gestionnaire. Colonnes acceptées (FR ou EN) : matricule, email, ' +
      'firstName|prenom, lastName|nom, className|classe. Upsert idempotent par matricule.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async importExpectedStudents(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier CSV requis (champ « file »).');
    }
    return this.accounts.importExpectedStudents(
      this.db(tenant),
      file.buffer.toString('utf-8'),
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COMPTES_VOIR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lister les comptes de l’école (filtre statut / recherche)',
    description:
      'Réservé au gestionnaire. Renvoie les comptes paginés + le compteur par ' +
      'statut (file d’attente = filtrer status=PENDING).',
  })
  async list(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: ListAccountsDto,
  ) {
    return this.accounts.listAccounts(this.db(tenant), query);
  }

  @Post('staff')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COMPTES_GERER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Créer un compte du personnel (admin)',
    description:
      'Réservé à l’administrateur. Crée un compte ACTIVE (bibliothécaire, ' +
      'gestionnaire, acquisitions, admin) et envoie le lien de mot de passe.',
  })
  async createStaff(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: CreateStaffDto,
  ) {
    return this.accounts.createStaff(this.db(tenant), dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COMPTES_GERER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Modifier un compte existant (prénom, nom, email, classe, rôle)',
    description:
      'Le mot de passe ne se modifie JAMAIS ici — toujours via le lien ' +
      'sécurisé. roleId suit la même logique que PATCH /accounts/:id/role.',
  })
  async update(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(this.db(tenant), id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COMPTES_GERER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspendre ou réactiver un compte (admin)' })
  async setStatus(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @ClientIp() ip?: string,
  ) {
    const result = await this.accounts.setStatus(this.db(tenant), id, dto.status);
    void this.audit.log({
      ...this.auditBase(tenant, user, ip),
      action: AUDIT_ACTIONS.ACCOUNT_STATUS_CHANGE,
      targetType: 'user',
      targetId: id,
      metadata: { status: dto.status },
    });
    return result;
  }

  @Get(':id/password-link')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COMPTES_GERER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lien de définition de mot de passe encore valide (repli si l’email ne part pas)',
    description:
      'Repli lorsque le SMTP est absent ou en panne : sans lui, un administrateur ' +
      'ne peut activer aucun lecteur. ⚠ Ce lien permet de PRENDRE LA MAIN sur le ' +
      'compte — il est réservé à « comptes.gerer », servi à la demande (jamais ' +
      'dans une liste), et sa consultation est tracée dans le journal d’audit.',
  })
  async passwordLink(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @ClientIp() ip: string | undefined,
    @Param('id') id: string,
  ) {
    const result = await this.accounts.passwordLink(this.db(tenant), id);
    // Tracé AVANT de rendre la main : qui a consulté le lien de quel compte,
    // et quand. Le jeton lui-même n'entre JAMAIS dans le journal.
    void this.audit.log({
      ...this.auditBase(tenant, user, ip),
      action: AUDIT_ACTIONS.ACCOUNT_PASSWORD_LINK_VIEW,
      targetType: 'user',
      targetId: id,
      targetLabel: result.email,
    });
    return result;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COMPTES_GERER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Supprimer définitivement un compte (admin)',
    description:
      'Libère l’email/matricule pour une recréation (utile pour les comptes ' +
      'de test). Inscriptions et jeton de mot de passe supprimés avec le ' +
      'compte ; si un adhérent est lié, refusé proprement en cas de prêt en ' +
      'cours ou de réservation active.',
  })
  async remove(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
  ) {
    if (user.sub === id) {
      throw new ForbiddenException('Vous ne pouvez pas supprimer votre propre compte.');
    }
    const db = this.db(tenant);
    // Récupère l'email AVANT suppression pour tracer QUEL compte a été supprimé.
    const target = await db.user.findUnique({ where: { id }, select: { email: true } });
    const result = await this.accounts.remove(db, id);
    void this.audit.log({
      ...this.auditBase(tenant, user, ip),
      action: AUDIT_ACTIONS.ACCOUNT_DELETE,
      targetType: 'user',
      targetId: id,
      targetLabel: target?.email,
    });
    return result;
  }

  @Get('assignable-roles')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COMPTES_GERER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rôles assignables à l’activation (nom, système ou non)',
    description:
      'Distinct de GET /roles (fonction roles.gerer) : un compte peut avoir ' +
      'comptes.gerer sans avoir roles.gerer et doit tout de même pouvoir ' +
      'choisir un rôle existant à l’activation.',
  })
  async assignableRoles(@CurrentTenant() tenant: ResolvedTenant | null) {
    const roles = await this.roles.list(this.db(tenant));
    return roles.map((r) => ({ id: r.id, name: r.name, isSystem: r.isSystem }));
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COMPTES_GERER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Assigner un rôle à un compte',
    description:
      'roleId absent/null = retirer le rôle dynamique (retour au rôle système ' +
      'implicite). L’assignation d’un rôle système synchronise l’enum historique.',
  })
  async assignRole(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @ClientIp() ip?: string,
  ) {
    const result = await this.roles.assignRole(this.db(tenant), id, dto.roleId ?? null);
    void this.audit.log({
      ...this.auditBase(tenant, user, ip),
      action: AUDIT_ACTIONS.ACCOUNT_ROLE_CHANGE,
      targetType: 'user',
      targetId: id,
      metadata: { roleId: dto.roleId ?? null },
    });
    return result;
  }

  @Post('register')
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // endpoint public
  @ApiOperation({
    summary: 'Créer un compte (inscription publique — étudiant ou personnel)',
    description:
      'ÉTUDIANT (matricule fourni) : si matricule + email figurent dans la ' +
      'liste pré-chargée → compte ACTIVE (activation automatique) et lien de ' +
      'mot de passe envoyé ; sinon PENDING. PERSONNEL/AUTRE (sans matricule) : ' +
      'toujours PENDING — le rôle est défini par l’activateur au moment de ' +
      'l’activation, jamais par l’inscrit.',
  })
  async register(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: RegisterDto,
  ) {
    return this.accounts.register(this.db(tenant), dto);
  }

  @Post(':id/activate')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COMPTES_ACTIVER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Activer manuellement un compte en attente (rôle optionnel)',
    description:
      'Passe un compte PENDING à ACTIVE et envoie le lien de définition de mot ' +
      'de passe. roleId optionnel : assigner un rôle exige EN PLUS la fonction ' +
      'comptes.gerer — un activateur simple ne peut pas fabriquer un compte à ' +
      'privilèges (anti-escalade).',
  })
  async activate(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ActivateAccountDto,
    @ClientIp() ip?: string,
  ) {
    const db = this.db(tenant);
    if (dto.roleId) {
      // Anti-escalade : activer suffit pour un compte simple, mais poser un
      // rôle (donc des fonctions) exige le droit de gérer les comptes.
      const canManage = await this.authz.hasFunction(
        db,
        user.sub,
        FONCTIONS.COMPTES_GERER,
      );
      if (!canManage) {
        throw new ForbiddenException(
          'Assigner un rôle à l’activation exige la fonction comptes.gerer.',
        );
      }
    }
    const result = await this.accounts.activateAccount(db, id, dto.roleId);
    void this.audit.log({
      ...this.auditBase(tenant, user, ip),
      action: AUDIT_ACTIONS.ACCOUNT_ACTIVATE,
      targetType: 'user',
      targetId: id,
      metadata: { roleId: dto.roleId ?? null },
    });
    return result;
  }

  @Post('set-password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // anti-devinette de jeton
  @ApiOperation({
    summary: 'Définir son mot de passe via le lien sécurisé',
    description:
      'Consomme un token à usage unique (valable 24h) et enregistre le mot de ' +
      'passe (haché). Aucun mot de passe n’est jamais transmis en clair par email.',
  })
  async setPassword(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: SetPasswordDto,
  ) {
    return this.accounts.setPassword(this.db(tenant), dto.token, dto.password);
  }
}
