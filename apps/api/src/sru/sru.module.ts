import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModulesModule } from '../modules/modules.module';
import { SruController } from './sru.controller';
import { SruService } from './sru.service';

@Module({
  imports: [AuthModule, ModulesModule], // JwtAuthGuard + FunctionsGuard + ModuleActifGuard
  controllers: [SruController],
  providers: [SruService],
  exports: [SruService],
})
export class SruModule {}
