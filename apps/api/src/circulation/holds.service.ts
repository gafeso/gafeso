import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HoldStatus, ItemStatus, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../accounts/mail/mail.service';
import { CirculationService } from './circulation.service';
import { HOLD_PICKUP_DAYS } from './circulation-rules';
import { PatronsService } from '../patrons/patrons.service';

export type TenantDb = PrismaClient;

const DAY_MS = 24 * 3600 * 1000;
const ACTIVE_HOLD_STATUSES: HoldStatus[] = [HoldStatus.PENDING, HoldStatus.AVAILABLE];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Réservations côté lecteur + notifications de mise à disposition + expiration.
 * Vit dans le module circulation (le retour au guichet déclenche l'email), et
 * est réutilisé par le module reader pour le self-service.
 *
 * SÉCURITÉ (anti-IDOR) : `placeHold`/`cancelHold`/`myHolds` sont bornés à
 * l'adhérent du compte connecté (`userId`), jamais à un identifiant de requête.
 */
@Injectable()
export class HoldsService {
  private readonly logger = new Logger(HoldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly circulation: CirculationService,
    private readonly patrons: PatronsService,
  ) {}

  private async holdPickupDays(tenantId: string): Promise<number> {
    const s = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    return s?.holdPickupDays ?? HOLD_PICKUP_DAYS;
  }

  private patronForUser(db: TenantDb, userId: string) {
    return db.patron.findUnique({ where: { userId } });
  }

  /**
   * Résout l'adhérent du compte connecté, en le créant à la volée s'il n'en a
   * pas encore. La création vit désormais dans PatronsService.cardForUser :
   * elle est aussi le point d'entrée de la carte de lecteur, et deux chemins de
   * création divergeraient un jour.
   */
  private ensurePatron(db: TenantDb, userId: string) {
    return this.patrons.cardForUser(db, userId);
  }

  /** Position dans la file (1 = tête) d'une réservation PENDING. */
  private async positionOf(
    db: TenantDb,
    hold: { recordId: string; priority: number; createdAt: Date },
  ): Promise<number> {
    const ahead = await db.hold.count({
      where: {
        recordId: hold.recordId,
        status: { in: ACTIVE_HOLD_STATUSES },
        OR: [
          { priority: { lt: hold.priority } },
          { priority: hold.priority, createdAt: { lt: hold.createdAt } },
        ],
      },
    });
    return ahead + 1;
  }

  /** Poser une réservation pour le lecteur connecté. */
  async placeHold(db: TenantDb, tenantId: string, userId: string, recordId: string, now: Date = new Date()) {
    const patron = await this.ensurePatron(db, userId);
    const pickupDays = await this.holdPickupDays(tenantId);
    const result = await this.circulation.placeHoldForPatron(db, recordId, patron.id, now, pickupDays);
    // Mis de côté immédiatement (un exemplaire était libre) → email au lecteur.
    if (result.readyForPickup) {
      await this.notifyAvailable(db, tenantId, now);
    }
    return {
      readyForPickup: result.readyForPickup,
      queuePosition: result.queuePosition,
      pickupDays: result.readyForPickup ? pickupDays : undefined,
    };
  }

  /** Mes réservations actives, avec la position dans la file. */
  async myHolds(db: TenantDb, userId: string, _now: Date = new Date()) {
    const patron = await this.patronForUser(db, userId);
    if (!patron) return { hasCard: false, holds: [] as unknown[] };
    const holds = await db.hold.findMany({
      where: { patronId: patron.id, status: { in: ACTIVE_HOLD_STATUSES } },
      include: { record: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const withPosition = await Promise.all(
      holds.map(async (h) => ({
        holdId: h.id,
        recordId: h.record.id,
        title: h.record.title,
        status: h.status,
        // AVAILABLE = mis de côté (retrait au comptoir) → position 0.
        position: h.status === HoldStatus.AVAILABLE ? 0 : await this.positionOf(db, h),
        expiryDate: h.expiryDate,
      })),
    );
    return { hasCard: true, holds: withPosition };
  }

  /**
   * Annuler MA réservation (anti-IDOR : doit m'appartenir, sinon 404). Peut
   * promouvoir le suivant si un exemplaire était mis de côté → on le notifie.
   */
  async cancelHold(db: TenantDb, tenantId: string, userId: string, holdId: string, now: Date = new Date()) {
    const patron = await this.patronForUser(db, userId);
    const hold = patron ? await db.hold.findUnique({ where: { id: holdId } }) : null;
    if (!hold || hold.patronId !== patron!.id || !ACTIVE_HOLD_STATUSES.includes(hold.status)) {
      throw new NotFoundException('Réservation active introuvable.');
    }
    const result = await this.circulation.cancelHold(db, holdId, now);
    await this.notifyAvailable(db, tenantId, now);
    return result;
  }

  /**
   * Envoie l'email « réservation disponible » au premier de la file, de façon
   * IDEMPOTENTE : la colonne `notifiedAt` est RÉSERVÉE (updateMany conditionnel)
   * avant l'envoi → jamais deux emails, même en concurrence / après redémarrage.
   * Un échec SMTP réinitialise `notifiedAt` pour retenter au passage suivant.
   */
  async notifyAvailable(db: TenantDb, tenantId: string, now: Date = new Date()) {
    const pickupDays = await this.holdPickupDays(tenantId);
    const ready = await db.hold.findMany({
      where: { status: HoldStatus.AVAILABLE, notifiedAt: null },
      include: {
        record: { select: { title: true } },
        patron: { select: { user: { select: { email: true, firstName: true, lastName: true } } } },
      },
    });
    let sent = 0;
    for (const hold of ready) {
      // Réservation atomique du droit d'envoi (anti-double-envoi).
      const claimed = await db.hold.updateMany({
        where: { id: hold.id, notifiedAt: null },
        data: { notifiedAt: now },
      });
      if (claimed.count !== 1) continue;

      const user = hold.patron.user;
      const email = user?.email?.trim() ?? '';
      if (!email || !isValidEmail(email)) {
        // Pas d'email exploitable : on garde `notifiedAt` posé (retrait au
        // guichet), on ne rescanne pas indéfiniment.
        continue;
      }
      try {
        await this.mail.sendHoldAvailable(email, {
          name: user ? `${user.firstName} ${user.lastName}`.trim() : null,
          title: hold.record.title,
          pickupDays,
          expiryDate: hold.expiryDate,
        });
        sent += 1;
      } catch (error) {
        // Échec SMTP : on relâche la réservation pour retenter plus tard.
        await db.hold.updateMany({ where: { id: hold.id }, data: { notifiedAt: null } });
        this.logger.warn(
          `Email de réservation non envoyé à ${email} (hold ${hold.id}) : ` +
            `${(error as Error).message} — sera retenté.`,
        );
      }
    }
    return { sent };
  }

  /**
   * Fait expirer les mises de côté dépassées (statut AVAILABLE, expiryDate
   * passée) → EXPIRED, puis promeut le suivant de la file (nouvelle fenêtre de
   * retrait) ou libère l'exemplaire. Notifie les nouveaux promus.
   */
  async expireStale(db: TenantDb, tenantId: string, now: Date = new Date()) {
    const pickupDays = await this.holdPickupDays(tenantId);
    const stale = await db.hold.findMany({
      where: { status: HoldStatus.AVAILABLE, expiryDate: { lt: now } },
    });
    for (const hold of stale) {
      await db.$transaction(async (tx) => {
        const expired = await tx.hold.updateMany({
          where: { id: hold.id, status: HoldStatus.AVAILABLE },
          data: { status: HoldStatus.EXPIRED },
        });
        if (expired.count !== 1) return; // déjà traité entre-temps
        const next = await tx.hold.findFirst({
          where: { recordId: hold.recordId, status: HoldStatus.PENDING },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        });
        if (next) {
          await tx.hold.update({
            where: { id: next.id },
            data: {
              status: HoldStatus.AVAILABLE,
              expiryDate: new Date(now.getTime() + pickupDays * DAY_MS),
              notifiedAt: null,
            },
          });
        } else {
          const heldItem = await tx.item.findFirst({
            where: { recordId: hold.recordId, status: ItemStatus.ON_HOLD },
          });
          if (heldItem) {
            await tx.item.update({
              where: { id: heldItem.id },
              data: { status: ItemStatus.AVAILABLE },
            });
          }
        }
      });
    }
    await this.notifyAvailable(db, tenantId, now);
    return { expired: stale.length };
  }

  /** Balaye tous les tenants actifs (expiration + notification de rattrapage). */
  async processAllTenants(now: Date = new Date()) {
    const tenants = await this.prisma.tenant.findMany({ where: { status: 'ACTIVE' } });
    for (const tenant of tenants) {
      try {
        await this.expireStale(this.prisma.forTenant(tenant.slug), tenant.id, now);
      } catch (error) {
        this.logger.error(
          `Réservations : échec du tenant "${tenant.slug}" — ${(error as Error).message}`,
        );
      }
    }
  }
}
