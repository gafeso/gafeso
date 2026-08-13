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

  async closeSession(db: TenantDb, id: string) {
    const session = await this.requireSession(db, id);
    if (session.status === 'CLOSED') return session;
    return db.inventorySession.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
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
