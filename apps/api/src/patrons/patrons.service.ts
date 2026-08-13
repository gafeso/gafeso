import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { CreatePatronDto, ListPatronsDto, UpdatePatronDto } from './dto/patron.dto';

export type TenantDb = PrismaClient;

@Injectable()
export class PatronsService {
  async createPatron(db: TenantDb, dto: CreatePatronDto) {
    // Le compte utilisateur lié doit exister dans le schéma de l'école.
    if (dto.userId) {
      const user = await db.user.findUnique({ where: { id: dto.userId } });
      if (!user) {
        throw new BadRequestException('Compte utilisateur lié introuvable.');
      }
    }
    try {
      return await db.patron.create({
        data: {
          barcode: dto.barcode.trim(),
          category: dto.category.trim().toLowerCase(),
          userId: dto.userId ?? null,
          expiryDate: dto.expiryDate ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Code-barres déjà attribué, ou compte utilisateur déjà lié à un autre adhérent.',
        );
      }
      throw error;
    }
  }

  async listPatrons(db: TenantDb, query: ListPatronsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PatronWhereInput = {
      ...(query.category ? { category: query.category.trim().toLowerCase() } : {}),
      ...(query.q ? { barcode: { contains: query.q.trim() } } : {}),
    };

    const [total, patrons] = await Promise.all([
      db.patron.count({ where }),
      db.patron.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { registrationDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { total, page, totalPages: Math.ceil(total / limit) || 1, patrons };
  }

  async getPatron(db: TenantDb, id: string) {
    const patron = await db.patron.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!patron) throw new NotFoundException('Adhérent introuvable.');

    const [openCheckouts, activeHolds] = await Promise.all([
      db.checkout.count({ where: { patronId: id, returnDate: null } }),
      db.hold.count({
        where: { patronId: id, status: { in: ['PENDING', 'AVAILABLE'] } },
      }),
    ]);

    return { ...patron, openCheckouts, activeHolds };
  }

  async updatePatron(db: TenantDb, id: string, dto: UpdatePatronDto) {
    await this.ensurePatron(db, id);
    if (dto.userId) {
      const user = await db.user.findUnique({ where: { id: dto.userId } });
      if (!user) {
        throw new BadRequestException('Compte utilisateur lié introuvable.');
      }
    }
    try {
      return await db.patron.update({
        where: { id },
        data: {
          barcode: dto.barcode?.trim(),
          category: dto.category?.trim().toLowerCase(),
          userId: dto.userId,
          expiryDate: dto.expiryDate,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Code-barres déjà attribué, ou compte utilisateur déjà lié à un autre adhérent.',
        );
      }
      throw error;
    }
  }

  /**
   * Suppression refusée tant que l'adhérent a un PRÊT quelconque (en cours
   * OU déjà rendu) ou une réservation active. Un prêt rendu reste une ligne
   * `Checkout` rattachée à l'adhérent (historique/statistiques) — la clé
   * étrangère `checkouts.patron_id` est en RESTRICT (jamais de suppression
   * silencieuse de l'historique de prêt) : sans ce contrôle, la suppression
   * planterait en 500 (contrainte de clé étrangère) dès qu'un prêt a déjà
   * été rendu au lieu de renvoyer un refus propre.
   */
  async deletePatron(db: TenantDb, id: string) {
    await this.ensurePatron(db, id);
    const [anyCheckout, activeHolds] = await Promise.all([
      db.checkout.count({ where: { patronId: id } }),
      db.hold.count({
        where: { patronId: id, status: { in: ['PENDING', 'AVAILABLE'] } },
      }),
    ]);
    if (anyCheckout > 0 || activeHolds > 0) {
      throw new ConflictException(
        'Impossible de supprimer : prêts (en cours ou passés) ou réservations actives rattachés à cet adhérent.',
      );
    }
    await db.patron.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Carte de bibliothèque du COMPTE connecté, créée à la volée si besoin.
   *
   * Point de création UNIQUE de l'adhérent lié à un compte. Elle vivait dans
   * HoldsService, appelée au moment de poser une réservation : un étudiant qui
   * n'avait jamais réservé n'avait donc pas de carte, et l'écran « ma carte »
   * n'avait rien à afficher. La dupliquer ailleurs aurait créé deux chemins de
   * création qui divergeraient un jour — c'est exactement ce qui est arrivé à
   * la classe entre le compte et l'inscription.
   *
   * Le code-barres est dérivé de l'identifiant du compte : stable, unique, et
   * surtout IMMUABLE — c'est lui qu'on imprime sur la carte du lecteur et que
   * la douchette du comptoir lit.
   *
   * À NE PAS CONFONDRE avec `ensurePatron` ci-dessous, qui ne crée rien : elle
   * vérifie qu'un adhérent existe par son propre identifiant. Homonymie
   * héritée, levée ici par le nom.
   */
  async cardForUser(db: TenantDb, userId: string) {
    const existing = await db.patron.findUnique({ where: { userId } });
    if (existing) return existing;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('Compte introuvable.');
    const category = user.role === 'STUDENT' ? 'etudiant' : 'personnel';
    return db.patron.create({
      data: { userId, barcode: `LEC-${userId.slice(0, 8).toUpperCase()}`, category },
    });
  }

  private async ensurePatron(db: TenantDb, id: string): Promise<void> {
    const exists = await db.patron.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Adhérent introuvable.');
  }
}
