import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { CreateClassDto, EnrollStudentDto, UpdateClassDto } from './dto/enrollment.dto';
import { currentAcademicYear, isValidAcademicYear } from './academic-year';
import { PrismaService } from '../prisma/prisma.service';

export type TenantDb = PrismaClient;

/** « l1 droit » → « L1_DROIT » (format référencé par les règles d'accès). */
export function normalizeClassName(name: string): string {
  return name.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

@Injectable()
export class EnrollmentService {
  // Les règles d'accès vivent dans le schéma `public` (clé tenantId), pas dans
  // celui de l'école : il faut le client partagé pour les consulter.
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────
  // Classes
  // ───────────────────────────────────────────────────────────
  async createClass(db: TenantDb, dto: CreateClassDto) {
    try {
      return await db.schoolClass.create({
        data: {
          name: normalizeClassName(dto.name),
          label: dto.label?.trim() ?? null,
          level: dto.level?.trim().toUpperCase() ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Une classe existe déjà avec ce nom.');
      }
      throw error;
    }
  }

  async listClasses(db: TenantDb) {
    const classes = await db.schoolClass.findMany({
      include: { _count: { select: { enrollments: true } } },
      orderBy: { name: 'asc' },
    });
    // Effectif réel = étudiants dont la classe active est celle-ci.
    const headcounts = await db.user.groupBy({
      by: ['className'],
      where: { className: { not: null }, role: UserRole.STUDENT },
      _count: { _all: true },
    });
    const byName = new Map(
      headcounts.map((h) => [h.className, h._count._all] as const),
    );
    return classes.map((c) => ({
      ...c,
      activeStudents: byName.get(c.name) ?? 0,
    }));
  }

  async getClass(db: TenantDb, id: string) {
    const schoolClass = await db.schoolClass.findUnique({
      where: { id },
      include: {
        enrollments: {
          include: {
            user: {
              select: {
                id: true,
                matricule: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        },
      },
    });
    if (!schoolClass) throw new NotFoundException('Classe introuvable.');
    return schoolClass;
  }

  async updateClass(db: TenantDb, id: string, dto: UpdateClassDto) {
    const existing = await db.schoolClass.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Classe introuvable.');

    const newName = dto.name ? normalizeClassName(dto.name) : undefined;
    try {
      return await db.$transaction(async (tx) => {
        const updated = await tx.schoolClass.update({
          where: { id },
          data: {
            name: newName,
            label: dto.label?.trim(),
            level: dto.level?.trim().toUpperCase(),
          },
        });
        // Renommage : répercuter sur la classe active des étudiants
        // (users.class_name est la référence utilisée par access-control).
        if (newName && newName !== existing.name) {
          await tx.user.updateMany({
            where: { className: existing.name },
            data: { className: newName },
          });
        }
        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Une classe existe déjà avec ce nom.');
      }
      throw error;
    }
  }

  async deleteClass(db: TenantDb, id: string, tenantId?: string) {
    const schoolClass = await db.schoolClass.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!schoolClass) throw new NotFoundException('Classe introuvable.');
    if (schoolClass._count.enrollments > 0) {
      throw new ConflictException(
        'Impossible de supprimer : des inscriptions sont rattachées à cette classe.',
      );
    }

    // RÈGLES D'ACCÈS QUI RÉFÉRENCENT CETTE CLASSE. Symétrique de la validation
    // faite à la création d'une règle (AccessControlService.addAccessRule).
    //
    // Sans ce contrôle, supprimer une classe laissait des règles orphelines
    // pointant vers un nom qui n'existe plus : elles ne correspondaient plus
    // JAMAIS à personne, en silence. C'est le défaut de la classe en texte
    // libre — fermé des deux côtés de la saisie — qui rentrait par la porte de
    // la suppression. Une école qui réorganise ses classes en fin d'année le
    // reproduisait à l'identique.
    if (tenantId) {
      const rules = await this.prisma.accessRule.findMany({
        where: { tenantId, className: schoolClass.name },
        select: { collection: { select: { name: true } } },
      });
      if (rules.length > 0) {
        const noms = [...new Set(rules.map((r) => r.collection?.name).filter(Boolean))];
        throw new ConflictException(
          `Impossible de supprimer : ${rules.length} règle(s) d'accès référencent la classe ` +
            `« ${schoolClass.name} »` +
            (noms.length > 0 ? ` (collections : ${noms.join(', ')})` : '') +
            `. Retirez ou modifiez ces règles d'abord — sinon elles ne ` +
            `correspondraient plus à aucun étudiant, sans que rien ne le signale.`,
        );
      }
    }

    await db.schoolClass.delete({ where: { id } });
    return { deleted: true };
  }

  // ───────────────────────────────────────────────────────────
  // Inscriptions
  // ───────────────────────────────────────────────────────────
  /**
   * Inscrit un étudiant dans une classe pour une année académique.
   * Une seule inscription par étudiant et par année : ré-inscrire déplace
   * l'étudiant. La classe active (users.class_name) est mise à jour — c'est
   * elle que lisent access-control et l'OPAC.
   */
  async enrollStudent(db: TenantDb, dto: EnrollStudentDto) {
    const user = await db.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Étudiant introuvable.');
    if (user.role !== UserRole.STUDENT) {
      throw new BadRequestException('Seul un compte étudiant peut être inscrit dans une classe.');
    }

    const className = normalizeClassName(dto.className);
    const schoolClass = await db.schoolClass.findUnique({ where: { name: className } });
    if (!schoolClass) throw new NotFoundException(`Classe « ${className} » introuvable.`);

    // Année omise = année courante, calculée ICI. Elle l'était côté navigateur,
    // sur l'année CIVILE — donc fausse de janvier à août (voir academic-year.ts).
    const academicYear = dto.academicYear ?? currentAcademicYear();
    if (!isValidAcademicYear(academicYear)) {
      throw new BadRequestException(
        `Année académique « ${academicYear} » invalide : deux années consécutives attendues (ex. 2026-2027).`,
      );
    }

    return db.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.upsert({
        where: {
          userId_academicYear: {
            userId: user.id,
            academicYear,
          },
        },
        create: {
          userId: user.id,
          classId: schoolClass.id,
          academicYear,
        },
        update: { classId: schoolClass.id }, // ré-inscription = changement de classe
      });
      await tx.user.update({
        where: { id: user.id },
        data: { className },
      });
      return { enrollment, className };
    });
  }

  /** Désinscrit un étudiant (année donnée) et efface sa classe active si c'était celle-là. */
  async unenrollStudent(db: TenantDb, enrollmentId: string) {
    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { schoolClass: true, user: true },
    });
    if (!enrollment) throw new NotFoundException('Inscription introuvable.');

    await db.$transaction(async (tx) => {
      await tx.enrollment.delete({ where: { id: enrollmentId } });
      if (enrollment.user.className === enrollment.schoolClass.name) {
        await tx.user.update({
          where: { id: enrollment.userId },
          data: { className: null },
        });
      }
    });
    return { deleted: true };
  }

  async listEnrollments(db: TenantDb, className?: string, academicYear?: string) {
    return db.enrollment.findMany({
      where: {
        ...(className
          ? { schoolClass: { name: normalizeClassName(className) } }
          : {}),
        ...(academicYear ? { academicYear } : {}),
      },
      include: {
        user: {
          select: { id: true, matricule: true, firstName: true, lastName: true },
        },
        schoolClass: { select: { name: true, label: true } },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  /** Étudiants attendus (liste pré-chargée) d'une classe, avec leur statut de réclamation. */
  async expectedStudentsOfClass(db: TenantDb, className: string) {
    const name = normalizeClassName(className);
    const expected = await db.expectedStudent.findMany({
      where: { className: name },
      orderBy: { lastName: 'asc' },
    });
    return {
      className: name,
      total: expected.length,
      claimed: expected.filter((e) => e.claimed).length,
      students: expected,
    };
  }
}
