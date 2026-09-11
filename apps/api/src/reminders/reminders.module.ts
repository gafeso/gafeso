import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModulesModule } from '../modules/modules.module';
import { RemindersService } from './reminders.service';
import { RemindersScheduler } from './reminders.scheduler';
import { RemindersController } from './reminders.controller';

/**
 * Rappels de circulation (échéances + retards) par email.
 * - RemindersService : moteur + idempotence (schéma public : reminder_logs).
 * - RemindersScheduler : @Cron quotidien (balaie tous les tenants activés).
 * - Importe AuthModule pour les gardes du contrôleur (JwtAuthGuard +
 *   FunctionsGuard). PrismaService et MailService sont globaux.
 */
@Module({
  imports: [AuthModule, ModulesModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersScheduler],
  exports: [RemindersService],
})
export class RemindersModule {}
