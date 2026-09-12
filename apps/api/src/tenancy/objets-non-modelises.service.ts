import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  comparerAuxObjetsPresents,
  messageDeRefus,
  OBJETS_NON_MODELISES,
  requeteDExistence,
} from './objets-non-modelises';

/**
 * REFUSE DE DÉMARRER si un objet de base non modélisé par Prisma manque.
 *
 * Même exigence que `OfflineKeysService` pour ses trois clés, et pour la même
 * raison : une garantie absente ne se signale pas toute seule. Voir
 * `objets-non-modelises.ts` pour le motif complet et la borne du contrôle.
 *
 * ⚠ `OnApplicationBootstrap` ET NON LE CONSTRUCTEUR : la vérification demande
 * une requête, donc elle est asynchrone. Nest attend ce crochet avant d'écouter
 * le port — une exception ici empêche donc réellement l'API de servir, ce qui
 * est le but.
 */
@Injectable()
export class ObjetsNonModelisesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ObjetsNonModelisesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    let lignes: { nom: string; type: string }[];
    try {
      lignes = await this.prisma.$queryRawUnsafe<{ nom: string; type: string }[]>(
        requeteDExistence(),
      );
    } catch (error) {
      // ⚠ TROISIÈME ÉTAT : « je n'ai pas pu vérifier » n'est PAS « ça manque ».
      //
      // Refuser de démarrer ici transformerait une base lente à répondre en
      // boucle de redémarrage — une coupure d'une minute deviendrait une panne.
      // L'API ne servira rien sans base de toute façon, et elle se rétablira
      // seule. On crie, on ne bloque pas.
      this.logger.error(
        `Objets de base NON VÉRIFIÉS (base injoignable) : ${(error as Error).message}. ` +
          `L'API démarre, mais les garanties de ${OBJETS_NON_MODELISES.length} objet(s) ` +
          `non modélisés ne sont pas confirmées.`,
      );
      return;
    }

    const { manquants } = comparerAuxObjetsPresents(lignes);
    if (manquants.length > 0) {
      throw new Error(messageDeRefus(manquants));
    }
    this.logger.log(
      `Objets de base non modélisés : ${OBJETS_NON_MODELISES.length} présent(s) — ` +
        OBJETS_NON_MODELISES.map((o) => o.nom).join(', '),
    );
  }
}
