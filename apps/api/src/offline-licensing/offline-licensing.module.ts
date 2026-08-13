import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ContentIngestionService } from './content-ingestion.service';
import { OfflineDevicesService } from './offline-devices.service';
import { OfflineKeysService } from './offline-keys.service';
import { OfflineLicensesService } from './offline-licenses.service';
import { OfflineLicensingController } from './offline-licensing.controller';

/**
 * Cœur offline (backend). Chiffrement à l'ingestion (ContentIngestionService,
 * branché dans DigitalCopyService) + endpoints devices/licenses/status/
 * my-documents. OfflineKeysService charge/valide les clés serveur (refus de
 * démarrer si absentes). PrismaModule et AuditModule sont globaux.
 */
@Module({
  imports: [
    StorageModule, // dépôt du blob chiffré
    AuthModule, // JwtAuthGuard + FunctionsGuard + AuthzService
    AccessControlModule, // getRecordAccessStatus (droit réutilisé)
  ],
  controllers: [OfflineLicensingController],
  providers: [
    OfflineKeysService,
    ContentIngestionService,
    OfflineDevicesService,
    OfflineLicensesService,
  ],
  exports: [ContentIngestionService, OfflineKeysService],
})
export class OfflineLicensingModule {}
