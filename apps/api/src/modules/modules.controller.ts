import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { ModulesService } from './modules.service';
import { ModuleActivationDto } from './dto/module-activation.dto';

@ApiTags('modules')
@UseGuards(JwtAuthGuard)
@Controller('modules')
export class ModulesController {
  constructor(private readonly modules: ModulesService) {}

  private requireTenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return tenant;
  }

  /**
   * État des modules de l'établissement courant.
   *
   * ⚠ LECTURE OUVERTE À TOUT COMPTE AUTHENTIFIÉ, DÉLIBÉRÉMENT. Le front doit
   * filtrer son menu sur l'état RÉEL (P4-3) : exiger `modules.gerer` pour LIRE
   * l'état reviendrait à n'autoriser ce filtrage qu'à l'administrateur, et tous
   * les autres verraient des entrées menant à des routes refusées — « refuser
   * sans cacher laisse une interface qui ment ».
   *
   * Ce qui sort ici n'est pas sensible : la liste des modules du produit et un
   * booléen par établissement. Le POUVOIR de les changer, lui, exige
   * `modules.gerer` (voir PATCH ci-dessous).
   */
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'État des modules de l’établissement courant' })
  async etat(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.modules.etat(this.requireTenant(tenant).id);
  }

  @Patch(':id')
  @UseGuards(FunctionsGuard)
  @RequiresFunctions(FONCTIONS.MODULES_GERER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Activer ou désactiver un module pour l’établissement courant',
    description:
      'Aucune donnée n’est supprimée : les amendes dues, l’historique des ' +
      'rappels et les notices exposées restent intacts, et une réactivation ' +
      'les retrouve tels quels.',
  })
  async changer(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: ModuleActivationDto,
  ) {
    return this.modules.changerActivation(this.requireTenant(tenant).id, id, dto.actif);
  }
}
