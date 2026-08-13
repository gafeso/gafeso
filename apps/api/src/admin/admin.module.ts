import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogingModule } from '../cataloging/cataloging.module';
import { RolesModule } from '../roles/roles.module';
import { CategoriesModule } from '../categories/categories.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ApiKeyGuard } from '../auth/api-key.guard';

@Module({
  imports: [
    AuthModule, // JwtService (login super-admin + guard plateforme)
    CatalogingModule, // CatalogingService.reindexAll (réindexation Meilisearch)
    CategoriesModule, // CategoriesService.seedDefaults (seed des catégories standard)
    RolesModule, // RolesService.ensureSystemRoles (socle de provisioning)
  ],
  controllers: [AdminController],
  providers: [AdminService, ApiKeyGuard],
  exports: [AdminService],
})
export class AdminModule {}
