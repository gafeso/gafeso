import { Controller, Get, Header, Post, Query, Req, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { OaiService } from './oai.service';
import { oaiError } from './oai-xml';
import { normalizeHomeContent } from '../tenancy/home-content';

/**
 * Entrepôt OAI-PMH 2.0 — endpoint PUBLIC, tenant-scopé par le Host (comme
 * l'OPAC). Expose UNIQUEMENT des métadonnées bibliographiques (jamais les
 * fichiers numériques). Débit limité (endpoint public). Réponses toujours en
 * HTTP 200 (les erreurs de protocole sont dans le corps XML).
 */
@ApiExcludeController()
@Controller('oai')
export class OaiController {
  constructor(
    private readonly oai: OaiService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Content-Type', 'text/xml; charset=utf-8')
  async get(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: Record<string, string>,
    @Req() req: Request,
  ) {
    return this.dispatch(tenant, query, req);
  }

  @Post()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Content-Type', 'text/xml; charset=utf-8')
  async post(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: Record<string, string>,
    @Body() body: Record<string, string>,
    @Req() req: Request,
  ) {
    return this.dispatch(tenant, { ...query, ...(body ?? {}) }, req);
  }

  /** Hôte public (domaine de l'école), sans port. Priorité x-forwarded-host
   *  (proxy same-origin du front) puis Host direct. */
  private publicHost(req: Request): string {
    const fwd = req.headers['x-forwarded-host'];
    const forwardedHost = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    return (forwardedHost || req.get('host') || 'localhost').split(':')[0];
  }

  private baseUrl(req: Request): string {
    const proto = req.protocol; // respecte x-forwarded-proto (trust proxy configuré)
    const path = req.originalUrl.split('?')[0];
    // Servi via le proxy same-origin du front (/api/*) : le Host public est dans
    // x-forwarded-host, et le chemin public porte le préfixe /api (retiré par le
    // rewrite Next). On reconstruit l'URL EXACTE que le moissonneur utilise.
    const fwd = req.headers['x-forwarded-host'];
    const forwardedHost = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (forwardedHost) {
      return `${proto}://${forwardedHost}/api${path}`;
    }
    return `${proto}://${req.get('host') ?? 'localhost'}${path}`;
  }

  /**
   * Email de contact de l'entrepôt (adminEmail). Réutilise l'email de contact
   * déjà saisi dans la vitrine de l'établissement (homepageContent.contact) ;
   * à défaut, repli propre sur `contact@<domaine>`. adminEmail est OBLIGATOIRE
   * dans Identify (standard OAI-PMH) : on renvoie toujours une valeur valide.
   */
  private async resolveAdminEmail(tenant: ResolvedTenant, req: Request): Promise<string> {
    try {
      const settings = await this.prisma.tenantSettings.findUnique({
        where: { tenantId: tenant.id },
        select: { homepageContent: true },
      });
      const email = normalizeHomeContent(settings?.homepageContent).contact.email.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
    } catch {
      /* base indisponible : on retombe sur le repli domaine ci-dessous */
    }
    return `contact@${this.publicHost(req)}`;
  }

  private async dispatch(tenant: ResolvedTenant | null, params: Record<string, string>, req: Request) {
    const baseUrl = this.baseUrl(req);
    if (!tenant) {
      return oaiError(new Date(), baseUrl, 'badArgument', 'Entrepôt inconnu pour ce domaine.');
    }
    const adminEmail = await this.resolveAdminEmail(tenant, req);
    return this.oai.handle(
      this.prisma.forTenant(tenant.slug),
      { slug: tenant.slug, name: tenant.name, adminEmail },
      params,
      baseUrl,
    );
  }
}
