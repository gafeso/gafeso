import { Module } from '@nestjs/common';
import { ModulesModule } from '../modules/modules.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

// PrismaService (global) + AuditService (@Global) sont injectés sans import.
@Module({
  imports: [AuthModule,
    // ⚠ POUR `ModuleActifGuard`. Sans lui : « Nest can’t resolve dependencies
    // of the ModuleActifGuard » au DÉMARRAGE — et aucun test unitaire ne le
    // voit, puisqu'il construit le service à la main avec des doublures.
    ModulesModule,
  ], // JwtAuthGuard + FunctionsGuard
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
