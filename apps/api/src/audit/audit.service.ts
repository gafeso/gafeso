import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_ACTION_LABELS, AuditEntry } from './audit.actions';

export interface AuditListFilters {
  tenantId: string;
  actor?: string; // sous-chaîne d'email de l'acteur
  action?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Écrit une entrée d'audit — NON BLOQUANT et INFAILLIBLE côté appelant :
   * on ne rejette jamais et on ne bloque jamais l'action métier. En cas
   * d'échec (base indisponible…), on se contente d'un warning : perdre une
   * ligne de journal ne doit JAMAIS faire échouer une connexion, une
   * suppression, etc. Les appelants font `void audit.log(...)` (fire-and-forget)
   * ou peuvent l'`await` (les tests) sans risque de rejet.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId ?? null,
          actorId: entry.actorId ?? null,
          actorEmail: entry.actorEmail ?? null,
          actorRole: entry.actorRole ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          targetLabel: entry.targetLabel ?? null,
          ip: entry.ip ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Écriture du journal d'audit échouée (action=${entry.action}) : ${(error as Error).message}`,
      );
    }
  }

  /** Consultation paginée, TOUJOURS bornée au tenant courant (isolation applicative). */
  async list(filters: AuditListFilters) {
    const where: Prisma.AuditLogWhereInput = { tenantId: filters.tenantId };
    if (filters.action) where.action = filters.action;
    if (filters.actor?.trim()) {
      where.actorEmail = { contains: filters.actor.trim(), mode: 'insensitive' };
    }
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }

    const [total, entries] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
    ]);

    return {
      total,
      page: filters.page,
      totalPages: Math.ceil(total / filters.limit) || 1,
      entries,
    };
  }

  /**
   * Activité récente d'UN utilisateur sur lui-même — self-scopé : borné à la
   * fois par tenant ET par acteur. Ne demande AUCUNE permission admin : chacun
   * voit sa propre activité, jamais celle des autres. Le libellé est résolu ici
   * (côté serveur) pour éviter d'exposer le catalogue d'actions au front.
   */
  async listForActor(tenantId: string, actorId: string, limit = 10) {
    const rows = await this.prisma.auditLog.findMany({
      where: { tenantId, actorId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { action: true, ip: true, createdAt: true },
    });
    return rows.map((r) => ({
      action: r.action,
      label: AUDIT_ACTION_LABELS[r.action] ?? r.action,
      ip: r.ip,
      createdAt: r.createdAt,
    }));
  }
}
