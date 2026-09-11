import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { ModulesModule } from './modules/modules.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { TenantMiddleware } from './tenancy/tenant.middleware';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './mail/mail.module';
import { AccountsModule } from './accounts/accounts.module';
import { AccessControlModule } from './access-control/access-control.module';
import { AdminModule } from './admin/admin.module';
import { SearchModule } from './search/search.module';
import { CatalogingModule } from './cataloging/cataloging.module';
import { OpacModule } from './opac/opac.module';
import { PatronsModule } from './patrons/patrons.module';
import { CirculationModule } from './circulation/circulation.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { RolesModule } from './roles/roles.module';
import { CategoriesModule } from './categories/categories.module';
import { RemindersModule } from './reminders/reminders.module';
import { ReaderModule } from './reader/reader.module';
import { AuthorsModule } from './authors/authors.module';
import { StatsModule } from './stats/stats.module';
import { OaiModule } from './oai/oai.module';
import { SruModule } from './sru/sru.module';
import { LabelsModule } from './labels/labels.module';
import { InventoryModule } from './inventory/inventory.module';
import { HealthModule } from './health/health.module';
import { OfflineLicensingModule } from './offline-licensing/offline-licensing.module';
import { UploadSizeMiddleware } from './common/upload-size.middleware';
import { ClientCacheKeyMiddleware } from './common/client-cache-key.middleware';

@Module({
  imports: [
    // Charge le .env de la racine du monorepo (puis un .env local éventuel)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    // Limitation de débit globale (par IP) : 300 requêtes / minute.
    // Les endpoints sensibles (login, inscription, mot de passe) portent des
    // limites plus strictes via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    // Tâches planifiées (rappels de circulation quotidiens).
    ScheduleModule.forRoot(),
    PrismaModule,
    ModulesModule,
    TenancyModule,
    AuthModule,
    AuditModule,
    MailModule,
    AccountsModule,
    AccessControlModule,
    AdminModule,
    SearchModule,
    CatalogingModule,
    OpacModule,
    PatronsModule,
    CirculationModule,
    EnrollmentModule,
    RolesModule,
    CategoriesModule,
    RemindersModule,
    ReaderModule,
    AuthorsModule,
    StatsModule,
    OaiModule,
    SruModule,
    LabelsModule,
    InventoryModule,
    HealthModule,
    OfflineLicensingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Taille des téléversements : refus AVANT lecture du corps, sinon la
    // requête est avortée et la réponse d'erreur ne peut plus être écrite —
    // le client recevait « Internal Server Error » (voir le commentaire du
    // middleware). Placé en premier, avant toute autre consommation.
    consumer.apply(UploadSizeMiddleware).forRoutes('*');

    // Retire les paramètres de transport (`__host`, clé de cache du front)
    // avant validation : le ValidationPipe global refuse tout paramètre
    // inconnu, et seize routes portent un @Query() typé. Traité ici une fois,
    // pour les routes présentes et futures.
    consumer.apply(ClientCacheKeyMiddleware).forRoutes('*');

    // Résolution du tenant sur toutes les routes, sauf santé et docs
    consumer
      .apply(TenantMiddleware)
      // Santé, docs et endpoints plateforme ne dépendent pas d'un tenant
      .exclude('health', 'docs', 'docs/(.*)', 'admin/(.*)')
      .forRoutes('*');
  }
}
