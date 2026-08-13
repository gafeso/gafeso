import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { ClientIp } from '../audit/client-ip.decorator';
import { CategoriesService, TenantDb } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private ctx(tenant: ResolvedTenant | null): { db: TenantDb; slug: string } {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return { db: this.prisma.forTenant(tenant.slug), slug: tenant.slug };
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les catégories (domaines) de l’école',
    description: 'Alimente la liste déroulante de saisie des notices et la constellation.',
  })
  async list(@CurrentTenant() tenant: ResolvedTenant | null) {
    const { db } = this.ctx(tenant);
    return this.categories.list(db);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une catégorie' })
  async create(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: CreateCategoryDto,
  ) {
    const { db } = this.ctx(tenant);
    return this.categories.create(db, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Renommer une catégorie',
    description: 'Répercuté sur les notices déjà classées dans cette catégorie (réindexées).',
  })
  async update(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const { db, slug } = this.ctx(tenant);
    return this.categories.update(db, slug, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Supprimer une catégorie',
    description: 'Refusé si des notices portent encore cette catégorie.',
  })
  async remove(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
  ) {
    const { db } = this.ctx(tenant);
    const result = await this.categories.remove(db, id);
    void this.audit.log({
      tenantId: tenant?.id ?? null,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.CATEGORY_DELETE,
      targetType: 'category',
      targetId: id,
      ip,
    });
    return result;
  }
}
