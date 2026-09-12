import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import {
  RETENTION_DEPOT_REFUSE_MOIS,
  dateDeButoir,
  fichierAPurger,
} from './retention';

export interface BilanPurge {
  ecoles: number;
  depots: number;
  objets: number;
  echecs: number;
}

/**
 * LA PURGE DES FICHIERS DE DÉPÔTS REFUSÉS — backlog n°25.
 *
 * ⚠ TROIS PROPRIÉTÉS, ET CHACUNE RÉPOND À UNE FAÇON DE SE TROMPER ICI.
 *
 * **1. La trace est écrite AVEC l'issue réelle, pas avant l'acte.** C'est la
 * famille « la trace de succès qui précède l'acte » : un journal écrit d'abord
 * dirait « supprimé » d'un fichier que le stockage a refusé de rendre. On
 * supprime, on MESURE, puis on écrit ce qu'on a mesuré.
 *
 * **2. La trace n'est PAS `AuditService.log`.** Celui-ci avale ses échecs
 * délibérément — perdre une ligne de journal ne doit jamais faire échouer une
 * connexion. Ce raisonnement ne vaut pas pour une suppression : « un fichier
 * qui disparaît sans trace est indistinguable d'un fichier perdu ». La ligne
 * est donc écrite directement, et son échec ARRÊTE le balayage de l'école —
 * plutôt que de continuer à supprimer sans pouvoir le dire.
 *
 * **3. Le dépôt survit entier, son motif de refus compris.** Seuls les OCTETS
 * partent. `fileName` est conservé pendant que `fileKey` est effacé : c'est
 * cette asymétrie qui distingue « document supprimé après douze mois » de
 * « aucun document n'a jamais été déposé ». Voir `fichierPurge`.
 *
 * ⚠ CE QU'ELLE SUPPRIME AUJOURD'HUI : RIEN. Le circuit de dépôt date du
 * 12 septembre 2026 ; aucun refus n'a douze mois, et il n'y en aura pas avant
 * septembre 2027. La règle est posée maintenant parce qu'une politique de
 * rétention écrite après coup se heurte à des données qu'on n'ose plus
 * toucher — pas parce qu'il y a quelque chose à purger.
 */
@Injectable()
export class PurgeDepotsService {
  private readonly logger = new Logger(PurgeDepotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Balaie toutes les écoles actives. Une école en échec n'arrête pas les autres. */
  async purgerToutesLesEcoles(maintenant: Date = new Date()): Promise<BilanPurge> {
    const bilan: BilanPurge = { ecoles: 0, depots: 0, objets: 0, echecs: 0 };
    const ecoles = await this.prisma.tenant.findMany({ where: { status: 'ACTIVE' } });
    for (const ecole of ecoles) {
      bilan.ecoles += 1;
      try {
        const r = await this.purgerUneEcole(
          this.prisma.forTenant(ecole.slug),
          ecole.id,
          maintenant,
        );
        bilan.depots += r.depots;
        bilan.objets += r.objets;
        bilan.echecs += r.echecs;
      } catch (error) {
        bilan.echecs += 1;
        this.logger.error(
          `Purge des dépôts : école « ${ecole.slug} » abandonnée — ${(error as Error).message}`,
        );
      }
    }
    return bilan;
  }

  async purgerUneEcole(
    db: PrismaClient,
    tenantId: string,
    maintenant: Date = new Date(),
  ): Promise<{ depots: number; objets: number; echecs: number }> {
    const butoir = dateDeButoir(maintenant);
    // ⚠ LE PRÉ-FILTRE RÉDUIT, LA DÉCISION TRANCHE — même forme que partout
    // ailleurs. Un `where` trop large ne peut alors que faire travailler pour
    // rien ; il ne peut pas faire supprimer un fichier qu'il ne fallait pas.
    const candidats = await db.deposit.findMany({
      where: { status: 'refuse', decidedAt: { lt: butoir } },
      select: {
        id: true,
        title: true,
        status: true,
        decidedAt: true,
        fileKey: true,
        fileName: true,
        encObjectKey: true,
      },
      orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    });

    let depots = 0;
    let objets = 0;
    let echecs = 0;

    for (const depot of candidats) {
      if (!fichierAPurger(depot, maintenant)) continue;

      // 1 · On supprime, et on MESURE. Rien n'est annoncé avant.
      const supprimes: string[] = [];
      const manques: string[] = [];
      for (const cle of [depot.fileKey, depot.encObjectKey]) {
        if (!cle) continue;
        try {
          await this.storage.deleteObject(cle);
          supprimes.push(cle);
        } catch (error) {
          manques.push(`${cle} (${(error as Error).message})`);
        }
      }

      // 2 · Puis on écrit CE QU'ON A MESURÉ.
      //
      // ⚠ PAS DE TRANSACTION, ET CE N'EST PAS UN OUBLI : le journal vit dans le
      // schéma `public` et le dépôt dans `tenant_<slug>`, servis par DEUX
      // clients Prisma distincts (voir `PrismaService.forTenant`, une connexion
      // par schéma). Une `$transaction` mêlant les deux ne tiendrait pas — et
      // l'écrire ferait CROIRE à une atomicité qui n'existe pas, ce qui est
      // pire que de ne pas l'avoir.
      //
      // ⚠ L'ORDRE PORTE DONC LA GARANTIE, et il est choisi par le pire cas. Le
      // journal d'ABORD : si le second geste échoue, le dépôt nomme encore des
      // clés dont les octets sont partis — visible, et le passage suivant
      // reprend la ligne. Dans l'autre ordre, un échec du journal laisserait un
      // fichier disparu SANS TRACE, c'est-à-dire indistinguable d'un fichier
      // perdu. Une incohérence qui se voit vaut mieux qu'un silence qui se lit
      // comme un bon état.
      try {
        await this.prisma.auditLog.create({
          data: {
            tenantId,
            action: AUDIT_ACTIONS.DEPOSIT_FILE_PURGE,
            targetType: 'deposit',
            targetId: depot.id,
            targetLabel: depot.title,
            metadata: {
              refuseLe: depot.decidedAt?.toISOString() ?? null,
              retentionMois: RETENTION_DEPOT_REFUSE_MOIS,
              nomDuFichier: depot.fileName,
              objetsSupprimes: supprimes,
              objetsNonSupprimes: manques,
            },
          },
        });
      } catch (error) {
        // ⚠ ON S'ARRÊTE POUR CETTE ÉCOLE. Continuer reviendrait à supprimer
        // des fichiers sans pouvoir le dire — le seul cas où poursuivre est
        // pire que renoncer.
        throw new Error(
          `journal de purge non écrit pour le dépôt ${depot.id} — ${(error as Error).message}`,
        );
      }

      // ⚠ `fileName`, `fileSize` et `fileFormat` SURVIVENT : c'est le fait
      // qu'ils restent pendant que `fileKey` s'efface qui distingue « document
      // supprimé après douze mois » de « aucun document n'a jamais été
      // déposé ». Voir `fichierPurge`.
      await db.deposit.update({
        where: { id: depot.id },
        data: {
          fileKey: null,
          encObjectKey: null,
          encWrappedCek: null,
          encSegSize: null,
          encStatus: null,
        },
      });
      depots += 1;
      objets += supprimes.length;
      echecs += manques.length;
    }

    return { depots, objets, echecs };
  }
}
