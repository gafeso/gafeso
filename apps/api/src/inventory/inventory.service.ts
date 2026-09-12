import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { CSV_BOM, toCsv } from '../stats/csv';
import { CreateSessionDto } from './dto/inventory.dto';

export type TenantDb = PrismaClient;

/** Classement immédiat d'un scan (feedback douchette). */
export type ScanResult = 'SEEN' | 'ALREADY' | 'UNKNOWN' | 'OUT_OF_SCOPE' | 'ON_LOAN';

export interface ItemInfo {
  id: string;
  barcode: string;
  title: string;
  callNumber: string | null;
  location: string | null;
  status: string;
}

const ITEM_SELECT = {
  id: true,
  barcode: true,
  callNumber: true,
  location: true,
  status: true,
  record: { select: { title: true } },
} satisfies Prisma.ItemSelect;

function toInfo(it: {
  id: string;
  barcode: string;
  callNumber: string | null;
  location: string | null;
  status: string;
  record: { title: string };
}): ItemInfo {
  return {
    id: it.id,
    barcode: it.barcode,
    title: it.record.title,
    callNumber: it.callNumber,
    location: it.location,
    status: it.status,
  };
}

@Injectable()
export class InventoryService {
  constructor(private readonly audit: AuditService) {}

  // ── Sessions ────────────────────────────────────────────────────────────
  async createSession(db: TenantDb, dto: CreateSessionDto, actorEmail: string | null) {
    const scope = dto.scope === 'LOCATION' ? 'LOCATION' : 'ALL';
    let location: string | null = null;
    if (scope === 'LOCATION') {
      location = dto.location?.trim() || null;
      if (!location) {
        throw new BadRequestException('Une localisation est requise pour un périmètre localisé.');
      }
    }
    return db.inventorySession.create({
      data: { name: dto.name.trim(), scope, location, status: 'OPEN', createdBy: actorEmail },
    });
  }

  async listSessions(db: TenantDb) {
    return db.inventorySession.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { scans: true } } },
    });
  }

  /** Détail d'une session + progression (pour l'écran de scan). */
  async getSession(db: TenantDb, id: string) {
    const session = await this.requireSession(db, id);
    const where = this.scopeWhere(session);
    const [expected, scans] = await Promise.all([
      db.item.count({ where }),
      db.inventoryScan.findMany({ where: { sessionId: id }, select: { itemId: true } }),
    ]);
    // « vus » = exemplaires DU PÉRIMÈTRE effectivement scannés (les scans hors
    // périmètre / inconnus ne comptent pas dans la progression).
    const scopeItemIds = new Set(
      (await db.item.findMany({ where, select: { id: true } })).map((i) => i.id),
    );
    const scannedInScope = new Set(
      scans.map((s) => s.itemId).filter((v): v is string => !!v && scopeItemIds.has(v)),
    );
    return {
      ...session,
      progress: { expected, scanned: scannedInScope.size, totalScans: scans.length },
    };
  }

  /**
   * LES TROIS ÉTATS D'UNE SESSION, et le troisième est neuf.
   *
   *   OPEN ──clore──▶ CLOSED ──marquer les manquants──▶ APPLIED
   *     ▲                │
   *     └────rouvrir─────┘
   *
   * ⚠ `APPLIED` EXISTE POUR QUE `rouvrir` PUISSE REFUSER. Une session dont on a
   * marqué les manquants a CHANGÉ LE CATALOGUE : des exemplaires sont passés en
   * `MISSING`. La rouvrir et rescanner produirait un second marquage sur un
   * fonds déjà modifié, et plus personne ne saurait ce que le premier avait
   * constaté. Tant qu'on n'a rien appliqué, en revanche, une clôture prématurée
   * est une simple erreur de clic — et refaire des jours de scan pour ça serait
   * absurde.
   *
   * Statut en TEXTE (colonne existante) : aucune migration, et le vocabulaire
   * est déclaré au schéma à côté de la colonne.
   */
  async closeSession(db: TenantDb, id: string) {
    const session = await this.requireSession(db, id);
    if (session.status !== 'OPEN') return session;
    return db.inventorySession.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  }

  /**
   * ROUVRIR une session clôturée par erreur.
   *
   * ⚠ SANS ELLE, UN CLIC COÛTAIT LE RÉCOLEMENT ENTIER. `scan` refuse sur une
   * session non ouverte en disant « rouvrez-en une NOUVELLE » — c'est-à-dire
   * recommencer, sur un fonds de plusieurs milliers d'exemplaires.
   *
   * ⚠ REFUSÉE SUR UNE SESSION APPLIQUÉE, et le refus dit pourquoi : le
   * catalogue a déjà été modifié.
   */
  async reopenSession(db: TenantDb, id: string) {
    const session = await this.requireSession(db, id);
    if (session.status === 'OPEN') return session;
    if (session.status === 'APPLIED') {
      throw new ConflictException(
        'Les manquants de cette session ont déjà été marqués : le catalogue a ' +
          'été modifié. Ouvrez une nouvelle session plutôt que de rouvrir ' +
          'celle-ci — un second marquage porterait sur un fonds déjà changé.',
      );
    }
    return db.inventorySession.update({
      where: { id },
      data: { status: 'OPEN', closedAt: null },
    });
  }

  /**
   * ANNULE UN SCAN — un code-barres pointé par erreur.
   *
   * ⚠ SANS ELLE, UNE ERREUR DE SCAN DÉFAIT SILENCIEUSEMENT LE RÉCOLEMENT. Un
   * code-barres scanné par mégarde — l'étagère d'à côté, un marque-page —
   * marque l'exemplaire VU pour toujours : `mark-missing` ne le signalera pas,
   * et un exemplaire réellement absent restera `AVAILABLE` au catalogue. Le
   * récolement échoue précisément à sa seule raison d'être, sur cet
   * exemplaire-là, sans rien dire.
   *
   * ⚠ SESSION OUVERTE SEULEMENT : retirer un scan d'une session close
   * changerait un rapport déjà lu, et d'une session appliquée, un rapport déjà
   * appliqué au catalogue.
   */
  async annulerScan(db: TenantDb, id: string, rawBarcode: string) {
    const session = await this.requireSession(db, id);
    if (session.status !== 'OPEN') {
      throw new ConflictException(
        'Session close : un scan ne s’annule que pendant le récolement.',
      );
    }
    const barcode = rawBarcode.trim();
    if (!barcode) throw new BadRequestException('Code-barres vide.');

    const supprime = await db.inventoryScan.deleteMany({
      where: { sessionId: id, barcode },
    });
    if (supprime.count === 0) {
      throw new NotFoundException(
        `Aucun scan « ${barcode} » dans cette session : rien à annuler.`,
      );
    }
    return { annule: true, barcode };
  }

  // ── Scan ────────────────────────────────────────────────────────────────
  async scan(
    db: TenantDb,
    id: string,
    rawBarcode: string,
  ): Promise<{ result: ScanResult; barcode: string; item: ItemInfo | null }> {
    const session = await this.requireSession(db, id);
    if (session.status !== 'OPEN') {
      throw new ConflictException('Session close : rouvrez-en une nouvelle pour scanner.');
    }
    const barcode = rawBarcode.trim();
    if (!barcode) throw new BadRequestException('Code-barres vide.');

    // Déjà scanné dans cette session ? (unicité (session, barcode))
    const existing = await db.inventoryScan.findUnique({
      where: { sessionId_barcode: { sessionId: id, barcode } },
    });
    if (existing) {
      const item = existing.itemId
        ? await db.item.findUnique({ where: { id: existing.itemId }, select: ITEM_SELECT })
        : null;
      return { result: 'ALREADY', barcode, item: item ? toInfo(item) : null };
    }

    const item = await db.item.findUnique({ where: { barcode }, select: ITEM_SELECT });
    let result: ScanResult;
    if (!item) result = 'UNKNOWN';
    else if (session.scope === 'LOCATION' && (item.location ?? '') !== session.location)
      result = 'OUT_OF_SCOPE';
    else if (item.status === 'CHECKED_OUT') result = 'ON_LOAN';
    else result = 'SEEN';

    await db.inventoryScan.create({
      data: { sessionId: id, barcode, itemId: item?.id ?? null, result },
    });
    return { result, barcode, item: item ? toInfo(item) : null };
  }

  // ── Rapport ───────────────────────────────────────────────────────────────
  async report(db: TenantDb, id: string) {
    const session = await this.requireSession(db, id);
    const where = this.scopeWhere(session);
    const [scopeItems, scans] = await Promise.all([
      db.item.findMany({ where, select: ITEM_SELECT, orderBy: [{ callNumber: 'asc' }, { barcode: 'asc' }] }),
      db.inventoryScan.findMany({ where: { sessionId: id }, orderBy: { scannedAt: 'asc' } }),
    ]);

    const scannedItemIds = new Set(scans.map((s) => s.itemId).filter((v): v is string => !!v));
    const scopeItemIds = new Set(scopeItems.map((i) => i.id));

    const seen: ItemInfo[] = [];
    const missing: ItemInfo[] = [];
    const onLoan: ItemInfo[] = [];
    for (const it of scopeItems) {
      const info = toInfo(it);
      if (scannedItemIds.has(it.id)) seen.push(info);
      // En prêt = absent LÉGITIME (jamais compté manquant), s'il n'a pas été scanné.
      else if (it.status === 'CHECKED_OUT') onLoan.push(info);
      else missing.push(info);
    }
    // Inattendus : scannés mais hors périmètre (item d'une autre localisation) ou
    // code-barres inconnu.
    const unexpected = scans
      .filter((s) => !s.itemId || !scopeItemIds.has(s.itemId))
      .map((s) => ({ barcode: s.barcode, result: s.result as ScanResult }));

    return {
      session,
      counts: {
        seen: seen.length,
        missing: missing.length,
        onLoan: onLoan.length,
        unexpected: unexpected.length,
        expected: scopeItems.length,
      },
      seen,
      missing,
      onLoan,
      unexpected,
    };
  }

  /** Rapport au format CSV (UTF-8 + BOM ; séparateur point-virgule via toCsv). */
  async reportCsv(db: TenantDb, id: string): Promise<string> {
    const r = await this.report(db, id);
    const rows: (string | number | null)[][] = [];
    const push = (cat: string, code: string, cote: string | null, titre: string, loc: string | null) =>
      rows.push([cat, code, cote, titre, loc]);
    for (const it of r.seen) push('Vu', it.barcode, it.callNumber, it.title, it.location);
    for (const it of r.missing) push('Manquant', it.barcode, it.callNumber, it.title, it.location);
    for (const it of r.onLoan) push('En prêt', it.barcode, it.callNumber, it.title, it.location);
    for (const u of r.unexpected) {
      const label = u.result === 'UNKNOWN' ? 'Inattendu (inconnu)' : 'Inattendu (hors périmètre)';
      push(label, u.barcode, null, '', null);
    }
    return (
      CSV_BOM + toCsv(['Catégorie', 'Code-barres', 'Cote', 'Titre', 'Localisation'], rows)
    );
  }

  // ── Action : marquer les manquants ─────────────────────────────────────────
  async markMissing(
    db: TenantDb,
    tenant: ResolvedTenant,
    id: string,
    user: JwtPayload,
    ip?: string,
  ): Promise<{ marked: number }> {
    const session = await this.requireSession(db, id);
    // ⚠ LA SESSION DOIT ÊTRE CLOSE, ET CE GARDE N'EXISTAIT PAS. Sur une session
    // OUVERTE, « les manquants » sont tout ce qui n'a pas ENCORE été scanné :
    // au milieu d'un récolement de huit mille exemplaires, ce geste en marque
    // sept mille comme introuvables. Et l'écran offrait le bouton dès qu'un
    // manquant apparaissait — c'est-à-dire dès le premier scan.
    if (session.status === 'OPEN') {
      throw new ConflictException(
        'Clôturez la session avant de marquer les manquants : tant qu’elle est ' +
          'ouverte, « manquant » veut seulement dire « pas encore scanné ».',
      );
    }
    if (session.status === 'APPLIED') {
      throw new ConflictException('Les manquants de cette session ont déjà été marqués.');
    }
    const report = await this.report(db, id);
    const ids = report.missing.map((m) => m.id);
    if (ids.length > 0) {
      // Garde-fou : ne jamais écraser un exemplaire redevenu CHECKED_OUT entre-temps.
      await db.item.updateMany({
        where: { id: { in: ids }, status: { not: 'CHECKED_OUT' } },
        data: { status: 'MISSING' },
      });
    }
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.INVENTORY_MARK_MISSING,
      targetType: 'inventory_session',
      targetId: id,
      targetLabel: session.name,
      metadata: { count: ids.length, itemIds: ids },
      ip,
    });
    // ⚠ LA SESSION PASSE À `APPLIED`, et c'est ce qui rend `rouvrir` refusable :
    // le catalogue a changé, un second marquage porterait sur un fonds déjà
    // modifié. L'écriture vient APRÈS le marquage, pas avant — annoncer un état
    // qu'on n'a pas encore atteint est la faute qu'on corrige partout ailleurs.
    await db.inventorySession.update({ where: { id }, data: { status: 'APPLIED' } });
    return { marked: ids.length };
  }

  // ── Utilitaires ─────────────────────────────────────────────────────────
  private scopeWhere(session: { scope: string; location: string | null }): Prisma.ItemWhereInput {
    return session.scope === 'LOCATION' ? { location: session.location } : {};
  }

  private async requireSession(db: TenantDb, id: string) {
    const session = await db.inventorySession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session de récolement introuvable.');
    return session;
  }
}
