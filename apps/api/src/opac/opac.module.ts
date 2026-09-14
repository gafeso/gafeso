import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SearchModule } from '../search/search.module';
import { CatalogingModule } from '../cataloging/cataloging.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { MoissonnageModule } from '../moissonnage/moissonnage.module';
import { OpacController } from './opac.controller';
import { OpacService } from './opac.service';

@Module({
    // ⚠ `MoissonnageModule` : `ProvenanceService`, pour que la notice DISE d'où
  // elle vient (décision 1 du brief P7). Aucun cycle — `moissonnage` ne connaît
  // pas l'OPAC.
  imports: [AuthModule, SearchModule, CatalogingModule, AccessControlModule, MoissonnageModule],
  controllers: [OpacController],
  providers: [OpacService],
  exports: [OpacService],
})
export class OpacModule {}
