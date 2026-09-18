import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HoldStatus, ItemStatus, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../accounts/mail/mail.service';
import { CirculationService } from './circulation.service';
import { HOLD_PICKUP_DAYS } from './circulation-rules';
import { PatronsService } from '../patrons/patrons.service';
import { nomDeLAdherent } from '../patrons/noms-divergents';

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
    let notification: Awaited<ReturnType<typeof this.notifyAvailable>> | null = null;
    // Mis de côté immédiatement (un exemplaire était libre) → email au lecteur.
    if (result.readyForPickup) {
      notification = await this.notifyAvailable(db, tenantId, now);
    }
    return {
      readyForPickup: result.readyForPickup,
      queuePosition: result.queuePosition,
      pickupDays: result.readyForPickup ? pickupDays : undefined,
      /**
       * ⚠ CE QUI N'A PAS PU ÊTRE ENVOYÉ. Vide dans le cas courant. Non vide,
       * l'écran doit le DIRE : sans ça, le lecteur n'est jamais prévenu et son
       * document repart au suivant à l'expiration.
       */
      nonPrevenus: notification?.nonPrevenus ?? [],
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
    // ⚠ Annuler PROMEUT le suivant : c'est lui qu'on notifie, et c'est lui qui
    // peut n'être jamais prévenu.
    const notification = await this.notifyAvailable(db, tenantId, now);
    return { ...result, nonPrevenus: notification.nonPrevenus };
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
        // ⚠ `firstName`/`lastName` de la FICHE : elle fait autorité sur le nom,
        // le compte n'est qu'un repli (voir `nomDeLAdherent`).
        patron: {
          select: {
            firstName: true,
            lastName: true,
            user: { select: { email: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    let sent = 0;
    // ⚠ CE QUI N'A PAS PU ÊTRE ENVOYÉ REMONTE, il ne se contente pas d'être
    // journalisé. Le service mesurait déjà son issue — c'était l'un des quatre
    // mensonges corrigés le matin — mais ses TROIS appelants la jetaient : le
    // guichet ne savait pas que le lecteur n'avait pas été prévenu.
    //
    // Or la chaîne complète est celle-ci : un courriel qui échoue sans bruit,
    // plus un écran qui ne dit pas l'échéance de retrait, et le document repart
    // à la personne suivante sans que celui qui l'attendait ait jamais rien su.
    // Le journal ne suffit pas : personne ne le lit au comptoir.
    const nonPrevenus: { holdId: string; titre: string; motif: string }[] = [];
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
        //
        // ⚠ MAIS ON LE DIT. C'est le cas le plus silencieux des trois : aucun
        // échec technique, aucune exception, et un lecteur qui ne sera JAMAIS
        // prévenu — sans nouvelle tentative, puisqu'on garde `notifiedAt`. Le
        // guichet doit le savoir au moment où il met le document de côté.
        nonPrevenus.push({
          holdId: hold.id,
          titre: hold.record.title,
          motif: 'aucun_destinataire',
        });
        continue;
      }
      try {
        const resultat = await this.mail.sendHoldAvailable(email, {
          // La fiche fait autorité : un nom corrigé par la bibliothécaire
          // doit apparaître dans le courriel qu'on lui envoie.
          name: nomDeLAdherent(hold.patron),
          title: hold.record.title,
          pickupDays,
          expiryDate: hold.expiryDate,
        });
        // ⚠ `sent += 1` COMPTAIT DES COURRIELS JAMAIS PARTIS. `MailService`
        // traitait « SMTP absent » comme un succès : le compteur enflait, et
        // `notifiedAt` restait posé — donc le lecteur n'était jamais prévenu
        // que son document l'attendait, et le guichet croyait l'avoir averti.
        // Même traitement que l'échec SMTP juste en dessous : on relâche la
        // réservation pour retenter.
        if (!resultat.sent) {
          await db.hold.updateMany({ where: { id: hold.id }, data: { notifiedAt: null } });
          nonPrevenus.push({
            holdId: hold.id,
            titre: hold.record.title,
            motif: resultat.reason,
          });
          this.logger.warn(
            `Email de réservation NON envoyé à ${email} (hold ${hold.id}) : ` +
              `${resultat.reason}${resultat.detail ? ` — ${resultat.detail}` : ''} — sera retenté.`,
          );
          continue;
        }
        sent += 1;
      } catch (error) {
        // Échec SMTP : on relâche la réservation pour retenter plus tard.
        await db.hold.updateMany({ where: { id: hold.id }, data: { notifiedAt: null } });
        nonPrevenus.push({
          holdId: hold.id,
          titre: hold.record.title,
          motif: 'smtp_error',
        });
        this.logger.warn(
          `Email de réservation non envoyé à ${email} (hold ${hold.id}) : ` +
            `${(error as Error).message} — sera retenté.`,
        );
      }
    }
    return { sent, nonPrevenus };
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
