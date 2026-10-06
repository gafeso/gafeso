import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { refusDesSecrets } from './common/secrets-de-production';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { VERSION_PUBLIEE } from './health/version';
import { InstallationService } from './installation/installation.service';
import { engendrerJeton } from './installation/jeton-amorcage';
import { PrismaService } from './prisma/prisma.service';
import { MulterExceptionFilter } from './common/multer-exception.filter';

/**
 * EN PRODUCTION, REFUSE DE DÉMARRER SUR UN SECRET FAIBLE OU CONNU.
 *
 * ⚠ Il n'en couvrait que DEUX sur six — `JWT_SECRET` et `ADMIN_API_KEY`. La
 * liste vit désormais dans `secrets-de-production.ts`, sous forme d'OBLIGATION :
 * un secret neuf absent de la liste fait échouer son garde.
 *
 * ⚠ Et le pire cas n'est pas « faible », c'est « CONNU » : copier
 * `.env.prod.example` tel quel fait du marqueur « À REMPLIR » la clé réelle —
 * un secret publié dans notre propre dépôt.
 */
function assertProductionSecrets(config: ConfigService): void {
  if (config.get<string>('NODE_ENV') !== 'production') return;

  const refus = refusDesSecrets((v) => config.get<string>(v));
  if (refus.length > 0) {
    throw new Error(
      'REFUS DE DÉMARRER — secrets de production faibles ou d’exemple :\n' +
        refus.map((r) => `  · ${r}`).join('\n') +
        '\n\nEngendrez-les : openssl rand -base64 32' +
        '\nPour une instance DÉJÀ EN SERVICE, suivez « Rotation des secrets » ' +
        'dans DEPLOY.md : l’ordre des gestes compte, et certains invalident les ' +
        'sessions en cours.',
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  assertProductionSecrets(config);

  // Confiance aux proxys INTERNES uniquement (Caddy + web, sur le réseau
  // Docker en IP privées), jamais « trust all ». `req.ip` reflète alors la
  // VRAIE IP cliente extraite de X-Forwarded-For — le rate limiting
  // (throttler) s'applique donc par attaquant et non globalement à l'IP du
  // conteneur web. Un client externe ne peut pas usurper son IP : Express
  // ignore toute entrée X-Forwarded-For publique au-delà du premier saut
  // non fiable (audit 2026-07-14). Les presets couvrent loopback (dev) et les
  // plages privées uniquelocal (10/8, 172.16/12, 192.168/16 — réseau Docker).
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

  // Arrêt propre (SIGTERM) : ferme les connexions Prisma/SMTP via les hooks.
  app.enableShutdownHooks();

  // Sécurité HTTP (en-têtes)
  app.use(helmet());

  // CORS — origines depuis CORS_ORIGINS (séparées par des virgules)
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });

  // Erreurs de téléversement (Multer) traduites en réponses utilisables :
  // un dépassement de taille répondait 500 « Internal Server Error », sans
  // dire ni que le fichier était trop gros ni quelle était la limite.
  app.useGlobalFilters(new MulterExceptionFilter(app.get(HttpAdapterHost).httpAdapter));

  // Validation globale des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Documentation Swagger sur /docs — hors production uniquement
  // (SWAGGER_ENABLED=true pour forcer, ex. environnement de recette).
  if (!isProduction || config.get<string>('SWAGGER_ENABLED') === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Gafeso API')
      .setDescription('SIGB multi-tenant open-source — API NestJS')
      .setVersion(VERSION_PUBLIEE.version)
      .addBearerAuth()
      .addApiKey(
        { type: 'apiKey', name: 'x-admin-api-key', in: 'header' },
        'admin-api-key',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  /**
   * LE JETON D'AMORÇAGE — engendré À CHAQUE DÉMARRAGE tant que l'installation
   * reste à faire.
   *
   * ⚠ POURQUOI À CHAQUE DÉMARRAGE et pas une seule fois. Un jeton posé une fois
   * laisse un trou sans issue : l'installateur qui perd le fichier — un `rm`, un
   * volume recréé, une copie oubliée — n'a plus AUCUN chemin, et il faudrait
   * alors une route de reprise, c'est-à-dire une seconde porte sur une instance
   * non installée. Régénérer ferme le trou sans ouvrir de porte : le fichier
   * correspond toujours à ce que la base attend, et le jeton du démarrage
   * précédent cesse de valoir.
   *
   * ⚠ ET `essaisRates` N'EST PAS REMIS À ZÉRO. C'est tout l'intérêt de l'avoir
   * persisté : un attaquant qui fait tomber la sonde pour provoquer un
   * redémarrage ne doit pas récupérer vingt essais.
   */
  try {
    const installation = app.get(InstallationService, { strict: false });
    if (await installation.estRequise()) {
      const { empreinte, chemin } = engendrerJeton();
      await app.get(PrismaService, { strict: false }).installation.update({
        where: { id: 'unique' },
        data: { jetonHash: empreinte },
      });
      Logger.warn(
        'INSTALLATION REQUISE — cette instance n’a pas encore d’établissement. ' +
          `Le jeton d’amorçage est dans ${chemin} (droits 0600). ` +
          '⚠ Ne collez jamais son CONTENU ailleurs : pour demander de l’aide, ' +
          'donnez ce CHEMIN. Il est consommé par l’installation et le fichier effacé.',
        'Bootstrap',
      );
    }
  } catch (erreur) {
    // ⚠ On NE BLOQUE PAS le démarrage : une instance déjà installée dont la
    // table manquerait (migration en retard) doit continuer de servir. Mais on
    // le DIT, parce qu'un assistant qui ne s'ouvre jamais sur une instance
    // neuve est indiscernable d'une instance déjà installée.
    Logger.error(
      'L’état d’installation n’a pas pu être lu : ' +
        `${(erreur as Error).message}. Si cette instance est NEUVE, l’assistant ` +
        'ne pourra pas s’ouvrir — vérifiez que les migrations Prisma sont appliquées.',
      'Bootstrap',
    );
  }

  const port = config.get<number>('API_PORT') ?? 4000;
  await app.listen(port);
  Logger.log(
    `Gafeso API démarrée sur http://localhost:${port} (health: /health, docs: /docs)`,
    'Bootstrap',
  );
}

void bootstrap();
