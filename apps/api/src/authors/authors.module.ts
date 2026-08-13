import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogingModule } from '../cataloging/cataloging.module';
import { AuthorsService } from './authors.service';
import { AuthorsAdminController } from './authors-admin.controller';

/**
 * Fichier d'autorités auteurs. @Global : AuthorsService est réutilisé par
 * l'admin (dédup, fusion), le catalogage (créer-si-absent à la saisie) et
 * l'OPAC (fiche/index) sans réimport. Importe AuthModule (gardes du contrôleur
 * admin) et CatalogingModule (réindexation ciblée après renommage/fusion).
 * PrismaService et AuditService sont globaux.
 */
@Global()
@Module({
  imports: [AuthModule, CatalogingModule],
  controllers: [AuthorsAdminController],
  providers: [AuthorsService],
  exports: [AuthorsService],
})
export class AuthorsModule {}
