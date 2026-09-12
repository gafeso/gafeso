import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { ModuleActifGuard } from '../modules/module-actif.guard';
import { ModuleRequis } from '../modules/module-requis.decorator';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { AuthzService } from '../auth/authz.service';
import { ClientIp } from '../audit/client-ip.decorator';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { DepotsService } from './depots.service';
import {
  CreerDepotDto,
  DesignerDirecteurDto,
  RattacherNoticeDto,
  RefuserDepotDto,
} from './dto/depot.dto';

/**
 * LE CIRCUIT DE DÉPÔT — P6-2.
 *
 * ⚠ TROIS FONCTIONS, TROIS MÉTIERS, et aucune route n'en cumule deux :
 *  · `depot.deposer` — l'étudiant crée, soumet, suit le sien ;
 *  · `depot.valider` — le directeur voit et décide, sur SES dépôts seulement ;
 *  · `catalogue.gerer` — le bibliothécaire voit ce qui reste à cataloguer et
 *    rattache la notice qu'il a créée par le chemin normal.
 *
 * ⚠ TOUT LE CONTRÔLEUR EST SOUS `@ModuleRequis('depot')`, au niveau de la
 * CLASSE et non route par route : les douze routes appartiennent au circuit,
 * et une treizième écrite demain hérite de la garde sans que personne y pense.
 *
 * Motif, mesuré par la session front : `depot.deposer` est sur le rôle SYSTÈME
 * Étudiant, donc seedé dans CHAQUE école ; `depot.valider` sur aucun. Il
 * n'existait donc aucune école « sans dépôt » — toutes étaient à moitié
 * ouvertes, les étudiants déposant partout et personne ne validant nulle part.
 * **Un circuit qu'on ne peut pas éteindre est un droit imposé.**
 *
 * ⚠ CE QUI EST ÉCRIT ICI A CESSÉ D'ÊTRE VRAI UNE FOIS, et c'est la question
 * qu'on se pose maintenant devant tout commentaire : « qu'est-ce qui reste
 * écrit sans plus être vrai ? » Ce bloc affirmait que les deux fonctions
 * n'étaient portées par aucun rôle, ce qui n'est plus le cas d'aucune des deux.
 *
 * L'état réel, au 12 septembre 2026 :
 *  · `depot.deposer` est portée par l'ÉTUDIANT — l'élargissement a été accordé ;
 *  · `depot.valider` n'est portée par aucun rôle métier, mais l'Administrateur
 *    la porte PAR IDENTITÉ (`TOUTES_LES_FONCTIONS`). Elle attend un rôle
 *    dynamique « Enseignant » que chaque école crée si elle en a l'usage.
 *
 * Conséquence pratique, et elle n'est pas anodine : le seul directeur
 * désignable d'une école qui n'a pas créé ce rôle est son administrateur. Le
 * circuit est donc franchissable de bout en bout dès aujourd'hui, avec une
 * seule personne au bout.
 */
@ApiTags('depots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard, ModuleActifGuard)
@ModuleRequis('depot')
@Controller('depots')
export class DepotsController {
  constructor(
    private readonly depots: DepotsService,
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
  ) {}

  /** Le tenant, ou un refus explicable — la trace d'audit en a besoin. */
  private tenantRequis(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return tenant;
  }

  private db(tenant: ResolvedTenant | null): PrismaClient {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return this.prisma.forTenant(tenant.slug);
  }

  // ── L'étudiant ────────────────────────────────────────────────────────────

  @Post()
  @RequiresFunctions(FONCTIONS.DEPOT_DEPOSER)
  @ApiOperation({ summary: 'Créer un dépôt (brouillon)' })
  creer(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreerDepotDto,
  ) {
    return this.depots.creer(this.db(tenant), user.sub, dto);
  }

  @Get('directeurs')
  @RequiresFunctions(FONCTIONS.DEPOT_DEPOSER)
  @ApiOperation({
    summary: 'Les directeurs que je peux désigner',
    description:
      'Identifiant et nom affichable, et rien d’autre — ce n’est pas ' +
      'l’annuaire des comptes. Ne rend que les personnes qui portent ' +
      'réellement `depot.valider` : le menu ne doit jamais proposer ' +
      'quelqu’un que la garde refusera ensuite.',
  })
  directeurs(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.depots.directeursDesignables(this.db(tenant));
  }

  @Patch(':id/directeur')
  @RequiresFunctions(FONCTIONS.DEPOT_DEPOSER)
  @ApiOperation({
    summary: 'Désigner ou changer le directeur d’un brouillon',
    description:
      'Sans elle, `directorId` ne se posait qu’à la création, où il est ' +
      'facultatif : un brouillon créé sans directeur ne pouvait plus jamais ' +
      'être ni soumis ni corrigé. Brouillon seulement — changer le directeur ' +
      'd’un dépôt soumis le retirerait des mains de qui l’examine.',
  })
  designerDirecteur(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DesignerDirecteurDto,
  ) {
    return this.depots.designerDirecteur(this.db(tenant), id, user.sub, dto.directorId);
  }

  @Get('mes-depots')
  @RequiresFunctions(FONCTIONS.DEPOT_DEPOSER)
  @ApiOperation({
    summary: 'Mes dépôts et leur état',
    description:
      'Un étudiant qui dépose et n’entend plus rien redéposera : il doit ' +
      'pouvoir suivre le sien, y compris un refus et son motif.',
  })
  mesDepots(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.depots.mesDepots(this.db(tenant), user.sub);
  }

  @Post(':id/document')
  @RequiresFunctions(FONCTIONS.DEPOT_DEPOSER)
  @ApiOperation({
    summary: 'Téléverser le document du dépôt (PDF ou EPUB)',
    description:
      'Le fichier est CHIFFRÉ dès le dépôt, pas au catalogage : un dépôt ' +
      'refusé que personne ne cataloguera jamais laisserait sinon son document ' +
      'en clair indéfiniment. Remplaçable tant que le dépôt est un brouillon.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }),
  )
  televerser(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier requis (champ « file »).');
    }
    return this.depots.televerser(this.db(tenant), id, user.sub, file);
  }

  @Post(':id/soumettre')
  @RequiresFunctions(FONCTIONS.DEPOT_DEPOSER)
  @ApiOperation({
    summary: 'Soumettre un dépôt au directeur',
    description:
      'Rend le dépôt ET l’issue de la notification (`notification.sent`). ' +
      'Un échec d’envoi ne fait PAS échouer la soumission : l’écran doit ' +
      'pouvoir dire « soumis, mais votre directeur n’a pas été prévenu ».',
  })
  soumettre(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.depots.soumettre(this.db(tenant), id, user.sub);
  }

  // ── Les trois populations ─────────────────────────────────────────────────

  @Get(':id/document')
  @ApiOperation({
    summary: 'URL de lecture du document déposé (5 min)',
    description:
      '⚠ SANS ELLE, LE CIRCUIT DEMANDAIT À UN DIRECTEUR DE VALIDER UN CONTENU ' +
      'QU’IL NE POUVAIT PAS LIRE — et au déposant de faire confiance au fichier ' +
      'qu’il venait d’envoyer. Trois populations y ont droit : le déposant (le ' +
      'sien), le directeur désigné (ceux qu’il dirige), le bibliothécaire ' +
      '(`catalogue.gerer`). La décision est DANS LE SERVICE : ' +
      '`@RequiresFunctions` exige TOUTES les fonctions listées, il ne sait pas ' +
      'dire « ou ». Refus : « introuvable », par symétrie avec le reste du module.',
  })
  async document(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const db = this.db(tenant);
    const fonctions = await this.authz.getFunctions(db, user.sub);
    return this.depots.urlDeLectureDuDocument(db, id, user.sub, fonctions);
  }

  @Post(':id/retirer')
  @RequiresFunctions(FONCTIONS.DEPOT_DEPOSER)
  @ApiOperation({
    summary: 'Retirer mon dépôt soumis — il repasse en brouillon',
    description:
      '⚠ SANS ELLE, UN DÉPÔT SOUMIS N’AVAIT AUCUNE SORTIE QUI NE DÉPENDE D’UN ' +
      'AUTRE : valider et refuser sont réservés au directeur DÉSIGNÉ, et le ' +
      'directeur ne se change que sur un brouillon. Un directeur qui perd ' +
      '`depot.valider` — rôle changé, compte désactivé, départ — laissait le ' +
      'dépôt bloqué pour toujours. C’est SON dépôt : il ne doit dépendre de ' +
      'personne pour en reprendre la main. Le directeur est PRÉVENU, et ' +
      '`notification` dit ce qui est réellement arrivé à cet envoi.',
  })
  retirer(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.depots.retirer(this.db(tenant), id, user.sub);
  }

  // ── Le bibliothécaire ─────────────────────────────────────────────────────

  /**
   * ⚠ SOUS `catalogue.gerer`, ET LE CHOIX SE DISCUTE — je l'écris pour qu'il
   * puisse être repris en une ligne.
   *
   * La consigne était « `outils.lecteurs` ou une fonction voisine — pas
   * `depot.valider`, sinon on résout un blocage par le droit qui manque ».
   * `catalogue.gerer` est la fonction qui ouvre DÉJÀ le circuit de dépôt au
   * bibliothécaire (`a-cataloguer`, `:id/notice`) : c'est la même personne, au
   * même écran, et aucune fonction nouvelle n'est créée.
   *
   * `outils.lecteurs` désigne les outils qui opèrent sur les LECTEURS — import
   * de la liste attendue, classes. Un dépôt bloqué n'est pas un lecteur.
   */
  @Get('soumis')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({
    summary: 'Tous les dépôts en attente de décision, du plus ancien au plus récent',
    description:
      '⚠ SANS ELLE, LA RÉATTRIBUTION ÉTAIT INUTILISABLE : aucune route ne ' +
      'listait les dépôts soumis pour le personnel — `a-valider` est ' +
      'auto-portée au directeur, `a-cataloguer` ne rend que les validés, ' +
      '`mes-depots` est celle du déposant. Le bibliothécaire ne pouvait pas ' +
      'obtenir l’identifiant du dépôt bloqué, c’est-à-dire le cas exact que la ' +
      'réattribution existe pour résoudre. ' +
      'Chaque ligne porte `joursDepuisSoumission` — « il y a 94 jours » se lit, ' +
      '« 2026-06-10 » demande un calcul. ' +
      '⚠ Elle ne permet NI de valider NI de refuser : décider reste au ' +
      'directeur désigné, et la propriété tient par construction.',
  })
  soumis(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.depots.soumis(this.db(tenant));
  }

  @Post(':id/reattribuer')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({
    summary: 'Réattribuer un dépôt soumis à un autre directeur',
    description:
      'La seconde porte hors de « soumis », pour le cas où le déposant ne peut ' +
      'plus agir — parti, compte suspendu. Le dépôt reste SOUMIS : seul son ' +
      'directeur change, et le nouveau le voit apparaître dans sa liste. La ' +
      'réponse NOMME l’ancien directeur — « réattribué » sans dire de qui à qui ' +
      'ne raconte rien.',
  })
  async reattribuer(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DesignerDirecteurDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.tenantRequis(tenantOrNull);
    const result = await this.depots.reattribuer(
      this.db(tenantOrNull),
      id,
      dto.directorId,
    );
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.DEPOSIT_REASSIGN,
      targetType: 'deposit',
      targetId: id,
      targetLabel: result.depot.title,
      ip,
      // ⚠ L'ANCIEN ET LE NOUVEAU, tous les deux. « Réattribué » seul ne se
      // relit pas six mois plus tard.
      metadata: {
        ancienDirecteur: result.ancienDirecteur,
        nouveauDirecteurId: dto.directorId,
      },
    });
    return result;
  }

  // ── Le directeur ──────────────────────────────────────────────────────────

  @Get('a-valider')
  @RequiresFunctions(FONCTIONS.DEPOT_VALIDER)
  @ApiOperation({
    summary: 'Les dépôts que JE dirige et qui attendent ma décision',
    description:
      'AUTO-PORTÉE : jamais les dépôts d’un collègue. C’est ce qui rend cette ' +
      'fonction acceptable — on gagne l’accès à des données sur soi.',
  })
  aValider(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.depots.aValider(this.db(tenant), user.sub);
  }

  @Post(':id/valider')
  @RequiresFunctions(FONCTIONS.DEPOT_VALIDER)
  @ApiOperation({
    summary: 'Valider le CONTENU d’un dépôt que l’on dirige',
    description:
      'Aucune notice n’est créée ici : la description est complétée par le ' +
      'bibliothécaire, qui crée la notice par le chemin normal du catalogage.',
  })
  valider(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.depots.valider(this.db(tenant), id, user.sub);
  }

  @Post(':id/refuser')
  @RequiresFunctions(FONCTIONS.DEPOT_VALIDER)
  @ApiOperation({
    summary: 'Refuser un dépôt, AVEC son motif',
    description:
      'Aucune donnée n’est supprimée : le dépôt reste, son fichier reste, et ' +
      'le motif est conservé.',
  })
  refuser(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RefuserDepotDto,
  ) {
    return this.depots.refuser(this.db(tenant), id, user.sub, dto.motif);
  }

  // ── Le bibliothécaire ─────────────────────────────────────────────────────

  @Get('a-cataloguer')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({ summary: 'Les dépôts validés dont la notice reste à créer' })
  aCataloguer(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.depots.aCataloguer(this.db(tenant));
  }

  @Post(':id/notice')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiOperation({
    summary: 'Rattacher au dépôt la notice qu’on vient de cataloguer',
    description:
      'La notice est créée par POST /cataloging/records, qui porte ses ' +
      'invariants (auteur principal, trois mots-clés). Cette route ne fait que ' +
      'la rattacher : créer la notice ici demanderait un troisième chemin ' +
      'd’écriture aux règles plus souples.',
  })
  rattacherNotice(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: RattacherNoticeDto,
  ) {
    return this.depots.rattacherNotice(this.db(tenant), id, dto.recordId);
  }
}
