import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModuleActifGuard } from '../modules/module-actif.guard';
import { ModuleRequis } from '../modules/module-requis.decorator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { SruService, SruSearchResult } from './sru.service';

/**
 * Récupération de notices sur des serveurs SRU externes (BnF, LoC…). Réservé
 * au personnel qui gère le catalogue. Endpoint sous /cataloging (c'est un outil
 * de catalogage), sans dépendance au tenant (les cibles sont externes).
 */
@ApiTags('cataloging')
@Controller('cataloging')
export class SruController {
  constructor(private readonly sru: SruService) {}

  @Get('lookup')
  @UseGuards(ModuleActifGuard)
  @ModuleRequis('interoperabilite')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiBearerAuth()
  // Appels sortants vers des tiers → débit borné (anti-abus / anti-martèlement).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rechercher une notice sur les serveurs SRU (BnF, LoC…)' })
  async lookup(
    @Query('isbn') isbn?: string,
    @Query('q') q?: string,
  ): Promise<SruSearchResult> {
    return this.sru.search({ isbn, query: q });
  }
}
