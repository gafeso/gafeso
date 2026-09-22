import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { ClientIp } from '../audit/client-ip.decorator';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import {
  CATEGORIES_RECOLEMENT,
  CategorieRecolement,
  InventoryService,
  TenantDb,
} from './inventory.service';
import { CreateSessionDto, PaginationRecolementDto, ScanDto } from './dto/inventory.dto';

/**
 * Récolement / inventaire (vague 2). Réservé au personnel qui gère le
 * catalogue (statuts d'exemplaires). Tenant-scopé par le Host.
 */
@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.OUTILS_CATALOGUE)
@ApiBearerAuth()
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  private db(tenant: ResolvedTenant | null): { db: TenantDb; tenant: ResolvedTenant } {
    if (!tenant) throw new BadRequestException('Établissement non résolu.');
    return { db: this.prisma.forTenant(tenant.slug), tenant };
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Créer une session de récolement' })
  async create(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSessionDto,
  ) {
    const { db } = this.db(tenant);
    return this.inventory.createSession(db, dto, user.email);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Lister les sessions de récolement' })
  async list(@CurrentTenant() tenant: ResolvedTenant | null) {
    const { db } = this.db(tenant);
    return this.inventory.listSessions(db);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Détail d’une session (avec progression)' })
  async detail(@CurrentTenant() tenant: ResolvedTenant | null, @Param('id') id: string) {
    const { db } = this.db(tenant);
    return this.inventory.getSession(db, id);
  }

  @Post('sessions/:id/scan')
  @ApiOperation({ summary: 'Scanner un exemplaire (douchette)' })
  async scan(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: ScanDto,
  ) {
    const { db } = this.db(tenant);
    return this.inventory.scan(db, id, dto.barcode);
  }

  @Get('sessions/:id/counts')
  @ApiOperation({
    summary: 'Comptes du récolement, SANS les listes — réponse de taille constante',
    description:
      'Le récolement est la seule fonction dont le périmètre nominal est le fonds ENTIER. ' +
      'Cette route rend ce que l’écran affiche (cinq nombres) sans transporter les listes : ' +
      'sur un fonds de 10 000 exemplaires, la réponse passe de ~2 Mo à quelques centaines ' +
      'd’octets. Les listes se demandent une par une par /items, quand on les ouvre.',
  })
  async counts(@CurrentTenant() tenant: ResolvedTenant | null, @Param('id') id: string) {
    const { db } = this.db(tenant);
    return this.inventory.counts(db, id);
  }

  @Get('sessions/:id/items/:categorie')
  @ApiOperation({
    summary: 'UNE catégorie du rapport, paginée (seen | missing | onLoan | unexpected)',
    description:
      'Rend le nombre total de pages, donc accepte `page` — un contrat qui annonce ' +
      'un parcours qu’il ne sert pas est un faux. `limit` est borné à 500 : sans ' +
      'cette borne, la pagination serait décorative.',
  })
  async items(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Param('categorie') categorie: string,
    @Query() q: PaginationRecolementDto,
  ) {
    // ⚠ La catégorie vient du CHEMIN, donc le pipe de validation ne la voit
    // pas : elle se vérifie ici, contre le vocabulaire, jamais contre une
    // chaîne recopiée.
    if (!(CATEGORIES_RECOLEMENT as readonly string[]).includes(categorie)) {
      throw new BadRequestException(
        `Catégorie inconnue « ${categorie} ». Attendu : ${CATEGORIES_RECOLEMENT.join(', ')}.`,
      );
    }
    const { db } = this.db(tenant);
    return this.inventory.categorie(
      db,
      id,
      categorie as CategorieRecolement,
      q.page ?? 1,
      q.limit ?? 100,
    );
  }

  @Get('sessions/:id/report')
  @ApiOperation({
    summary: 'Rapport de récolement COMPLET (vus / manquants / inattendus / en prêt)',
    description:
      '⚠ Non borné, délibérément : c’est le chemin de l’export et des écrans déjà ' +
      'déployés. Pour un affichage, préférer /counts puis /items. Ne PAS y ajouter ' +
      'de `take` sans curseur — voir le commentaire de markMissing.',
  })
  async report(@CurrentTenant() tenant: ResolvedTenant | null, @Param('id') id: string) {
    const { db } = this.db(tenant);
    return this.inventory.report(db, id);
  }

  @Get('sessions/:id/report.csv')
  @ApiOperation({ summary: 'Export CSV du rapport de récolement' })
  async reportCsv(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { db } = this.db(tenant);
    const csv = await this.inventory.reportCsv(db, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="recolement-${id}.csv"`);
    res.end(csv);
  }

  @Post('sessions/:id/close')
  @ApiOperation({ summary: 'Clôturer une session' })
  async close(@CurrentTenant() tenant: ResolvedTenant | null, @Param('id') id: string) {
    const { db } = this.db(tenant);
    return this.inventory.closeSession(db, id);
  }

  @Post('sessions/:id/reopen')
  @ApiOperation({
    summary: 'Rouvrir une session clôturée par erreur',
    description:
      '⚠ Sans elle, un clic coûtait le récolement entier : `scan` refuse sur ' +
      'une session close en disant « rouvrez-en une NOUVELLE », c’est-à-dire ' +
      'recommencer sur plusieurs milliers d’exemplaires. Refusée si les ' +
      'manquants ont DÉJÀ été marqués — le catalogue a changé.',
  })
  async reopen(@CurrentTenant() tenant: ResolvedTenant | null, @Param('id') id: string) {
    const { db } = this.db(tenant);
    return this.inventory.reopenSession(db, id);
  }

  @Delete('sessions/:id/scans/:barcode')
  @ApiOperation({
    summary: 'Annuler un scan — un code-barres pointé par erreur',
    description:
      '⚠ Sans elle, une erreur de scan DÉFAIT SILENCIEUSEMENT le récolement : ' +
      'l’exemplaire est marqué vu pour toujours, « marquer les manquants » ne ' +
      'le signale pas, et un exemplaire réellement absent reste disponible au ' +
      'catalogue. Session OUVERTE seulement.',
  })
  async annulerScan(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Param('barcode') barcode: string,
  ) {
    const { db } = this.db(tenant);
    return this.inventory.annulerScan(db, id, barcode);
  }

  @Post('sessions/:id/mark-missing')
  @ApiOperation({ summary: 'Marquer les manquants confirmés (statut MISSING, tracé)' })
  async markMissing(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @ClientIp() ip?: string,
  ) {
    const { db, tenant: t } = this.db(tenant);
    return this.inventory.markMissing(db, t, id, user, ip);
  }
}
