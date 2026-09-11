import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModulesModule } from '../modules/modules.module';
import { CirculationController } from './circulation.controller';
import { CirculationService } from './circulation.service';
import { HoldsService } from './holds.service';
import { HoldsScheduler } from './holds.scheduler';
import { PatronsModule } from '../patrons/patrons.module';

@Module({
  imports: [AuthModule, PatronsModule, ModulesModule],
  controllers: [CirculationController],
  providers: [CirculationService, HoldsService, HoldsScheduler],
  exports: [CirculationService, HoldsService],
})
export class CirculationModule {}
