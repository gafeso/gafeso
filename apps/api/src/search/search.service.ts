import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RecordContributorDoc,
  RecordSearchDoc,
  SearchEngine,
  SearchParams,
  SearchResult,
} from './search-engine';
import { MeilisearchEngine } from './meilisearch.engine';
import { ElasticsearchEngine } from './elasticsearch.engine';

// Ré-exports : les consommateurs importent ces symboles depuis
// `../search/search.service` — chemins conservés pour ne rien casser.
export {
  RecordContributorDoc,
  RecordSearchDoc,
  SearchParams,
  SearchResult,
  SearchEngine,
} from './search-engine';

/**
 * Construit le document d'indexation depuis une notice, quel que soit le chemin
 * d'appel : accepte les mots-clés sous leur forme de liaison Prisma
 * (`{ keyword: { name } }[]`) OU déjà aplatie (`string[]`), et des contributeurs
 * absents (notice pas encore migrée → repli sur l'ancien champ auteur pour
 * rester cherchable). Le moteur remplaçant les documents en entier à
 * l'indexation, TOUT indexeur doit passer par ici — un document partiel
 * écraserait les champs des autres.
 */
/**
 * Les états d'une réponse de recherche.
 *
 * `'servi'` couvre les deux réponses RÉELLES — avec ou sans résultats. Zéro
 * résultat est une réponse, l'indisponibilité n'en est pas une.
 *
 * ⚠ Vocabulaire ALIGNÉ sur le front (`ExistenceNotice` dans
 * `apps/web/lib/server-api.ts` : `existe | introuvable | indisponible`). Le
 * troisième terme est le même mot des deux côtés de l'API, exprès.
 */
export type EtatRecherche = 'servi' | 'indisponible';

/**
 * Réponse de `SearchService.search` — union DISCRIMINÉE, pas un objet avec un
 * drapeau.
 *
 * ⚠ L'UNION EST LE POINT. Avec un drapeau (`indisponible?: boolean`) sur un
 * `SearchResult` toujours rempli, un appelant qui l'ignore lit `totalHits: 0`
 * et affirme « aucun résultat » — exactement le défaut qu'on corrige. Avec
 * l'union, le compilateur refuse de lire `totalHits` avant d'avoir traité
 * l'état. Le coût est assumé : quatre appelants à reprendre, une fois.
 */
export type ReponseRecherche =
  | ({ etat: 'servi' } & SearchResult)
  | { etat: 'indisponible'; motif: string };

/**
 * Réponse de `SearchService.countDocuments` — même union que la recherche.
 *
 * ⚠ `documents: 0` NE DOIT JAMAIS SERVIR DE REPLI. Un index injoignable rendu
 * « 0 document » se lirait comme un index VIDE, donc comme une dérive maximale,
 * donc comme une invitation à réindexer un fonds qui n'a peut-être rien. Or une
 * réindexation complète sur un gros catalogue n'est pas gratuite : c'est
 * exactement la « non-réponse qui INVITE À AGIR » de CLAUDE.md, et le geste
 * qu'elle provoque est une écriture.
 */
export type ReponseComptage =
  | { etat: 'servi'; documents: number }
  | { etat: 'indisponible'; motif: string };

export function buildRecordSearchDoc(record: {
  id: string;
  title: string;
  titleComplement?: string | null;
  author: string | null;
  isbn: string | null;
  category: string | null;
  language: string;
  publishYear: number | null;
  recordType: string;
  defenseUniversity?: string | null;
  summary?: string | null;
  coverUrl: string | null;
  contributors?: { name: string; role?: string; position?: number; authorId?: string | null }[];
  keywords?: string[] | { keyword: { name: string } }[];
}): RecordSearchDoc {
  const ordered = [...(record.contributors ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const contributorList: RecordContributorDoc[] =
    ordered.length > 0
      ? ordered.map((c) => ({
          name: c.name,
          role: c.role ?? 'AUTEUR_PRINCIPAL',
          authorId: c.authorId ?? null,
        }))
      : record.author
        ? [{ name: record.author, role: 'AUTEUR_PRINCIPAL', authorId: null }]
        : [];
  return {
    id: record.id,
    title: record.title,
    titleComplement: record.titleComplement ?? null,
    author: record.author,
    contributors: contributorList.map((c) => c.name),
    contributorList,
    keywords: (record.keywords ?? []).map((k) => (typeof k === 'string' ? k : k.keyword.name)),
    defenseUniversity: record.defenseUniversity ?? null,
    isbn: record.isbn,
    summary: record.summary ?? null,
    category: record.category,
    language: record.language,
    publishYear: record.publishYear,
    recordType: record.recordType,
    coverUrl: record.coverUrl,
  };
}

/**
 * Façade de recherche : choisit le moteur (Meilisearch par défaut,
 * Elasticsearch en option) selon SEARCH_ENGINE, délègue le contrat, et préserve
 * la DÉGRADATION GRACIEUSE historique — un moteur injoignable renvoie un
 * résultat de recherche vide (facettes à 0), JAMAIS une 500. L'indexation, elle,
 * est protégée chez les appelants (`safeIndex`/`safeRemove` de cataloging).
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly engine: SearchEngine;

  constructor(config: ConfigService) {
    this.engine = SearchService.resolveEngine(config, this.logger);
  }

  /** Sélection du moteur au démarrage, avec message de log clair. */
  private static resolveEngine(config: ConfigService, logger: Logger): SearchEngine {
    const choice = (config.get<string>('SEARCH_ENGINE') ?? 'meilisearch').trim().toLowerCase();
    switch (choice) {
      case 'meilisearch':
      case '':
        logger.log('Moteur de recherche : Meilisearch (défaut).');
        return new MeilisearchEngine(config);
      case 'elasticsearch':
        logger.log(
          'Moteur de recherche : Elasticsearch (option). ⚠ ES exige 2–4 Go de RAM ' +
            '— Meilisearch reste recommandé (voir docs/search-engines.md).',
        );
        return new ElasticsearchEngine(config);
      default:
        // Valeur non reconnue : repli SÛR sur Meilisearch (jamais planter au boot).
        logger.warn(
          `SEARCH_ENGINE="${choice}" non reconnu (meilisearch | elasticsearch) — repli sur Meilisearch.`,
        );
        return new MeilisearchEngine(config);
    }
  }

  indexUid(slug: string): string {
    return this.engine.indexUid(slug);
  }

  ensureIndex(slug: string): Promise<void> {
    return this.engine.ensureIndex(slug);
  }

  indexRecords(slug: string, docs: RecordSearchDoc[]): Promise<void> {
    return this.engine.indexRecords(slug, docs);
  }

  removeRecord(slug: string, id: string): Promise<void> {
    return this.engine.removeRecord(slug, id);
  }

  clearIndex(slug: string): Promise<void> {
    return this.engine.clearIndex(slug);
  }

  /**
   * Combien de documents l'index de cette école contient-il ?
   *
   * Même union que `search` : l'appelant DOIT traiter l'indisponibilité, et le
   * compilateur l'y oblige. Voir `ReponseComptage` pour la raison exacte du
   * refus de replier sur zéro.
   */
  async countDocuments(slug: string): Promise<ReponseComptage> {
    try {
      return { etat: 'servi', documents: await this.engine.countDocuments(slug) };
    } catch (error) {
      const motif = (error as Error).message;
      this.logger.warn(
        `Comptage d'index ${this.engine.name} indisponible (${slug}) : ${motif} — ` +
          `état « indisponible » rendu (JAMAIS zéro document).`,
      );
      return { etat: 'indisponible', motif };
    }
  }

  /** Le moteur répond-il ? (exposé au healthcheck de l'API.) */
  health(): Promise<boolean> {
    return this.engine.health();
  }

  /**
   * Recherche paginée avec facettes (OPAC, page constellation comprise).
   *
   * ⚠ TROIS ÉTATS, ET NON DEUX (backlog n°18, corrigé le 12 septembre 2026).
   *
   * Jusqu'ici, un moteur injoignable rendait un résultat VIDE : `totalHits: 0`,
   * facettes à zéro. L'intention était bonne — l'OPAC ne devait pas rendre une
   * 500 — mais la forme écrivait une non-réponse comme un FAIT : « aucun
   * résultat » là où la vérité est « je ne sais pas ». Un Meilisearch tombé
   * rendait donc une bibliothèque publiquement VIDE, avec un avertissement dans
   * un journal que personne ne lit en production, sur la surface la plus
   * visible du produit.
   *
   * Les trois états sont donc : servi avec des résultats, servi sans résultat,
   * et INDISPONIBLE. Les deux premiers portent le même `etat: 'servi'` — zéro
   * résultat est une réponse légitime, et c'est bien une réponse.
   *
   * ⚠ LA FORME REPREND CELLE DU FRONT, elle n'en invente pas une. `noticeExiste`
   * et `noticePublique` (apps/web/lib/server-api.ts) rendent déjà
   * `'existe' | 'introuvable' | 'indisponible'` pour la même raison, et sur la
   * même surface publique. Un produit qui distingue ses non-réponses de deux
   * façons différentes selon la couche ne les distingue pas.
   *
   * ⚠ ET C'EST À L'APPELANT DE TRANCHER, pas à cette méthode. Selon la surface,
   * « je ne sais pas » se traduit par un 503 (la recherche publique, la
   * constellation) ou par un silence honnête (un enrichissement facultatif qui
   * disparaît). Cette méthode ne peut pas le savoir : elle rapporte, elle ne
   * décide pas.
   */
  async search(slug: string, params: SearchParams): Promise<ReponseRecherche> {
    try {
      return { etat: 'servi', ...(await this.engine.search(slug, params)) };
    } catch (error) {
      const motif = (error as Error).message;
      this.logger.warn(
        `Recherche ${this.engine.name} indisponible (${slug}) : ${motif} — ` +
          `état « indisponible » rendu à l'appelant (JAMAIS un résultat vide).`,
      );
      return { etat: 'indisponible', motif };
    }
  }
}
