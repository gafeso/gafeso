import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';

@Module({
  imports: [AuthModule],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}
