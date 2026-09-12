import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { recordToMarcxmlElement } from '../cataloging/marc-export';
import { lireChampsDeProfil } from '../cataloging/champs-de-profil';
import {
  ANCIEN_PREFIX_MARCXML,
  MARCXCHANGE_NAMESPACE,
  MARCXCHANGE_PREFIX,
  MARCXCHANGE_SCHEMA_URL,
  messageAncienPrefixe,
  versMarcxchange,
} from '../cataloging/unimarc-xml';
import { oaiDatestamp, oaiEnvelope, oaiError, tag, xmlEscape } from './oai-xml';
import { versMarcxchangeDepuisNatif } from './reexposition-fidele';
import {
  ETDMS_NAMESPACE,
  ETDMS_PREFIX,
  ETDMS_SCHEMA_URL,
  PROFIL_ETDMS,
  exposableEnEtdms,
  versEtdms,
} from './etdms';

export type TenantDb = PrismaClient;

export interface OaiTenant {
  slug: string;
  name: string;
  /** Email de contact de l'entrepôt (adminEmail Identify) — résolu par le
   *  contrôleur : contact de l'établissement, sinon repli sur le domaine. */
  adminEmail: string;
}

const PAGE_SIZE = 100;
const FORMATS = ['oai_dc', MARCXCHANGE_PREFIX, ETDMS_PREFIX];

/**
 * Formats servis pour TOUTE notice, quel que soit son profil.
 *
 * ⚠ ETD-MS n'y est PAS : il n'est proposé que pour le profil `academique`
 * (I4). C'est ce qui rend `ListMetadataFormats?identifier=…` différent de
 * `ListMetadataFormats` sans identifiant — le premier décrit CETTE notice, le
 * second décrit l'entrepôt. Les confondre annoncerait ETD-MS sur un ouvrage.
 */
const FORMATS_UNIVERSELS = ['oai_dc', MARCXCHANGE_PREFIX];

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
  summary: string | null;
  /** Profil de description (P3-2) : `bibliographique` ou `academique`. */
  profile: string;
  // ⚠ P3-3 : les trois champs de profil ne sont plus des colonnes lues mais des
  // clés de `profileData`. Le type suit la LECTURE, pas la réponse — les trois
  // valeurs continuent de sortir à plat dans le MarcXchange.
  profileData: unknown;
  /**
   * P5-3 · La description d'ORIGINE et son dialecte, pour la réexposition
   * fidèle (I3). `marcFormat` n'est PAS décoratif : c'est lui qui est déclaré
   * dans l'attribut `format` quand le natif est servi.
   */
  marcData: unknown;
  marcFormat: string;
  category: string | null;
  recordType: string;
  contributors: { name: string; role: string; position: number }[];
  keywords: { keyword: { name: string } }[];
};

/**
 * ⚠ EXPORTÉ POUR ÊTRE GARDÉ, pas pour être réutilisé ailleurs.
 * `colonnes-lues-et-servies.spec.ts` vérifie que toute colonne LUE par
 * l'émission figure ici : le type et le select sont deux listes tenues à la
 * main, et rien ne les reliait.
 */
export const RECORD_SELECT = {
  id: true,
  updatedAt: true,
  title: true,
  titleComplement: true,
  isbn: true,
  publishYear: true,
  language: true,
  publisher: true,
  summary: true,
  profile: true,
  // ⚠ P3-3 : les trois champs de profil viennent de `profileData`. Les
  // colonnes existent encore (temps 1) mais ne sont plus LUES : c'est ce qui
  // prouve que leur suppression sera sans effet sur l'entrepôt OAI.
  profileData: true,
  // ⚠ P5-3 : ces deux colonnes sont LUES pour être RÉEXPOSÉES telles quelles.
  // Elles ne sont pas dans `contrat-notice-publique.ts` car elles ne sortent
  // pas dans la notice publique — l'entrepôt OAI est une autre exposition.
  marcData: true,
  marcFormat: true,
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
          return await this.listMetadataFormats(db, tenant, params, baseUrl, now);
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

  private async listMetadataFormats(
    db: TenantDb,
    tenant: OaiTenant,
    params: Record<string, string | undefined>,
    baseUrl: string,
    now: Date,
  ) {
    this.rejectExtraArgs(params, ['identifier']);

    // ⚠ LA LISTE N'EST PLUS LA MÊME POUR TOUTES LES NOTICES, et c'est ETD-MS
    // qui l'impose. Sans identifiant, on décrit ce que l'ENTREPÔT sait servir ;
    // avec un identifiant, ce que CETTE notice peut recevoir. Répondre la liste
    // complète dans les deux cas annoncerait ETD-MS sur un ouvrage — et un
    // moissonneur de thèses viendrait le chercher, pour recevoir un refus qu'on
    // lui avait promis inutile.
    let etdmsPossible = true;
    if (params.identifier) {
      const id = this.parseIdentifier(params.identifier, tenant.slug);
      const notice = await db.biblioRecord.findUnique({
        where: { id },
        select: { profile: true },
      });
      if (!notice) {
        throw new OaiProtocolError(
          'idDoesNotExist',
          `Aucune notice pour l’identifiant « ${params.identifier} ».`,
        );
      }
      etdmsPossible = exposableEnEtdms(notice);
    }
    // Le schéma est celui de la norme, chez son mainteneur — on ne sert pas sa
    // copie : le schéma d'une norme appartient à la norme.
    const formats = `    <metadataFormat>
      <metadataPrefix>oai_dc</metadataPrefix>
      <schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>
      <metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>
    </metadataFormat>
    <metadataFormat>
      <metadataPrefix>${MARCXCHANGE_PREFIX}</metadataPrefix>
      <schema>${MARCXCHANGE_SCHEMA_URL}</schema>
      <metadataNamespace>${MARCXCHANGE_NAMESPACE}</metadataNamespace>
    </metadataFormat>${
      etdmsPossible
        ? `
    <metadataFormat>
      <metadataPrefix>${ETDMS_PREFIX}</metadataPrefix>
      <schema>${ETDMS_SCHEMA_URL}</schema>
      <metadataNamespace>${ETDMS_NAMESPACE}</metadataNamespace>
    </metadataFormat>`
        : ''
    }`;
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
    // ⚠ REFUS EXPLICITE, ET AVEC LE BON CODE. `cannotDisseminateFormat` est
    // précisément l'erreur qu'OAI-PMH prévoit pour « ce format n'existe pas pour
    // CETTE notice ». Rendre un `<thesis>` avec des champs vides serait annoncer
    // une thèse là où il y a un ouvrage ; rendre `idDoesNotExist` ferait croire
    // que la notice n'existe pas. Le message dit lequel des deux est vrai.
    if (params.metadataPrefix === ETDMS_PREFIX && !exposableEnEtdms(record)) {
      throw new OaiProtocolError(
        'cannotDisseminateFormat',
        `La notice « ${params.identifier} » est de profil « ${record.profile} » : ` +
          `le format ${ETDMS_PREFIX} ne décrit que les travaux universitaires ` +
          `(profil « ${PROFIL_ETDMS} »). Elle reste disponible en oai_dc et ` +
          `${MARCXCHANGE_PREFIX}.`,
      );
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
    const meta =
      prefix === MARCXCHANGE_PREFIX
        ? this.marcxchangeMetadata(r)
        : prefix === ETDMS_PREFIX
          ? versEtdms(r, `oai:${tenant.slug}:${r.id}`, '        ')
          : this.oaiDcMetadata(r, tenant);
    return `${pad}  <record>\n    ${this.headerXml(r, tenant)}\n      <metadata>\n${meta}\n      </metadata>\n${pad}  </record>`;
  }

  /**
   * MarcXchange (ISO 25577). La notice DÉCLARE son dialecte au lieu de le
   * laisser deviner (invariant I4).
   *
   * ⚠ DEUX CHEMINS, ET LE PREMIER EST LA TENUE D'I3 (P5-3). Une notice
   * IMPORTÉE porte sa description d'origine : c'est ELLE qu'on réexpose, à
   * l'identique, avec le dialecte réellement reçu. Jusqu'au 11 septembre 2026
   * l'entrepôt servait une RECONSTRUCTION dans tous les cas — rebâtie depuis
   * la notice plate, donc amputée de tout ce que le modèle plat n'accueille
   * pas (notes, vedettes matière, zones locales), et annoncée `UNIMARC` même
   * pour du MARC21. Voir `reexposition-fidele.ts` et sa preuve de bout en bout.
   *
   * Le second chemin reste la reconstruction, pour les notices SAISIES dans
   * Gafeso : elles n'ont jamais eu de MARC, et il faut bien leur en produire un.
   */
  private marcxchangeMetadata(r: OaiRecord): string {
    const fidele = versMarcxchangeDepuisNatif(r.marcData, r.marcFormat);
    // ⚠ Pas de réindentation : la reconstruction n'en fait pas non plus
    // (`versMarcxchange` rend le XML de marcjs tel quel). Les deux chemins
    // doivent produire la MÊME forme, sinon le format de sortie dépendrait de
    // l'origine de la notice — un moissonneur n'a pas à le deviner.
    if (fidele) return fidele;

    const el = recordToMarcxmlElement({
      id: r.id,
      title: r.title,
      titleComplement: r.titleComplement,
      isbn: r.isbn,
      publishYear: r.publishYear,
      language: r.language,
      publisher: r.publisher,
      ...lireChampsDeProfil(r.profileData),
      category: r.category,
      recordType: r.recordType,
      contributors: r.contributors,
      keywords: r.keywords.map((k) => k.keyword.name),
      items: [], // OAI = métadonnées seules
    });
    return versMarcxchange(el, true);
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
    // ⚠ `dc:description` MANQUAIT, et 143 notices sur 352 portent un résumé.
    // Le champ existait, la colonne était remplie, et aucune exposition ne
    // l'émettait : un moissonneur recevait donc des notices muettes sur leur
    // contenu, sans qu'aucune erreur ne le signale. C'est l'élément que les
    // portails affichent en premier après le titre.
    lines.push(tag('dc:description', r.summary));
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
    // L'ancien préfixe est REFUSÉ EN NOMMANT son remplaçant. Le retirer en
    // silence laisserait un moissonneur en échec sans lui dire quoi demander ;
    // le servir encore le laisserait lire du faux MARC21 (invariant I4).
    if (prefix === ANCIEN_PREFIX_MARCXML) {
      throw new OaiProtocolError('cannotDisseminateFormat', messageAncienPrefixe());
    }
    if (!FORMATS.includes(prefix)) {
      throw new OaiProtocolError(
        'cannotDisseminateFormat',
        `Format « ${prefix} » non supporté (${FORMATS.join(', ')}). ` +
          `⚠ ${ETDMS_PREFIX} ne décrit que les travaux universitaires : ` +
          `ListMetadataFormats?identifier=… dit, pour une notice donnée, ` +
          `si elle peut le recevoir.`,
      );
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
    // ⚠ ETD-MS NE MOISSONNE QUE LE PROFIL ACADÉMIQUE (I4). Le filtre est ici,
    // dans la clause qui sert À LA FOIS au comptage et à la page : les mettre
    // ailleurs ferait diverger le total des lignes rendues, et le
    // `resumptionToken` promènerait le moissonneur sur des pages vides.
    //
    // Un moissonneur qui demande ETD-MS sur un fonds sans travaux
    // universitaires reçoit `noRecordsMatch` — l'erreur qu'OAI prévoit pour
    // « rien ne correspond ». Ce n'est pas une liste vide déguisée : c'est le
    // refus explicite que la norme attend, et il se distingue d'un entrepôt
    // éteint (403 du garde de module).
    if (state.prefix === ETDMS_PREFIX) where.profile = PROFIL_ETDMS;
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
