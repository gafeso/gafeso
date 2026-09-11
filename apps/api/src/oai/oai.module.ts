import { Module } from '@nestjs/common';
import { ModulesModule } from '../modules/modules.module';
import { OaiController } from './oai.controller';
import { OaiService } from './oai.service';

/**
 * Serveur OAI-PMH (moissonnage de métadonnées). Public, tenant-scopé par Host.
 * PrismaService global ; le mapping MARCXML est réutilisé depuis cataloging.
 */
@Module({
  // ModulesModule : le garde `ModuleActifGuard` a besoin de ModulesService.
  imports: [ModulesModule],
  controllers: [OaiController],
  providers: [OaiService],
})
export class OaiModule {}
