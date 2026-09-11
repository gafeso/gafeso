import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ComptesALierDto,
  CreatePatronDto,
  ListPatronsDto,
  UpdatePatronDto,
} from './dto/patron.dto';
import { joursDeRetard } from './jours-de-retard';
import { nomsDivergents } from './noms-divergents';

export type TenantDb = PrismaClient;

@Injectable()
export class PatronsService {
  /**
   * Inscrit un adhérent. Un nom OU un compte lié — la contrainte est portée par
   * le DTO (`carte-identifiable.validator.ts`), qui nomme ce qui manque.
   *
   * ⚠ RECOPIE AU MOMENT DU LIEN, ET L'ADHÉRENT EN DEVIENT PROPRIÉTAIRE.
   * Quand un compte est lié sans qu'un nom soit saisi, prénom et nom sont
   * recopiés depuis le compte — un INSTANTANÉ, pas une référence vivante.
   *
   * LA RAISON EST UNE PERMISSION, PAS UN GOÛT, et c'est ce qui a tranché :
   * corriger le nom d'un COMPTE exige `comptes.gerer`, que seul
   * l'Administrateur détient. Si le compte faisait foi, un nom mal orthographié
   * serait INCORRIGIBLE par la bibliothécaire, qui porte `adherents.gerer` —
   * elle devrait demander un administrateur pour rectifier le nom d'un lecteur,
   * au comptoir. Le code, lui, ne rend ni l'un ni l'autre plus simple : c'est un
   * `??` dans les deux sens. C'est donc la permission qui décide, et elle décide
   * pour l'adhérent.
   *
   * ⚠ CE QUE L'INSTANTANÉ COÛTE, assumé : si le compte est corrigé plus tard
   * (mariage, orthographe), l'adhérent garde l'ancien nom. C'est acceptable
   * précisément parce que la bibliothécaire peut le rectifier ; l'inverse serait
   * bloquant. Et le désaccord n'est pas tu : les chemins de lecture exposent
   * aussi le nom du compte lié quand il diffère (voir `nomsDeLAdherent`).
   */
  async createPatron(db: TenantDb, dto: CreatePatronDto) {
    // Le compte utilisateur lié doit exister dans le schéma de l'école.
    let compte: { firstName: string; lastName: string } | null = null;
    if (dto.userId) {
      const user = await db.user.findUnique({
        where: { id: dto.userId },
        select: { firstName: true, lastName: true },
      });
      if (!user) {
        throw new BadRequestException('Compte utilisateur lié introuvable.');
      }
      compte = user;
    }
    const saisi = (v?: string) => {
      const t = v?.trim();
      return t && t.length > 0 ? t : null;
    };
    try {
      return await db.patron.create({
        data: {
          barcode: dto.barcode.trim(),
          category: dto.category.trim().toLowerCase(),
          userId: dto.userId ?? null,
          // Le nom saisi prime ; à défaut, recopie depuis le compte lié.
          firstName: saisi(dto.firstName) ?? compte?.firstName ?? null,
          lastName: saisi(dto.lastName) ?? compte?.lastName ?? null,
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
      // Recherche par CODE-BARRES **ou par nom**, insensible à la casse.
      //
      // Avant : `barcode: { contains: q }` seul, sensible à la casse. Retrouver
      // « Traoré » était impossible — le nom n'était pas cherché du tout — et
      // « barry » en minuscules ne trouvait pas « BARRY ». Le nom vit sur
      // `user`, joint ici.
      //
      // ⚠ CE QUE CETTE CORRECTION NE FAIT PAS, et il vaut mieux le savoir :
      //  1. Les ACCENTS restent significatifs. `mode: 'insensitive'` traite la
      //     casse, pas les diacritiques : « traore » ne trouvera pas
      //     « Traoré ». Y remédier demande l'extension `unaccent` ou une
      //     colonne normalisée — infrastructure ou schéma, pas ce lot.
      //  2. Un nom COMPLET ne correspond pas : « Awa Traoré » n'est contenu ni
      //     dans le prénom ni dans le nom pris séparément.
      // Signalés plutôt que traités à moitié.
      ...(query.q?.trim()
        ? {
            OR: [
              { barcode: { contains: query.q.trim(), mode: 'insensitive' as const } },
              { user: { firstName: { contains: query.q.trim(), mode: 'insensitive' as const } } },
              { user: { lastName: { contains: query.q.trim(), mode: 'insensitive' as const } } },
              { user: { email: { contains: query.q.trim(), mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [total, patrons] = await Promise.all([
      db.patron.count({ where }),
      db.patron.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: [{ registrationDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      patrons: patrons.map((p) => ({ ...p, nomsDivergents: nomsDivergents(p) })),
    };
  }

  /**
   * Prêts d'un adhérent — EN COURS et HISTORIQUE paginé, pour le personnel.
   *
   * ⚠ Requête EXTRAITE de `ReaderService.myLoans`, pas réécrite : c'est la même
   * question posée sur une autre clé. `myLoans` la consomme désormais après
   * avoir résolu l'adhérent depuis le compte connecté, de sorte que l'écran du
   * personnel et l'espace lecteur ne puissent pas divergter.
   *
   * ⚠ CLÉ = patronId, et c'est pour cela que la méthode vit ICI et non dans
   * `reader.service`. Ce fichier-là énonce une règle de sécurité qu'il ne faut
   * pas affaiblir : « le lecteur est TOUJOURS l'utilisateur connecté, jamais un
   * identifiant fourni par la requête ». Une méthode prenant un patronId
   * arbitraire y aurait contredit la règle. Ici, l'accès est gardé par
   * `adherents.gerer` au niveau du contrôleur.
   */
  async loansOfPatron(
    db: TenantDb,
    patronId: string,
    opts: { historyPage?: number; historyLimit?: number } = {},
    now: Date = new Date(),
  ) {
    const page = Math.max(1, opts.historyPage ?? 1);
    const limit = Math.min(100, Math.max(1, opts.historyLimit ?? 20));

    const [openCheckouts, historyTotal, historyRows] = await Promise.all([
      db.checkout.findMany({
        where: { patronId, returnDate: null },
        include: { item: { include: { record: { select: { id: true, title: true } } } } },
        orderBy: { dueDate: 'asc' },
      }),
      db.checkout.count({ where: { patronId, returnDate: { not: null } } }),
      db.checkout.findMany({
        where: { patronId, returnDate: { not: null } },
        include: { item: { include: { record: { select: { id: true, title: true } } } } },
        orderBy: [{ returnDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const current = openCheckouts.map((c) => {
      const late = joursDeRetard(c.dueDate, now);
      return {
        checkoutId: c.id,
        recordId: c.item.record.id,
        title: c.item.record.title,
        itemBarcode: c.item.barcode,
        dueDate: c.dueDate,
        renewals: c.renewals,
        overdue: late > 0,
        overdueDays: late,
      };
    });

    const history = historyRows.map((c) => ({
      checkoutId: c.id,
      recordId: c.item.record.id,
      title: c.item.record.title,
      itemBarcode: c.item.barcode,
      checkoutDate: c.checkoutDate,
      dueDate: c.dueDate,
      returnDate: c.returnDate,
    }));

    return {
      current,
      history: {
        entries: history,
        total: historyTotal,
        page,
        totalPages: Math.ceil(historyTotal / limit) || 1,
      },
      counters: {
        current: current.length,
        overdue: current.filter((c) => c.overdue).length,
      },
    };
  }

  /**
   * Comptes qu'on peut LIER à une carte : actifs, et pas déjà rattachés.
   *
   * ⚠ POURQUOI CETTE ROUTE EXISTE, et pourquoi elle est étroite. La
   * bibliothécaire porte `adherents.gerer` mais pas `lecteurs.voir` : elle ne
   * pouvait pas trouver le compte d'un lecteur, donc ne produisait que des
   * cartes anonymes. Le problème n'était pas que `Patron` manquait de nom —
   * c'était qu'elle ne pouvait pas retrouver le compte qui en avait déjà un.
   *
   * ⚠ L'ÉLARGISSEMENT DE DROIT EST RÉEL ET IL EST BORNÉ : quatre champs,
   * comptes ACTIFS uniquement, et seulement ceux dont `patron` est null. C'est
   * strictement moins que `lecteurs.voir`, qui expose en plus les statuts, la
   * file d'attente d'activation et l'ensemble des comptes.
   *
   * ⚠ `patron: null` n'est PAS décoratif : sans ce filtre, la bibliothécaire
   * verrait des comptes déjà liés, en choisirait un, et la création échouerait
   * sur la contrainte d'unicité de `userId` — un refus qu'elle ne pourrait pas
   * comprendre. On ne propose que ce qui peut aboutir.
   */
  async comptesALier(db: TenantDb, query: ComptesALierDto) {
    const q = query.q?.trim();
    const comptes = await db.user.findMany({
      where: {
        status: 'ACTIVE',
        patron: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' as const } },
                { lastName: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: Math.min(50, Math.max(1, query.limit ?? 20)),
    });
    return { comptes };
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

    // Le désaccord est DIT, jamais tu : voir noms-divergents.ts.
    return { ...patron, openCheckouts, activeHolds, nomsDivergents: nomsDivergents(patron) };
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
