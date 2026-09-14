import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CatalogingService } from '../cataloging/cataloging.service';
import { ClientOai, IssueMoissonnage, Ramassage } from './client-oai';
import { mapperOaiDc, extraireDc } from './mapper-oai-dc';
import { verifierUrlDeSource } from './url-de-source';
import { CreateHarvestSourceDto, UpdateHarvestSourceDto } from './dto/source.dto';

export type TenantDb = PrismaClient;

/**
 * LE MOTEUR : il relie une source déclarée au client pur, et écrit ce qui s'est
 * passé.
 *
 * ⚠ TROIS PROPRIÉTÉS QU'IL TIENT, ET CHACUNE VIENT D'UN DÉFAUT CONNU :
 *
 * 1. **Le curseur n'avance qu'à l'ABOUTISSEMENT.** `HarvestSource.lastDatestamp`
 *    n'est écrit que sur une moisson complète. L'avancer après une interruption
 *    ferait sauter les notices d'une page jamais reçue, et la perte serait
 *    DÉFINITIVE : on ne redemanderait plus jamais cette fenêtre.
 *
 * 2. **Une source injoignable n'est pas une source vide.** Les quatre issues du
 *    client sont écrites telles quelles dans `outcome` — jamais repliées sur
 *    « zéro notice ». C'est la demande explicite du brief, et c'est la famille
 *    des trois états qu'on tient partout ailleurs.
 *
 * 3. **Rien n'est écrasé, rien n'est supprimé.** Une notice déjà connue dont la
 *    source a changé la version est une COLLISION : signalée, jamais appliquée
 *    (décision 2). Une notice disparue de la source est marquée
 *    `supprimee_a_la_source` et sa notice locale reste intacte (décision 6) —
 *    un moissonneur qui supprime sur absence transforme une panne de la source
 *    en perte de données.
 */
@Injectable()
export class MoissonnageService {
  private readonly logger = new Logger(MoissonnageService.name);

  constructor(
    private readonly cataloging: CatalogingService,
    private readonly client: ClientOai = new ClientOai(),
  ) {}

  // ══ LES SOURCES ══════════════════════════════════════════════════════════

  /** Déclarer une source. L'adresse est vérifiée ET normalisée. */
  async creerSource(db: TenantDb, dto: CreateHarvestSourceDto) {
    const verdict = verifierUrlDeSource(dto.baseUrl);
    if (!verdict.ok) throw new BadRequestException(verdict.motif);

    const cible = {
      baseUrl: verdict.url,
      metadataPrefix: dto.metadataPrefix.trim(),
      setSpec: dto.setSpec?.trim() ?? '',
    };
    // ⚠ LE DOUBLON SE DIT, IL NE SE FAIT PAS DIRE PAR LA BASE. Une violation de
    // contrainte remonterait en 500 avec un message Prisma : la personne
    // saurait qu'elle a échoué, pas pourquoi ni ce qui existe déjà.
    const existante = await db.harvestSource.findFirst({ where: cible });
    if (existante) {
      throw new ConflictException(
        `Cet entrepôt est déjà déclaré sous le nom « ${existante.name} »` +
          `${cible.setSpec ? ` pour l’ensemble « ${cible.setSpec} »` : ''}.`,
      );
    }

    return db.harvestSource.create({
      data: {
        name: dto.name.trim(),
        ...cible,
        periodicity: dto.periodicity ?? 'manuelle',
        active: dto.active ?? true,
      },
    });
  }

  /**
   * Les sources, avec leur DERNIÈRE exécution.
   *
   * ⚠ LA DERNIÈRE EXÉCUTION EST JOINTE, PAS DÉNORMALISÉE. Un `lastOutcome`
   * recopié sur la source serait une seconde vérité à tenir d'accord avec la
   * première — et l'écran a besoin de l'état, pas d'une copie.
   */
  async listerSources(db: TenantDb) {
    const sources = await db.harvestSource.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: { runs: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 1 } },
    });
    return sources.map(({ runs, ...source }) => ({
      ...source,
      derniereExecution: runs[0] ?? null,
    }));
  }

  async modifierSource(db: TenantDb, id: string, dto: UpdateHarvestSourceDto) {
    const source = await this.exigerSource(db, id);

    const baseUrl = dto.baseUrl ? verifierUrlDeSource(dto.baseUrl) : null;
    if (baseUrl && !baseUrl.ok) throw new BadRequestException(baseUrl.motif);

    return db.harvestSource.update({
      where: { id: source.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(baseUrl?.ok ? { baseUrl: baseUrl.url } : {}),
        ...(dto.metadataPrefix !== undefined
          ? { metadataPrefix: dto.metadataPrefix.trim() }
          : {}),
        ...(dto.setSpec !== undefined ? { setSpec: dto.setSpec.trim() } : {}),
        ...(dto.periodicity !== undefined ? { periodicity: dto.periodicity } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  /**
   * ⚠ SUPPRIMER UNE SOURCE N'EFFACE AUCUNE NOTICE.
   *
   * Les exécutions et l'identité des notices moissonnées partent en cascade —
   * c'est la MÉMOIRE du moissonnage. Les notices, elles, sont des notices du
   * catalogue comme les autres : `harvested_records.record_id` ne déclare
   * aucune relation, précisément pour que cette suppression ne puisse pas les
   * emporter. Le refus dit ce qui va disparaître, avant.
   */
  async supprimerSource(db: TenantDb, id: string) {
    const source = await this.exigerSource(db, id);
    const [executions, notices] = await Promise.all([
      db.harvestRun.count({ where: { sourceId: id } }),
      db.harvestedRecord.count({ where: { sourceId: id, recordId: { not: null } } }),
    ]);
    await db.harvestSource.delete({ where: { id: source.id } });
    return {
      supprimee: source.name,
      executionsEffacees: executions,
      // ⚠ COMPTÉES ET NOMMÉES : « supprimée » sans dire que N notices restent
      // au catalogue laisserait croire qu'elles sont parties avec.
      noticesConservees: notices,
    };
  }

  /** Les comptes rendus d'une source, du plus récent au plus ancien. */
  async executions(db: TenantDb, sourceId: string, page = 1, limit = 20) {
    await this.exigerSource(db, sourceId);
    const [total, runs] = await Promise.all([
      db.harvestRun.count({ where: { sourceId } }),
      db.harvestRun.findMany({
        where: { sourceId },
        // ⚠ DÉPARTAGÉ : `startedAt` seul laisse deux exécutions de la même
        // milliseconde dans un ordre non déterministe, donc une ligne qui
        // saute d'une page à l'autre.
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, page, totalPages: Math.max(1, Math.ceil(total / limit)), runs };
  }

  /**
   * Les notices que le moissonnage a SIGNALÉES sans trancher — décision 2.
   *
   * C'est la matière de l'écran de P7-4 : ce que personne n'a encore arbitré.
   */
  async collisions(db: TenantDb, sourceId: string, page = 1, limit = 50) {
    await this.exigerSource(db, sourceId);
    const where = { sourceId, status: 'collision' };
    const [total, lignes] = await Promise.all([
      db.harvestedRecord.count({ where }),
      db.harvestedRecord.findMany({
        where,
        orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, page, totalPages: Math.max(1, Math.ceil(total / limit)), collisions: lignes };
  }

  private async exigerSource(db: TenantDb, id: string) {
    const source = await db.harvestSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Source de moissonnage introuvable.');
    return source;
  }

  // ══ L'EXÉCUTION ══════════════════════════════════════════════════════════

  /**
   * Exécute un moissonnage et rend le compte rendu écrit en base.
   *
   * `maintenant` est injectable pour que la péremption d'un jeton soit
   * éprouvable sans attendre — une doublure de test n'a pas d'horloge.
   */
  async executer(
    db: TenantDb,
    slug: string,
    sourceId: string,
    maintenant: Date = new Date(),
  ) {
    const source = await this.exigerSource(db, sourceId);

    // ⚠ LA REPRISE N'EST TENTÉE QUE DANS SA FENÊTRE. Un jeton périmé renvoyé à
    // l'entrepôt produit un `badResumptionToken` — une panne qui ressemble à
    // une source cassée alors que tout va bien. Hors fenêtre, on repart du
    // curseur incrémental, qui ne périme jamais.
    const reprise = await this.repriseUtilisable(db, sourceId, maintenant);

    const run = await db.harvestRun.create({
      data: { sourceId, outcome: 'en_cours' },
    });

    const issue = await this.client.moissonner({
      baseUrl: source.baseUrl,
      metadataPrefix: source.metadataPrefix,
      // `""` veut dire « tout l'entrepôt » : la colonne est non nulle pour que
      // la contrainte d'unicité s'applique, le client garde son `set?`.
      set: source.setSpec || undefined,
      from: reprise ? undefined : source.lastDatestamp ?? undefined,
      reprise: reprise ?? undefined,
    });

    return this.ecrireIssue(db, slug, run.id, source.id, issue, maintenant);
  }

  /** Le jeton du dernier passage, s'il est encore dans sa fenêtre. */
  private async repriseUtilisable(
    db: TenantDb,
    sourceId: string,
    maintenant: Date,
  ): Promise<string | null> {
    const precedent = await db.harvestRun.findFirst({
      where: { sourceId, resumptionToken: { not: null } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
    if (!precedent?.resumptionToken) return null;
    // ⚠ UNE PÉREMPTION INCONNUE N'EST PAS UNE PÉREMPTION INFINIE. L'entrepôt ne
    // l'annonce pas toujours ; on tente quand même, parce que le pire cas est
    // un `badResumptionToken` que la prochaine exécution corrigera — alors que
    // renoncer par principe rendrait la reprise inutile chez la plupart des
    // entrepôts, qui n'annoncent rien.
    if (precedent.resumptionExpires && precedent.resumptionExpires <= maintenant) return null;
    return precedent.resumptionToken;
  }

  private async ecrireIssue(
    db: TenantDb,
    slug: string,
    runId: string,
    sourceId: string,
    issue: IssueMoissonnage,
    maintenant: Date,
  ) {
    if (issue.etat === 'vide') {
      // ⚠ UN VIDE CONFIRMÉ FAIT AVANCER LE CURSEUR. L'entrepôt a répondu qu'il
      // n'avait rien de neuf depuis cette date : redemander la même fenêtre au
      // prochain passage serait la seule chose qu'on sait déjà inutile.
      return this.clore(db, runId, { outcome: 'vide' }, maintenant);
    }

    const ramassage: Ramassage | null =
      issue.etat === 'moisson' ? issue : issue.partiel;

    // Rien n'a été ramassé : on écrit l'échec, et le curseur ne bouge pas.
    if (!ramassage) {
      return this.clore(
        db,
        runId,
        { outcome: issue.etat, reason: 'motif' in issue ? issue.motif : undefined },
        maintenant,
      );
    }

    const comptes = await this.appliquer(db, slug, sourceId, ramassage);

    return this.clore(
      db,
      runId,
      {
        outcome: issue.etat,
        reason: issue.etat === 'moisson' ? undefined : 'motif' in issue ? issue.motif : undefined,
        ...comptes,
        pages: ramassage.pages,
        lastDatestamp: ramassage.dernierDatestamp,
        resumptionToken: ramassage.reprise?.jeton ?? null,
        resumptionExpires: ramassage.reprise?.expire ? new Date(ramassage.reprise.expire) : null,
        // ⚠ LE CURSEUR DE LA SOURCE N'AVANCE QUE SI LE PARCOURS A ABOUTI.
        avancerLaSource: issue.etat === 'moisson' && !ramassage.reprise,
        sourceId,
      },
      maintenant,
    );
  }

  /** Écrit l'identité et les notices, sans jamais écraser ni supprimer. */
  private async appliquer(db: TenantDb, slug: string, sourceId: string, r: Ramassage) {
    let created = 0;
    let ignored = 0;
    let collided = 0;

    const connues = new Map(
      (
        await db.harvestedRecord.findMany({
          where: {
            sourceId,
            oaiIdentifier: {
              in: [...r.notices, ...r.suppressions].map((n) => n.identifiant),
            },
          },
        })
      ).map((h) => [h.oaiIdentifier, h]),
    );

    const aCreer: { identifiant: string; datestamp: string; extrait: NonNullable<ReturnType<typeof mapperOaiDc>>; brut: unknown }[] = [];

    for (const notice of r.notices) {
      const deja = connues.get(notice.identifiant);

      if (deja) {
        if (deja.datestamp === notice.datestamp) {
          // Rien de neuf : la source la redonne, à l'identique.
          ignored += 1;
          await db.harvestedRecord.update({
            where: { id: deja.id },
            data: { lastSeenAt: new Date() },
          });
          continue;
        }
        // ⚠ DÉCISION 2 : on SIGNALE, on ne tranche pas. La notice locale n'est
        // pas touchée — c'est un humain qui décidera, sur l'écran de P7-4.
        collided += 1;
        await db.harvestedRecord.update({
          where: { id: deja.id },
          data: { status: 'collision', datestamp: notice.datestamp },
        });
        continue;
      }

      const extrait = mapperOaiDc(notice.metadonnees);
      if (!extrait) {
        // Sans titre, il n'y a pas de notice. Comptée, jamais silencieuse.
        ignored += 1;
        await db.harvestedRecord.create({
          data: {
            sourceId,
            oaiIdentifier: notice.identifiant,
            datestamp: notice.datestamp,
            status: 'ignoree',
            lastSeenAt: new Date(),
          },
        });
        continue;
      }
      aCreer.push({
        identifiant: notice.identifiant,
        datestamp: notice.datestamp,
        extrait,
        brut: extraireDc(notice.metadonnees),
      });
    }

    if (aCreer.length) {
      const ids = await this.cataloging.importerNoticesMoissonnees(
        db,
        slug,
        aCreer.map(({ extrait, brut }) => ({ extrait, brut })),
      );
      for (const [i, entree] of aCreer.entries()) {
        await db.harvestedRecord.create({
          data: {
            sourceId,
            oaiIdentifier: entree.identifiant,
            datestamp: entree.datestamp,
            recordId: ids[i],
            status: 'importee',
            lastSeenAt: new Date(),
          },
        });
      }
      created = ids.length;
    }

    // ⚠ DÉCISION 6 : SIGNALÉE, JAMAIS APPLIQUÉE. La notice locale reste. On ne
    // note que ceci : la source ne la donne plus.
    let deletions = 0;
    for (const suppression of r.suppressions) {
      const deja = connues.get(suppression.identifiant);
      if (!deja) {
        // ⚠ UNE SUPPRESSION D'UNE NOTICE QU'ON N'A JAMAIS EUE EST COMPTÉE, ET
        // CE N'EST PAS UNE COQUETTERIE. Elle arrive à chaque moissonnage
        // incrémental : la source signale ce qu'elle a retiré depuis notre
        // date, y compris ce que nous n'avions pas pris.
        //
        // Sans ce compte, l'arithmétique du compte rendu ne tombe PAS juste —
        // mesuré contre le DSpace de démonstration : « 100 reçues, 99 créées,
        // 0 ignorée », une ligne manquante et personne pour dire laquelle.
        // Quelqu'un serait allé chercher un défaut qui n'existe pas.
        //
        // Elle est `ignored` : reçue, et rien fait. C'est exactement ce que ce
        // compteur veut dire.
        ignored += 1;
        continue;
      }
      deletions += 1;
      await db.harvestedRecord.update({
        where: { id: deja.id },
        data: { status: 'supprimee_a_la_source', datestamp: suppression.datestamp },
      });
    }

    // ⚠ L'INVARIANT DU COMPTE RENDU : reçues = créées + ignorées + collisions +
    // suppressions. Une ligne qui n'entre dans aucun compte est une ligne dont
    // personne ne saura ce qu'elle est devenue.
    return {
      received: r.notices.length + r.suppressions.length,
      created,
      ignored,
      collided,
      deletions,
    };
  }

  private async clore(
    db: TenantDb,
    runId: string,
    champs: Record<string, unknown> & { avancerLaSource?: boolean; sourceId?: string },
    maintenant: Date,
  ) {
    const { avancerLaSource, sourceId, ...data } = champs;

    if (avancerLaSource && sourceId && data.lastDatestamp) {
      await db.harvestSource.update({
        where: { id: sourceId },
        data: { lastDatestamp: data.lastDatestamp as string },
      });
    }

    // ⚠ L'HEURE RÉELLE, PAS `maintenant`. Le paramètre injecté sert à décider
    // si un jeton de reprise est encore dans sa fenêtre — il est capturé AVANT
    // l'appel réseau. L'employer ici a produit, contre un vrai entrepôt, un
    // compte rendu où `finishedAt` PRÉCÈDE `startedAt` de sept millisecondes :
    // une exécution qui se termine avant d'avoir commencé.
    //
    // Personne n'en serait mort, et c'est justement le genre de faux qu'on
    // n'écrit jamais exprès et que personne ne relit.
    return db.harvestRun.update({
      where: { id: runId },
      data: { ...data, finishedAt: new Date() },
    });
  }
}
