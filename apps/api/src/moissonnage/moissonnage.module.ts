import { Module } from '@nestjs/common';
import { CatalogingModule } from '../cataloging/cataloging.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { MoissonnageController } from './moissonnage.controller';
import { ClientOai } from './client-oai';
import { MoissonnageService } from './moissonnage.service';
import { MoissonnageScheduler } from './moissonnage.scheduler';
import { ProvenanceService } from './provenance.service';

/**
 * ⚠ `CatalogingModule` EST IMPORTÉ, ET CE N'EST PAS UNE FORMALITÉ.
 * `MoissonnageService` prend `CatalogingService` en dépendance de
 * constructeur : sans cet import, les tests unitaires resteraient VERTS et
 * l'API refuserait de démarrer — « Nest can't resolve dependencies ». C'est
 * arrivé deux fois sur `DepotsModule`, avec 1051 puis 1226 tests au vert.
 */
@Module({
  imports: [CatalogingModule, AuditModule, AuthModule],
  controllers: [MoissonnageController],
  providers: [MoissonnageService, MoissonnageScheduler, ProvenanceService, { provide: ClientOai, useFactory: () => new ClientOai() }],
  exports: [MoissonnageService, ProvenanceService],
})
export class MoissonnageModule {}
