import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PurgeDepotsService } from './purge-depots.service';

/**
 * Une fois par jour, à 03:00, heure de Ouagadougou — l'heure creuse.
 *
 * ⚠ QUOTIDIEN POUR UNE RÈGLE ANNUELLE, ET C'EST VOULU. Un passage mensuel
 * ferait dépendre la date de suppression du jour où le planificateur tombe :
 * un fichier pourrait rester six semaines de plus sans que rien ne l'explique.
 * La règle dit douze mois, le passage quotidien la rend vraie à un jour près.
 *
 * ⚠ ET IL NE SUPPRIME RIEN AVANT SEPTEMBRE 2027 : le circuit de dépôt date du
 * 12 septembre 2026. Un passage qui ne trouve rien n'est pas un passage inutile
 * — c'est ce qu'on veut lire dans le journal pendant un an.
 */
const QUOTIDIEN_A_3H = '0 3 * * *';

@Injectable()
export class PurgeDepotsScheduler {
  private readonly logger = new Logger(PurgeDepotsScheduler.name);
  private enCours = false;

  constructor(private readonly purge: PurgeDepotsService) {}

  @Cron(QUOTIDIEN_A_3H, { name: 'depots-retention', timeZone: 'Africa/Ouagadougou' })
  async quotidien(): Promise<void> {
    if (this.enCours) {
      this.logger.warn('Purge des dépôts déjà en cours — saut de ce déclenchement.');
      return;
    }
    this.enCours = true;
    try {
      const b = await this.purge.purgerToutesLesEcoles();
      this.logger.log(
        `Rétention des dépôts refusés : ${b.ecoles} école(s), ${b.depots} dépôt(s) purgé(s), ` +
          `${b.objets} objet(s) supprimé(s), ${b.echecs} échec(s).`,
      );
    } catch (error) {
      this.logger.error(`Purge des dépôts échouée : ${(error as Error).message}`);
    } finally {
      this.enCours = false;
    }
  }
}
