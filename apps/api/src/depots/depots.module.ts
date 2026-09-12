import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { OfflineLicensingModule } from '../offline-licensing/offline-licensing.module';
import { ModulesModule } from '../modules/modules.module';
import { DepotsController } from './depots.controller';
import { DepotsService } from './depots.service';
import { PurgeDepotsService } from './purge-depots.service';
import { PurgeDepotsScheduler } from './purge-depots.scheduler';

@Module({
  // ⚠ `StorageModule` ET `OfflineLicensingModule` SONT NÉCESSAIRES, et leur
  // absence n'a été vue qu'au DÉMARRAGE DE L'APPLICATION.
  //
  // Les tests unitaires construisent `DepotsService` à la main avec des
  // doublures : ils n'exercent JAMAIS le graphe d'injection de Nest. Les 1051
  // tests étaient verts pendant que l'API refusait de démarrer sur
  // « Nest can't resolve dependencies of the DepotsService ». C'est la famille
  // de défauts que `CLAUDE.md` nomme — ceux qu'aucun test unitaire ne peut
  // atteindre — et le seul instrument qui les voit est le démarrage réel.
  //
  // MailService, lui, vient du MailModule global (@Global).
  // ⚠ `ModulesModule` EST NÉCESSAIRE DEPUIS QUE LE CONTRÔLEUR PORTE
  // `ModuleActifGuard` — et son absence a de nouveau été invisible à la suite :
  // 1 226 tests verts, et l'API refusant de démarrer. Deuxième fois sur ce
  // module. Un test unitaire construit le service à la main avec des doublures ;
  // il ne sait rien de ce que le conteneur saura résoudre.
  imports: [AuthModule, StorageModule, OfflineLicensingModule, ModulesModule],
  controllers: [DepotsController],
  // ⚠ LA PURGE ET SON PLANIFICATEUR (backlog n°25) sont déclarés ICI, et
  // l'avertissement ci-dessus vaut pour eux : un provider ajouté sans son
  // module refuse au DÉMARRAGE, pas dans la suite. `PrismaService` vient du
  // PrismaModule global ; `StorageService` du StorageModule déjà importé.
  providers: [DepotsService, PurgeDepotsService, PurgeDepotsScheduler],
  exports: [DepotsService],
})
export class DepotsModule {}
