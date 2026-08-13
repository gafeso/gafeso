import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  imports: [AuthModule], // JwtAuthGuard + FunctionsGuard
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
