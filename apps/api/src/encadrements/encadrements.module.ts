import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EncadrementsController } from './encadrements.controller';
import { EncadrementsService } from './encadrements.service';

/**
 * ⚠ `AuthModule` est nécessaire pour `JwtAuthGuard`, et son absence ne se verrait
 * qu'au DÉMARRAGE — pas dans la suite, qui construit le service à la main. Le
 * démarrage réel fait partie de la vérification de ce lot.
 *
 * `PrismaService` vient du PrismaModule global.
 */
@Module({
  imports: [AuthModule],
  controllers: [EncadrementsController],
  providers: [EncadrementsService],
  exports: [EncadrementsService],
})
export class EncadrementsModule {}
