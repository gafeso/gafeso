import { Module } from '@nestjs/common';
import { ModulesModule } from '../modules/modules.module';
import { AuthModule } from '../auth/auth.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  imports: [AuthModule,
    // ⚠ POUR `ModuleActifGuard`. Sans lui : « Nest can’t resolve dependencies
    // of the ModuleActifGuard » au DÉMARRAGE — et aucun test unitaire ne le
    // voit, puisqu'il construit le service à la main avec des doublures.
    ModulesModule,
  ], // JwtAuthGuard + FunctionsGuard
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
