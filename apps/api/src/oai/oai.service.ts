import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { recordToMarcxmlElement } from '../cataloging/marc-export';
import { oaiDatestamp, oaiEnvelope, oaiError, tag, xmlEscape } from './oai-xml';

export type TenantDb = PrismaClient;

export interface OaiTenant {
  slug: string;
  name: string;
  /** Email de contact de l'entrepôt (adminEmail Identify) — résolu par le
   *  contrôleur : contact de l'établissement, sinon repli sur le domaine. */
  adminEmail: string;
}

const PAGE_SIZE = 100;
const FORMATS = ['oai_dc', 'marcxml'];

/** Erreur de protocole OAI (rendue en <error code=…>). */
class OaiProtocolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

type OaiRecord = {
  id: string;
  updatedAt: Date;
  title: string;
  titleComplement: string | null;
  isbn: string | null;
  publishYear: number | null;
  language: string;
  publisher: string | null;
  publicationCity: string | null;
  defenseUniversity: string | null;
  defensePlace: string | null;
  category: string | null;
  recordType: string;
  contributors: { name: string; role: string; position: number }[];
  keywords: { keyword: { name: string } }[];
};

const RECORD_SELECT = {
  id: true,
  updatedAt: true,
  title: true,
  titleComplement: true,
  isbn: true,
  publishYear: true,
  language: true,
  publisher: true,
  publicationCity: true,
  defenseUniversity: true,
  defensePlace: true,
  category: true,
  recordType: true,
  contributors: { orderBy: { position: 'asc' as const }, select: { name: true, role: true, position: true } },
  keywords: { select: { keyword: { select: { name: true } } } },
};

interface HarvestState {
  offset: number;
  from?: string;
  until?: string;
  set?: string;
  prefix: string;
}

@Injectable()
export class OaiService {
  async handle(
    db: TenantDb,
    tenant: OaiTenant,
    params: Record<string, string | undefined>,
    baseUrl: string,
    now: Date = new Date(),
  ): Promise<string> {
    try {
      switch (params.verb) {
        case 'Identify':
          return await this.identify(db, tenant, params, baseUrl, now);
        case 'ListMetadataFormats':
          return this.listMetadataFormats(tenant, params, baseUrl, now);
        case 'ListSets':
          return await this.listSets(db, params, baseUrl, now);
        case 'ListIdentifiers':
          return await this.listRecords(db, tenant, params, baseUrl, now, false);
        case 'ListRecords':
          return await this.listRecords(db, tenant, params, baseUrl, now, true);
        case 'GetRecord':
          return await this.getRecord(db, tenant, params, baseUrl, now);
        default:
          return oaiError(
            now,
            baseUrl,
            'badVerb',
            `Verbe illégal ou manquant : « ${params.verb ?? ''} ».`,
          );
      }
    } catch (e) {
      if (e instanceof OaiProtocolError) {
        // Les arguments ne sont pas répétés dans <request> en cas d'erreur d'argument.
        return oaiError(now, baseUrl, e.code, e.message, e.code === 'badVerb' ? {} : { verb: params.verb });
      }
      throw e;
    }
  }

  // ── Verbes ────────────────────────────────────────────────────────────────
  private async identify(db: TenantDb, tenant: OaiTenant, params: Record<string, string | undefined>, baseUrl: string, now: Date) {
    this.rejectExtraArgs(params, []);
    const earliest = await db.biblioRecord.aggregate({ _min: { updatedAt: true } });
    const body =
      '  <Identify>\n' +
      `    ${tag('repositoryName', `Gafeso — ${tenant.name}`)}\n` +
      `    ${tag('baseURL', baseUrl)}\n` +
      '    <protocolVersion>2.0</protocolVersion>\n' +
      `    ${tag('adminEmail', tenant.adminEmail)}\n` +
      `    <earliestDatestamp>${oaiDatestamp(earliest._min.updatedAt ?? new Date(0))}</earliestDatestamp>\n` +
      '    <deletedRecord>no</deletedRecord>\n' +
      '    <granularity>YYYY-MM-DDThh:mm:ssZ</granularity>\n' +
      '  </Identify>';
    return oaiEnvelope(now, baseUrl, { verb: 'Identify' }, body);
  }

  private listMetadataFormats(tenant: OaiTenant, params: Record<string, string | undefined>, baseUrl: string, now: Date) {
    // identifier optionnel : la même liste s'applique à toutes les notices.
    this.rejectExtraArgs(params, ['identifier']);
    const formats = `    <metadataFormat>
      <metadataPrefix>oai_dc</metadataPrefix>
      <schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>
      <metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>
    </metadataFormat>
    <metadataFormat>
      <metadataPrefix>marcxml</metadataPrefix>
      <schema>http://www.loc.gov/standards/marcxml/schema/MARC21slim.xsd</schema>
      <metadataNamespace>http://www.loc.gov/MARC21/slim</metadataNamespace>
    </metadataFormat>`;
    return oaiEnvelope(now, baseUrl, { verb: 'ListMetadataFormats', identifier: params.identifier }, `  <ListMetadataFormats>\n${formats}\n  </ListMetadataFormats>`);
  }

  private async listSets(db: TenantDb, params: Record<string, string | undefined>, baseUrl: string, now: Date) {
    this.rejectExtraArgs(params, []);
    const cats = await db.biblioRecord.groupBy({ by: ['category'], where: { category: { not: null } }, _count: { _all: true } });
    if (cats.length === 0) {
      throw new OaiProtocolError('noSetHierarchy', 'Cet entrepôt n’expose pas de sets.');
    }
    const sets = cats
      .map((c) => `    <set>\n      <setSpec>${xmlEscape(c.category as string)}</setSpec>\n      <setName>${xmlEscape(c.category as string)}</setName>\n    </set>`)
      .join('\n');
    return oaiEnvelope(now, baseUrl, { verb: 'ListSets' }, `  <ListSets>\n${sets}\n  </ListSets>`);
  }

  private async getRecord(db: TenantDb, tenant: OaiTenant, params: Record<string, string | undefined>, baseUrl: string, now: Date) {
    this.rejectExtraArgs(params, ['identifier', 'metadataPrefix']);
    if (!params.identifier || !params.metadataPrefix) {
      throw new OaiProtocolError('badArgument', 'identifier et metadataPrefix sont requis.');
    }
    this.checkFormat(params.metadataPrefix);
    const id = this.parseIdentifier(params.identifier, tenant.slug);
    const record = (await db.biblioRecord.findUnique({ where: { id }, select: RECORD_SELECT })) as OaiRecord | null;
    if (!record) {
      throw new OaiProtocolError('idDoesNotExist', `Aucune notice pour l’identifiant « ${params.identifier} ».`);
    }
    const body = `  <GetRecord>\n${this.recordXml(record, tenant, params.metadataPrefix, true)}\n  </GetRecord>`;
    return oaiEnvelope(now, baseUrl, { verb: 'GetRecord', identifier: params.identifier, metadataPrefix: params.metadataPrefix }, body);
  }

  private async listRecords(
    db: TenantDb,
    tenant: OaiTenant,
    params: Record<string, string | undefined>,
    baseUrl: string,
    now: Date,
    withMetadata: boolean,
  ) {
    const verb = withMetadata ? 'ListRecords' : 'ListIdentifiers';
    const state = this.resolveState(params);
    this.checkFormat(state.prefix);

    const where = this.buildWhere(state);
    const total = await db.biblioRecord.count({ where });
    if (total === 0) {
      throw new OaiProtocolError('noRecordsMatch', 'Aucune notice ne correspond aux critères.');
    }
    const rows = (await db.biblioRecord.findMany({
      where,
      select: RECORD_SELECT,
      orderBy: { id: 'asc' },
      skip: state.offset,
      take: PAGE_SIZE,
    })) as OaiRecord[];

    const items = rows
      .map((r) => (withMetadata ? this.recordXml(r, tenant, state.prefix, false) : `    ${this.headerXml(r, tenant)}`))
      .join('\n');

    const nextOffset = state.offset + rows.length;
    let token = '';
    if (nextOffset < total) {
      token = `\n    <resumptionToken cursor="${state.offset}" completeListSize="${total}">${this.encodeToken({ ...state, offset: nextOffset })}</resumptionToken>`;
    } else if (params.resumptionToken) {
      token = '\n    <resumptionToken/>'; // fin d'une séquence paginée
    }

    const requestAttrs: Record<string, string | undefined> = params.resumptionToken
      ? { verb, resumptionToken: params.resumptionToken }
      : { verb, metadataPrefix: state.prefix, from: state.from, until: state.until, set: state.set };
    return oaiEnvelope(now, baseUrl, requestAttrs, `  <${verb}>\n${items}${token}\n  </${verb}>`);
  }

  // ── Métadonnées ───────────────────────────────────────────────────────────
  private headerXml(r: OaiRecord, tenant: OaiTenant): string {
    const set = r.category ? `<setSpec>${xmlEscape(r.category)}</setSpec>` : '';
    return `<header>\n      <identifier>oai:${tenant.slug}:${r.id}</identifier>\n      <datestamp>${oaiDatestamp(r.updatedAt)}</datestamp>\n      ${set}\n    </header>`;
  }

  private recordXml(r: OaiRecord, tenant: OaiTenant, prefix: string, indentedForGetRecord: boolean): string {
    const pad = indentedForGetRecord ? '  ' : '  ';
    const meta = prefix === 'marcxml' ? this.marcxmlMetadata(r) : this.oaiDcMetadata(r, tenant);
    return `${pad}  <record>\n    ${this.headerXml(r, tenant)}\n      <metadata>\n${meta}\n      </metadata>\n${pad}  </record>`;
  }

  /** MARCXML — RÉUTILISE le mapping du bloc 1. JAMAIS d'exemplaire ni de fichier. */
  private marcxmlMetadata(r: OaiRecord): string {
    const el = recordToMarcxmlElement({
      id: r.id,
      title: r.title,
      titleComplement: r.titleComplement,
      isbn: r.isbn,
      publishYear: r.publishYear,
      language: r.language,
      publisher: r.publisher,
      publicationCity: r.publicationCity,
      defenseUniversity: r.defenseUniversity,
      defensePlace: r.defensePlace,
      category: r.category,
      recordType: r.recordType,
      contributors: r.contributors,
      keywords: r.keywords.map((k) => k.keyword.name),
      items: [], // OAI = métadonnées seules
    });
    return el.replace('<record>', '<record xmlns="http://www.loc.gov/MARC21/slim">');
  }

  /** Dublin Core simple (oai_dc) — obligatoire du standard. */
  private oaiDcMetadata(r: OaiRecord, tenant: OaiTenant): string {
    const lines: string[] = [];
    lines.push(tag('dc:title', r.titleComplement ? `${r.title} : ${r.titleComplement}` : r.title));
    for (const c of r.contributors) {
      if (c.role === 'DIRECTEUR_MEMOIRE') lines.push(tag('dc:contributor', c.name));
      else lines.push(tag('dc:creator', c.name));
    }
    for (const k of r.keywords) lines.push(tag('dc:subject', k.keyword.name));
    if (r.category) lines.push(tag('dc:subject', r.category));
    lines.push(tag('dc:publisher', r.publisher));
    lines.push(tag('dc:date', r.publishYear != null ? String(r.publishYear) : null));
    lines.push(tag('dc:type', r.recordType));
    lines.push(tag('dc:language', r.language));
    if (r.isbn) lines.push(tag('dc:identifier', `ISBN:${r.isbn}`));
    lines.push(tag('dc:identifier', `oai:${tenant.slug}:${r.id}`));
    const inner = lines.filter(Boolean).map((l) => `        ${l}`).join('\n');
    return (
      '        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ ' +
      'http://www.openarchives.org/OAI/2.0/oai_dc.xsd">\n' +
      inner +
      '\n        </oai_dc:dc>'
    );
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────
  private checkFormat(prefix: string | undefined) {
    if (!prefix) throw new OaiProtocolError('badArgument', 'metadataPrefix est requis.');
    if (!FORMATS.includes(prefix)) {
      throw new OaiProtocolError('cannotDisseminateFormat', `Format « ${prefix} » non supporté (oai_dc, marcxml).`);
    }
  }

  private parseIdentifier(identifier: string, slug: string): string {
    const parts = identifier.split(':');
    if (parts.length !== 3 || parts[0] !== 'oai' || parts[1] !== slug) {
      throw new OaiProtocolError('idDoesNotExist', `Identifiant « ${identifier} » invalide pour cet entrepôt.`);
    }
    return parts[2];
  }

  private buildWhere(state: HarvestState): Prisma.BiblioRecordWhereInput {
    const where: Prisma.BiblioRecordWhereInput = {};
    const updatedAt: Prisma.DateTimeFilter = {};
    if (state.from) updatedAt.gte = this.parseOaiDate(state.from, false);
    if (state.until) updatedAt.lte = this.parseOaiDate(state.until, true);
    if (state.from || state.until) where.updatedAt = updatedAt;
    if (state.set) where.category = state.set;
    return where;
  }

  /** Date OAI : YYYY-MM-DD (borne jour) ou timestamp complet. */
  private parseOaiDate(value: string, endOfDay: boolean): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}Z`);
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) throw new OaiProtocolError('badArgument', `Date « ${value} » invalide.`);
    return d;
  }

  /** État de moisson : soit décodé du resumptionToken, soit des arguments. */
  private resolveState(params: Record<string, string | undefined>): HarvestState {
    if (params.resumptionToken) {
      // Le token est EXCLUSIF des autres arguments (hors verb).
      if (params.metadataPrefix || params.from || params.until || params.set) {
        throw new OaiProtocolError('badArgument', 'resumptionToken est exclusif des autres arguments.');
      }
      return this.decodeToken(params.resumptionToken);
    }
    return {
      offset: 0,
      from: params.from,
      until: params.until,
      set: params.set,
      prefix: params.metadataPrefix ?? '',
    };
  }

  private encodeToken(state: HarvestState): string {
    return Buffer.from(JSON.stringify(state)).toString('base64url');
  }

  private decodeToken(token: string): HarvestState {
    try {
      const s = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      if (typeof s.offset !== 'number' || typeof s.prefix !== 'string') throw new Error('champ manquant');
      return s;
    } catch {
      throw new OaiProtocolError('badResumptionToken', 'resumptionToken invalide ou expiré.');
    }
  }

  /** Rejette tout argument non autorisé pour ce verbe (hors « verb »). */
  private rejectExtraArgs(params: Record<string, string | undefined>, allowed: string[]) {
    for (const key of Object.keys(params)) {
      if (key === 'verb') continue;
      if (params[key] === undefined) continue;
      if (!allowed.includes(key)) {
        throw new OaiProtocolError('badArgument', `Argument « ${key} » non autorisé pour ce verbe.`);
      }
    }
  }
}
