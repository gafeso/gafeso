import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * Service Prisma multi-tenant.
 *
 * - Le client de base est connecté au schéma `public` (données partagées :
 *   catalogue commercial, fédération, paiements, tenants).
 * - `forTenant(slug)` renvoie un client lié au schéma `tenant_<slug>` (données
 *   propres à une école). Les clients par tenant sont mis en cache et réutilisés.
 *
 * Le switching se fait en réécrivant le paramètre `schema` de l'URL de connexion :
 * chaque schéma dispose ainsi de son propre pool, isolé des autres.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly baseUrl: string;
  private readonly tenantClients = new Map<string, PrismaClient>();

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('DATABASE_URL');
    super({ datasources: { db: { url } } });
    this.baseUrl = url ?? '';
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connexion PostgreSQL établie (schéma public)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    for (const client of this.tenantClients.values()) {
      await client.$disconnect();
    }
    this.tenantClients.clear();
  }

  /**
   * Renvoie un client Prisma pointant sur le schéma d'un tenant (tenant_<slug>).
   * Le client est créé à la demande puis mis en cache.
   */
  forTenant(slug: string): PrismaClient {
    const schema = `tenant_${slug}`;
    const cached = this.tenantClients.get(schema);
    if (cached) return cached;

    const client = new PrismaClient({
      datasources: { db: { url: this.buildUrlForSchema(schema) } },
    });
    this.tenantClients.set(schema, client);
    this.logger.debug(`Client Prisma créé pour le schéma "${schema}"`);
    return client;
  }

  /** Réécrit le paramètre `schema` de l'URL de connexion de base. */
  private buildUrlForSchema(schema: string): string {
    const url = new URL(this.baseUrl);
    url.searchParams.set('schema', schema);
    return url.toString();
  }
}
