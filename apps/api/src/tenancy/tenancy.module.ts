import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { TenancyService } from './tenancy.service';
import { ObjetsNonModelisesService } from './objets-non-modelises.service';
import { TenancyController } from './tenancy.controller';

@Module({
  imports: [
    AuthModule, // JwtAuthGuard + AuthzService (FunctionsGuard)
    StorageModule, // StorageService.putCover (upload logo / photo hero)
  ],
  controllers: [TenancyController],
  providers: [TenancyService, ObjetsNonModelisesService],
  exports: [TenancyService],
})
export class TenancyModule {}
