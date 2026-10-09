import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JetonAmorcageDto } from './dto/jeton.dto';
import { TerminerInstallationDto } from './dto/terminer-installation.dto';
import { TestCourrielDto } from './dto/test-courriel.dto';
import { InstallationService } from './installation.service';
import { SessionAssistantGuard } from './session-assistant.guard';

/**
 * L'ASSISTANT D'INSTALLATION — six routes, dont CINQ ne survivent pas à
 * l'installation : elles répondent alors `410 Gone`.
 *
 * ⚠ `410` et non `404` : « cette route a existé et n'existe plus » est une
 * information juste, là où un 404 ferait chercher une faute de frappe.
 *
 * ⚠ 🔴 ET `GET etat` SURVIT, DÉLIBÉRÉMENT. Ce commentaire disait « les six
 * routes, et AUCUNE ne survit » — c'était faux, et faux de la façon la plus
 * coûteuse : il décrivait l'inverse d'une décision prise exprès.
 *
 * `etat` est la SEULE route appelée sur une instance installée, et c'est elle
 * qui départage l'assistant de l'écran de connexion. Une route qui existe pour
 * dire « est-ce installé ? » doit pouvoir répondre NON — et un `410` sur un
 * appel de routine se lit comme une panne dans un journal.
 *
 * Le document de conception portait les deux affirmations, à deux chapitres
 * d'écart ; c'est l'USAGE qui a tranché, pas la relecture — le front ne pouvait
 * pas écrire son écran sans savoir laquelle était vraie. Corrigé le 9 octobre
 * 2026, en documentant l'assistant pour l'UO : le commentaire avait survécu à
 * la décision qu'il contredit.
 *
 * ⚠ ET CES ROUTES SONT LA SEULE POPULATION DU PRODUIT QUI N'EST GARDÉE NI PAR
 * UNE FONCTION NI PAR UNE CLÉ D'API. C'est la troisième famille de gardes —
 * après `@RequiresFunctions` (tenant) et `ApiKeyGuard` (plateforme) —, donc
 * invisible aux deux inventaires existants. `routes-installation-gardees.spec.ts`
 * est son inventaire propre : élargir l'un des deux autres mélangerait des
 * populations dont les règles diffèrent.
 */
@ApiTags('installation')
@Controller('installation')
export class InstallationController {
  constructor(private readonly service: InstallationService) {}

  @Get('etat')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'L’installation est-elle encore à faire ? (publique, sans jeton)',
    description:
      'Ne rend QUE ce booléen : tout autre champ serait lisible sans jeton. ' +
      'Elle révèle qu’une instance n’est pas initialisée — c’est assumé, sans ' +
      'elle le front ne peut pas choisir entre l’assistant et l’écran de connexion.',
  })
  etat() {
    return this.service.etat();
  }

  @Post('jeton')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Échange le jeton d’amorçage contre une session d’assistant (30 min)',
    description:
      'Le jeton passe en CORPS, jamais en paramètre d’URL. Au-delà de 20 essais ' +
      'faux — compteur PERSISTÉ, donc insensible à un redémarrage — l’assistant ' +
      'se verrouille.',
  })
  // ⚠ 200 et non 201 : cette route ne crée aucune ressource durable.
  jeton(@Body() dto: JetonAmorcageDto) {
    return this.service.ouvrirSession(dto.jeton);
  }

  @Get('constat')
  @UseGuards(SessionAssistantGuard)
  @ApiOperation({
    summary: 'Ce que l’environnement porte déjà, et que l’assistant ne peut pas changer',
    description: 'Rend `smtp.hote`, JAMAIS `smtp.motDePasse` — même derrière une session.',
  })
  constat() {
    return this.service.constat();
  }

  @Get('modules')
  @UseGuards(SessionAssistantGuard)
  @ApiOperation({
    summary: 'Les modules, LUS DANS LE REGISTRE',
    description:
      'Le front ne recopie pas cette liste : un module ajouté au registre doit ' +
      'apparaître dans l’assistant sans toucher au front.',
  })
  modules() {
    return this.service.modules();
  }

  @Post('test-courriel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAssistantGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Envoie un message d’essai, et DIT la vérité sur ce qui s’est passé',
    description:
      'Un échec est un 200 avec `envoye: false` et son motif, jamais un 500 : ' +
      '« ça n’a pas marché, voici pourquoi » est une réponse réussie. Et ' +
      '« ACCEPTÉ n’est pas ARRIVÉ » est dit explicitement en cas de succès.',
  })
  testCourriel(@Body() dto: TestCourrielDto) {
    return this.service.testerCourriel(dto.destinataire);
  }

  @Post('terminer')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAssistantGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Crée l’école et son administrateur, puis ferme l’assistant DÉFINITIVEMENT',
    description:
      'Exige `confirme: true` — second geste explicite, ce qui suit n’est pas ' +
      'défaisable. Rend `lienMotDePasse` DANS TOUS LES CAS, et `courrielEnvoye` ' +
      'dit la vérité : sans ce lien, un échec d’envoi laisserait l’administrateur ' +
      'sans aucun chemin vers le seul compte de l’instance.',
  })
  // ⚠ 200 et non 201 : la réponse ne porte pas l'URL d'une ressource créée, et
  // l'appelant n'a rien à relire — il a tout ce qu'il doit noter.
  terminer(@Body() dto: TerminerInstallationDto) {
    return this.service.terminer(dto);
  }
}
