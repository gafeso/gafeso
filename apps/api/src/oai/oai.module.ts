import { Module } from '@nestjs/common';
import { OaiController } from './oai.controller';
import { OaiService } from './oai.service';

/**
 * Serveur OAI-PMH (moissonnage de métadonnées). Public, tenant-scopé par Host.
 * PrismaService global ; le mapping MARCXML est réutilisé depuis cataloging.
 */
@Module({
  controllers: [OaiController],
  providers: [OaiService],
})
export class OaiModule {}
