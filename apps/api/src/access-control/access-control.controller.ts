import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClientIp } from '../audit/client-ip.decorator';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { JwtPayload } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthzService } from '../auth/authz.service';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { AccessControlService } from './access-control.service';
import { StudentAccessContext } from './access-control.matching';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddAccessRuleDto } from './dto/add-access-rule.dto';
import { AddTitleDto } from './dto/add-title.dto';
import { AddRecordDto } from './dto/add-record.dto';

@ApiTags('access-control')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('collections')
export class AccessControlController {
  constructor(
    private readonly accessControl: AccessControlService,
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
  ) {}

  private requireTenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return tenant;
  }

  /** Construit le contexte d'accès de l'étudiant (classe + palier) depuis le schéma tenant. */
  private studentContext(
    tenant: ResolvedTenant,
    userId: string,
  ): Promise<StudentAccessContext> {
    return this.accessControl.buildStudentContext(
      tenant,
      this.prisma.forTenant(tenant.slug),
      userId,
    );
  }

  // ── Étudiant : ressources visibles ──────────────────────────
  @Get('me')
  @ApiOperation({
    summary: 'Collections accessibles à l’étudiant connecté',
    description:
      'Ne renvoie que les collections dont une règle d’accès de l’école ' +
      'correspond à la classe et au palier d’abonnement de l’étudiant.',
  })
  async myCollections(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    const ctx = await this.studentContext(this.requireTenant(tenant), user.sub);
    return this.accessControl.getVisibleCollections(ctx);
  }

  @Get('me/titles/:titleId/access')
  @ApiOperation({
    summary: 'Vérifier l’accès de l’étudiant à un titre',
    description:
      'Retourne { canAccess } selon les collections auxquelles l’étudiant a droit.',
  })
  async canAccessTitle(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('titleId') titleId: string,
  ) {
    const ctx = await this.studentContext(this.requireTenant(tenant), user.sub);
    return { canAccess: await this.accessControl.canAccessTitle(ctx, titleId) };
  }

  @Get('me/records/:recordId/access')
  @ApiOperation({
    summary: 'Vérifier l’accès du membre à un document numérisé local',
    description:
      'Retourne le statut d’accès (avec message français en cas de refus) pour ' +
      'piloter l’état du bouton « Lire en ligne » sur la fiche document. Le ' +
      'personnel a toujours accès en lecture (même règle que l’endpoint /read).',
  })
  async canAccessRecord(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('recordId') recordId: string,
  ) {
    const resolved = this.requireTenant(tenant);
    const db = this.prisma.forTenant(resolved.slug);
    // Même règle que /read : la fonction document.lire donne la lecture libre.
    if (await this.authz.hasFunction(db, user.sub, FONCTIONS.DOCUMENT_LIRE)) {
      return { granted: true };
    }
    const ctx = await this.studentContext(resolved, user.sub);
    return this.accessControl.getRecordAccessStatus(db, ctx, recordId);
  }

  // ── Administration (école) ──────────────────────────────────
  @Post()
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Créer une collection (admin)' })
  async createCollection(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: CreateCollectionDto,
  ) {
    return this.accessControl.createCollection(dto, this.requireTenant(tenant).id);
  }

  @Get()
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Lister les collections de l’école (admin)' })
  async listCollections(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.accessControl.listCollections(this.requireTenant(tenant).id);
  }

  @Get('rule-options')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({
    summary: 'Référentiels pour composer une règle d’accès',
    description:
      'Classes réelles de l’école (nom technique + libellé) et paliers ' +
      'd’abonnement effectivement portés par des comptes. Alimente les listes ' +
      'déroulantes : plus aucune saisie libre d’un identifiant technique.',
  })
  async ruleOptions(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.accessControl.ruleOptions(this.requireTenant(tenant).slug);
  }

  /**
   * ⚠ DÉCLARÉE AVANT `@Get(':id')`, et ce n'est pas indifférent : `documents`
   * serait sinon un candidat plausible pour `:id` à la lecture du fichier. Les
   * deux chemins n'ont pas le même nombre de segments, donc Nest ne les
   * confond pas — mais l'ordre rend l'intention lisible.
   */
  @Get('documents/:recordId')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({
    summary: 'Libellé d’un document local (identifiant + titre) (admin)',
    description:
      'Le strict nécessaire pour afficher un document rattaché à une ' +
      'collection. Le registre professionnel complet est sur ' +
      '/cataloging/records/:id, derrière `catalogue.gerer`.',
  })
  async recordLabel(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('recordId') recordId: string,
  ) {
    return this.accessControl.recordLabel(this.requireTenant(tenant).slug, recordId);
  }

  @Get(':id')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Détail d’une collection (titres + règles) (admin)' })
  async getCollection(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.accessControl.getCollection(id, this.requireTenant(tenant).id);
  }

  @Patch(':id')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Modifier une collection (nom / description) (admin)' })
  async updateCollection(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.accessControl.updateCollection(id, this.requireTenant(tenant).id, dto);
  }

  @Delete(':id')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({
    summary: 'Supprimer une collection — refusé si elle n’est pas VIDE (admin)',
    description:
      '⚠ « Vide » inclut les RÈGLES D’ACCÈS : une collection sans document mais ' +
      'portant des règles porte quand même des décisions, et l’écran la montre ' +
      'vide. Le refus COMPTE ce qui bloque — « 12 document(s), 3 règle(s) ' +
      'd’accès, 2 sous-collection(s) » — parce qu’un refus qui ne compte pas ' +
      'envoie chercher à l’aveugle. Pas de cascade : elle emporterait des ' +
      'règles d’accès, c’est-à-dire des décisions. La collection SOCLE ne se ' +
      'supprime pas.',
  })
  async deleteCollection(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const result = await this.accessControl.removeCollection(id, tenant.id);
    // ⚠ TRACÉ. Une collection porte des règles d'accès : la supprimer, même
    // vide, retire un objet dont d'autres décisions ont pu dépendre.
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.COLLECTION_DELETE,
      targetType: 'collection',
      targetId: id,
      targetLabel: result.name,
      ip,
    });
    return result;
  }

  /**
   * CE QUE LA PROPAGATION FERAIT — elle ne fait rien.
   *
   * ⚠ DEUX ROUTES ET NON UNE, et c'est l'exigence du lot : l'action LISTE ce
   * qu'elle va toucher avant d'écrire. Un `dryRun` en paramètre aurait mis la
   * lecture et l'écriture derrière le même verbe, où une faute de frappe
   * élargit des droits.
   */
  @Get(':id/propagation')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({
    summary: 'Ce que la propagation des règles ferait (aucune écriture)',
    description:
      'Rend les règles de la collection, les sous-collections qui les ' +
      'recevraient, celles qui les portent déjà, celles ÉCARTÉES avec leur ' +
      'motif, et le nombre total de règles qui seraient écrites.',
  })
  async previsualiserPropagation(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.accessControl.previsualiserPropagation(id, this.requireTenant(tenant).id);
  }

  /**
   * Applique les règles de la collection à ses sous-collections.
   *
   * ⚠ C'EST UN ÉLARGISSEMENT DE DROITS. Il est donc écrit dans le journal
   * d'audit, avec les collections touchées NOMMÉES — et l'entrée est écrite
   * dans la MÊME TRANSACTION que les règles : si la trace échoue, rien n'est
   * élargi. Voir le motif complet sur `propagerRegles`.
   */
  @Post(':id/propagation')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Propager les règles d’accès aux sous-collections (admin)' })
  async propagerRegles(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @ClientIp() ip: string | undefined,
    @Param('id') id: string,
  ) {
    return this.accessControl.propagerRegles(id, this.requireTenant(tenant).id, {
      id: user.sub,
      email: user.email,
      role: user.role,
      ip,
    });
  }

  @Post(':id/titles')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Ajouter un titre à une collection (admin)' })
  async addTitle(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: AddTitleDto,
  ) {
    return this.accessControl.addTitle(id, this.requireTenant(tenant).id, dto.titleId);
  }

  @Delete(':id/titles/:titleId')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Retirer un titre d’une collection (admin)' })
  async removeTitle(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Param('titleId') titleId: string,
  ) {
    return this.accessControl.removeTitle(id, this.requireTenant(tenant).id, titleId);
  }

  @Post(':id/records')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({
    summary: 'Rattacher un document numérisé local (BiblioRecord) à une collection (admin)',
    description:
      'La collection est liée à l’école de l’admin au premier document ajouté ' +
      '(une collection interne appartient à une seule école).',
  })
  async addRecord(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: AddRecordDto,
  ) {
    return this.accessControl.addRecord(id, this.requireTenant(tenant).id, dto.recordId);
  }

  @Delete(':id/records/:recordId')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Retirer un document numérisé local d’une collection (admin)' })
  async removeRecord(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
  ) {
    return this.accessControl.removeRecord(id, this.requireTenant(tenant).id, recordId);
  }

  @Post(':id/access-rules')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({
    summary: 'Ajouter une règle d’accès (classe / palier) à une collection (admin)',
    description:
      'La règle est rattachée à l’école courante. className / subscriptionTier ' +
      'absents = joker (toutes classes / tous paliers).',
  })
  async addAccessRule(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: AddAccessRuleDto,
  ) {
    const resolved = this.requireTenant(tenant);
    // Le slug permet d'atteindre le schéma de l'école pour VALIDER la classe
    // référencée (les classes vivent côté tenant, les règles côté public) —
    // sans quoi une classe inexistante passait sans broncher.
    return this.accessControl.addAccessRule(id, resolved.id, dto, resolved.slug);
  }

  @Get(':id/access-rules')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Lister les règles d’accès de l’école pour une collection (admin)' })
  async listAccessRules(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.accessControl.listAccessRules(id, this.requireTenant(tenant).id);
  }

  @Delete('access-rules/:ruleId')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.COLLECTIONS_GERER)
  @ApiOperation({ summary: 'Supprimer une règle d’accès (admin)' })
  async removeAccessRule(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('ruleId') ruleId: string,
  ) {
    return this.accessControl.removeAccessRule(
      ruleId,
      this.requireTenant(tenant).id,
    );
  }
}
