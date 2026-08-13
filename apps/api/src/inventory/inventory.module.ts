import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

// PrismaService (global) + AuditService (@Global) sont injectés sans import.
@Module({
  imports: [AuthModule], // JwtAuthGuard + FunctionsGuard
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
