import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { mergeHomeTokens, sanitizeHomeTokens } from './home-theme';
import { sanitizeHomeContentInput } from './home-content';
import {
  appliquerSiVersion,
  assainirPagesLegalesEnEntree,
  versionDesPagesLegales,
  type PagesLegales,
} from './pages-legales';
import { isValidSlug } from './tenant-schema';

/**
 * Les réglages NON VERSIONNÉS que `PATCH /tenancy/settings` écrit.
 *
 * ⚠ Nommé plutôt que `Prisma.TenantSettingsUpdateInput` : ce type-là porte les
 * relations et les opérateurs de mise à jour, donc il n'est PAS utilisable dans
 * un `create`. Et un `as` pour forcer les deux aurait masqué exactement ce que
 * le compilateur voulait dire. Ici, des scalaires optionnels — valides des deux
 * côtés d'un `upsert`.
 */
type AutresReglages = {
  primaryColor?: string;
  secondaryColor?: string;
  themeTokens?: Prisma.InputJsonValue;
  latticeEnabled?: boolean;
  homepageContent?: Prisma.InputJsonValue;
};

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

    // pagesLegales : remplacement complet, comme l'accueil. Le DTO a déjà REFUSÉ
    // ce qui serait tronqué — la normalisation ici ne fait donc que borner des
    // valeurs déjà acceptables, et elle NFC-ise les textes (ils arrivent d'un
    // copier-coller depuis un PDF, donc d'un tiers).
    // ⚠ TYPÉ `PagesLegales`, PAS `InputJsonValue` : c'est l'écriture
    // conditionnelle qui sérialise, et elle a besoin de la FORME pour y ajouter
    // le jeton. Un `as unknown as` ici rendrait `pourLeStockage` aveugle à ce
    // qu'elle reçoit.
    const pagesLegales: PagesLegales | undefined =
      dto.pagesLegales !== undefined
        ? assainirPagesLegalesEnEntree(dto.pagesLegales)
        : undefined;

    // Les réglages NON VERSIONNÉS — ils ne remplacent rien qu'un autre pourrait
    // être en train de rédiger.
    const data = {
      ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
      ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
      ...(themeTokens !== undefined && { themeTokens }),
      ...(dto.latticeEnabled !== undefined && { latticeEnabled: dto.latticeEnabled }),
      ...(homepageContent !== undefined && { homepageContent }),
    };

    if (pagesLegales === undefined) {
      return this.prisma.tenantSettings.upsert({
        where: { tenantId },
        update: data,
        create: { tenantId, ...data },
      });
    }

    return this.ecrirePagesLegales(tenantId, data, pagesLegales, dto.pagesLegalesVersion!);
  }

  /**
   * ⭐⭐ ÉCRITURE DES PAGES LÉGALES SOUS CONTRÔLE DE VERSION.
   *
   * ## 🔴 LA FORME FAUTIVE, ET ELLE EST CELLE QU'ON ÉCRIT SPONTANÉMENT
   *
   * ```ts
   * await tx.$transaction(async (tx) => {
   *   const actuel = await tx.tenantSettings.findUnique({ where: { tenantId } });
   *   if (versionDe(actuel) !== attendue) throw new ConflictException(…);  // ⚠
   *   await tx.tenantSettings.update({ … });
   * });
   * ```
   *
   * **Elle ne protège de RIEN**, et c'est un FAUX DISPOSITIF au sens exact de ce
   * dépôt : la transaction est là, le contrôle est là, le `throw` est là, et
   * l'effet manque. PostgreSQL est en `READ COMMITTED` : deux transactions
   * lisent toutes deux la version 3, toutes deux trouvent l'égalité, toutes deux
   * écrivent la version 4. **Le contrôle passe pour les deux.**
   *
   * Une relecture voit un mécanisme complet. Seule une mesure — deux écritures
   * concurrentes, et compter ce qui RESTE — le démentit.
   *
   * ## ⭐ LA FORME JUSTE : LE PRÉDICAT EST DANS L'`UPDATE`
   *
   * Un `UPDATE … WHERE version = $attendue` n'a aucune fenêtre. Quand deux
   * requêtes visent la même ligne, PostgreSQL fait ATTENDRE la seconde, puis
   * **RÉÉVALUE son `WHERE` contre la ligne nouvellement validée** : la version
   * n'y est plus 3, zéro ligne touchée, et on sait refuser. Ce n'est pas une
   * optimisation du cas précédent — c'est le seul qui mesure.
   *
   * ## ⚠ POURQUOI LA LIGNE EST GARANTIE D'EXISTER D'ABORD
   *
   * Un `UPDATE` sur une ligne absente touche zéro ligne — indiscernable d'une
   * version périmée. On rendrait donc 409 à une école qui n'a jamais rien écrit,
   * c'est-à-dire un conflit avec personne. L'`upsert` préalable supprime le cas :
   * après lui, zéro ligne touchée ne peut signifier QUE « version périmée ».
   *
   * ## ⚠ ET LE PRÉDICAT DISCRIMINE LE TYPE, comme son jumeau TypeScript
   *
   * `(pages_legales ->> 'version')::int` LÈVE si la valeur n'est pas numérique.
   * Le `jsonb_typeof(…) = 'number'` est donc la même discrimination que
   * `versionDesPagesLegales` côté code — et les deux doivent rester d'accord,
   * sinon la divergence ne se verrait qu'au premier conflit réel.
   */
  private async ecrirePagesLegales(
    tenantId: string,
    autresReglages: AutresReglages,
    pagesLegales: PagesLegales,
    versionAttendue: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. La ligne existe — voir le motif ci-dessus.
      await tx.tenantSettings.upsert({
        where: { tenantId },
        update: autresReglages,
        create: { ...autresReglages, tenantId },
      });

      // 2. Les pages légales, sous prédicat. UNE instruction, aucune fenêtre.
      const touchees = await appliquerSiVersion(tx, tenantId, pagesLegales, versionAttendue);

      if (touchees === 0) {
        // ⚠ On relit la version COURANTE pour la dire. Un refus qui ne nomme pas
        // l'écart envoie chercher sans rien donner — « le message d'échec dit
        // QUOI FAIRE, pas ce qui ne va pas ».
        const actuel = await tx.tenantSettings.findUnique({
          where: { tenantId },
          select: { pagesLegales: true },
        });
        const courante = versionDesPagesLegales(actuel?.pagesLegales);
        throw new ConflictException(
          `Ces pages légales ont été modifiées entre-temps (vous avez lu la ` +
            `version ${versionAttendue}, la version actuelle est ${courante}). ` +
            `RELISEZ la page avant d’enregistrer : votre écriture remplacerait ` +
            `tout, et elle effacerait ce que quelqu’un vient de rédiger. ` +
            `Rien n’a été enregistré.`,
        );
      }

      return tx.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
    });
  }
}
