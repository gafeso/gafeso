import {
  BadRequestException,
  Body,
  Controller,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { ClientIp } from '../audit/client-ip.decorator';
import { CurrentTenant } from './current-tenant.decorator';
import { ResolvedTenant, TenancyService } from './tenancy.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { mergeHomeTokens } from './home-theme';
import { normalizeHomeContent } from './home-content';
import { enrollmentUrl, qrPng, qrPosterPdf } from './enrollment-qr';

// Images de la vitrine (logo, photo hero) — servies publiquement, donc dans le
// bucket public « covers ». Formats web courants, taille raisonnable.
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 Mo

@ApiTags('tenancy')
@Controller('tenancy')
export class TenancyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Origine publique de l'établissement — celle que le QR fait ouvrir.
   * C'est APP_URL, pas le Host de la requête : le personnel peut administrer
   * depuis une adresse interne, un tunnel ou une IP, et une affiche portant
   * `http://192.168.1.12:8080/e/zinda` ne servirait à personne une fois sortie
   * du bâtiment. On imprime toujours l'adresse publique configurée.
   */
  private appUrl(): string {
    const url = this.config.get<string>('APP_URL');
    if (!url) throw new BadRequestException('APP_URL n’est pas configurée sur ce serveur.');
    return url;
  }

  /**
   * QR d'inscription de l'établissement, en PNG (aperçu écran, insertion dans
   * un document) et en PDF (affiche A4 prête à imprimer, avec le nom de
   * l'établissement et l'adresse en clair).
   *
   * Réservé à etablissement.gerer, comme les autres réglages — non que le
   * contenu soit secret (il est public par construction), mais parce que
   * fabriquer l'affiche officielle de la bibliothèque est un acte
   * d'administration.
   */
  @Get('qr.png')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.ETABLISSEMENT_GERER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'QR d’inscription de l’établissement (PNG)' })
  async qrPngEndpoint(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Res() res: Response,
    @Query('download') download?: string,
  ): Promise<void> {
    if (!tenant) throw new BadRequestException('Établissement non résolu.');
    const png = await qrPng(this.appUrl(), tenant.slug);
    res.setHeader('Content-Type', 'image/png');
    // `inline` par défaut : la même URL sert l'aperçu à l'écran. Forcer
    // `attachment` déclencherait un téléchargement jusque dans une balise
    // <img>, et l'aperçu resterait vide sans rien dire.
    const disposition = download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="qr-${tenant.slug}.png"`);
    res.end(png);
  }

  @Get('qr.pdf')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.ETABLISSEMENT_GERER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Affiche A4 imprimable avec le QR d’inscription' })
  async qrPdfEndpoint(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Res() res: Response,
  ): Promise<void> {
    if (!tenant) throw new BadRequestException('Établissement non résolu.');
    const record = await this.prisma.tenant.findUnique({ where: { id: tenant.id } });
    const bytes = await qrPosterPdf(this.appUrl(), tenant.slug, record?.name ?? tenant.name);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="affiche-qr-${tenant.slug}.pdf"`);
    res.end(Buffer.from(bytes));
  }

  /**
   * Descripteur lu par l'application mobile après le scan du QR :
   * l'adresse PUBLIQUE de l'API, le slug et le nom. Sans authentification —
   * ces trois informations sont exactement ce qu'un lecteur doit connaître
   * pour se connecter, et le QR les rend déjà publiques.
   *
   * Il est servi par l'ORIGINE que le QR fait ouvrir (le domaine de l'école),
   * pas par le domaine de l'API : l'application ne connaît que l'origine
   * scannée au moment où elle vient le chercher. La façade web le relaie sur
   * /.well-known/gafeso.json.
   */
  @Get('descriptor')
  @ApiOperation({ summary: 'Descripteur de connexion (API publique, slug, nom)' })
  async descriptor(@CurrentTenant() tenant: ResolvedTenant | null) {
    if (!tenant) throw new BadRequestException('Établissement non résolu.');
    const record = await this.prisma.tenant.findUnique({ where: { id: tenant.id } });
    // Pas de repli sur une chaîne vide : un descripteur dont le champ `api`
    // serait vide a l'air valide, se télécharge sans erreur, et laisse
    // l'application se connecter à nulle part. Mieux vaut une panne nommée,
    // côté serveur, que ce silence-là côté appareil.
    const api = this.config.get<string>('API_PUBLIC_URL')?.trim();
    if (!api) {
      throw new BadRequestException(
        'API_PUBLIC_URL n’est pas configurée : le descripteur de connexion serait inutilisable.',
      );
    }
    return {
      version: 1,
      api,
      tenant: tenant.slug,
      name: record?.name ?? tenant.name,
      enrollmentUrl: enrollmentUrl(this.appUrl(), tenant.slug),
    };
  }

  /**
   * Identité publique de l'école du domaine courant (nom, couleurs, locale).
   * Sans authentification : sert au branding des pages publiques (connexion).
   */
  @Get('current')
  @ApiOperation({ summary: 'Identité publique de l’école du domaine courant' })
  async current(@CurrentTenant() tenant: ResolvedTenant | null) {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    const record = await this.prisma.tenant.findUnique({
      where: { id: tenant.id },
      include: { settings: true },
    });
    return {
      name: record?.name ?? tenant.name,
      slug: tenant.slug,
      primaryColor: record?.settings?.primaryColor ?? '#0F2B46',
      secondaryColor: record?.settings?.secondaryColor ?? '#D97B2B',
      logoUrl: record?.settings?.logoUrl ?? null,
      locale: record?.settings?.locale ?? 'fr',
      // Vitrine (spec docs/spec-accueil-tenant.md) : palette neutre complète
      // (défauts appliqués) + toggle du motif décoratif.
      themeTokens: mergeHomeTokens(record?.settings?.themeTokens),
      latticeEnabled: record?.settings?.latticeEnabled ?? false,
      // Politique 2FA (non secrète) — pilote le toggle admin et l'UX de login.
      require2fa: record?.settings?.require2fa ?? false,
      // Adresse encodée dans le QR d'établissement. Exposée ici, et non
      // recalculée par le navigateur : l'administration peut se faire depuis
      // une adresse interne, et afficher `window.location.origin` montrerait
      // une adresse DIFFÉRENTE de celle réellement imprimée sur l'affiche.
      // Un écran qui prétend dire ce que contient le papier doit le lire à la
      // même source que le papier.
      enrollmentUrl: enrollmentUrl(
        this.config.get<string>('APP_URL') ?? '',
        tenant.slug,
      ),
    };
  }

  /**
   * Charge utile COMPLÈTE de la page d'accueil vitrine du domaine courant
   * (spec docs/spec-accueil-tenant.md) : identité + thème + contenu normalisé.
   * Sans authentification — c'est une page publique, rendue en SSR à partir
   * de cet unique appel. Renvoie un 404 « soft » (payload minimal) plutôt
   * qu'une 400 si le domaine est inconnu, pour ne pas casser le rendu.
   */
  @Get('home')
  @ApiOperation({ summary: 'Contenu complet de la page d’accueil du domaine courant' })
  async home(@CurrentTenant() tenant: ResolvedTenant | null) {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    const record = await this.prisma.tenant.findUnique({
      where: { id: tenant.id },
      include: { settings: true },
    });
    return {
      name: record?.name ?? tenant.name,
      slug: tenant.slug,
      primaryColor: record?.settings?.primaryColor ?? '#0F2B46',
      secondaryColor: record?.settings?.secondaryColor ?? '#D97B2B',
      themeTokens: mergeHomeTokens(record?.settings?.themeTokens),
      latticeEnabled: record?.settings?.latticeEnabled ?? false,
      content: normalizeHomeContent(record?.settings?.homepageContent),
    };
  }

  /**
   * Modifie les couleurs de l'école courante — jamais un tenantId arbitraire :
   * toujours celui résolu depuis le Host (multi-tenant strict). Réservé à
   * etablissement.gerer (que seul Administrateur porte par défaut).
   */
  @Patch('settings')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.ETABLISSEMENT_GERER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier les couleurs de l’école courante' })
  async updateSettings(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTenantSettingsDto,
    @ClientIp() ip?: string,
  ) {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    const result = await this.tenancy.updateSettings(tenant.id, dto);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.HOMEPAGE_UPDATE,
      targetType: 'homepage',
      targetId: tenant.id,
      // Trace ce qui a changé (sans le contenu volumineux).
      metadata: {
        changedHomepage: dto.homepageContent !== undefined,
        changedColors: dto.primaryColor !== undefined || dto.secondaryColor !== undefined,
        changedTheme: dto.themeTokens !== undefined,
      },
      ip,
    });
    return result;
  }

  /**
   * Téléverse une image de la vitrine (logo ou photo hero) dans le bucket
   * public « covers » et renvoie son URL. L'admin place ensuite cette URL dans
   * le contenu (identity.logoUrl / heroImageUrl) et enregistre via PATCH.
   * jpg/png/webp, 5 Mo max. Réservé à etablissement.gerer.
   */
  @Post('settings/image')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.ETABLISSEMENT_GERER)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Téléverser une image de la vitrine (logo / photo hero)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: ['logo', 'hero'] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  async uploadImage(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind?: string,
  ) {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    if (!file) throw new BadRequestException('Fichier requis (champ « file »).');
    const ext = IMAGE_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Format non pris en charge : jpg, png ou webp uniquement.');
    }
    const safeKind = kind === 'logo' ? 'logo' : 'hero';
    // Clé horodatée → pas de cache navigateur périmé au remplacement.
    const key = `home/${tenant.slug}/${safeKind}-${Date.now()}.${ext}`;
    const url = await this.storage.putCover(key, file.buffer, file.mimetype);
    return { url };
  }
}
