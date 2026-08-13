import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

/**
 * Tableau de bord statistiques + exports. Importe AuthModule pour les gardes.
 * PrismaService est global. StatsService exporté pour les exports CSV (bloc 3).
 */
@Module({
  imports: [AuthModule],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
