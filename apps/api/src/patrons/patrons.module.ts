import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PatronsController } from './patrons.controller';
import { PatronsService } from './patrons.service';

@Module({
  imports: [AuthModule],
  controllers: [PatronsController],
  providers: [PatronsService],
  exports: [PatronsService],
})
export class PatronsModule {}
