import { Module } from '@nestjs/common';
import { CatalogingModule } from '../cataloging/cataloging.module';
import { AuditModule } from '../audit/audit.module';
import { ModulesModule } from '../modules/modules.module';
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
  // ⚠ `ModulesModule` : `ModuleActifGuard`, posé sur le contrôleur depuis
  // `fc27951`, a besoin de `ModulesService`. Son absence ne casse AUCUN test —
  // elle casse le DÉMARRAGE de l'API, et `main` a passé une nuit dans cet état
  // avec 1 491 tests verts. Un test unitaire n'exerce jamais le graphe
  // d'injection : il construit le service à la main, avec des doublures.
  imports: [CatalogingModule, AuditModule, AuthModule, ModulesModule],
  controllers: [MoissonnageController],
  providers: [MoissonnageService, MoissonnageScheduler, ProvenanceService, { provide: ClientOai, useFactory: () => new ClientOai() }],
  exports: [MoissonnageService, ProvenanceService],
})
export class MoissonnageModule {}
