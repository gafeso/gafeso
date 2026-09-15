import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModulesModule } from '../modules/modules.module';
import { StatsService } from './stats.service';
import { UsageService } from './usage.service';
import { RapportAnnuelService } from './rapport-annuel.service';
import { StatsController } from './stats.controller';

/**
 * Tableau de bord statistiques + exports. Importe AuthModule pour les gardes.
 * PrismaService est global. StatsService exporté pour les exports CSV (bloc 3).
 */
@Module({
  // ⚠ `ModulesModule` : le garde a besoin de `ModulesService`. Son oubli ne
  // casse AUCUN test — il casse le démarrage de l'API.
  imports: [AuthModule, ModulesModule],
  controllers: [StatsController],
  providers: [StatsService, UsageService, RapportAnnuelService],
  // ⚠ `UsageService` est EXPORTÉ parce que ses ÉCRIVAINS vivent ailleurs :
  // l'OPAC (lecture en ligne) et le catalogage (téléchargement). Une table de
  // comptage dont personne n'écrit est la famille la plus répétée de ce
  // dépôt — « une colonne sans écrivain ». Elle est branchée dans le même lot
  // que sa migration, délibérément.
  exports: [StatsService, UsageService],
})
export class StatsModule {}
