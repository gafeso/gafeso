import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModulesModule } from '../modules/modules.module';
import { StorageModule } from '../storage/storage.module';
import { TenancyService } from './tenancy.service';
import { ObjetsNonModelisesService } from './objets-non-modelises.service';
import { TenancyController } from './tenancy.controller';

@Module({
  imports: [
    AuthModule, // JwtAuthGuard + AuthzService (FunctionsGuard)
    StorageModule, // StorageService.putCover (upload logo / photo hero)
    // ⚠ ModulesService est résolu PAR LE CONTENEUR : aucun test unitaire ne
    // peut voir son absence (il construit le contrôleur à la main). C'est le
    // démarrage qui refuserait — « Nest can't resolve dependencies ».
    ModulesModule, // ModulesService.estActif → circulationActive
  ],
  controllers: [TenancyController],
  providers: [TenancyService, ObjetsNonModelisesService],
  exports: [TenancyService],
})
export class TenancyModule {}
