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
import { CreatePatronDto, ListPatronsDto, UpdatePatronDto } from './dto/patron.dto';

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

  @Get(':id')
  @ApiOperation({ summary: 'Fiche adhérent (prêts en cours et réservations comptés)' })
  async get(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.patrons.getPatron(this.db(tenant), id);
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
