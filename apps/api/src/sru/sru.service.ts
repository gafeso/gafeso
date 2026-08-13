import { Injectable, Logger } from '@nestjs/common';
import { extractBiblio } from '../cataloging/marc-mapper';
import { parseSruMarcxml } from './sru-marcxml';
import { getSruServers, SruServer } from './sru-servers';

/** Délai court : sur une liaison ouest-africaine, un serveur lent NE DOIT PAS
 *  bloquer la saisie. On abandonne vite et on le signale. */
const SRU_TIMEOUT_MS = 6000;
/** Nombre de notices demandées par serveur (l'utilisateur en choisit une). */
const MAX_RECORDS = 5;

/** Une notice candidate proposée à l'utilisateur (sous-ensemble pré-remplissable). */
export interface SruCandidate {
  /** Serveur d'origine (affiché comme source). */
  source: string;
  title: string;
  titleComplement: string | null;
  contributors: { name: string; role: string }[];
  publisher: string | null;
  publicationCity: string | null;
  publishYear: number | null;
  isbn: string | null;
  language: string | null;
  recordType: string | null;
}

/** Un serveur injoignable (cas NORMAL) : listé sans bloquer les autres. */
export interface SruSourceError {
  source: string;
  message: string;
}

export interface SruSearchResult {
  candidates: SruCandidate[];
  errors: SruSourceError[];
}

export interface SruCriteria {
  isbn?: string;
  query?: string;
}

@Injectable()
export class SruService {
  private readonly logger = new Logger(SruService.name);

  /**
   * Interroge en parallèle tous les serveurs SRU configurés. Un serveur en
   * échec (timeout, réseau, HTTP) est reporté dans `errors` sans faire échouer
   * la recherche : l'UI affiche les notices trouvées ailleurs + un avertissement.
   */
  async search(criteria: SruCriteria): Promise<SruSearchResult> {
    const isbn = criteria.isbn?.trim();
    const query = criteria.query?.trim();
    if (!isbn && !query) {
      return { candidates: [], errors: [] };
    }

    const servers = getSruServers().filter((s) => s.enabled);
    const settled = await Promise.all(
      servers.map((server) => this.queryServer(server, { isbn, query })),
    );

    const candidates: SruCandidate[] = [];
    const errors: SruSourceError[] = [];
    for (const r of settled) {
      candidates.push(...r.candidates);
      if (r.error) errors.push(r.error);
    }
    return { candidates, errors };
  }

  private async queryServer(
    server: SruServer,
    criteria: SruCriteria,
  ): Promise<{ candidates: SruCandidate[]; error?: SruSourceError }> {
    const cql = this.buildCql(server, criteria);
    if (!cql) return { candidates: [] };
    const url = this.buildUrl(server, cql);

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(SRU_TIMEOUT_MS),
        headers: { Accept: 'application/xml,text/xml' },
      });
      if (!res.ok) {
        return { candidates: [], error: { source: server.name, message: `Réponse inattendue (HTTP ${res.status}).` } };
      }
      const xml = await res.text();
      const records = parseSruMarcxml(xml);
      const candidates = records
        .map((fields) => this.toCandidate(server, fields))
        .filter((c): c is SruCandidate => c !== null);
      return { candidates };
    } catch (e) {
      const message = this.describeError(e);
      this.logger.warn(`SRU ${server.id} injoignable : ${message}`);
      return { candidates: [], error: { source: server.name, message } };
    }
  }

  /** Construit la requête CQL selon la cible et le critère (ISBN prioritaire). */
  private buildCql(server: SruServer, criteria: SruCriteria): string | null {
    if (criteria.isbn) {
      return this.cqlClause(server, server.index.isbn, criteria.isbn);
    }
    if (criteria.query) {
      return this.cqlClause(server, server.index.title, criteria.query);
    }
    return null;
  }

  /** `index all "valeur"` (BnF) ou `index="valeur"` (LoC), selon la relation. */
  private cqlClause(server: SruServer, index: string, value: string): string {
    const v = this.escapeCql(value);
    return server.relation === '=' ? `${index}="${v}"` : `${index} all "${v}"`;
  }

  /** Échappe les guillemets pour ne pas casser la requête CQL. */
  private escapeCql(value: string): string {
    return value.replace(/"/g, '');
  }

  private buildUrl(server: SruServer, cql: string): string {
    const params = new URLSearchParams({
      version: server.version,
      operation: 'searchRetrieve',
      recordSchema: server.recordSchema,
      maximumRecords: String(MAX_RECORDS),
      query: cql,
    });
    const sep = server.baseUrl.includes('?') ? '&' : '?';
    return `${server.baseUrl}${sep}${params.toString()}`;
  }

  private toCandidate(server: SruServer, fields: string[][]): SruCandidate | null {
    const b = extractBiblio(fields, server.format);
    if (!b.title) return null; // sans titre exploitable, la notice n'aide pas
    return {
      source: server.name,
      title: b.title,
      titleComplement: b.titleComplement,
      contributors: b.contributors,
      publisher: b.publisher,
      publicationCity: b.publicationCity,
      publishYear: b.publishYear,
      isbn: b.isbn,
      language: b.language,
      recordType: b.recordType,
    };
  }

  /** Message clair et court, par type de défaillance (jamais de stack). */
  private describeError(e: unknown): string {
    if (e instanceof Error) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        return 'Délai dépassé — serveur externe trop lent ou injoignable.';
      }
      if (e.name === 'TypeError') {
        return 'Serveur injoignable (problème de connexion).';
      }
      return e.message;
    }
    return 'Erreur inconnue.';
  }
}
