import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HoldsService } from './holds.service';

// Toutes les heures : fait expirer les mises de côté dépassées, passe au suivant
// et sert de rattrapage pour les emails « réservation disponible ».
@Injectable()
export class HoldsScheduler {
  private readonly logger = new Logger(HoldsScheduler.name);
  private running = false;

  constructor(private readonly holds: HoldsService) {}

  @Cron('0 * * * *', { name: 'holds-expiry', timeZone: 'Africa/Ouagadougou' })
  async hourly(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.holds.processAllTenants();
    } catch (error) {
      this.logger.error(`Traitement des réservations échoué : ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
