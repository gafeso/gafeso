import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * @Global : AuditService est injectable dans TOUS les modules (auth, roles,
 * accounts, cataloging, categories, tenancy, admin) sans réimporter ce module —
 * le journal d'audit est transversal. Importe AuthModule pour les gardes du
 * contrôleur de consultation (JwtAuthGuard + FunctionsGuard/AuthzService) ; la
 * dépendance inverse (AuthController → AuditService) passe par le provider
 * GLOBAL, donc pas de cycle d'import de modules.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
