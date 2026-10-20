import { Controller, Get, Header, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { ModuleActifGuard } from '../modules/module-actif.guard';
import { ModuleRequis } from '../modules/module-requis.decorator';
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
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(ModuleActifGuard)
  @ModuleRequis('interoperabilite')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Content-Type', 'text/xml; charset=utf-8')
  async get(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: Record<string, string>,
  ) {
    return this.dispatch(tenant, query);
  }

  @Post()
  @UseGuards(ModuleActifGuard)
  @ModuleRequis('interoperabilite')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Content-Type', 'text/xml; charset=utf-8')
  async post(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: Record<string, string>,
    @Body() body: Record<string, string>,
  ) {
    return this.dispatch(tenant, { ...query, ...(body ?? {}) });
  }

  /**
   * ⚠ CORRIGÉ le 20 octobre 2026 : ces deux méthodes lisaient le Host REÇU
   * (`req.get('host')`, `x-forwarded-host`) pour bâtir un domaine et une URL
   * absolue renvoyés dans le corps XML — un Host forgé y ressortait identique,
   * y compris dans `adminEmail` (repli `contact@<host forgé>`). Mesuré par
   * l'effet : aucune prise de compte possible par ce chemin (l'email n'est
   * qu'AFFICHÉ, jamais contacté par le serveur), mais un moissonneur qui fait
   * confiance à `requestURL`/`adminEmail` pour identifier l'entrepôt recevait
   * l'adresse CHOISIE PAR L'APPELANT, pas celle de l'établissement. Remplacé
   * par la même source que `OpacService.publicUrl` : `APP_URL` (configuration,
   * jamais une requête) et le domaine PRINCIPAL du tenant RÉSOLU (en base,
   * jamais déclaré par le client).
   */

  /** Hôte public de l'établissement RÉSOLU, sans port — jamais celui reçu. */
  private async publicHost(tenant: ResolvedTenant): Promise<string> {
    const record = await this.prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { domains: { where: { isPrimary: true }, select: { domain: true }, take: 1 } },
    });
    const domaine = record?.domains[0]?.domain;
    if (domaine) return domaine;
    const appUrl = this.config.get<string>('APP_URL')?.trim();
    try {
      return appUrl ? new URL(appUrl).hostname : 'localhost';
    } catch {
      return 'localhost';
    }
  }

  /**
   * URL de base pour `requestURL`/`responseDate` — depuis la CONFIGURATION,
   * jamais depuis la requête. Sans tenant résolu, il n'y a pas de domaine
   * d'établissement à choisir : `APP_URL` seul.
   */
  private async baseUrl(tenant: ResolvedTenant | null): Promise<string> {
    const appUrl = this.config.get<string>('APP_URL')?.trim() || 'http://localhost:3000';
    if (!tenant) return `${appUrl}/api/oai`;
    let scheme: string;
    try {
      scheme = new URL(appUrl).protocol;
    } catch {
      scheme = 'http:';
    }
    const domaine = await this.publicHost(tenant);
    return `${scheme}//${domaine}/api/oai`;
  }

  /**
   * Email de contact de l'entrepôt (adminEmail). Réutilise l'email de contact
   * déjà saisi dans la vitrine de l'établissement (homepageContent.contact) ;
   * à défaut, repli propre sur `contact@<domaine résolu>`. adminEmail est
   * OBLIGATOIRE dans Identify (standard OAI-PMH) : on renvoie toujours une
   * valeur valide.
   */
  private async resolveAdminEmail(tenant: ResolvedTenant): Promise<string> {
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
    return `contact@${await this.publicHost(tenant)}`;
  }

  private async dispatch(tenant: ResolvedTenant | null, params: Record<string, string>) {
    const baseUrl = await this.baseUrl(tenant);
    if (!tenant) {
      return oaiError(new Date(), baseUrl, 'badArgument', 'Entrepôt inconnu pour ce domaine.');
    }
    const adminEmail = await this.resolveAdminEmail(tenant);
    return this.oai.handle(
      this.prisma.forTenant(tenant.slug),
      { slug: tenant.slug, name: tenant.name, adminEmail },
      params,
      baseUrl,
    );
  }
}
