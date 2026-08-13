import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogingModule } from '../cataloging/cataloging.module';
import { SearchModule } from '../search/search.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [
    AuthModule, // JwtAuthGuard + AuthzService (FunctionsGuard)
    CatalogingModule, // CatalogingService.toSearchDoc (réindexation au renommage)
    SearchModule, // SearchService.indexRecords
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
