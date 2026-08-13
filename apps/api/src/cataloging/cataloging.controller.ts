import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { MarcFormat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { ClientIp } from '../audit/client-ip.decorator';
import { CatalogingService, TenantDb } from './cataloging.service';
import { recordToIso2709, recordToMarcxmlElement } from './marc-export';
import { CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { CreateItemDto, UpdateItemDto } from './dto/item.dto';
import { ListRecordsDto } from './dto/list-records.dto';
import { DigitalCopyService } from './digital-copy.service';

@ApiTags('cataloging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@Controller('cataloging')
export class CatalogingController {
  constructor(
    private readonly cataloging: CatalogingService,
    private readonly digitalCopy: DigitalCopyService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Résout tenant + client Prisma du schéma école. */
  private ctx(tenant: ResolvedTenant | null): { db: TenantDb; slug: string } {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return { db: this.prisma.forTenant(tenant.slug), slug: tenant.slug };
  }

  // ── Notices ─────────────────────────────────────────────────
  @Post('records')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({
    summary: 'Créer une notice',
    description:
      'La catégorie (droit, medecine...) alimente la page constellation. ' +
      'La notice est indexée dans Meilisearch immédiatement.',
  })
  async createRecord(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: CreateRecordDto,
  ) {
    const { db, slug } = this.ctx(tenant);
    return this.cataloging.createRecord(db, slug, dto);
  }

  @Post('records/import-marc')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Importer un fichier MARC (ISO 2709)',
    description:
      'MARC21 ou UNIMARC (champ marcFormat, défaut UNIMARC). category optionnelle ' +
      'appliquée à toutes les notices importées.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        marcFormat: { type: 'string', enum: ['MARC21', 'UNIMARC'] },
        category: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async importMarc(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @UploadedFile() file: Express.Multer.File,
    @Body('marcFormat') marcFormat?: string,
    @Body('category') category?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier MARC requis (champ « file »).');
    }
    const format =
      marcFormat === MarcFormat.MARC21 ? MarcFormat.MARC21 : MarcFormat.UNIMARC;
    const { db, slug } = this.ctx(tenant);
    return this.cataloging.importMarc(db, slug, file.buffer, format, category);
  }

  @Get('export')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({
    summary: 'Export MARC (UNIMARC) — notice, sélection ou catalogue complet',
    description:
      'format=iso2709 (.mrc) ou marcxml (.xml). ids=a,b,c pour une sélection ' +
      '(ou une notice) ; sans ids, tout le catalogue. Généré en streaming.',
  })
  async export(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query('format') format: string,
    @Query('ids') ids: string,
    @Res() res: Response,
  ) {
    const { db } = this.ctx(tenant);
    const idList = ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const marcxml = format === 'marcxml';
    const base = idList && idList.length === 1 ? `notice-${idList[0]}` : 'catalogue';

    if (marcxml) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.marcxml"`);
      res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
      res.write('<collection xmlns="http://www.loc.gov/MARC21/slim">\n');
      for await (const batch of this.cataloging.exportRecordsBatched(db, idList)) {
        for (const rec of batch) res.write(recordToMarcxmlElement(rec) + '\n');
      }
      res.write('</collection>\n');
    } else {
      res.setHeader('Content-Type', 'application/marc; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.mrc"`);
      for await (const batch of this.cataloging.exportRecordsBatched(db, idList)) {
        for (const rec of batch) res.write(recordToIso2709(rec));
      }
    }
    res.end();
  }

  @Get('keywords')
  @ApiOperation({
    summary: 'Mots-clés du tenant (autocomplétion du champ tags)',
    description:
      'Liste triée, filtrable par ?q= (noms normalisés en minuscules, §2.4).',
  })
  async listKeywords(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query('q') q?: string,
  ) {
    const { db } = this.ctx(tenant);
    return this.cataloging.listKeywords(db, q);
  }

  @Get('records')
  @ApiOperation({ summary: 'Registre des notices (paginé, filtre par catégorie)' })
  async listRecords(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: ListRecordsDto,
  ) {
    const { db } = this.ctx(tenant);
    return this.cataloging.listRecords(db, query);
  }

  @Get('records/:id')
  @ApiOperation({ summary: 'Détail d’une notice (avec exemplaires)' })
  async getRecord(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    const { db } = this.ctx(tenant);
    return this.cataloging.getRecord(db, id);
  }

  @Patch('records/:id')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({ summary: 'Modifier une notice (réindexée)' })
  async updateRecord(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateRecordDto,
  ) {
    const { db, slug } = this.ctx(tenant);
    return this.cataloging.updateRecord(db, slug, id, dto);
  }

  @Delete('records/:id')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({ summary: 'Supprimer une notice (refusé si exemplaires/réservations)' })
  async deleteRecord(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
  ) {
    const { db, slug } = this.ctx(tenant);
    const result = await this.cataloging.deleteRecord(db, slug, id);
    void this.audit.log({
      tenantId: tenant?.id ?? null,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.RECORD_DELETE,
      targetType: 'record',
      targetId: id,
      ip,
    });
    return result;
  }

  @Post('reindex')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({ summary: 'Réindexer tout le catalogue dans Meilisearch' })
  async reindex(@CurrentTenant() tenant: ResolvedTenant | null) {
    const { db, slug } = this.ctx(tenant);
    return this.cataloging.reindexAll(db, slug);
  }

  // ── Exemplaires ─────────────────────────────────────────────
  @Post('records/:id/items')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({ summary: 'Ajouter un exemplaire à une notice' })
  async addItem(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: CreateItemDto,
  ) {
    const { db } = this.ctx(tenant);
    return this.cataloging.addItem(db, id, dto);
  }

  @Patch('items/:itemId')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({ summary: 'Modifier un exemplaire' })
  async updateItem(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    const { db } = this.ctx(tenant);
    return this.cataloging.updateItem(db, itemId, dto);
  }

  @Delete('items/:itemId')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({ summary: 'Supprimer un exemplaire (refusé si prêts rattachés)' })
  async deleteItem(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('itemId') itemId: string,
  ) {
    const { db } = this.ctx(tenant);
    return this.cataloging.deleteItem(db, itemId);
  }

  // ── Exemplaire numérique (PDF/EPUB) ─────────────────────────
  @Post('records/:id/digital-copy')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Téléverser le fichier numérique (PDF/EPUB) d’une notice',
    description:
      'Un seul exemplaire numérique par notice : un nouvel envoi remplace ' +
      'le précédent. 200 Mo maximum. Stocké dans MinIO (bucket digital-copies). ' +
      'Les métadonnées embarquées (titre, auteur, langue, éditeur, date, ' +
      'couverture) sont extraites et pré-remplissent les champs vides de la ' +
      'notice — jamais d’écrasement d’une valeur déjà saisie.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }),
  )
  async uploadDigitalCopy(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier requis (champ « file »).');
    }
    const { db, slug } = this.ctx(tenant);
    return this.digitalCopy.upload(db, slug, id, file);
  }

  @Get('records/:id/digital-copy')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({
    summary: 'Métadonnées de l’exemplaire numérique d’une notice (personnel)',
    description:
      'Réservé au personnel du catalogue : expose la clé objet interne. Les ' +
      'membres passent par l’OPAC (fiche + lecture en ligne).',
  })
  async getDigitalCopy(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    const { db } = this.ctx(tenant);
    return this.digitalCopy.getMetadata(db, id);
  }

  @Get('records/:id/digital-copy/download-url')
  @RequiresFunctions(FONCTIONS.DOCUMENT_TELECHARGER)
  @ApiOperation({
    summary: 'URL signée temporaire pour télécharger le fichier numérique (admin)',
    description:
      'Valable 15 minutes. TÉLÉCHARGEMENT réservé à l’administrateur : le ' +
      'bibliothécaire lit en ligne (OPAC /read) mais ne télécharge pas ; les ' +
      'étudiants passent par l’OPAC, soumis au contrôle d’accès (brique 4).',
  })
  async getDigitalCopyDownloadUrl(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    const { db } = this.ctx(tenant);
    return this.digitalCopy.getDownloadUrl(db, id);
  }

  @Delete('records/:id/digital-copy')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({ summary: 'Supprimer l’exemplaire numérique d’une notice' })
  async deleteDigitalCopy(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    const { db } = this.ctx(tenant);
    return this.digitalCopy.remove(db, id);
  }
}
