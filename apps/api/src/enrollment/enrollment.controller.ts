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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { EnrollmentService, TenantDb } from './enrollment.service';
import {
  CreateClassDto,
  EnrollStudentDto,
  UpdateClassDto,
} from './dto/enrollment.dto';

@ApiTags('enrollment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.CLASSES_GERER)
@Controller('enrollment')
export class EnrollmentController {
  constructor(
    private readonly enrollment: EnrollmentService,
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

  // ── Classes ─────────────────────────────────────────────────
  @Post('classes')
  @ApiOperation({
    summary: 'Créer une classe',
    description:
      'Le nom est normalisé (MAJUSCULES_UNDERSCORE) — c’est lui que référencent ' +
      'les règles d’accès et la liste des étudiants attendus.',
  })
  async createClass(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: CreateClassDto,
  ) {
    return this.enrollment.createClass(this.db(tenant), dto);
  }

  @Get('classes')
  @ApiOperation({ summary: 'Lister les classes (avec effectif actif)' })
  async listClasses(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.enrollment.listClasses(this.db(tenant));
  }

  @Get('classes/:id')
  @ApiOperation({ summary: 'Détail d’une classe (inscriptions)' })
  async getClass(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.enrollment.getClass(this.db(tenant), id);
  }

  @Patch('classes/:id')
  @ApiOperation({
    summary: 'Modifier une classe',
    description:
      'Un renommage est répercuté sur la classe active des étudiants concernés.',
  })
  async updateClass(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.enrollment.updateClass(this.db(tenant), id, dto);
  }

  @Delete('classes/:id')
  @ApiOperation({
    summary: 'Supprimer une classe',
    description:
      'Refusé si des inscriptions y sont rattachées, ou si des règles d’accès ' +
      'la référencent — une règle orpheline ne correspondrait plus à aucun ' +
      'étudiant, sans que rien ne le signale.',
  })
  async deleteClass(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    // Le tenantId permet de vérifier les règles d'accès, qui vivent dans
    // `public` et non dans le schéma de l'école. `db()` a déjà rejeté un
    // tenant non résolu.
    const db = this.db(tenant);
    return this.enrollment.deleteClass(db, id, tenant!.id);
  }

  @Get('classes/:name/expected-students')
  @ApiOperation({
    summary: 'Étudiants attendus d’une classe (liste pré-chargée, statut réclamé)',
  })
  async expectedStudents(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('name') name: string,
  ) {
    return this.enrollment.expectedStudentsOfClass(this.db(tenant), name);
  }

  // ── Inscriptions ────────────────────────────────────────────
  @Post('enroll')
  @ApiOperation({
    summary: 'Inscrire un étudiant dans une classe (année académique)',
    description:
      'Une inscription par étudiant et par année : ré-inscrire déplace ' +
      'l’étudiant. Met à jour sa classe active (utilisée par access-control).',
  })
  async enroll(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: EnrollStudentDto,
  ) {
    return this.enrollment.enrollStudent(this.db(tenant), dto);
  }

  @Get('enrollments')
  @ApiQuery({ name: 'className', required: false })
  @ApiQuery({ name: 'academicYear', required: false })
  @ApiOperation({ summary: 'Lister les inscriptions (filtres classe / année)' })
  async list(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query('className') className?: string,
    @Query('academicYear') academicYear?: string,
  ) {
    return this.enrollment.listEnrollments(this.db(tenant), className, academicYear);
  }

  @Delete('enrollments/:id')
  @ApiOperation({ summary: 'Désinscrire un étudiant (efface sa classe active)' })
  async unenroll(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.enrollment.unenrollStudent(this.db(tenant), id);
  }
}
