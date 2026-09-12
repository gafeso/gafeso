import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { ReconciliationAuDemarrageService } from './reconciliation-au-demarrage.service';

@Module({
  imports: [AuthModule], // JwtAuthGuard + AuthzService (FunctionsGuard)
  controllers: [RolesController],
  providers: [RolesService, ReconciliationAuDemarrageService],
  exports: [RolesService],
})
export class RolesModule {}
