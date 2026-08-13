import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { PatronsModule } from '../patrons/patrons.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [AuthModule, RolesModule, PatronsModule], // JwtAuthGuard + AuthzService + assignation de rôle + suppression cascadée d'un adhérent lié
  controllers: [AccountsController],
  providers: [AccountsService], // MailService vient du MailModule global
  exports: [AccountsService],
})
export class AccountsModule {}
