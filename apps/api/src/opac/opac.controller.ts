import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import {
  analyserIdentifiant,
  reconnaitreAdresse,
} from './identifiant-perenne';
import { ProvenanceService } from '../moissonnage/provenance.service';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tokenFromCookieHeader } from '../auth/session-cookie';
import { AuthzService } from '../auth/authz.service';
import { reponseDeScan, type NiveauDeScan } from './scan-par-niveau';
import { FONCTIONS } from '../auth/functions';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthorsService } from '../authors/authors.service';
import { CHIFFRES_TTL_SECONDS, OpacService } from './opac.service';
import { NouveautesDto } from './dto/nouveautes.dto';
import { ParcourirDto } from './dto/parcourir.dto';
import { OpacSearchDto } from './dto/opac-search.dto';
import { AuthorsIndexDto } from './dto/authors-index.dto';

/**
 * OPAC public : la recherche, la constellation et les fiches sont accessibles
 * sans compte. Les données réservées aux membres (exemplaires, disponibilité)
 * ne sont renvoyées qu'avec un JWT valide — le masquage est fait côté API,
 * l'interface n'est qu'une commodité.
 */
@ApiTags('opac')
@Controller('opac')
export class OpacController {
  constructor(
    private readonly opac: OpacService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly accessControl: AccessControlService,
    private readonly authz: AuthzService,
    private readonly authors: AuthorsService,
    private readonly provenance: ProvenanceService,
  ) {}

  private requireTenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return tenant;
  }

  /**
   * Vrai si la requête porte un JWT valide ÉMIS POUR CETTE ÉCOLE
   * (authentification OPTIONNELLE — un jeton d'une autre école = anonyme).
   * Lit le jeton du cookie httpOnly `bc_token` (canal du navigateur depuis le
   * passage au cookie httpOnly) OU de l'en-tête `Authorization: Bearer`
   * (clients hors navigateur). Sans le cookie, un utilisateur connecté était vu
   * comme anonyme → fiche verrouillée à tort (régression prod 2026-07-16).
   */
  private isMember(tenantSlug: string, authorization?: string, cookie?: string): boolean {
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const token = bearer ?? tokenFromCookieHeader(cookie);
    if (!token) return false;
    try {
      const payload = this.jwt.verify(token) as { tenant?: string };
      return payload.tenant === tenantSlug;
    } catch {
      return false;
    }
  }

  @Get('search')
  @ApiOperation({
    summary: 'Recherche dans le catalogue (public, plein texte + facettes)',
  })
  async search(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: OpacSearchDto,
  ) {
    return this.opac.searchCatalog(this.requireTenant(tenant).slug, query);
  }

  /**
   * Chiffres publics du fonds — quatre entiers, aucune donnée nominative.
   *
   * `Cache-Control` annonce la fraîcheur RÉELLE : les comptages sont mis en
   * cache côté serveur pour la même durée. C'est l'en-tête qui porte cette
   * information, et non le corps, parce que le contrat convenu avec la page
   * d'accueil est « quatre entiers, rien d'autre » — y ajouter un horodatage
   * casserait le contrat pour dire ce que HTTP sait déjà exprimer.
   */
  @Get('chiffres')
  @Header('Cache-Control', `public, max-age=${CHIFFRES_TTL_SECONDS}`)
  @ApiOperation({
    summary: 'Chiffres du fonds (public) — documents, lecteurs, numérique, hors ligne',
  })
  async chiffres(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.opac.chiffresDuFonds(this.requireTenant(tenant).slug);
  }

  /**
   * Notices les plus récemment AJOUTÉES au catalogue (public).
   *
   * ⚠ Le titre de section côté page est « À découvrir dans le catalogue », et
   * non « Dernières acquisitions » : l'ordre reflète l'écriture des lignes en
   * base, pas une date d'acquisition — qui n'existe pas dans le modèle.
   */
  @Get('nouveautes')
  @Header('Cache-Control', `public, max-age=${CHIFFRES_TTL_SECONDS}`)
  @ApiOperation({
    summary: 'Notices récemment ajoutées au catalogue (public, ordre stable)',
  })
  async nouveautes(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: NouveautesDto,
  ) {
    return this.opac.nouveautes(
      this.requireTenant(tenant).slug,
      query.limit,
      query.avecFichier,
    );
  }

  /**
   * Parcours du catalogue (public, servi par la base) — paginé, total juste.
   * Porte le filtre « a un fichier », que la recherche plein texte ne peut pas
   * offrir sans que ses totaux deviennent faux.
   */
  @Get('parcourir')
  @Header('Cache-Control', `public, max-age=${CHIFFRES_TTL_SECONDS}`)
  @ApiOperation({ summary: 'Parcourir le catalogue (public, paginé)' })
  async parcourir(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: ParcourirDto,
  ) {
    return this.opac.parcourir(
      this.requireTenant(tenant).slug,
      query.page,
      query.limit,
      query.avecFichier,
    );
  }

  @Get('constellation')
  @Header('Cache-Control', `public, max-age=${CHIFFRES_TTL_SECONDS}`)
  @ApiOperation({
    summary: 'Répartition du catalogue par catégorie (public, page constellation)',
  })
  async constellation(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.opac.constellation(this.requireTenant(tenant).slug);
  }

  @Get('authors')
  @ApiOperation({
    summary: 'Index des auteurs (public) — liste alphabétique + nombre d’œuvres',
  })
  async authorsIndex(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: AuthorsIndexDto,
  ) {
    const resolved = this.requireTenant(tenant);
    return this.authors.listAuthors(this.prisma.forTenant(resolved.slug), {
      q: query.q,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('authors/:id')
  @ApiOperation({
    summary: 'Fiche auteur (public) — infos + œuvres groupées par rôle',
  })
  async authorDetail(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    const resolved = this.requireTenant(tenant);
    return this.authors.getAuthor(this.prisma.forTenant(resolved.slug), id);
  }

  /**
   * LA PROVENANCE D'UNE PAGE DE RÉSULTATS, EN UNE REQUÊTE — P7-3.
   *
   * ⚠ EN LOT, ET C'EST LA RAISON DE SA FORME. Un écran de résultats porte vingt
   * notices ; une requête par notice ferait vingt appels pour afficher une
   * page. L'écran envoie les identifiants qu'il vient de recevoir, et reçoit
   * seulement ceux qui viennent d'ailleurs.
   *
   * ⚠ LES NOTICES LOCALES SONT ABSENTES DU RÉSULTAT, et leur absence EST la
   * réponse. Rendre « provenance: null » pour chacune ferait porter à l'écran
   * une liste de « rien à dire » aussi longue que ses résultats.
   *
   * ⚠ PUBLIQUE, comme les notices qu'elle décrit : dire qu'une notice vient
   * d'une autre école n'apprend rien de plus que la notice elle-même, et c'est
   * au visiteur anonyme qu'elle sert le plus — c'est lui qu'on renvoie vers
   * l'origine, puisque le fichier n'est pas ici.
   */
  @Get('provenances')
  @ApiOperation({
    summary: 'D’où viennent ces notices — celles qui ont été moissonnées',
    description:
      'Décision 1 du brief P7 : ce qui arrive par moissonnage reste marqué ' +
      'comme tel. Chaque entrée porte l’école d’origine, l’identifiant de la ' +
      'notice CHEZ ELLE, et le lien public quand la source en publie un. ' +
      '⚠ `lien: null` quand elle n’en publie pas — on ne fabrique pas une ' +
      'adresse : un lien mort affiché est pire qu’un lien absent.',
  })
  async provenances(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query('ids') ids?: string,
  ) {
    const resolved = this.requireTenant(tenant);
    const liste = (ids ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      // ⚠ BORNE DÉCLARÉE : une page de résultats en porte vingt, cent est déjà
      // large. Sans borne, un `ids=` de dix mille entrées ferait une requête
      // `IN` que personne n'a voulue — sur une route publique et sans session.
      .slice(0, 100);
    return this.provenance.provenances(this.prisma.forTenant(resolved.slug), liste);
  }

  /**
   * RÉSOUT UN IDENTIFIANT PÉRENNE VERS SA NOTICE — P7-2.
   *
   * ⚠ ELLE EST DÉCLARÉE AVANT `records/:id` PARCE QUE NEST APPARIE DANS
   * L'ORDRE. Placée après, `resoudre/:identifiant` serait mangée par… rien,
   * en réalité — les deux chemins ont deux segments et ne se recouvrent pas.
   * Mais l'ordre reste celui qu'on lit, et une route littérale avant une route
   * à paramètre est la seule disposition qui ne demande pas de vérifier.
   *
   * ⚠ TROIS REFUS DISTINCTS, et ils ne se disent pas pareil :
   *  · la forme est mauvaise → on dit laquelle est attendue ;
   *  · l'identifiant désigne une AUTRE école → « introuvable ici », jamais
   *    « existe ailleurs » : ce serait dire à un inconnu ce que porte le
   *    catalogue d'un tiers ;
   *  · la notice n'existe pas → 404, et c'est `recordDetail` qui le rend.
   */
  /**
   * ⭐ UNE ADRESSE SCANNÉE — ce que l'application mobile tient après un QR.
   *
   * Le QR d'une étiquette porte une URL, pas un identifiant : c'est ce qu'un
   * appareil photo ordinaire sait ouvrir. L'application, elle, veut la NOTICE.
   *
   * ## ⚠ POURQUOI UNE ROUTE, ET PAS « que le client découpe l'URL »
   *
   * Parce que le refus qui compte ne se lit pas dans le chemin : **une adresse
   * d'un AUTRE établissement se reconnaît à son HÔTE**, et seul le serveur sait
   * quels domaines sont les siens. Un client qui découperait l'URL lui-même
   * appellerait `/opac/records/<id>` sur SA propre école, ne trouverait rien,
   * et dirait « notice introuvable » — alors que le livre existe, ailleurs.
   *
   * ⚠ ET LES DEUX REFUS NE SE DISENT PAS PAREIL : « ce n'est pas un QR
   * Gafeso » et « ce livre appartient à une autre bibliothèque » appellent deux
   * gestes différents. Le second NOMME l'hôte, pour que l'application puisse
   * dire à son lecteur où aller — sans rien révéler du catalogue d'en face.
   */
  @Get('scan')
  @ApiOperation({
    summary: 'Reconnaître une adresse scannée (QR d’étiquette) et rendre la notice',
    description:
      'Rend la fiche publique si l’adresse appartient à CET établissement. ' +
      '⚠ 404 « illisible » si ce n’est pas une adresse de notice Gafeso ; ' +
      '409 si elle appartient à un AUTRE établissement, avec son hôte — pour ' +
      'que l’application dise où aller plutôt que « introuvable ».',
  })
  async scan(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query('url') url: string,
    @Headers('authorization') authorization?: string,
    @Headers('cookie') cookie?: string,
  ) {
    const resolved = this.requireTenant(tenant);
    if (!url || typeof url !== 'string') {
      throw new NotFoundException(
        'Aucune adresse à reconnaître : passez l’adresse scannée dans `url`.',
      );
    }
    const hotes = await this.opac.hotesDeLEcole(resolved.slug);
    const lu = reconnaitreAdresse(url, hotes);
    if (!lu.reconnue) {
      if (lu.motif === 'autre-etablissement') {
        throw new ConflictException(
          `Ce document appartient à une autre bibliothèque (${lu.hote}). ` +
            'Changez d’établissement dans l’application pour l’ouvrir.',
        );
      }
      throw new NotFoundException(
        'Cette adresse n’est pas celle d’une notice Gafeso. Scannez le QR de ' +
          'l’étiquette, pas le code-barres.',
      );
    }
    const db = this.prisma.forTenant(resolved.slug);
    const membre = this.isMember(resolved.slug, authorization, cookie);
    const record = await this.opac.recordDetail(db, lu.recordId, membre, resolved.slug);

    /**
     * ⭐ LE NIVEAU SE RÉSOUT EN BASE, PAS DANS LE JETON.
     *
     * `circulation.faire` est la fonction du guichet : c'est elle qui distingue
     * un bibliothécaire d'un étudiant, et elle est relue à CHAQUE requête par
     * `AuthzService`. Lire le rôle du JWT ferait survivre un droit révoqué
     * jusqu'à l'expiration du jeton — et ce qui est en jeu ici est le nom d'un
     * emprunteur.
     *
     * ⚠ Un jeton illisible ou d'une autre école donne `visiteur`, jamais une
     * erreur : un QR se scanne sans être connecté, c'est son usage normal.
     */
    const sujet = this.sujetDuJeton(resolved.slug, authorization, cookie);
    let niveau: NiveauDeScan = 'visiteur';
    if (sujet) {
      niveau = (await this.authz.hasFunction(db, sujet, FONCTIONS.CIRCULATION_FAIRE))
        ? 'bibliothecaire'
        : 'etudiant';
    }

    const exemplaires = await this.opac.exemplairesPourLeScan(db, lu.recordId);
    /**
     * ⚠ LA LECTURE EN LIGNE SE DEMANDE AU CONTRÔLE D'ACCÈS, jamais au niveau.
     * Un étudiant de la mauvaise classe est `etudiant` et n'a PAS le droit de
     * lire : confondre les deux rendrait une action qui échoue au clic.
     */
    let lectureEnLigne = false;
    if (sujet) {
      // ⚠ `document.lire` est la lecture LIBRE du personnel : pas de contexte à
      // construire, et surtout pas d'embargo à contourner — c'est la même
      // distinction que la route de lecture en ligne fait déjà.
      if (await this.authz.hasFunction(db, sujet, FONCTIONS.DOCUMENT_LIRE)) {
        lectureEnLigne = true;
      } else {
        const ctx = await this.accessControl.buildStudentContext(resolved, db, sujet);
        const etat = await this.accessControl.getRecordAccessStatus(db, ctx, lu.recordId);
        lectureEnLigne = etat.granted;
      }
    }

    return reponseDeScan({
      niveau,
      record,
      exemplaires,
      exemplaire: exemplaires[0] ?? null,
      lectureEnLigne,
      maintenant: new Date(),
    });
  }

  /**
   * Le sujet du jeton, ou `null`. Même lecture que `isMember`, mais elle REND
   * l'identifiant : sans lui on ne peut pas interroger les fonctions en base.
   */
  private sujetDuJeton(
    tenantSlug: string,
    authorization?: string,
    cookie?: string,
  ): string | null {
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const token = bearer ?? tokenFromCookieHeader(cookie);
    if (!token) return null;
    try {
      const payload = this.jwt.verify(token) as { tenant?: string; sub?: string };
      return payload.tenant === tenantSlug && payload.sub ? payload.sub : null;
    } catch {
      return null;
    }
  }

  @Get('resoudre/:identifiant')
  @ApiOperation({
    summary: 'Résoudre un identifiant pérenne (`oai:<école>:<uuid>`) vers sa notice',
    description:
      'L’identifiant ne porte AUCUN domaine : il survit à un déménagement de ' +
      'serveur, là où l’URL qui mène ici, elle, est une localisation — donc ' +
      'périssable par nature. C’est la distinction qui empêche un catalogue de ' +
      'perdre la moitié de ses liens après une migration. ' +
      '⚠ Elle rend la NOTICE, jamais le fichier : l’accès au document reste ' +
      '`/opac/records/:id/read`, qui passe par le contrôle d’accès et par ' +
      'l’embargo. Une URL résolvable dans les métadonnées n’ouvre donc rien.',
  })
  async resoudre(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('identifiant') identifiant: string,
    @Headers('authorization') authorization?: string,
    @Headers('cookie') cookie?: string,
  ) {
    const resolved = this.requireTenant(tenant);
    const analyse = analyserIdentifiant(identifiant);
    if (!analyse) {
      throw new NotFoundException(
        `Identifiant « ${identifiant} » illisible : attendu la forme oai:<école>:<identifiant>.`,
      );
    }
    if (analyse.slug !== resolved.slug) {
      // ⚠ « INTROUVABLE ICI », ET SURTOUT PAS « IL EXISTE AILLEURS ». Le second
      // dirait à n'importe qui ce que porte le catalogue d'un autre
      // établissement — sur une route publique, sans session.
      throw new NotFoundException(
        `Aucune notice sous cet identifiant dans ce catalogue.`,
      );
    }
    return this.opac.recordDetail(
      this.prisma.forTenant(resolved.slug),
      analyse.id,
      this.isMember(resolved.slug, authorization, cookie),
      // ⚠ LE SLUG EST OBLIGATOIRE ICI, et un garde l'exige : sans lui,
      // `publicUrl` et `identifiantPerenne` sortiraient à `null` pour
      // toujours — « une colonne SERVIE que personne ne remplit ».
      resolved.slug,
    );
  }

  @Get('records/:id')
  @ApiOperation({
    summary: 'Fiche détaillée d’une notice (public)',
    description:
      'Exemplaires et disponibilité réservés aux membres : sans JWT valide, ' +
      'la réponse porte membersOnly=true et masque ces champs.',
  })
  async record(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('cookie') cookie?: string,
  ) {
    const resolved = this.requireTenant(tenant);
    return this.opac.recordDetail(
      this.prisma.forTenant(resolved.slug),
      id,
      this.isMember(resolved.slug, authorization, cookie),
      // ⚠ LE SLUG EST OBLIGATOIRE ICI, et un garde l'exige : sans lui,
      // `publicUrl` et `identifiantPerenne` sortiraient à `null` pour
      // toujours — « une colonne SERVIE que personne ne remplit ».
      resolved.slug,
    );
  }

  @Get('records/:id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'URL de lecture en ligne du fichier numérique (membres autorisés uniquement)',
    description:
      'Étudiants : réservé à ceux dont la classe/l’abonnement donne accès à ce ' +
      'document (module access-control, brique 4) — 403 sinon, vérifié côté ' +
      'serveur, jamais seulement côté front. Personnel (bibliothécaire, ' +
      'gestionnaire, admin) : lecture sans restriction ; le téléchargement ' +
      'reste réservé à l’admin. URL signée valable 2 h.',
  })
  async read(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const resolved = this.requireTenant(tenant);
    const db = this.prisma.forTenant(resolved.slug);
    // Fonction document.lire (personnel) : lecture libre (ctx null).
    // Sinon : contexte classe/abonnement soumis à access-control.
    const readsAll = await this.authz.hasFunction(db, user.sub, FONCTIONS.DOCUMENT_LIRE);
    const ctx = readsAll
      ? null
      : await this.accessControl.buildStudentContext(resolved, db, user.sub);
    return this.opac.getReadUrl(db, id, ctx, user.sub);
  }
}
