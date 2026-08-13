import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { normalizeHomeContent } from '../tenancy/home-content';
import { buildLabelsPdf, LabelData, LabelLayout } from './label-pdf';

export type TenantDb = PrismaClient;

/** Nombre de jours en deçà duquel une notice est « nouveauté » (filtre étiquettes). */
const NEW_WINDOW_DAYS = 30;

export interface LabelCriteria {
  /** Exemplaires précis (une sélection). Prioritaire. */
  itemIds?: string[];
  /** Toutes les notices (leurs exemplaires) — « une notice, tous ses exemplaires ». */
  recordIds?: string[];
  /** Filtre localisation. */
  location?: string;
  /** Filtre nouveautés (notices créées récemment). */
  nouveaute?: boolean;
}

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(
    tenant: ResolvedTenant,
    criteria: LabelCriteria,
    layout: Partial<LabelLayout>,
    now: Date = new Date(),
  ): Promise<Uint8Array> {
    const db = this.prisma.forTenant(tenant.slug);
    const sigle = await this.resolveSigle(tenant);
    const items = await this.selectItems(db, criteria, now);
    if (items.length === 0) {
      throw new BadRequestException('Aucun exemplaire ne correspond à cette sélection.');
    }
    const labels: LabelData[] = items.map((it) => ({
      barcode: it.barcode,
      callNumber: it.callNumber,
      title: it.record.title,
      sigle,
    }));
    return buildLabelsPdf(labels, layout);
  }

  private async selectItems(db: TenantDb, criteria: LabelCriteria, now: Date) {
    const where: Prisma.ItemWhereInput = {};
    if (criteria.itemIds && criteria.itemIds.length > 0) {
      where.id = { in: criteria.itemIds };
    } else {
      if (criteria.recordIds && criteria.recordIds.length > 0) {
        where.recordId = { in: criteria.recordIds };
      }
      if (criteria.location) where.location = criteria.location;
      if (criteria.nouveaute) {
        const since = new Date(now.getTime() - NEW_WINDOW_DAYS * 24 * 3600 * 1000);
        where.record = { createdAt: { gte: since } };
      }
    }
    // Ordre de planche naturel : localisation, puis cote, puis code-barres.
    return db.item.findMany({
      where,
      select: {
        barcode: true,
        callNumber: true,
        location: true,
        record: { select: { title: true } },
      },
      orderBy: [{ location: 'asc' }, { callNumber: 'asc' }, { barcode: 'asc' }],
    });
  }

  /** Sigle imprimé : acronyme de la vitrine, sinon initiales du nom, sinon slug. */
  private async resolveSigle(tenant: ResolvedTenant): Promise<string> {
    try {
      const settings = await this.prisma.tenantSettings.findUnique({
        where: { tenantId: tenant.id },
        select: { homepageContent: true },
      });
      const acronym = normalizeHomeContent(settings?.homepageContent).identity.acronym.trim();
      if (acronym) return acronym;
    } catch {
      /* repli ci-dessous */
    }
    const initials = tenant.name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 6);
    return initials || tenant.slug.toUpperCase();
  }
}
