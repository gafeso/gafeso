import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SearchModule } from '../search/search.module';
import { CatalogingModule } from '../cataloging/cataloging.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { OpacController } from './opac.controller';
import { OpacService } from './opac.service';

@Module({
  imports: [AuthModule, SearchModule, CatalogingModule, AccessControlModule],
  controllers: [OpacController],
  providers: [OpacService],
  exports: [OpacService],
})
export class OpacModule {}
