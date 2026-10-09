import { Module } from '@nestjs/common';
import { ModulesModule } from '../modules/modules.module';
import { AuthModule } from '../auth/auth.module';
import { CirculationModule } from '../circulation/circulation.module';
import { StatsModule } from '../stats/stats.module';
import { ReaderService } from './reader.service';
import { ReaderController } from './reader.controller';
import { CirculationPolicyController } from './circulation-policy.controller';
import { PatronsModule } from '../patrons/patrons.module';

/**
 * Espace lecteur self-service (prêts, renouvellement, réservations) + politique
 * de circulation en ligne (admin). Importe AuthModule pour les gardes et
 * CirculationModule pour HoldsService (réservations). Prisma/Mail/Audit globaux.
 */
@Module({
  imports: [AuthModule, CirculationModule, PatronsModule,
    // ⚠ Pour `UsageService` : un test unitaire ne dit RIEN du graphe d'injection.
    StatsModule,
    // ⚠ POUR `ModuleActifGuard`. Sans lui : « Nest can’t resolve dependencies
    // of the ModuleActifGuard » au DÉMARRAGE — et aucun test unitaire ne le
    // voit, puisqu'il construit le service à la main avec des doublures.
    ModulesModule,
  ],
  controllers: [ReaderController, CirculationPolicyController],
  providers: [ReaderService],
  exports: [ReaderService],
})
export class ReaderModule {}
