import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AdminModule } from '../admin/admin.module';
import { InstallationController } from './installation.controller';
import { InstallationService } from './installation.service';
import { SessionAssistantService } from './session-assistant.service';

/**
 * ⚠ CE MODULE N'EST PAS DANS LE REGISTRE DES MODULES ACTIVABLES, et ce n'est
 * pas un oubli : il n'y a personne pour l'éteindre avant l'installation, et il
 * s'éteint tout seul après — ses routes rendent `410`. Un interrupteur sur
 * lui-même serait un interrupteur que seul l'installateur pourrait actionner
 * contre sa propre installation.
 */
@Module({
  imports: [AdminModule, AccountsModule],
  controllers: [InstallationController],
  providers: [InstallationService, SessionAssistantService],
  exports: [InstallationService, SessionAssistantService],
})
export class InstallationModule {}
