import { Global, Module } from '@nestjs/common';
import { MailService } from '../accounts/mail/mail.service';

/**
 * @Global : MailService (envoi d'emails transactionnels) est partagé par
 * plusieurs modules (accounts : lien de mot de passe ; auth : code 2FA par
 * email). Fournir un provider global évite un cycle d'import entre AuthModule
 * et AccountsModule.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
