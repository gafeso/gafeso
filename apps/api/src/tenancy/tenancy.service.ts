import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { mergeHomeTokens, sanitizeHomeTokens } from './home-theme';
import { sanitizeHomeContentInput } from './home-content';
import { isValidSlug } from './tenant-schema';

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
}

@Injectable()
export class TenancyService {
  private readonly logger = new Logger(TenancyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Résout le tenant à partir de l'en-tête Host (domaine sans port).
   * Renvoie null si le domaine est inconnu.
   *
   * Défensif : tant que les tables du schéma `public` n'existent pas
   * (avant la première migration), on renvoie null sans faire échouer
   * la requête HTTP.
   */
  async resolveByHost(host?: string): Promise<ResolvedTenant | null> {
    if (!host) return null;
    const domain = host.split(':')[0].toLowerCase();

    try {
      const record = await this.prisma.domain.findUnique({
        where: { domain },
        include: { tenant: true },
      });
      if (!record) {
        // Volontairement en WARN (pas debug) : c'est la seule trace en prod
        // du domaine EXACT reçu par l'API quand la résolution échoue — la
        // valeur affichée au visiteur (BadRequestException) ne le contient
        // pas. Comparer avec `SELECT domain FROM public.domains` en cas
        // d'incident (espace superflu, casse, sous-domaine différent...).
        this.logger.warn(`Aucune école pour le domaine "${domain}" (Host reçu : "${host}").`);
        return null;
      }
      return {
        id: record.tenant.id,
        slug: record.tenant.slug,
        name: record.tenant.name,
      };
    } catch (error) {
      this.logger.debug(
        `Résolution du tenant impossible pour "${domain}" : ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Résout le tenant par son slug (clients API-directs : app mobile via en-tête
   * `X-Tenant`, ou repli sur le claim `tenant` du JWT). Slug validé (format),
   * lookup sur le schéma `public`. Renvoie null si inconnu/invalide — jamais
   * d'exception (comme resolveByHost).
   */
  async resolveBySlug(slug?: string): Promise<ResolvedTenant | null> {
    if (!slug || !isValidSlug(slug)) return null;
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
      return tenant ? { id: tenant.id, slug: tenant.slug, name: tenant.name } : null;
    } catch (error) {
      this.logger.debug(
        `Résolution du tenant par slug impossible pour "${slug}" : ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Met à jour l'identité visuelle de l'école `tenantId` (jamais un tenantId
   * arbitraire fourni par le client : toujours celui résolu depuis le Host).
   * Upsert : aucune ligne `tenant_settings` n'existe pour les écoles
   * provisionnées avant cette fonctionnalité.
   */
  async updateSettings(tenantId: string, dto: UpdateTenantSettingsDto) {
    // themeTokens : PATCH partiel possible (l'admin ne modifie qu'une couleur)
    // → on fusionne les clés fournies (nettoyées) sur les tokens déjà stockés,
    // sans effacer les autres. Défauts appliqués à la lecture (mergeHomeTokens).
    let themeTokens: Prisma.InputJsonValue | undefined;
    if (dto.themeTokens !== undefined) {
      const existing = await this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { themeTokens: true },
      });
      themeTokens = {
        ...mergeHomeTokens(existing?.themeTokens),
        ...sanitizeHomeTokens(dto.themeTokens),
      };
    }

    // homepageContent : remplacement complet (le formulaire admin envoie l'état
    // entier), nettoyé/normalisé — jamais de clé parasite ni de liste démesurée.
    const homepageContent: Prisma.InputJsonValue | undefined =
      dto.homepageContent !== undefined
        ? (sanitizeHomeContentInput(dto.homepageContent) as unknown as Prisma.InputJsonValue)
        : undefined;

    const data = {
      ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
      ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
      ...(themeTokens !== undefined && { themeTokens }),
      ...(dto.latticeEnabled !== undefined && { latticeEnabled: dto.latticeEnabled }),
      ...(homepageContent !== undefined && { homepageContent }),
      ...(dto.require2fa !== undefined && { require2fa: dto.require2fa }),
    };
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
  }
}
