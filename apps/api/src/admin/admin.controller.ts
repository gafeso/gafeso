import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminAuditInterceptor } from '../audit/admin-audit.interceptor';
import { AdminService } from './admin.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';

@ApiTags('admin')
@Controller('admin')
@UseInterceptors(AdminAuditInterceptor)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // anti force brute
  @ApiOperation({
    summary: 'Connexion super-admin plateforme',
    description: 'Renvoie un JWT super-admin, à utiliser en Bearer sur les routes /admin.',
  })
  async login(@Body() dto: SuperAdminLoginDto) {
    return this.admin.superAdminLogin(dto.email, dto.password);
  }

  @Post('tenants')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({
    summary: 'Provisionner une école',
    description:
      'Crée le tenant (public) et son schéma tenant_<slug> avec ses tables. ' +
      'Réservé à la plateforme (clé API x-admin-api-key).',
  })
  async provision(@Body() dto: ProvisionTenantDto) {
    return this.admin.provisionTenant(dto);
  }

  @Get('tenants')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({ summary: 'Lister les écoles provisionnées' })
  async list() {
    return this.admin.listTenants();
  }

  @Get('tenants/:slug')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({ summary: 'Détail d’une école' })
  async get(@Param('slug') slug: string) {
    return this.admin.getTenant(slug);
  }

  @Get('tenants/:slug/socle')
  @ApiOperation({
    summary: 'État du socle d’un établissement (rôles, catégories, règles, classes)',
  })
  async socle(@Param('slug') slug: string) {
    return this.admin.tenantSocle(slug);
  }

  @Post('tenants/:slug/sync-schema')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({
    summary: 'Synchroniser le schéma d’une école (après ajout de tables au modèle)',
    description:
      'Rejoue la DDL de provisioning en ignorant l’existant. Idempotent, ' +
      'ne touche pas aux données.',
  })
  async syncSchema(@Param('slug') slug: string) {
    return this.admin.syncTenantSchema(slug);
  }

  @Post('tenants/:slug/migrate-authors')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({
    summary: 'Copier les auteurs existants vers les contributeurs (migration en deux temps)',
    description:
      'Pour chaque notice avec un auteur texte et aucun contributeur, crée ' +
      'un contributeur AUTEUR_PRINCIPAL. Idempotent, ne supprime rien — ' +
      'l’ancien champ auteur reste en place jusqu’à une migration ultérieure.',
  })
  async migrateAuthors(@Param('slug') slug: string) {
    return this.admin.migrateAuthors(slug);
  }

  @Post('tenants/:slug/domaines-orphelins')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({
    summary: 'Lister les domaines orphelins d’une école (lecture seule par défaut)',
    description:
      'Valeurs de `biblio_records.category` sans catégorie correspondante : ' +
      'visibles dans la constellation, absentes de l’écran de gestion, hors ' +
      'd’atteinte du renommage et de la suppression. ' +
      'LISTE seulement, avec le nombre d’occurrences de chaque valeur. ' +
      'Ajouter ?creer=true pour créer les catégories manquantes — décision ' +
      'explicite : le vocabulaire des domaines appartient à la bibliothécaire.',
  })
  async orphanCategories(@Param('slug') slug: string, @Query('creer') creer?: string) {
    return this.admin.orphanCategories(slug, creer === 'true');
  }

  @Post('tenants/:slug/dedupe-authors')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({
    summary: 'Dédupliquer les contributeurs en fiches d’autorité auteur',
    description:
      'Regroupe les contributions par nom normalisé (casse/accents/espaces), ' +
      'crée une fiche d’autorité par groupe et relie chaque contribution. ' +
      'Idempotent : relancer renvoie 0 création, 0 liaison.',
  })
  async dedupeAuthors(@Param('slug') slug: string) {
    return this.admin.dedupeAuthors(slug);
  }

  @Post('tenants/:slug/seed-categories')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({
    summary: 'Seed des catégories standard chez une école',
    description:
      'Ajoute les 28 catégories standard manquantes (comparaison sans casse ' +
      'ni accents, jamais de doublon ni de suppression). Idempotent : ' +
      'relancer ne crée rien si tout existe.',
  })
  async seedCategories(@Param('slug') slug: string) {
    return this.admin.seedCategories(slug);
  }

  @Post('tenants/:slug/seed-homepage')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({
    summary: 'Seed d’une page d’accueil d’exemple',
    description:
      'Écrit un contenu d’accueil d’exemple, les tokens vitrine et active le ' +
      'motif décoratif, pour partir d’une vitrine complète et cohérente que ' +
      'l’établissement réécrit ensuite. Ne touche pas à la couleur principale ' +
      '(--primary reste celle choisie par l’établissement).',
  })
  async seedHomepage(@Param('slug') slug: string) {
    return this.admin.seedHomepage(slug);
  }

  @Post('tenants/:slug/reindex')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({
    summary: 'Réindexer le catalogue d’une école dans Meilisearch',
    description:
      'Reconstruit l’index depuis PostgreSQL (source de vérité). À lancer ' +
      'après un provisioning ou une perte de l’index Meilisearch.',
  })
  async reindex(@Param('slug') slug: string) {
    return this.admin.reindexTenant(slug);
  }

  @Delete('tenants/:slug')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('admin-api-key')
  @ApiOperation({
    summary: 'Déprovisionner une école (destructif)',
    description: 'Supprime le schéma tenant_<slug> (CASCADE) et les lignes associées.',
  })
  async deprovision(@Param('slug') slug: string) {
    return this.admin.deprovisionTenant(slug);
  }
}
