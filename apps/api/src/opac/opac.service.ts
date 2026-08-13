import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemStatus, PrismaClient } from '@prisma/client';
import { SearchService } from '../search/search.service';
import { DigitalCopyService } from '../cataloging/digital-copy.service';
import { AccessControlService } from '../access-control/access-control.service';
import { StudentAccessContext } from '../access-control/access-control.matching';
import { normalizeAuthorName } from '../authors/author-name';
import { OpacSearchDto } from './dto/opac-search.dto';

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
  ) {}

  /**
   * Recherche plein texte + facettes. Les filtres actifs sont combinés en AND ;
   * les valeurs texte sont échappées (JSON.stringify) pour le langage de filtre
   * Meilisearch.
   */
  async searchCatalog(slug: string, query: OpacSearchDto) {
    const filter: string[] = [];
    if (query.category) filter.push(`category = ${JSON.stringify(query.category)}`);
    if (query.language) filter.push(`language = ${JSON.stringify(query.language)}`);
    if (query.recordType)
      filter.push(`recordType = ${JSON.stringify(query.recordType)}`);
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

    return {
      hits: result.hits,
      totalHits: result.totalHits,
      page: result.page,
      totalPages: result.totalPages,
      facets: result.facetDistribution ?? {},
    };
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
  async recordDetail(db: TenantDb, id: string, member = true) {
    const found = await db.biblioRecord.findUnique({
      where: { id },
      include: {
        items: true,
        digitalCopy: true,
        contributors: { orderBy: { position: 'asc' } },
        keywords: { include: { keyword: true } },
      },
    });
    if (!found) throw new NotFoundException('Notice introuvable.');
    // Mots-clés aplatis en tableau de chaînes (comme côté cataloging).
    const record = { ...found, keywords: found.keywords.map((link) => link.keyword.name) };

    if (!member) {
      const { items: _items, digitalCopy: _digitalCopy, ...publicFields } = record;
      return {
        ...publicFields,
        items: [],
        availability: null,
        digitalCopy: null,
        membersOnly: true,
      };
    }

    const available = record.items.filter(
      (item) => item.status === ItemStatus.AVAILABLE,
    ).length;

    const { digitalCopy, ...fields } = record;

    return {
      ...fields,
      availability: {
        totalItems: record.items.length,
        available,
        borrowable: available > 0,
      },
      // Format seulement — jamais l'URL ni la clé objet ici (voir /read).
      digitalCopy: digitalCopy ? { fileFormat: digitalCopy.fileFormat } : null,
      membersOnly: false,
    };
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
