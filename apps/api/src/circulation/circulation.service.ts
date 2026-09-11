import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HoldStatus,
  ItemStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  canRenew,
  computeFine,
  HOLD_PICKUP_DAYS,
  resolveRule,
} from './circulation-rules';
import { CheckoutDto, CreateRuleDto, PlaceHoldDto, UpdateRuleDto } from './dto/circulation.dto';
import { DEFAULT_DUE_TIME, DEFAULT_TIMEZONE, computeDueAt } from './due-time';
import { nomsDivergents } from '../patrons/noms-divergents';

/**
 * Réglages d'échéance de l'établissement. Passés par l'appelant, qui les lit
 * dans `public.tenant_settings` — le service travaille sur le schéma tenant et
 * n'y a pas accès. Absents, on retombe sur les défauts : 16 h, Ouagadougou.
 */
export interface DueSettings {
  loanDueTime?: string | null;
  timezone?: string | null;
  /**
   * Le module `amendes` est-il actif pour cet établissement ? (P4-3)
   *
   * ⚠ `undefined` VAUT ACTIF, délibérément : un module absent du registre est
   * actif (décision 8), donc un appelant qui omettrait ce réglage garde le
   * comportement d'avant. Aucune école ne voit ses amendes s'éteindre par un
   * oubli de câblage — le sens inverse serait catastrophique et silencieux.
   *
   * ⚠ ET CE N'EST PAS UNE GARDE DE ROUTE. Rendre un document appartient à la
   * CIRCULATION, qui est du noyau : `POST /circulation/return` doit fonctionner
   * dans une école qui a éteint les amendes. L'extinction agit par une BRANCHE
   * — le tarif vaut zéro — et non par un refus.
   */
  amendesActives?: boolean;
}

/**
 * Tarif applicable, module `amendes` compris.
 *
 * ⚠ TROIS SITES DE CALCUL, PAS DEUX. Un premier relevé n'en avait vu que deux
 * (`grep` sur une fenêtre trop courte) : le troisième aurait continué
 * d'accumuler des amendes dans une école qui les a éteintes, et rien ne
 * l'aurait signalé. D'où cette fonction — un seul endroit à lire, et un test
 * qui compte les appels.
 */
export function tarifApplicable(finePerDay: number, settings?: DueSettings): number {
  return settings?.amendesActives === false ? 0 : finePerDay;
}

function dueAt(borrowedAt: Date, days: number, settings?: DueSettings): Date {
  return computeDueAt(
    borrowedAt,
    days,
    settings?.loanDueTime ?? DEFAULT_DUE_TIME,
    settings?.timezone ?? DEFAULT_TIMEZONE,
  );
}

export type TenantDb = PrismaClient;

const DAY_MS = 24 * 3600 * 1000;
const ACTIVE_HOLD_STATUSES: HoldStatus[] = [HoldStatus.PENDING, HoldStatus.AVAILABLE];

@Injectable()
export class CirculationService {
  // ───────────────────────────────────────────────────────────
  // Prêt
  // ───────────────────────────────────────────────────────────
  async checkout(
    db: TenantDb,
    dto: CheckoutDto,
    now: Date = new Date(),
    settings?: DueSettings,
  ) {
    const item = await db.item.findUnique({
      where: { barcode: dto.itemBarcode.trim() },
      include: { record: { select: { id: true, title: true } } },
    });
    if (!item) throw new NotFoundException('Exemplaire introuvable.');

    const patron = await db.patron.findUnique({
      where: { barcode: dto.patronBarcode.trim() },
    });
    if (!patron) throw new NotFoundException('Adhérent introuvable.');
    if (patron.expiryDate && patron.expiryDate.getTime() < now.getTime()) {
      throw new ForbiddenException('Carte d’adhérent expirée.');
    }

    const rules = await db.circulationRule.findMany({
      where: { patronCategory: patron.category },
    });
    const rule = resolveRule(rules, patron.category, item.itemType);

    const openCheckouts = await db.checkout.count({
      where: { patronId: patron.id, returnDate: null },
    });
    if (openCheckouts >= rule.maxCheckouts) {
      throw new ConflictException(
        `Plafond de prêts atteint (${rule.maxCheckouts} simultanés pour la catégorie « ${patron.category} »).`,
      );
    }

    // Un exemplaire mis de côté (ON_HOLD) ne part qu'avec le réservataire.
    let holdToFulfill: string | null = null;
    if (item.status === ItemStatus.ON_HOLD) {
      const readyHold = await db.hold.findFirst({
        where: { recordId: item.recordId, status: HoldStatus.AVAILABLE },
        orderBy: { createdAt: 'asc' },
      });
      if (!readyHold || readyHold.patronId !== patron.id) {
        throw new ConflictException(
          'Exemplaire mis de côté pour un autre adhérent (réservation).',
        );
      }
      holdToFulfill = readyHold.id;
    } else if (item.status !== ItemStatus.AVAILABLE) {
      throw new ConflictException(
        `Exemplaire non disponible (statut : ${item.status}).`,
      );
    }

    // Jours CALENDAIRES à l'heure d'échéance de l'école, plus 14 × 24 h :
    // deux emprunts du même jour ont désormais la même échéance.
    const dueDate = dueAt(now, rule.loanPeriodDays, settings);

    const checkout = await db.$transaction(async (tx) => {
      // Mise à jour CONDITIONNELLE : l'exemplaire doit encore être dans l'état
      // vérifié plus haut. Deux prêts simultanés du même exemplaire ne peuvent
      // pas tous les deux réussir (le second échoue proprement en 409).
      const claimed = await tx.item.updateMany({
        where: { id: item.id, status: item.status },
        data: { status: ItemStatus.CHECKED_OUT },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'Exemplaire pris par une autre opération à l’instant — rescannez.',
        );
      }
      const created = await tx.checkout.create({
        data: {
          itemId: item.id,
          patronId: patron.id,
          checkoutDate: now,
          dueDate,
        },
      });
      if (holdToFulfill) {
        await tx.hold.update({
          where: { id: holdToFulfill },
          data: { status: HoldStatus.FULFILLED },
        });
      }
      return created;
    });

    return {
      checkout,
      title: item.record.title,
      dueDate,
      rule: { loanPeriodDays: rule.loanPeriodDays, finePerDay: rule.finePerDay },
    };
  }

  // ───────────────────────────────────────────────────────────
  // Retour
  // ───────────────────────────────────────────────────────────
  async returnItem(
    db: TenantDb,
    itemBarcode: string,
    now: Date = new Date(),
    pickupDays: number = HOLD_PICKUP_DAYS,
    settings?: DueSettings,
  ) {
    const checkout = await db.checkout.findFirst({
      where: { returnDate: null, item: { barcode: itemBarcode.trim() } },
      include: { item: true, patron: true },
    });
    if (!checkout) {
      throw new NotFoundException('Aucun prêt en cours pour cet exemplaire.');
    }

    const rules = await db.circulationRule.findMany({
      where: { patronCategory: checkout.patron.category },
    });
    const rule = resolveRule(rules, checkout.patron.category, checkout.item.itemType);
    const fine = computeFine(
        checkout.dueDate,
        now,
        tarifApplicable(rule.finePerDay, settings),
        settings?.timezone ?? DEFAULT_TIMEZONE,
      );

    // Prochaine réservation en attente sur cette notice ?
    const nextHold = await db.hold.findFirst({
      where: { recordId: checkout.item.recordId, status: HoldStatus.PENDING },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    await db.$transaction(async (tx) => {
      // Clôture CONDITIONNELLE : si le prêt a déjà été rendu entre-temps
      // (double scan), la seconde opération échoue proprement.
      const closed = await tx.checkout.updateMany({
        where: { id: checkout.id, returnDate: null },
        data: { returnDate: now, fineAmount: fine.amountXof },
      });
      if (closed.count === 0) {
        throw new ConflictException('Ce prêt vient déjà d’être clôturé.');
      }
      if (nextHold) {
        // L'exemplaire est mis de côté pour le prochain réservataire.
        await tx.hold.update({
          where: { id: nextHold.id },
          data: {
            status: HoldStatus.AVAILABLE,
            expiryDate: new Date(now.getTime() + pickupDays * DAY_MS),
          },
        });
        await tx.item.update({
          where: { id: checkout.itemId },
          data: { status: ItemStatus.ON_HOLD },
        });
      } else {
        await tx.item.update({
          where: { id: checkout.itemId },
          data: { status: ItemStatus.AVAILABLE },
        });
      }
    });

    return {
      returned: true,
      fine, // { overdueDays, amountXof } — FCFA
      holdReady: nextHold
        ? { holdId: nextHold.id, patronId: nextHold.patronId, pickupDays: HOLD_PICKUP_DAYS }
        : null,
    };
  }

  // ───────────────────────────────────────────────────────────
  // Renouvellement
  // ───────────────────────────────────────────────────────────
  async renew(
    db: TenantDb,
    checkoutId: string,
    now: Date = new Date(),
    settings?: DueSettings,
  ) {
    const checkout = await db.checkout.findUnique({
      where: { id: checkoutId },
      include: { item: true, patron: true },
    });
    if (!checkout || checkout.returnDate) {
      throw new NotFoundException('Prêt en cours introuvable.');
    }

    const rules = await db.circulationRule.findMany({
      where: { patronCategory: checkout.patron.category },
    });
    const rule = resolveRule(rules, checkout.patron.category, checkout.item.itemType);

    const activeHolds = await db.hold.count({
      where: {
        recordId: checkout.item.recordId,
        status: { in: ACTIVE_HOLD_STATUSES },
      },
    });

    const verdict = canRenew(checkout, rule, now, activeHolds);
    if (!verdict.ok) {
      const reasons: Record<string, string> = {
        max_renewals: `Plafond de renouvellements atteint (${rule.maxRenewals}).`,
        overdue: 'Prêt en retard : renouvellement impossible, rapporter l’exemplaire.',
        holds_pending: 'Notice réservée par un autre adhérent : renouvellement impossible.',
      };
      throw new ConflictException(reasons[verdict.reason ?? 'max_renewals']);
    }

    // Le renouvellement repart du JOUR DU RENOUVELLEMENT (et non de l'ancienne
    // échéance) : c'est le choix déjà en place, désormais aligné sur l'heure
    // d'échéance de l'établissement.
    const dueDate = dueAt(now, rule.loanPeriodDays, settings);
    const updated = await db.checkout.update({
      where: { id: checkout.id },
      data: { dueDate, renewals: checkout.renewals + 1 },
    });
    return { checkout: updated, dueDate };
  }

  // ───────────────────────────────────────────────────────────
  // Réservations
  // ───────────────────────────────────────────────────────────
  async placeHold(db: TenantDb, dto: PlaceHoldDto, now: Date = new Date()) {
    const patron = await db.patron.findUnique({
      where: { barcode: dto.patronBarcode.trim() },
    });
    if (!patron) throw new NotFoundException('Adhérent introuvable.');
    if (patron.expiryDate && patron.expiryDate.getTime() < now.getTime()) {
      throw new ForbiddenException('Carte d’adhérent expirée.');
    }
    return this.placeHoldForPatron(db, dto.recordId, patron.id, now);
  }

  /**
   * Cœur du dépôt de réservation, à partir d'un `patronId` déjà résolu (le
   * guichet passe par un code-barres, le self-service par le compte connecté).
   * Un exemplaire libre est mis de côté (`pickupDays`) ; sinon file d'attente.
   */
  async placeHoldForPatron(
    db: TenantDb,
    recordId: string,
    patronId: string,
    now: Date = new Date(),
    pickupDays: number = HOLD_PICKUP_DAYS,
    settings?: DueSettings,
  ) {
    const record = await db.biblioRecord.findUnique({
      where: { id: recordId },
      include: { items: true },
    });
    if (!record) throw new NotFoundException('Notice introuvable.');

    const duplicate = await db.hold.findFirst({
      where: {
        recordId: record.id,
        patronId,
        status: { in: ACTIVE_HOLD_STATUSES },
      },
    });
    if (duplicate) {
      throw new ConflictException('Vous avez déjà une réservation active sur ce document.');
    }

    const availableItem = record.items.find(
      (item) => item.status === ItemStatus.AVAILABLE,
    );

    if (availableItem) {
      // Un exemplaire est libre : mis de côté immédiatement.
      const hold = await db.$transaction(async (tx) => {
        const created = await tx.hold.create({
          data: {
            recordId: record.id,
            patronId,
            status: HoldStatus.AVAILABLE,
            priority: 0,
            expiryDate: new Date(now.getTime() + pickupDays * DAY_MS),
          },
        });
        await tx.item.update({
          where: { id: availableItem.id },
          data: { status: ItemStatus.ON_HOLD },
        });
        return created;
      });
      return { hold, readyForPickup: true, pickupDays, queuePosition: 0 };
    }

    // Sinon : file d'attente, priorité = position dans la file.
    const queueLength = await db.hold.count({
      where: { recordId: record.id, status: { in: ACTIVE_HOLD_STATUSES } },
    });
    const hold = await db.hold.create({
      data: {
        recordId: record.id,
        patronId,
        status: HoldStatus.PENDING,
        priority: queueLength + 1,
      },
    });
    return { hold, readyForPickup: false, queuePosition: queueLength + 1 };
  }

  /**
   * Réservations actives (file d'attente) pour la vue guichet : par notice,
   * dans l'ordre, avec la position et l'adhérent. Statut AVAILABLE = mis de côté.
   */
  async listActiveHolds(db: TenantDb) {
    const holds = await db.hold.findMany({
      where: { status: { in: ACTIVE_HOLD_STATUSES } },
      include: {
        record: { select: { id: true, title: true } },
        patron: {
          select: {
            barcode: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ recordId: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    });

    // Position dans la file de chaque notice (1 = tête ; AVAILABLE = mis de côté).
    const positionByRecord = new Map<string, number>();
    return holds.map((h) => {
      const n = (positionByRecord.get(h.recordId) ?? 0) + 1;
      positionByRecord.set(h.recordId, n);
      const user = h.patron.user;
      return {
        holdId: h.id,
        recordId: h.record.id,
        title: h.record.title,
        status: h.status,
        position: n,
        patronBarcode: h.patron.barcode,
        patronName: user ? `${user.firstName} ${user.lastName}`.trim() : null,
        expiryDate: h.expiryDate,
      };
    });
  }

  async cancelHold(db: TenantDb, holdId: string, now: Date = new Date()) {
    const hold = await db.hold.findUnique({ where: { id: holdId } });
    if (!hold || !ACTIVE_HOLD_STATUSES.includes(hold.status)) {
      throw new NotFoundException('Réservation active introuvable.');
    }

    await db.$transaction(async (tx) => {
      await tx.hold.update({
        where: { id: holdId },
        data: { status: HoldStatus.CANCELLED },
      });

      if (hold.status === HoldStatus.AVAILABLE) {
        // Un exemplaire était mis de côté : le passer au suivant, sinon le libérer.
        const heldItem = await tx.item.findFirst({
          where: { recordId: hold.recordId, status: ItemStatus.ON_HOLD },
        });
        if (heldItem) {
          const next = await tx.hold.findFirst({
            where: { recordId: hold.recordId, status: HoldStatus.PENDING },
            orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          });
          if (next) {
            await tx.hold.update({
              where: { id: next.id },
              data: {
                status: HoldStatus.AVAILABLE,
                expiryDate: new Date(now.getTime() + HOLD_PICKUP_DAYS * DAY_MS),
              },
            });
          } else {
            await tx.item.update({
              where: { id: heldItem.id },
              data: { status: ItemStatus.AVAILABLE },
            });
          }
        }
      }
    });

    return { cancelled: true };
  }

  // ───────────────────────────────────────────────────────────
  // Registres
  // ───────────────────────────────────────────────────────────
  /** Prêts en retard, avec l'amende courant à ce jour (FCFA). */
  async listOverdues(db: TenantDb, now: Date = new Date(), settings?: DueSettings) {
    const overdue = await db.checkout.findMany({
      where: { returnDate: null, dueDate: { lt: now } },
      include: {
        // `id` en plus du titre : sans lui, l'écran des retards affiche des
        // titres sur lesquels on ne peut pas cliquer. Même défaut que
        // patronSituation ci-dessous — corrigé aux DEUX endroits, un tiers de
        // correctif laisse revenir le défaut.
        item: { include: { record: { select: { id: true, title: true } } } },
        patron: { select: { id: true, barcode: true, category: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const rules = await db.circulationRule.findMany();
    return overdue.map((checkout) => {
      const rule = resolveRule(rules, checkout.patron.category, checkout.item.itemType);
      const fine = computeFine(
        checkout.dueDate,
        now,
        tarifApplicable(rule.finePerDay, settings),
        settings?.timezone ?? DEFAULT_TIMEZONE,
      );
      return {
        checkoutId: checkout.id,
        recordId: checkout.item.record.id,
        title: checkout.item.record.title,
        itemBarcode: checkout.item.barcode,
        patron: checkout.patron,
        dueDate: checkout.dueDate,
        overdueDays: fine.overdueDays,
        accruedFineXof: fine.amountXof,
      };
    });
  }

  /** Situation complète d'un adhérent : prêts, réservations, amendes (FCFA). */
  async patronSituation(
    db: TenantDb,
    patronId: string,
    now: Date = new Date(),
    settings?: DueSettings,
  ) {
    const patron = await db.patron.findUnique({
      where: { id: patronId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!patron) throw new NotFoundException('Adhérent introuvable.');

    const [openCheckouts, holds, recordedFines, rules] = await Promise.all([
      db.checkout.findMany({
        where: { patronId, returnDate: null },
        include: { item: { include: { record: { select: { id: true, title: true } } } } },
        orderBy: { dueDate: 'asc' },
      }),
      db.hold.findMany({
        where: { patronId, status: { in: ACTIVE_HOLD_STATUSES } },
        // Les réservations sont rendues TELLES QUELLES : ajouter `id` ici
        // l'expose directement, sans projection à modifier.
        include: { record: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.checkout.aggregate({
        where: { patronId, returnDate: { not: null } },
        _sum: { fineAmount: true },
      }),
      db.circulationRule.findMany({ where: { patronCategory: patron.category } }),
    ]);

    let accruing = 0;
    const checkouts = openCheckouts.map((checkout) => {
      const rule = resolveRule(rules, patron.category, checkout.item.itemType);
      const fine = computeFine(
        checkout.dueDate,
        now,
        tarifApplicable(rule.finePerDay, settings),
        settings?.timezone ?? DEFAULT_TIMEZONE,
      );
      accruing += fine.amountXof;
      return {
        checkoutId: checkout.id,
        recordId: checkout.item.record.id,
        title: checkout.item.record.title,
        itemBarcode: checkout.item.barcode,
        dueDate: checkout.dueDate,
        renewals: checkout.renewals,
        overdue: fine.overdueDays > 0,
        accruedFineXof: fine.amountXof,
      };
    });

    const recorded = recordedFines._sum.fineAmount ?? 0;
    return {
      // Le nom de l'adhérent fait foi ; celui du compte reste visible dans
      // `patron.user`, et `nomsDivergents` dit s'ils se sont désaccordés.
      // Voir patrons/noms-divergents.ts — le signal informe, il ne décide rien.
      patron: { ...patron, nomsDivergents: nomsDivergents(patron) },
      checkouts,
      holds,
      fines: {
        recordedXof: recorded, // amendes constatées aux retours passés
        accruingXof: accruing, // amendes courant sur les retards en cours
        totalXof: recorded + accruing,
      },
    };
  }

  // ───────────────────────────────────────────────────────────
  // Règles de circulation
  // ───────────────────────────────────────────────────────────
  async createRule(db: TenantDb, dto: CreateRuleDto) {
    try {
      return await db.circulationRule.create({
        data: {
          patronCategory: dto.patronCategory.trim().toLowerCase(),
          itemType: dto.itemType.trim().toLowerCase(),
          loanPeriodDays: dto.loanPeriodDays,
          maxRenewals: dto.maxRenewals ?? 1,
          maxCheckouts: dto.maxCheckouts ?? 5,
          finePerDay: dto.finePerDay ?? 0,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Une règle existe déjà pour cette catégorie et ce type d’exemplaire.',
        );
      }
      throw error;
    }
  }

  async listRules(db: TenantDb) {
    return db.circulationRule.findMany({
      orderBy: [{ patronCategory: 'asc' }, { itemType: 'asc' }],
    });
  }

  async updateRule(db: TenantDb, id: string, dto: UpdateRuleDto) {
    const rule = await db.circulationRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Règle introuvable.');
    return db.circulationRule.update({
      where: { id },
      data: {
        patronCategory: dto.patronCategory?.trim().toLowerCase(),
        itemType: dto.itemType?.trim().toLowerCase(),
        loanPeriodDays: dto.loanPeriodDays,
        maxRenewals: dto.maxRenewals,
        maxCheckouts: dto.maxCheckouts,
        finePerDay: dto.finePerDay,
      },
    });
  }

  async deleteRule(db: TenantDb, id: string) {
    const rule = await db.circulationRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Règle introuvable.');
    await db.circulationRule.delete({ where: { id } });
    return { deleted: true };
  }
}
