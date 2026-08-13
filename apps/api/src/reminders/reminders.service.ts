import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../accounts/mail/mail.service';
import {
  DEFAULT_REMINDER_TEMPLATES,
  formatDueDate,
  renderTemplate,
  resolveTemplates,
  REMINDER_VARIABLES,
  ReminderTemplates,
  ReminderType,
  ReminderVars,
} from './reminder-templates';
import { UpdateReminderSettingsDto } from './dto/update-reminder-settings.dto';

/** Jeu de données d'exemple pour l'aperçu des modèles. */
const SAMPLE_VARS: ReminderVars = {
  prenom: 'Awa',
  nom: 'Traoré',
  titre: 'Les Soleils des indépendances',
  code_barres: 'BIB-000123',
  date_echeance: '20/07/2026',
  jours_retard: 3,
};

export type TenantDb = PrismaClient;

/** Config de rappels résolue pour un tenant (défauts appliqués). */
interface ReminderConfig {
  daysBefore: number; // N : rappel d'échéance J-N
  overdueRepeatDays: number; // M : relance de retard à J+1 puis tous les M jours
  templatesRaw: unknown; // reminder_templates brut (résolu au rendu)
}

/** Un rappel candidat pour un prêt donné, à un instant de référence. */
interface ReminderPlan {
  type: ReminderType;
  stageKey: string; // discriminant d'idempotence
  joursRetard: number;
}

export interface SweepSummary {
  tenants: number;
  processed: number; // prêts examinés
  sent: number;
  failed: number;
  skippedNoEmail: number;
  alreadySent: number;
}

/** Minuit UTC du jour de `d` (Ouagadougou = UTC+0 toute l'année → sûr). */
function startOfDayUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Nombre de jours entiers entre deux dates (a - b), positif si a est après b. */
function dayDiff(a: Date, b: Date): number {
  return Math.floor((startOfDayUTC(a) - startOfDayUTC(b)) / 86_400_000);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Ne garde d'un modèle entrant que les champs texte non vides (les vides → défaut au rendu). */
function sanitizeTemplate(t?: { subject?: string; body?: string }): { subject?: string; body?: string } {
  const out: { subject?: string; body?: string } = {};
  if (typeof t?.subject === 'string' && t.subject.trim()) out.subject = t.subject;
  if (typeof t?.body === 'string' && t.body.trim()) out.body = t.body;
  return out;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ── Configuration par établissement ──────────────────────────────────────

  /** Paramètres de rappels du tenant (défauts appliqués), + catalogue de variables. */
  async getSettings(tenantId: string) {
    const s = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    const templates = resolveTemplates(s?.reminderTemplates ?? null);
    return {
      enabled: s?.remindersEnabled ?? false,
      daysBefore: s?.reminderDaysBefore ?? 2,
      overdueRepeatDays: s?.overdueRepeatDays ?? 7,
      templates,
      defaults: DEFAULT_REMINDER_TEMPLATES,
      variables: REMINDER_VARIABLES,
      // Le repli email n'a de sens que si un SMTP réel est configuré.
      smtpConfigured: this.mail.available,
    };
  }

  /**
   * Met à jour les paramètres de rappels (PATCH partiel). Les modèles sont
   * fusionnés sur l'existant puis re-résolus (défauts si vide) — un champ vidé
   * repart sur le défaut FR, jamais sur du vide.
   */
  async updateSettings(tenantId: string, dto: UpdateReminderSettingsDto) {
    let reminderTemplates: ReminderTemplates | undefined;
    if (dto.templates !== undefined) {
      const existing = await this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { reminderTemplates: true },
      });
      const current = resolveTemplates(existing?.reminderTemplates ?? null);
      reminderTemplates = resolveTemplates({
        dueSoon: { ...current.dueSoon, ...sanitizeTemplate(dto.templates.dueSoon) },
        overdue: { ...current.overdue, ...sanitizeTemplate(dto.templates.overdue) },
      });
    }
    const data = {
      ...(dto.enabled !== undefined && { remindersEnabled: dto.enabled }),
      ...(dto.daysBefore !== undefined && { reminderDaysBefore: dto.daysBefore }),
      ...(dto.overdueRepeatDays !== undefined && { overdueRepeatDays: dto.overdueRepeatDays }),
      ...(reminderTemplates !== undefined && {
        reminderTemplates: reminderTemplates as unknown as Prisma.InputJsonValue,
      }),
    };
    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
    return this.getSettings(tenantId);
  }

  /**
   * Journal des rappels envoyés, borné au tenant courant, paginé et filtrable
   * (type, statut). Lecture seule — la table est dénormalisée, aucune jointure.
   */
  async listLog(
    tenantId: string,
    filters: { type?: string; status?: string; page?: number; limit?: number },
  ) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const where: Prisma.ReminderLogWhereInput = {
      tenantId,
      ...(filters.type && { type: filters.type }),
      ...(filters.status && { status: filters.status }),
    };
    const [total, entries] = await Promise.all([
      this.prisma.reminderLog.count({ where }),
      this.prisma.reminderLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          status: true,
          recipientEmail: true,
          recipientName: true,
          recordTitle: true,
          itemBarcode: true,
          dueDate: true,
          error: true,
          createdAt: true,
        },
      }),
    ]);
    return { total, page, totalPages: Math.ceil(total / limit) || 1, entries };
  }

  /** Rend un modèle (sujet + corps) avec un jeu de données d'exemple. */
  preview(type: ReminderType, subject: string, body: string) {
    const vars: ReminderVars =
      type === 'DUE_SOON' ? { ...SAMPLE_VARS, jours_retard: 0 } : SAMPLE_VARS;
    return {
      subject: renderTemplate(subject, vars),
      body: renderTemplate(body, vars),
    };
  }

  /**
   * Détermine le rappel à considérer pour un prêt à l'instant `asOf` :
   * - échéance dans [0, N] jours (et pas encore en retard) → DUE_SOON, une fois
   *   par date d'échéance (stageKey = la date) ;
   * - retard ≥ 1 jour → OVERDUE, palier k = floor((retard-1)/M) (relance à J+1
   *   puis tous les M jours), une fois par palier (stageKey = le n° de palier).
   * Les deux cas sont mutuellement exclusifs (signe du retard). Renvoie null si
   * aucun rappel n'est dû.
   */
  planFor(dueDate: Date, config: ReminderConfig, asOf: Date): ReminderPlan | null {
    const daysOverdue = dayDiff(asOf, dueDate);
    if (daysOverdue >= 1) {
      const k = Math.floor((daysOverdue - 1) / Math.max(1, config.overdueRepeatDays));
      return { type: 'OVERDUE', stageKey: `overdue:${k}`, joursRetard: daysOverdue };
    }
    const daysUntilDue = -daysOverdue;
    if (daysUntilDue >= 0 && daysUntilDue <= config.daysBefore) {
      const iso = new Date(startOfDayUTC(dueDate)).toISOString().slice(0, 10);
      return { type: 'DUE_SOON', stageKey: `due:${iso}`, joursRetard: 0 };
    }
    return null;
  }

  /**
   * Balaye TOUS les tenants actifs ayant les rappels activés (appelé par le
   * planificateur). Un tenant en échec n'interrompt pas les autres.
   */
  async sweepAllTenants(asOf: Date = new Date()): Promise<SweepSummary> {
    const summary: SweepSummary = {
      tenants: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      skippedNoEmail: 0,
      alreadySent: 0,
    };
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      include: { settings: true },
    });
    for (const tenant of tenants) {
      if (!tenant.settings?.remindersEnabled) continue;
      summary.tenants += 1;
      try {
        const r = await this.processTenant(tenant.id, tenant.slug, tenant.settings, asOf);
        summary.processed += r.processed;
        summary.sent += r.sent;
        summary.failed += r.failed;
        summary.skippedNoEmail += r.skippedNoEmail;
        summary.alreadySent += r.alreadySent;
      } catch (error) {
        // Un tenant qui plante (schéma absent, DB…) ne doit pas bloquer les autres.
        this.logger.error(
          `Rappels : échec du tenant "${tenant.slug}" — ${(error as Error).message}`,
        );
      }
    }
    return summary;
  }

  /**
   * Déclenche les rappels pour UN tenant, quel que soit l'état de la bascule
   * `remindersEnabled` (action admin explicite « envoyer maintenant » / test).
   * Le planificateur, lui, ne traite que les tenants activés.
   */
  async runForTenant(tenantId: string, slug: string, asOf: Date = new Date()) {
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    return this.processTenant(tenantId, slug, settings, asOf);
  }

  private async processTenant(
    tenantId: string,
    slug: string,
    settings: {
      reminderDaysBefore: number;
      overdueRepeatDays: number;
      reminderTemplates: Prisma.JsonValue | null;
    } | null,
    asOf: Date,
  ) {
    const config: ReminderConfig = {
      daysBefore: settings?.reminderDaysBefore ?? 2,
      overdueRepeatDays: settings?.overdueRepeatDays ?? 7,
      templatesRaw: settings?.reminderTemplates ?? null,
    };
    const db = this.prisma.forTenant(slug);

    // Prêts en cours (non rendus) avec l'adhérent et l'exemplaire.
    const checkouts = await db.checkout.findMany({
      where: { returnDate: null },
      include: {
        item: { include: { record: { select: { title: true } } } },
        patron: { include: { user: { select: { email: true, firstName: true, lastName: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const counters = { processed: 0, sent: 0, failed: 0, skippedNoEmail: 0, alreadySent: 0 };
    for (const checkout of checkouts) {
      const plan = this.planFor(checkout.dueDate, config, asOf);
      if (!plan) continue;
      counters.processed += 1;
      const outcome = await this.processReminder(tenantId, checkout, plan, config, asOf);
      if (outcome === 'sent') counters.sent += 1;
      else if (outcome === 'failed') counters.failed += 1;
      else if (outcome === 'skipped-no-email') counters.skippedNoEmail += 1;
      else if (outcome === 'already-sent') counters.alreadySent += 1;
    }
    return counters;
  }

  /**
   * Traite UN rappel avec idempotence stricte « réserver puis envoyer » :
   * 1. si une ligne SENT existe déjà → rien (jamais deux fois) ;
   * 2. sans email valide → journalise SKIPPED_NO_EMAIL, sans envoi (retenté) ;
   * 3. sinon on RÉSERVE une ligne (contrainte unique = anti-double-envoi même
   *    entre instances concurrentes), on envoie, puis on marque SENT ou FAILED.
   * Un échec SMTP est journalisé et retenté au prochain passage (non bloquant).
   */
  private async processReminder(
    tenantId: string,
    checkout: {
      id: string;
      dueDate: Date;
      item: { barcode: string; record: { title: string } };
      patron: { user: { email: string; firstName: string; lastName: string } | null };
    },
    plan: ReminderPlan,
    config: ReminderConfig,
    asOf: Date,
  ): Promise<'sent' | 'failed' | 'skipped-no-email' | 'already-sent' | 'raced'> {
    const where: Prisma.ReminderLogWhereUniqueInput = {
      checkoutId_type_stageKey: {
        checkoutId: checkout.id,
        type: plan.type,
        stageKey: plan.stageKey,
      },
    };
    const existing = await this.prisma.reminderLog.findUnique({ where });
    if (existing?.status === 'SENT') return 'already-sent';

    const user = checkout.patron.user;
    const email = user?.email?.trim() ?? '';
    const snapshot = {
      tenantId,
      recipientName: user ? `${user.firstName} ${user.lastName}`.trim() : null,
      itemBarcode: checkout.item.barcode,
      recordTitle: checkout.item.record.title,
      dueDate: checkout.dueDate,
    };

    // Cas sans email valide : journalisé (visible dans l'admin), jamais envoyé,
    // retenté plus tard (au cas où l'adhérent renseigne un email).
    if (!email || !isValidEmail(email)) {
      const data = {
        ...snapshot,
        recipientEmail: user?.email ?? null,
        status: 'SKIPPED_NO_EMAIL',
        error: 'Adhérent sans adresse email valide',
      };
      if (existing) {
        await this.prisma.reminderLog.update({ where, data });
      } else {
        await this.prisma.reminderLog.create({
          data: { checkoutId: checkout.id, type: plan.type, stageKey: plan.stageKey, ...data },
        });
      }
      return 'skipped-no-email';
    }

    // RÉSERVATION : crée la ligne PENDING sous la contrainte unique. Si une autre
    // instance l'a déjà réservée à l'instant, on abandonne sans envoyer.
    if (!existing) {
      try {
        await this.prisma.reminderLog.create({
          data: {
            checkoutId: checkout.id,
            type: plan.type,
            stageKey: plan.stageKey,
            ...snapshot,
            recipientEmail: email,
            status: 'PENDING',
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return 'raced';
        }
        throw error;
      }
    }

    // ENVOI (hors transaction : un échec SMTP laisse la ligne, marquée FAILED).
    const templates = resolveTemplates(config.templatesRaw);
    const tpl = plan.type === 'OVERDUE' ? templates.overdue : templates.dueSoon;
    const vars: ReminderVars = {
      prenom: user!.firstName,
      nom: user!.lastName,
      titre: checkout.item.record.title,
      code_barres: checkout.item.barcode,
      date_echeance: formatDueDate(checkout.dueDate),
      jours_retard: plan.joursRetard,
    };
    try {
      await this.mail.sendCirculationReminder(
        email,
        renderTemplate(tpl.subject, vars),
        renderTemplate(tpl.body, vars),
      );
      await this.prisma.reminderLog.update({
        where,
        data: { ...snapshot, recipientEmail: email, status: 'SENT', error: null },
      });
      return 'sent';
    } catch (error) {
      const message = (error as Error).message?.slice(0, 500) ?? 'Erreur inconnue';
      await this.prisma.reminderLog.update({
        where,
        data: { ...snapshot, recipientEmail: email, status: 'FAILED', error: message },
      });
      this.logger.warn(
        `Rappel non envoyé à ${email} (prêt ${checkout.id}, ${plan.type}) : ${message} — sera retenté.`,
      );
      return 'failed';
    }
  }
}
