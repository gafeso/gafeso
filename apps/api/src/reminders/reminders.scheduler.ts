import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RemindersService } from './reminders.service';

// Tous les jours à 07:00, heure de Ouagadougou (UTC+0). Un seul passage à la
// fois : le garde `running` évite un chevauchement si un passage traîne.
const DAILY_AT_7 = '0 7 * * *';

@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);
  private running = false;

  constructor(private readonly reminders: RemindersService) {}

  @Cron(DAILY_AT_7, { name: 'circulation-reminders', timeZone: 'Africa/Ouagadougou' })
  async daily(): Promise<void> {
    if (this.running) {
      this.logger.warn('Passage de rappels déjà en cours — saut de ce déclenchement.');
      return;
    }
    this.running = true;
    try {
      const s = await this.reminders.sweepAllTenants();
      this.logger.log(
        `Rappels quotidiens : ${s.tenants} école(s) traitée(s), ${s.sent} envoyé(s), ` +
          `${s.failed} échec(s) (retentés), ${s.skippedNoEmail} sans email, ` +
          `${s.alreadySent} déjà envoyés (ignorés).`,
      );
    } catch (error) {
      this.logger.error(`Balayage des rappels échoué : ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
