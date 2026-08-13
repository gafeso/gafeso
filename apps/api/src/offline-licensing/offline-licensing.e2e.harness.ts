/**
 * Harness e2e (hors vitest) : boote l'app Nest COMPLÈTE dans un process enfant
 * et l'expose en HTTP. La spec `offline-licensing.e2e.spec.ts` le lance et le
 * teste via fetch — booter NestFactory dans le module-runner de vitest plante
 * (transformation Vite + modules natifs), pas dans un vrai process Node.
 *
 * Lancé par la spec :  ts-node --transpile-only offline-licensing.e2e.harness.ts
 * Émet `E2E_LISTENING <port>` sur stdout quand prêt ; s'arrête sur SIGTERM.
 * Ce fichier n'est PAS un *.spec.ts → jamais ramassé par la suite de tests.
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.set('trust proxy', 'loopback');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  // Port fixe possible (E2E_PORT) : nécessaire pour `adb reverse` en session device.
  await app.listen(Number(process.env.E2E_PORT) || 0);
  const addr = app.getHttpServer().address();
  const port = typeof addr === 'string' ? 0 : addr?.port;
  process.stdout.write(`E2E_LISTENING ${port}\n`);

  const shutdown = async () => {
    await app.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  process.stderr.write(`E2E_HARNESS_FAIL ${(e as Error).stack ?? (e as Error).message}\n`);
  process.exit(1);
});
