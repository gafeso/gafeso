import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { MulterExceptionFilter } from './common/multer-exception.filter';

/**
 * En production, refuse de démarrer avec des secrets d'exemple ou trop
 * courts : mieux vaut un échec franc au déploiement qu'une plateforme
 * ouverte avec « change_me » comme clé.
 */
function assertProductionSecrets(config: ConfigService): void {
  if (config.get<string>('NODE_ENV') !== 'production') return;

  const problems: string[] = [];
  const jwtSecret = config.get<string>('JWT_SECRET') ?? '';
  if (jwtSecret.length < 32 || jwtSecret.includes('change_me')) {
    problems.push('JWT_SECRET (32 caractères aléatoires minimum)');
  }
  const adminKey = config.get<string>('ADMIN_API_KEY') ?? '';
  if (adminKey && (adminKey.length < 24 || /change_me|dev_/.test(adminKey))) {
    problems.push('ADMIN_API_KEY (24 caractères aléatoires minimum, ou vide pour désactiver)');
  }
  if (problems.length > 0) {
    throw new Error(
      `Refus de démarrer en production avec des secrets faibles : ${problems.join(' ; ')}.`,
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
      .setVersion('0.1.0')
      .addBearerAuth()
      .addApiKey(
        { type: 'apiKey', name: 'x-admin-api-key', in: 'header' },
        'admin-api-key',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('API_PORT') ?? 4000;
  await app.listen(port);
  Logger.log(
    `Gafeso API démarrée sur http://localhost:${port} (health: /health, docs: /docs)`,
    'Bootstrap',
  );
}

void bootstrap();
