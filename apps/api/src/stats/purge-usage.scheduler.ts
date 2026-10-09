import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RETENTION_NOMINATIVE_MOIS, UsageService } from './usage.service';

/**
 * LA PURGE NOMINATIVE DE L'USAGE — le nom tombe à 12 mois, la ligne reste.
 *
 * *Consigne de Jean, 6 octobre 2026 : « Historique nominatif conservé 12 mois
 * puis purgé ; agrégats conservés. »*
 *
 * ⚠ ELLE N'EST GARDÉE PAR AUCUN MODULE, ET C'EST DÉLIBÉRÉ. La règle d'activation
 * porte sur ce qu'un module MONTRE et ce qu'il ÉMET. Une purge ne montre rien,
 * n'émet rien, et elle est une OBLIGATION — pas une fonctionnalité. Une école qui
 * éteindrait les statistiques garderait sinon des noms indéfiniment : le module
 * décide de ce qu'on EXPOSE, jamais de ce qu'on CONSERVE.
 *
 * ⚠ ET ELLE NE S'ARRÊTE PAS À LA PREMIÈRE ÉCOLE QUI ÉCHOUE. Une école dont le
 * schéma est à demi provisionné ne doit pas empêcher les autres d'être purgées —
 * c'est « un nettoyage écrit sous la dictée des contraintes s'arrête où elles se
 * taisent », pris à l'envers : on parcourt la population, pas les erreurs.
 */
@Injectable()
export class PurgeUsageScheduler {
  private readonly logger = new Logger(PurgeUsageScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
  ) {}

  /**
   * Chaque nuit. ⚠ Le compte RAPPORTÉ est un compte d'EFFET — combien de lignes
   * ont perdu leur nom —, jamais « la purge a tourné ». Un dispositif se vérifie
   * par ce qu'il LAISSE.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgerToutesLesEcoles(maintenant: Date = new Date()): Promise<number> {
    const ecoles = await this.prisma.tenant.findMany({ select: { slug: true } });
    let total = 0;
    let echecs = 0;
    for (const ecole of ecoles) {
      try {
        const n = await this.usage.purgerLeNominatif(
          this.prisma.forTenant(ecole.slug),
          maintenant,
        );
        total += n;
        if (n > 0) {
          this.logger.log(
            `Purge d’usage : ${n} ligne(s) anonymisée(s) pour « ${ecole.slug} » ` +
              `(rétention ${RETENTION_NOMINATIVE_MOIS} mois).`,
          );
        }
      } catch (error) {
        echecs += 1;
        this.logger.error(
          `Purge d’usage ABANDONNÉE pour « ${ecole.slug} » : ${(error as Error).message}. ` +
            'Les autres écoles sont traitées quand même.',
        );
      }
    }
    if (echecs > 0) {
      // ⚠ DIT, et pas seulement compté : une purge à demi faite laisse des noms
      // au-delà de leur rétention, et c'est une obligation, pas une statistique.
      this.logger.warn(
        `Purge d’usage : ${echecs} école(s) sur ${ecoles.length} n’ont PAS été purgées.`,
      );
    }
    return total;
  }
}
