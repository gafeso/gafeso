import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CirculationModule } from '../circulation/circulation.module';
import { ReaderService } from './reader.service';
import { ReaderController } from './reader.controller';
import { CirculationPolicyController } from './circulation-policy.controller';
import { PatronsModule } from '../patrons/patrons.module';

/**
 * Espace lecteur self-service (prêts, renouvellement, réservations) + politique
 * de circulation en ligne (admin). Importe AuthModule pour les gardes et
 * CirculationModule pour HoldsService (réservations). Prisma/Mail/Audit globaux.
 */
@Module({
  imports: [AuthModule, CirculationModule, PatronsModule],
  controllers: [ReaderController, CirculationPolicyController],
  providers: [ReaderService],
  exports: [ReaderService],
})
export class ReaderModule {}
