import { forwardRef, Module } from '@nestjs/common';
import { StatsModule } from '../stats/stats.module';
import { AuthModule } from '../auth/auth.module';
import { SearchModule } from '../search/search.module';
import { StorageModule } from '../storage/storage.module';
import { OfflineLicensingModule } from '../offline-licensing/offline-licensing.module';
import { CatalogingController } from './cataloging.controller';
import { CatalogingService } from './cataloging.service';
import { DigitalCopyService } from './digital-copy.service';
import { MetadataExtractionService } from './metadata-extraction.service';

@Module({
  imports: [AuthModule, SearchModule, StorageModule, OfflineLicensingModule,
    // ⚠ Son absence ne casserait aucun test — elle casserait le DÉMARRAGE.
    forwardRef(() => StatsModule),
  ],
  controllers: [CatalogingController],
  providers: [CatalogingService, DigitalCopyService, MetadataExtractionService],
  exports: [CatalogingService, DigitalCopyService],
})
export class CatalogingModule {}
