import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { VERSION_PUBLIEE } from './version';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: "État de santé de l'API, et LA VERSION QUI TOURNE",
    description:
      'Publique et sans authentification — c’est la première chose qu’un support ' +
      'demande, et elle doit être joignable avant toute session. Elle ne révèle ' +
      'rien d’une école : ni slug, ni compte, ni donnée.',
  })
  check() {
    return {
      status: 'ok',
      service: 'gafeso-api',
      // ⚠ LUE À L'EXÉCUTION depuis le package.json de l'image, jamais figée au
      // build : un build-arg afficherait la version du jour du build, qui est
      // celle qu'on CROIT avoir déployée.
      version: VERSION_PUBLIEE.version,
      // `inconnu` quand l'environnement ne le porte pas — une réponse, pas une
      // absence.
      commit: VERSION_PUBLIEE.commit,
      timestamp: new Date().toISOString(),
    };
  }
}
