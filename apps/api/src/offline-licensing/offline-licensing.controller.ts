import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { ClientIp } from '../audit/client-ip.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { FunctionsGuard } from '../auth/functions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { EntitlementsQueryDto, IssueLicenseDto, RegisterDeviceDto } from './dto/offline.dto';
import { OfflineDevicesService } from './offline-devices.service';
import { OfflineLicensesService } from './offline-licenses.service';

/**
 * Endpoints du cœur offline. Toutes les routes sont authentifiées (JwtAuthGuard,
 * qui vérifie aussi jeton↔tenant) et tenant-scopées via @CurrentTenant + forTenant.
 */
@ApiTags('offline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('offline')
export class OfflineLicensingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: OfflineDevicesService,
    private readonly licenses: OfflineLicensesService,
  ) {}

  private ctx(tenant: ResolvedTenant | null): { tenant: ResolvedTenant; db: ReturnType<PrismaService['forTenant']> } {
    if (!tenant) {
      throw new BadRequestException('Tenant non résolu : domaine inconnu ou en-tête X-Tenant manquant.');
    }
    return { tenant, db: this.prisma.forTenant(tenant.slug) };
  }

  @Post('devices')
  @ApiOperation({ summary: 'Enregistrer un appareil (clé publique) pour la lecture hors-ligne.' })
  registerDevice(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @ClientIp() ip: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    const { tenant: t, db } = this.ctx(tenant);
    return this.devices.register(db, t, user, ip, dto);
  }

  @Post('licenses')
  @ApiOperation({ summary: 'Émettre une licence hors-ligne (droit vérifié, CEK enveloppée, signée).' })
  issueLicense(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @ClientIp() ip: string,
    @Body() dto: IssueLicenseDto,
  ) {
    const { tenant: t, db } = this.ctx(tenant);
    return this.licenses.issue(db, t, user, ip, dto);
  }

  @Get('licenses/:id/status')
  @ApiOperation({
    summary: 'Statut d’une licence de l’appelant (rejoue le droit en ligne).',
    description:
      'Réservé au propriétaire de la licence : la vérification du droit ÉCRIT ' +
      '(elle révoque si l’accès est perdu), une lecture non autorisée pourrait ' +
      'donc révoquer la licence d’autrui.',
  })
  licenseStatus(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const { tenant: t, db } = this.ctx(tenant);
    return this.licenses.status(db, t, user, id);
  }

  @Get('licenses/:id/blob-url')
  @ApiOperation({ summary: 'URL signée du blob chiffré (licence active et à soi requise).' })
  blobUrl(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const { tenant: t, db } = this.ctx(tenant);
    return this.licenses.blobUrl(db, t, user, id);
  }

  @Post('entitlements')
  @ApiOperation({
    summary: 'Statut de plusieurs licences de l’appelant (lot).',
    description:
      'Borné aux licences de l’appelant. Une licence appartenant à un autre ' +
      'utilisateur ressort en « unknown » — l’appareil la conserve alors sans ' +
      'la purger, et son existence n’est pas confirmée.',
  })
  entitlements(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: EntitlementsQueryDto,
  ) {
    const { tenant: t, db } = this.ctx(tenant);
    return this.licenses.entitlements(db, t, user, dto.licenseIds);
  }

  @Post('licenses/:id/revoke')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({ summary: 'Révoquer une licence (personnel : catalogue.gerer).' })
  revoke(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @ClientIp() ip: string,
    @Param('id') id: string,
  ) {
    const { tenant: t, db } = this.ctx(tenant);
    return this.licenses.revoke(db, t, user, ip, id);
  }

  @Get('my-documents')
  @ApiOperation({ summary: 'Documents lisibles hors-ligne par l’utilisateur.' })
  myDocuments(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    const { tenant: t, db } = this.ctx(tenant);
    return this.licenses.myDocuments(db, t, user);
  }
}
