import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { adresseCourteDeLaNotice } from '../opac/identifiant-perenne';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { normalizeHomeContent } from '../tenancy/home-content';
import {
  LabelData,
  LabelLayout,
  PlancheEtiquettes,
  buildLabelsPdf,
} from './label-pdf';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generatePdf(
    tenant: ResolvedTenant,
    criteria: LabelCriteria,
    layout: Partial<LabelLayout>,
    now: Date = new Date(),
  ): Promise<PlancheEtiquettes> {
    const db = this.prisma.forTenant(tenant.slug);
    const sigle = await this.resolveSigle(tenant);
    const items = await this.selectItems(db, criteria, now);
    if (items.length === 0) {
      throw new BadRequestException('Aucun exemplaire ne correspond à cette sélection.');
    }
    // ⚠ L'adresse publique est celle de la NOTICE, pas de l'exemplaire : un
    // lecteur qui scanne veut la fiche du document, pas le volume qu'il tient.
    // Les exemplaires n'ont aucune page publique.
    const appUrl = this.config.get<string>('APP_URL')?.trim() ?? '';
    const domaine = appUrl ? await this.domainePrincipal(tenant.slug) : null;
    const labels: LabelData[] = items.map((it) => ({
      barcode: it.barcode,
      callNumber: it.callNumber,
      title: it.record.title,
      sigle,
      // `null` sans APP_URL : pas de QR, et le code-barres reprend toute la
      // largeur. On ne devine pas une adresse qu'on imprimerait sur un livre.
      // ⭐ LA FORME COURTE, et c'est un CHOIX : à 13 mm, l'adresse pérenne
      // ferait monter le QR d'une version et rétrécir ses modules de 8 %, pour
      // un gain nul — les deux adresses résolvent la même notice.
      shortUrl: appUrl ? adresseCourteDeLaNotice(appUrl, domaine, it.record.id) : null,
    }));
    return buildLabelsPdf(labels, layout);
  }

  /** Le domaine principal de l'école — une lecture par planche, pas par étiquette. */
  private async domainePrincipal(slug: string): Promise<string | null> {
    const t = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { domains: { where: { isPrimary: true }, select: { domain: true }, take: 1 } },
    });
    return t?.domains[0]?.domain ?? null;
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
        record: { select: { id: true, title: true } },
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
