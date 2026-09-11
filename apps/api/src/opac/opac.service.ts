import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, ItemStatus, PrismaClient, UserRole } from '@prisma/client';
import { SearchService } from '../search/search.service';
import { DigitalCopyService } from '../cataloging/digital-copy.service';
import { AccessControlService } from '../access-control/access-control.service';
import { StudentAccessContext } from '../access-control/access-control.matching';
import { normalizeAuthorName } from '../authors/author-name';
import { OpacSearchDto } from './dto/opac-search.dto';
import { NOUVEAUTES_PAR_DEFAUT } from './dto/nouveautes.dto';
import { PARCOURIR_PAR_DEFAUT } from './dto/parcourir.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CacheMemoireTTL } from './cache-memoire';
import { COLONNES_SERVIES, selectNoticePublique } from './contrat-notice-publique';
import { lireChampsDeProfil } from '../cataloging/champs-de-profil';

/**
 * Durée de vie des chiffres publics. EXPORTÉE parce que l'en-tête
 * `Cache-Control` de la route doit annoncer LA MÊME durée : deux valeurs
 * écrites séparément finiraient par diverger, et la page annoncerait une
 * fraîcheur que le serveur ne tient pas.
 */
export const CHIFFRES_TTL_SECONDS = 60;

/**
 * Rôles du PERSONNEL de la bibliothèque, exclus du compte des lecteurs.
 *
 * ⚠ Exprimé en EXCLUSION (`notIn`) et non en inclusion (`role = STUDENT`), et
 * c'est délibéré : une bibliothèque universitaire inscrit aussi des
 * enseignants, des chercheurs, du personnel administratif. Les compter par
 * `STUDENT` seul donnerait un chiffre étroit — faux, et faux en public.
 *
 * ⚠ Ce que l'exclusion laisse passer : un agent de la bibliothèque activé sur
 * un rôle PERSONNALISÉ garde `role = STUDENT` (buildAssignmentPatch ne
 * repositionne l'enum que pour les rôles SYSTÈME) et sera compté parmi les
 * lecteurs. Le chiffre est donc légèrement LARGE, jamais étroit — c'est le sens
 * dans lequel on préfère se tromper sur un chiffre affiché en public.
 */
export const PERSONNEL_BIBLIOTHEQUE: UserRole[] = [
  UserRole.LIBRARIAN,
  UserRole.MANAGER,
  UserRole.ACQUISITIONS,
  UserRole.ADMIN,
];

/**
 * Une notice de la section « À découvrir dans le catalogue ».
 *
 * ⚠ `coverUrl` vaut `null` quand la notice n'a pas de couverture — il n'est PAS
 * omis. Le front le type `string | null` et affiche un repli ; un champ absent
 * l'obligerait à distinguer « pas de couverture » de « champ jamais servi ».
 */
export interface NoticeRecente {
  id: string;
  title: string;
  author: string | null;
  publishYear: number | null;
  recordType: string;
  coverUrl: string | null;
}

/**
 * Découpe une liste « a,b,c » en valeurs propres.
 *
 * Les vides sont écartés : « book, ,these » vaut « book,these », et une chaîne
 * qui ne contient que des virgules ne produit AUCUN filtre — elle ne doit pas
 * produire un filtre impossible qui rendrait zéro résultat en silence.
 */
export function decouperListe(brut?: string): string[] {
  if (!brut) return [];
  return brut
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Une page de parcours du catalogue, même forme que la recherche. */
export interface PageDeNotices {
  hits: NoticeRecente[];
  totalHits: number;
  page: number;
  totalPages: number;
}

/** Les quatre entiers du contrat public. Rien d'autre n'y entre. */
export interface ChiffresDuFonds {
  documents: number;
  lecteurs: number;
  documentsNumeriques: number;
  lecturesHorsLigne: number;
}

export type TenantDb = PrismaClient;

const FACETS = ['category', 'language', 'publishYear', 'recordType'];
// Court À DESSEIN (protection raisonnable, non un DRM — cf.
// docs/architecture-securite-offline.md §1) : les deux lecteurs
// téléchargent le fichier EN ENTIER à
// l'ouverture (PDF : fetch → ArrayBuffer dans pdf-reader.tsx ; EPUB :
// openAs 'epub' dans epub-reader.tsx), l'URL signée n'a donc besoin de
// couvrir que ce téléchargement initial — pas la session de lecture, qui
// peut durer des heures sans nouvelle requête. Un TTL long ne ferait que
// prolonger la fenêtre où l'URL, visible dans l'onglet Réseau, reste
// partageable/téléchargeable hors application.
const READ_URL_TTL_SECONDS = 5 * 60;

@Injectable()
export class OpacService {
  constructor(
    private readonly search: SearchService,
    private readonly digitalCopy: DigitalCopyService,
    private readonly accessControl: AccessControlService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Cache des chiffres publics, CLÉ = slug de l'établissement.
   *
   * ⚠ La clé fait l'isolement : deux écoles ne peuvent pas se voir, même en
   * cache. Une clé unique (ou pas de clé) ferait fuiter les chiffres de la
   * première école appelée vers toutes les autres.
   */
  private readonly cacheChiffres = new CacheMemoireTTL<ChiffresDuFonds>(
    CHIFFRES_TTL_SECONDS * 1000,
  );

  /**
   * Cache des nouveautés. CLÉ = slug + limite : deux tailles demandées sont
   * deux réponses différentes, les confondre servirait six notices à qui en
   * demande douze.
   */
  private readonly cacheNouveautes = new CacheMemoireTTL<{ hits: NoticeRecente[] }>(
    CHIFFRES_TTL_SECONDS * 1000,
  );

  /**
   * Cache du PARCOURS. Sa clé porte page, limite et filtre : l'espace de clés
   * est donc ouvert sur une route publique, et c'est pour lui que le plafond du
   * cache a été posé (voir CacheMemoireTTL). Sans plafond, itérer
   * `?page=1..100000` ferait grandir la mémoire indéfiniment.
   */
  private readonly cacheParcours = new CacheMemoireTTL<PageDeNotices>(
    CHIFFRES_TTL_SECONDS * 1000,
  );

  /** Cache de la constellation. Clé = slug : un seul agrégat par école. */
  private readonly cacheConstellation = new CacheMemoireTTL<{
    totalRecords: number;
    domains: { category: string; count: number }[];
  }>(CHIFFRES_TTL_SECONDS * 1000);

  /**
   * Chiffres publics du fonds. Quatre entiers, aucune donnée nominative.
   *
   * Route PUBLIQUE, donc appelable à volonté : les quatre comptages sont mis en
   * cache une minute. Un chiffre affiché n'a pas besoin d'être à la seconde,
   * mais il doit dire sa fraîcheur — c'est l'en-tête `Cache-Control` de la
   * route qui l'annonce, pour que le corps reste exactement le contrat convenu.
   *
   * ⚠ Aucun filtrage par seuil ici. L'API sert les chiffres tels qu'ils sont, y
   * compris petits : masquer une tuile sous 50 est une décision d'affichage.
   * Filtrer côté serveur rendrait un petit fonds indiscernable d'un fonds
   * absent — exactement le motif qu'on passe notre temps à corriger.
   */
  async chiffresDuFonds(slug: string): Promise<ChiffresDuFonds> {
    return this.cacheChiffres.valeur(slug, async () => {
      const db = this.prisma.forTenant(slug);
      const [documents, lecteurs, documentsNumeriques, lecturesHorsLigne] =
        await Promise.all([
          db.biblioRecord.count(),
          db.user.count({
            where: {
              status: AccountStatus.ACTIVE,
              role: { notIn: PERSONNEL_BIBLIOTHEQUE },
            },
          }),
          // ⚠ Compté en NOTICES, pas en fichiers. Les deux donnent le même
          // nombre aujourd'hui (DigitalCopy.recordId est @unique), mais le jour
          // où une notice portera plusieurs fichiers, compter les fichiers
          // deviendrait faux EN SILENCE. La question posée est « combien de
          // notices ont un fichier » : on la pose telle quelle.
          db.biblioRecord.count({ where: { digitalCopy: { isNot: null } } }),
          db.offlineLicense.count(),
        ]);
      return { documents, lecteurs, documentsNumeriques, lecturesHorsLigne };
    });
  }

  /**
   * Les notices les plus récemment AJOUTÉES au catalogue.
   *
   * ⚠ « Récemment ajoutée » n'est PAS « récemment acquise ». `created_at` est
   * posé par le défaut Prisma au moment où la LIGNE est écrite : il n'est jamais
   * renseigné explicitement, ni à la saisie ni à l'import. Un fonds repris par
   * import porte donc la date de l'import sur toutes ses notices. C'est pourquoi
   * la section s'intitule « À découvrir dans le catalogue » et non « Dernières
   * acquisitions » : le second serait une affirmation fausse.
   *
   * ⚠ DÉPARTAGE OBLIGATOIRE. Avec des milliers de notices à la même seconde,
   * `created_at DESC` seul rend un ordre INDÉFINI : les six notices peuvent
   * changer d'un appel à l'autre sans qu'aucune donnée n'ait bougé. Le second
   * critère `id DESC` rend l'ordre stable — c'est le genre d'instabilité que
   * personne ne diagnostique jamais.
   *
   * ⚠ Pourquoi pas le moteur de recherche : il n'indexe aucun horodatage et
   * `SORTABLE_ATTRIBUTES` ne connaît que `title` et `publishYear`. Ouvrir un
   * vrai tri exigerait le champ dans le document, dans les DEUX moteurs, et une
   * réindexation de chaque établissement. Six notices ne le justifient pas.
   *
   * ⚠ Mis en cache comme les chiffres : la route est publique, et il n'existe
   * aucun index sur `created_at` — le tri balaie donc la table. Cadencé à une
   * fois par minute et par école, le coût est indifférent ; le jour où un fonds
   * réel arrive, un index sur (created_at DESC, id DESC) serait le vrai remède.
   */
  async nouveautes(
    slug: string,
    limit: number = NOUVEAUTES_PAR_DEFAUT,
    avecFichier = false,
  ): Promise<{ hits: NoticeRecente[] }> {
    // ⚠ La clé porte les DEUX paramètres. Sans `avecFichier`, la liste filtrée
    // et la liste complète se confondraient : le premier appelant fixerait la
    // réponse de l'autre pendant une minute.
    return this.cacheNouveautes.valeur(`${slug}:${limit}:${avecFichier}`, async () => {
      const db = this.prisma.forTenant(slug);
      const hits = await db.biblioRecord.findMany({
        // « A un fichier » se lit DANS LA BASE, pas dans l'index : le document
        // indexé ne porte aucune notion de fichier numérique, et l'y ajouter
        // coûterait une réindexation de chaque école plus une synchronisation à
        // la suppression qui n'existe pas. Ce filtre ne se combine pas avec le
        // plein texte — c'est un filtre de liste, pas une facette de recherche.
        // Le prédicat est celui qui compte déjà les documents numériques.
        ...(avecFichier ? { where: { digitalCopy: { isNot: null } } } : {}),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: {
          id: true,
          title: true,
          author: true,
          publishYear: true,
          recordType: true,
          coverUrl: true,
        },
      });
      // On rend ce qu'il y a : moins de `limit` notices n'est pas une erreur, et
      // rien ne complète la liste. Une liste vide est une liste vide.
      return { hits };
    });
  }

  /**
   * Parcours du catalogue, servi par la BASE — paginé, avec un total juste.
   *
   * ⚠ POURQUOI UNE ROUTE À PART, et non un paramètre de /opac/nouveautes : une
   * route nommée « nouveautés » qui sert un parcours filtré serait un nom qui
   * ment, et un nom faux finit toujours par gagner sur le code qu'il décrit.
   * `nouveautes` reste les six de l'accueil.
   *
   * ⚠ POURQUOI PAS /opac/search : le filtre « a un fichier » se lit en base, et
   * le moteur n'en sait rien. Le post-filtrer après la recherche rendrait
   * `totalHits`, `totalPages` et les compteurs de facettes faux — la page
   * annoncerait douze résultats et en montrerait trois. Ici le total et la
   * pagination viennent de la MÊME requête que les notices : ils ne peuvent pas
   * se contredire.
  *
   * ⚠ NE RETIREZ PAS `id: 'desc'` DU TRI. Ce n'est pas une précaution
   * décorative : sur un fonds chargé en masse, les notices partagent la même
   * seconde de `created_at`, et `ORDER BY created_at DESC` seul rend un ordre
   * INDÉFINI d'une page à l'autre.
   * Mesuré le 10 septembre 2026 sur les 352 notices de démonstration, dont 340
   * à la même seconde : le balayage des 18 pages sans départage ramène
   * **20 doublons et laisse 20 notices invisibles** — 5,7 % du fonds, en
   * silence. Avec le départage : 352 notices distinctes, zéro doublon.
   */
  async parcourir(
    slug: string,
    page = 1,
    limit: number = PARCOURIR_PAR_DEFAUT,
    avecFichier = false,
  ): Promise<PageDeNotices> {
    return this.cacheParcours.valeur(`${slug}:${page}:${limit}:${avecFichier}`, async () => {
      const db = this.prisma.forTenant(slug);
      const where = avecFichier ? { digitalCopy: { isNot: null } } : undefined;
      const [totalHits, hits] = await Promise.all([
        db.biblioRecord.count({ where }),
        db.biblioRecord.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            title: true,
            author: true,
            publishYear: true,
            recordType: true,
            coverUrl: true,
          },
        }),
      ]);
      // Une page au-delà de la fin rend une liste vide avec le VRAI total :
      // « il n'y a rien ici » et « il n'y a rien du tout » restent distincts.
      return { hits, totalHits, page, totalPages: Math.ceil(totalHits / limit) };
    });
  }

  /**
   * Recherche plein texte + facettes. Les filtres actifs sont combinés en AND ;
   * les valeurs texte sont échappées (JSON.stringify) pour le langage de filtre
   * Meilisearch.
   */
  async searchCatalog(slug: string, query: OpacSearchDto) {
    const filter: string[] = [];
    if (query.category) filter.push(`category = ${JSON.stringify(query.category)}`);
    if (query.language) filter.push(`language = ${JSON.stringify(query.language)}`);
    // Plusieurs types acceptés, séparés par une virgule. La forme produite —
    // un groupe OU d'égalités — est EXACTEMENT celle que le filtre catégories
    // émet déjà, donc celle que l'adaptateur Elasticsearch sait déjà traduire
    // (meili-filter.ts). Aucun changement d'index, aucune réindexation.
    const types = decouperListe(query.recordType);
    if (types.length === 1) {
      filter.push(`recordType = ${JSON.stringify(types[0])}`);
    } else if (types.length > 1) {
      filter.push(`(${types.map((t) => `recordType = ${JSON.stringify(t)}`).join(' OR ')})`);
    }
    if (query.year !== undefined) filter.push(`publishYear = ${query.year}`);

    // Recherche par champ (§5) : « titre » restreint aux attributs de titre
    // (jamais ISBN ni résumé) ; « categorie » filtre sur les catégories dont le
    // nom correspond (réutilise la facette). « tout » = comportement global.
    let q = query.q;
    let attributesToSearchOn: string[] | undefined;
    if (query.dans === 'titre') {
      attributesToSearchOn = ['title', 'titleComplement'];
    } else if (query.dans === 'categorie' && q?.trim()) {
      const matching = await this.matchingCategories(slug, q);
      if (matching.length === 0) {
        return { hits: [], totalHits: 0, page: query.page ?? 1, totalPages: 0, facets: {} };
      }
      filter.push(
        `(${matching.map((c) => `category = ${JSON.stringify(c)}`).join(' OR ')})`,
      );
      q = undefined; // on liste les notices des catégories, sans plein-texte
    }

    const result = await this.search.search(slug, {
      q,
      filter,
      page: query.page ?? 1,
      hitsPerPage: query.limit ?? 20,
      facets: FACETS,
      attributesToSearchOn,
    });

    // ⚠ ZÉRO RÉSULTAT A DEUX CAUSES, ET ELLES NE S'ÉCRIVENT PAS PAREIL.
    //
    // « aucune notice ne correspond à cette combinaison » est une réponse
    // légitime — c'est le cas de `category=droit` croisé avec `recordType=these`
    // quand aucune thèse de droit n'existe. Refuser cette requête serait faux.
    //
    // « la valeur demandée n'existe NULLE PART dans ce catalogue » est autre
    // chose : une URL partagée portant un type périmé affichait un catalogue
    // vide, sans un mot. Un fonds vide et un filtre invalide s'écrivaient
    // pareil — exactement le motif que ce produit passe son temps à corriger.
    //
    // On le DIT donc, au lieu de refuser. Le surcoût n'est payé que dans le cas
    // vide (une requête de facettes non filtrée) : le chemin nominal ne change
    // pas, et c'est précisément le cas vide qui a besoin d'être expliqué.
    const filtresInconnus =
      result.totalHits === 0 ? await this.valeursHorsCatalogue(slug, query) : undefined;

    return {
      hits: result.hits,
      totalHits: result.totalHits,
      page: result.page,
      totalPages: result.totalPages,
      facets: result.facetDistribution ?? {},
      // Absent quand tout est connu : le contrat du chemin nominal est inchangé.
      ...(filtresInconnus && Object.keys(filtresInconnus).length > 0
        ? { filtresInconnus }
        : {}),
    };
  }

  /**
   * Parmi les valeurs de facette demandées, celles qui n'existent NULLE PART
   * dans le catalogue de l'établissement.
   *
   * Mesuré contre la distribution de facettes NON filtrée : c'est la seule
   * façon de distinguer « cette valeur n'existe pas » de « cette combinaison ne
   * donne rien ». Appelée uniquement quand la recherche ne rend aucun résultat.
   */
  private async valeursHorsCatalogue(
    slug: string,
    query: OpacSearchDto,
  ): Promise<Record<string, string[]>> {
    const demandees: [string, string[]][] = [
      ['recordType', decouperListe(query.recordType)],
      ['category', query.category ? [query.category] : []],
      ['language', query.language ? [query.language] : []],
      ['publishYear', query.year !== undefined ? [String(query.year)] : []],
    ].filter(([, v]) => (v as string[]).length > 0) as [string, string[]][];
    if (demandees.length === 0) return {};

    const complet = await this.search.search(slug, {
      q: undefined,
      page: 1,
      hitsPerPage: 1,
      facets: FACETS,
    });
    const distribution = (complet.facetDistribution ?? {}) as Record<
      string,
      Record<string, number>
    >;

    const inconnues: Record<string, string[]> = {};
    for (const [champ, valeurs] of demandees) {
      const connues = Object.keys(distribution[champ] ?? {});
      const absentes = valeurs.filter((v) => !connues.includes(v));
      if (absentes.length > 0) inconnues[champ] = absentes;
    }
    return inconnues;
  }

  /**
   * Catégories existantes dont le nom correspond à `q` (insensible casse/accents),
   * lues via la facette `category` — réutilise l'agrégation Meilisearch existante.
   */
  private async matchingCategories(slug: string, q: string): Promise<string[]> {
    const facetRes = await this.search.search(slug, {
      q: '',
      filter: [],
      page: 1,
      hitsPerPage: 0,
      facets: ['category'],
    });
    const distribution = (facetRes.facetDistribution as Record<string, Record<string, number>>) ?? {};
    const categories = Object.keys(distribution.category ?? {});
    const needle = normalizeAuthorName(q);
    return categories.filter((c) => normalizeAuthorName(c).includes(needle));
  }

  /**
   * Fiche détaillée : notice + exemplaires + synthèse de disponibilité.
   * Les exemplaires et la disponibilité sont réservés aux membres : pour un
   * visiteur anonyme (`member = false`), ils sont masqués et la réponse porte
   * `membersOnly: true` (l'interface affiche alors le cadenas).
   */
  /**
   * Détail d'une notice — LA SURFACE QUE PROTÈGE I7.
   *
   * ⚠ Le `select` vient d'une DÉCLARATION, plus d'un `include`. La route
   * renvoyait toute la ligne : 26 clés pour 9 utilisées, et toute colonne
   * ajoutée au modèle partait automatiquement vers les téléphones — `profile`
   * l'a prouvé. I7 protège contre les retraits ; rien ne protégeait contre les
   * ajouts.
   *
   * ⚠ LA RÉPONSE N'A PAS RÉTRÉCI, elle est GELÉE : mêmes 26 clés, même ordre.
   * La réduire aux 9 utiles casserait des APK déjà installés ; ce sera un lot
   * annoncé, avec coexistence. Voir `contrat-notice-publique.ts`.
   *
   * Les clés sont construites dans l'ordre du contrat, et non par étalement :
   * l'ordre fait partie de ce qu'on a promis de ne pas changer, et le filet le
   * compare à l'octet.
   */
  async recordDetail(db: TenantDb, id: string, member = true) {
    const found = await db.biblioRecord.findUnique({
      where: { id },
      select: selectNoticePublique(),
    });
    if (!found) throw new NotFoundException('Notice introuvable.');

    const ligne = found as unknown as Record<string, unknown> & {
      keywords: { keyword: { name: string } }[];
      items: { status: ItemStatus }[];
      digitalCopy: { fileFormat: string } | null;
    };

    // ⚠ P3-3 : les trois champs de PROFIL viennent de `profileData`, plus des
    // colonnes. Les colonnes existent encore (temps 1) — lire le JSON est ce
    // qui prouve que le temps 2 pourra les retirer sans rien changer. La clé et
    // l'ordre dans la réponse, eux, ne bougent pas d'un octet.
    const profil = lireChampsDeProfil(ligne.profileData) as unknown as Record<string, unknown>;

    // Ordre du contrat, colonne par colonne. Verbeux, et c'est le prix du gel :
    // une colonne nouvelle n'entre pas ici sans qu'on l'ait écrite.
    const reponse: Record<string, unknown> = {};
    for (const colonne of COLONNES_SERVIES) {
      reponse[colonne] = colonne in profil ? profil[colonne] : ligne[colonne];
    }
    reponse.contributors = ligne.contributors;
    // Mots-clés aplatis en tableau de chaînes (comme côté cataloging).
    reponse.keywords = ligne.keywords.map((lien) => lien.keyword.name);

    if (!member) {
      reponse.items = [];
      reponse.availability = null;
      reponse.digitalCopy = null;
      reponse.membersOnly = true;
      return reponse;
    }

    const disponibles = ligne.items.filter(
      (item) => item.status === ItemStatus.AVAILABLE,
    ).length;

    reponse.items = ligne.items;
    reponse.availability = {
      totalItems: ligne.items.length,
      available: disponibles,
      borrowable: disponibles > 0,
    };
    // Format seulement — jamais l'URL ni la clé objet ici (voir /read). Le
    // `select` ne va même pas les chercher en base.
    reponse.digitalCopy = ligne.digitalCopy
      ? { fileFormat: ligne.digitalCopy.fileFormat }
      : null;
    reponse.membersOnly = false;
    return reponse;
  }

  /**
   * URL de lecture en ligne (signée, expiration courte — voir
   * READ_URL_TTL_SECONDS ci-dessus).
   * Contrôle d'accès (brique 4) appliqué ICI, côté serveur : un étudiant sans
   * droit sur ce document (classe/abonnement, via access-control) reçoit un
   * 403 et n'obtient JAMAIS l'URL signée — le verrouillage côté front n'est
   * qu'une commodité d'affichage. `ctx` null = membre du personnel : lecture
   * sans restriction de classe/abonnement (le téléchargement, lui, reste
   * réservé à l'admin — cataloging.controller).
   */
  async getReadUrl(db: TenantDb, id: string, ctx: StudentAccessContext | null) {
    const record = await db.biblioRecord.findUnique({
      where: { id },
      select: { title: true },
    });
    if (!record) throw new NotFoundException('Notice introuvable.');

    if (ctx !== null) {
      const access = await this.accessControl.getRecordAccessStatus(ctx, id);
      if (!access.granted) throw new ForbiddenException(access.message);
    }

    const { url, fileFormat, expiresInSeconds } = await this.digitalCopy.getDownloadUrl(
      db,
      id,
      READ_URL_TTL_SECONDS,
    );
    return { url, fileFormat, expiresInSeconds, title: record.title };
  }

  /**
   * Répartition du catalogue par catégorie — alimente la page constellation.
   * S'appuie sur la facette `category` de Meilisearch.
   */
  async constellation(slug: string) {
    // Route PUBLIQUE de la page d'accueil, et jusqu'ici la seule à interroger
    // Meilisearch à CHAQUE visite. Même cache que les autres chiffres publics :
    // un agrégat de répartition n'a pas besoin d'être à la seconde.
    return this.cacheConstellation.valeur(slug, () => this.calculerConstellation(slug));
  }

  private async calculerConstellation(slug: string) {
    const result = await this.search.search(slug, {
      q: '',
      page: 1,
      hitsPerPage: 1,
      facets: ['category'],
    });

    const distribution = (result.facetDistribution?.category ?? {}) as Record<
      string,
      number
    >;
    const domains = Object.entries(distribution)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return { totalRecords: result.totalHits, domains };
  }
}
