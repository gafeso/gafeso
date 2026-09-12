import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { EncadrementsService } from './encadrements.service';
import { MesEncadrementsDto } from './dto/mes-encadrements.dto';

/**
 * « MES ENCADREMENTS » — P6-3, versant API.
 *
 * ⚠ ELLE EXIGE `encadrements.voir` — décision de Jean, 12 septembre 2026.
 *
 * J'avais tranché l'inverse : puisque la route ne rend que des données sur
 * l'appelant, une permission que tout le monde devrait recevoir n'est pas une
 * permission. L'arbitrage lui revenait — créer une fonction et la poser sur un
 * rôle EST un élargissement de droits —, et il a tranché pour la fonction.
 *
 * **Ce qui reste vrai et porte tout le reste : l'AUTO-PORTAGE.** L'identifiant
 * n'est pas un paramètre, il vient du jeton, et il n'existe aucun chemin pour
 * en passer un autre. La fonction dit QUI a l'écran ; l'auto-portage dit que
 * l'écran ne montre jamais le travail d'un collègue. Les deux sont nécessaires,
 * et le second est une propriété TESTÉE — `encadrements.spec.ts` refuse même
 * qu'un `@Param` apparaisse dans ce fichier.
 *
 * ⚠ CE QUI RENDRAIT CETTE FORME FAUSSE, et il faut le dire pour qu'on sache
 * quand la reprendre : le jour où l'écran montre les encadrements d'UN AUTRE —
 * un chef de département qui consulte ceux de son équipe. Ce n'est plus la même
 * route, et il lui faudra sa propre fonction ; `encadrements.voir` ne doit pas
 * grossir pour l'absorber. C'est la faute d'`etablissement.gerer`, qui a déjà
 * été payée une fois.
 */
@ApiTags('encadrements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.ENCADREMENTS_VOIR)
@Controller('encadrements')
export class EncadrementsController {
  constructor(
    private readonly encadrements: EncadrementsService,
    private readonly prisma: PrismaService,
  ) {}

  private db(tenant: ResolvedTenant | null): PrismaClient {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return this.prisma.forTenant(tenant.slug);
  }

  @Get('miens')
  @ApiOperation({
    summary: 'Les mémoires et thèses que J’AI dirigés',
    description:
      'Rend `ficheLiee` : un compte non rattaché à sa fiche d’auteur ne peut ' +
      'pas avoir d’encadrements, et ce n’est PAS la même chose que « aucun ' +
      'encadrement ». L’écran doit lire ce champ avant de conclure — sinon il ' +
      'affirme à un enseignant qu’il n’a rien dirigé.',
  })
  miens(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Query() query: MesEncadrementsDto,
  ) {
    return this.encadrements.mesEncadrements(this.db(tenant), user.sub, query);
  }

  @Get('miens.csv')
  @ApiOperation({
    summary: 'Export CSV de mes encadrements — la pièce du dossier CCI',
    description:
      'NON paginé : une pièce justificative tronquée sans le dire serait un ' +
      'faux dans un dossier de promotion. Rend l’identifiant de chaque notice ' +
      'et non une adresse — l’API ne connaît pas le domaine public de l’école.',
  })
  async miensCsv(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const csv = await this.encadrements.mesEncadrementsCsv(this.db(tenant), user.sub);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mes-encadrements.csv"');
    res.end(csv);
  }
}
