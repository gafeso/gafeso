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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { PatronsService, TenantDb } from './patrons.service';
import {
  ComptesALierDto,
  CreatePatronDto,
  ListPatronsDto,
  PatronLoansDto,
  UpdatePatronDto,
} from './dto/patron.dto';

@ApiTags('patrons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.ADHERENTS_GERER)
@Controller('patrons')
export class PatronsController {
  constructor(
    private readonly patrons: PatronsService,
    private readonly prisma: PrismaService,
  ) {}

  private db(tenant: ResolvedTenant | null): TenantDb {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return this.prisma.forTenant(tenant.slug);
  }

  @Post()
  @ApiOperation({
    summary: 'Inscrire un adhérent',
    description:
      'Code-barres de carte unique ; liaison optionnelle à un compte utilisateur du tenant.',
  })
  async create(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: CreatePatronDto,
  ) {
    return this.patrons.createPatron(this.db(tenant), dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les adhérents (filtre catégorie / code-barres)' })
  async list(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: ListPatronsDto,
  ) {
    return this.patrons.listPatrons(this.db(tenant), query);
  }

  /**
   * Comptes qu'on peut lier à une carte. ⚠ Placée AVANT `@Get(':id')` : Nest
   * résout dans l'ordre de déclaration, et `:id` capturerait « comptes-a-lier ».
   */
  @Get('comptes-a-lier')
  @ApiOperation({ summary: 'Comptes actifs non encore liés à une carte' })
  async comptesALier(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: ComptesALierDto,
  ) {
    return this.patrons.comptesALier(this.db(tenant), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fiche adhérent (prêts en cours et réservations comptés)' })
  async get(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.patrons.getPatron(this.db(tenant), id);
  }

  /**
   * Prêts d'un adhérent : EN COURS et HISTORIQUE paginé.
   *
   * ⚠ Route de PERSONNEL, gardée par `adherents.gerer` au niveau du contrôleur.
   * Elle sert la même requête que l'espace lecteur (`/reader/loans`), mais
   * désignée par patronId au lieu du compte connecté — voir
   * `PatronsService.loansOfPatron`. `/circulation/patrons/:id` ne rendait que
   * les prêts EN COURS : l'historique n'était atteignable par personne.
   */
  @Get(':id/loans')
  @ApiOperation({ summary: 'Prêts d’un adhérent (en cours + historique paginé)' })
  async loans(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Query() query: PatronLoansDto,
  ) {
    return this.patrons.loansOfPatron(this.db(tenant), id, {
      historyPage: query.page,
      historyLimit: query.limit,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un adhérent' })
  async update(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: UpdatePatronDto,
  ) {
    return this.patrons.updatePatron(this.db(tenant), id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Supprimer un adhérent (refusé si prêts ou réservations actifs)',
  })
  async remove(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.patrons.deletePatron(this.db(tenant), id);
  }
}
