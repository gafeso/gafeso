import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HoldStatus, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PatronsService } from '../patrons/patrons.service';

export type TenantDb = PrismaClient;

const DAY_MS = 24 * 3600 * 1000;
const ACTIVE_HOLD_STATUSES: HoldStatus[] = [HoldStatus.PENDING, HoldStatus.AVAILABLE];

/** Politique de renouvellement en ligne, défauts si aucun réglage stocké. */
export interface OnlineRenewalPolicy {
  enabled: boolean;
  max: number;
  days: number;
  refuseOverdue: boolean;
}

/** Jours de retard entamés (0 si à jour). */
/**
 * Espace lecteur (self-service). RÈGLE DE SÉCURITÉ centrale : le « lecteur » est
 * TOUJOURS l'utilisateur connecté (`userId` issu du JWT), jamais un identifiant
 * fourni par la requête. On résout son adhérent (`patron`) par `userId` unique ;
 * toutes les lectures sont donc structurellement bornées à ses propres données.
 */
@Injectable()
export class ReaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patrons: PatronsService,
  ) {}

  /** Adhérent lié à l'utilisateur connecté (ou null s'il n'a pas de carte). */
  resolvePatron(db: TenantDb, userId: string) {
    return db.patron.findUnique({ where: { userId } });
  }

  /** Politique de circulation en ligne complète (admin), défauts appliqués. */
  async getCirculationPolicy(tenantId: string) {
    const s = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    return {
      onlineRenewalEnabled: s?.onlineRenewalEnabled ?? true,
      onlineRenewalMax: s?.onlineRenewalMax ?? 2,
      onlineRenewalDays: s?.onlineRenewalDays ?? 14,
      onlineRenewalRefuseOverdue: s?.onlineRenewalRefuseOverdue ?? true,
      holdPickupDays: s?.holdPickupDays ?? 7,
    };
  }

  /** Met à jour la politique (PATCH partiel), upsert. Renvoie l'état complet. */
  async updateCirculationPolicy(
    tenantId: string,
    dto: {
      onlineRenewalEnabled?: boolean;
      onlineRenewalMax?: number;
      onlineRenewalDays?: number;
      onlineRenewalRefuseOverdue?: boolean;
      holdPickupDays?: number;
    },
  ) {
    const data = {
      ...(dto.onlineRenewalEnabled !== undefined && { onlineRenewalEnabled: dto.onlineRenewalEnabled }),
      ...(dto.onlineRenewalMax !== undefined && { onlineRenewalMax: dto.onlineRenewalMax }),
      ...(dto.onlineRenewalDays !== undefined && { onlineRenewalDays: dto.onlineRenewalDays }),
      ...(dto.onlineRenewalRefuseOverdue !== undefined && {
        onlineRenewalRefuseOverdue: dto.onlineRenewalRefuseOverdue,
      }),
      ...(dto.holdPickupDays !== undefined && { holdPickupDays: dto.holdPickupDays }),
    };
    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
    return this.getCirculationPolicy(tenantId);
  }

  /** Politique de renouvellement en ligne du tenant (défauts si non configurée). */
  async renewalPolicy(tenantId: string): Promise<OnlineRenewalPolicy> {
    const s = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    return {
      enabled: s?.onlineRenewalEnabled ?? true,
      max: s?.onlineRenewalMax ?? 2,
      days: s?.onlineRenewalDays ?? 14,
      refuseOverdue: s?.onlineRenewalRefuseOverdue ?? true,
    };
  }

  /**
   * Renouvellement en ligne d'un prêt par le lecteur lui-même.
   * SÉCURITÉ (anti-IDOR) : on charge le prêt par son id MAIS on exige qu'il
   * appartienne à l'adhérent du compte connecté — sinon 404 (on ne révèle pas
   * l'existence du prêt d'autrui). Puis application de la politique tenant, avec
   * un message clair par motif de refus.
   */
  async renewLoan(db: TenantDb, tenantId: string, userId: string, checkoutId: string, now: Date = new Date()) {
    const patron = await this.resolvePatron(db, userId);
    if (!patron) {
      throw new NotFoundException('Prêt en cours introuvable.');
    }
    const checkout = await db.checkout.findUnique({
      where: { id: checkoutId },
      include: { item: { include: { record: { select: { id: true, title: true } } } } },
    });
    // Introuvable, rendu, ou appartenant à quelqu'un d'autre → 404 identique.
    if (!checkout || checkout.returnDate || checkout.patronId !== patron.id) {
      throw new NotFoundException('Prêt en cours introuvable.');
    }

    const policy = await this.renewalPolicy(tenantId);
    if (!policy.enabled) {
      throw new ConflictException(
        'Le renouvellement en ligne est désactivé par votre établissement.',
      );
    }
    if (checkout.renewals >= policy.max) {
      throw new ConflictException(
        `Nombre maximum de renouvellements atteint (${policy.max}). Rapportez le document.`,
      );
    }
    if (policy.refuseOverdue && checkout.dueDate.getTime() < now.getTime()) {
      throw new ConflictException(
        'Ce prêt est en retard : renouvellement impossible, rapportez le document.',
      );
    }
    // Réservé par un AUTRE lecteur → refus (les siennes propres n'empêchent pas).
    const otherHolds = await db.hold.count({
      where: {
        recordId: checkout.item.record.id,
        status: { in: ACTIVE_HOLD_STATUSES },
        patronId: { not: patron.id },
      },
    });
    if (otherHolds > 0) {
      throw new ConflictException(
        'Ce document est réservé par un autre lecteur : renouvellement impossible.',
      );
    }

    const dueDate = new Date(now.getTime() + policy.days * DAY_MS);
    const updated = await db.checkout.update({
      where: { id: checkout.id },
      data: { dueDate, renewals: checkout.renewals + 1 },
    });
    return {
      checkoutId: checkout.id,
      title: checkout.item.record.title,
      dueDate,
      renewals: updated.renewals,
      remaining: Math.max(0, policy.max - updated.renewals),
    };
  }

  /**
   * Prêts du lecteur connecté : en cours (avec retards) + historique paginé +
   * compteurs. Aucun paramètre d'identité : tout est borné à `userId`.
   */
  async myLoans(
    db: TenantDb,
    userId: string,
    opts: { historyPage?: number; historyLimit?: number } = {},
    now: Date = new Date(),
  ) {
    const patron = await this.resolvePatron(db, userId);
    if (!patron) {
      // Compte sans carte de bibliothèque : rien à afficher, pas d'erreur.
      return {
        hasCard: false,
        current: [],
        history: { entries: [], total: 0, page: 1, totalPages: 1 },
        counters: { current: 0, overdue: 0 },
      };
    }

    // ⚠ DÉLÈGUE À PatronsService, sans réécrire la requête. C'est la même
    // question — « les prêts de cet adhérent » — posée sur une autre clé :
    // ici l'adhérent est résolu depuis le compte CONNECTÉ (règle de sécurité
    // en tête de ce fichier), là il est désigné par son identifiant derrière
    // `adherents.gerer`. Une seconde copie aurait fini par afficher deux
    // nombres différents pour le même prêt.
    const prets = await this.patrons.loansOfPatron(db, patron.id, opts, now);
    return { hasCard: true, ...prets };
  }
}
