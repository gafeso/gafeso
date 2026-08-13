import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SruController } from './sru.controller';
import { SruService } from './sru.service';

@Module({
  imports: [AuthModule], // JwtAuthGuard + FunctionsGuard
  controllers: [SruController],
  providers: [SruService],
  exports: [SruService],
})
export class SruModule {}
