import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MailOutcome } from '../accounts/mail/mail-outcome';
import { MailService } from '../accounts/mail/mail.service';
import { StorageService } from '../storage/storage.service';
import { ContentIngestionService } from '../offline-licensing/content-ingestion.service';
import { verifierFichier, type UploadedDigitalFile } from '../cataloging/fichier-numerique';
import { FONCTIONS } from '../auth/functions';
import {
  OU_CANDIDAT_DIRECTEUR,
  SELECTION_CANDIDAT_DIRECTEUR,
  peutDirigerUnDepot,
  versDirecteurDesignable,
} from './directeurs';
import {
  ActeurDepot,
  EtatDepot,
  ETAT_INITIAL,
  enAttenteDeCatalogage,
  refusDeTransition,
} from './etats';

type TenantDb = PrismaClient;

/**
 * Durée de vie de l'URL de lecture d'un dépôt — **cinq minutes**, comme celle
 * de la lecture en ligne d'une notice (`READ_URL_TTL_SECONDS`).
 *
 * ⚠ Elle suffit parce que les lecteurs téléchargent le fichier ENTIER à
 * l'ouverture : aucune requête ensuite, session de lecture illimitée. Ne pas
 * rallonger « par confort » — le TTL est ce qui borne la fenêtre pendant
 * laquelle une URL copiée depuis l'onglet Réseau reste utilisable.
 */
const TTL_LECTURE_DEPOT_SECONDES = 5 * 60;

/**
 * LE CIRCUIT DE DÉPÔT — P6-2.
 *
 * L'étudiant dépose, le directeur valide le CONTENU, le bibliothécaire complète
 * la DESCRIPTION et c'est lui qui crée la notice. Deux gestes, deux métiers.
 *
 * ⚠ LA NOTICE NAÎT AU CATALOGAGE, PAS AU DÉPÔT, et ce n'est pas un détail de
 * séquence : c'est ce qui protège l'invariant I1. `BiblioRecord.id` ne change
 * jamais — c'est le `docId` des licences hors-ligne signées déployées sur des
 * téléphones. Un dépôt refusé ne doit laisser aucun identifiant mort-né dans la
 * table que ces licences indexent.
 *
 * ⚠ ET UN DÉPÔT N'EST JAMAIS PUBLIC, QUEL QUE SOIT SON ÉTAT — garanti par
 * CONSTRUCTION, pas par un filtre : `deposits` est une table distincte, et ni
 * l'OPAC ni l'entrepôt OAI ne la lisent. Il n'y a rien à filtrer parce qu'il
 * n'y a rien à voir. Voir `jamais-public.spec.ts`.
 */
@Injectable()
export class DepotsService {
  private readonly logger = new Logger(DepotsService.name);

  constructor(
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly ingestion: ContentIngestionService,
  ) {}

  /** Crée un brouillon. Le déposant est toujours l'auteur de l'appel. */
  async creer(
    db: TenantDb,
    deposantId: string,
    dto: {
      title: string;
      authorName: string;
      documentType: string;
      year?: number;
      directorId?: string;
    },
  ) {
    // ⚠ LE DIRECTEUR DOIT ÊTRE UN COMPTE EXISTANT, et c'est `Author.userId`
    // (P6-1) qui rend ce lien possible. Sans vérification, un identifiant
    // fautif produirait un dépôt que PERSONNE ne peut valider — et l'étudiant
    // attendrait indéfiniment sans que rien ne le dise.
    if (dto.directorId) await this.exigerDirecteur(db, dto.directorId);

    return db.deposit.create({
      data: {
        status: ETAT_INITIAL,
        depositorId: deposantId,
        authorName: dto.authorName.trim(),
        title: dto.title.trim(),
        documentType: dto.documentType,
        year: dto.year ?? null,
        directorId: dto.directorId ?? null,
      },
    });
  }

  /**
   * Téléverse le document du dépôt — et le CHIFFRE immédiatement.
   *
   * ⚠ LE CHIFFREMENT A LIEU AU DÉPÔT, PAS AU CATALOGAGE. Le pire cas la
   * commande : un dépôt REFUSÉ que personne ne cataloguera jamais laisserait
   * son fichier en clair indéfiniment. Les documents les moins protégés
   * seraient exactement ceux que personne ne surveille — et une thèse sous
   * embargo attend parfois des semaines une décision qui ne vient pas.
   *
   * ⚠ LES CLÉS SONT PRÉFIXÉES PAR L'IDENTIFIANT DU DÉPÔT, et le catalogage ne
   * les recopie PAS : il copie les VALEURS de colonnes dans `digital_copies`.
   * Le blob et la CEK enveloppée ne sont jamais retouchés.
   *
   * ⚠ ET LE FICHIER CLAIR EST CONSERVÉ, comme pour toute copie numérique : la
   * lecture en ligne en a besoin, le chiffré sert la lecture hors-ligne. C'est
   * le même régime que le reste du produit — deux façons de stocker un
   * document, et la seconde serait celle que personne ne pense à protéger.
   */
  async televerser(
    db: TenantDb,
    id: string,
    deposantId: string,
    fichier: UploadedDigitalFile,
  ) {
    const depot = await this.exigerDepot(db, id);
    if (depot.depositorId !== deposantId) {
      throw new NotFoundException('Dépôt introuvable.');
    }
    // ⚠ On ne remplace pas le document d'un dépôt déjà SOUMIS : le directeur
    // aurait validé un document et en verrait un autre.
    if (depot.status !== ETAT_INITIAL) {
      throw new BadRequestException(
        `Ce dépôt est « ${depot.status} » : son document ne peut plus être remplacé.`,
      );
    }

    const verdict = verifierFichier(fichier);
    if (!verdict.accepte) throw new BadRequestException(verdict.refus);

    const objectKey = `${id}/${Date.now()}-${nomDeFichierSur(fichier.originalname)}`;
    await this.storage.putObject(objectKey, fichier.buffer, fichier.mimetype);

    const precedent = depot.fileKey;
    const precedentChiffre = depot.encObjectKey;

    let ingestion: Record<string, unknown> = { encStatus: 'pending', encError: null };
    if (verdict.format === 'PDF') {
      try {
        ingestion = {
          ...(await this.ingestion.ingestPdf(id, fichier.buffer)),
          encStatus: 'ready',
          encError: null,
        };
      } catch (error) {
        // ⚠ L'ÉCHEC DU CHIFFREMENT NE FAIT PAS ÉCHOUER LE DÉPÔT, mais il est
        // ÉCRIT : `encStatus: 'failed'` avec son motif. Un dépôt dont le
        // chiffrement a échoué est lisible en ligne et pas hors ligne — et on
        // peut le savoir, au lieu de le découvrir sur un téléphone.
        ingestion = { encStatus: 'failed', encError: (error as Error).message };
        this.logger.warn(
          `Ingestion chiffrée du dépôt ${id} échouée : ${(error as Error).message}`,
        );
      }
    }

    const misAJour = await db.deposit.update({
      where: { id },
      data: {
        fileKey: objectKey,
        fileName: fichier.originalname,
        fileSize: fichier.size,
        fileFormat: verdict.format,
        ...ingestion,
      },
    });

    // ⚠ L'ANCIEN OBJET N'EST SUPPRIMÉ QU'APRÈS le succès du nouveau et de
    // l'écriture — jamais de fenêtre où le dépôt n'a plus de document.
    if (precedent && precedent !== objectKey) {
      await this.storage.deleteObject(precedent).catch(() => undefined);
    }
    if (precedentChiffre && precedentChiffre !== misAJour.encObjectKey) {
      await this.storage.deleteObject(precedentChiffre).catch(() => undefined);
    }
    return misAJour;
  }

  /**
   * L'étudiant soumet : le dépôt passe à `soumis` et le directeur est notifié.
   *
   * ⚠ LA NOTIFICATION DIT LA VÉRITÉ SUR SON ENVOI. Elle rend le `MailOutcome`
   * tel quel — jamais un « envoyé » écrit en dur. C'est le motif corrigé ce
   * matin sur quatre chemins : un étudiant qui dépose et n'entend plus rien
   * redéposera, et un directeur jamais prévenu ne validera jamais.
   *
   * ⚠ MAIS UN ÉCHEC DE COURRIEL NE FAIT PAS ÉCHOUER LA SOUMISSION. Le dépôt est
   * soumis, il apparaît dans la liste du directeur, et le circuit reste
   * utilisable sans messagerie. L'issue est REMONTÉE pour que l'écran puisse
   * dire « soumis, mais votre directeur n'a pas été prévenu — signalez-le-lui ».
   */
  async soumettre(db: TenantDb, id: string, deposantId: string) {
    const depot = await this.exigerDepot(db, id);
    if (depot.depositorId !== deposantId) {
      // ⚠ « INTROUVABLE » ET NON « INTERDIT », par le même raisonnement que
      // pour le directeur : un 403 dirait à un étudiant qu'un dépôt existe sous
      // cet identifiant et qu'il appartient à quelqu'un d'autre. Ce n'est pas
      // son affaire, et la symétrie évite qu'un des deux chemins fuie ce que
      // l'autre protège.
      throw new NotFoundException('Dépôt introuvable.');
    }
    this.exigerTransition(depot.status as EtatDepot, 'soumis', 'deposant');
    if (!depot.directorId) {
      throw new BadRequestException(
        'Désignez le directeur de mémoire ou de thèse avant de soumettre.',
      );
    }
    // ⚠ UN DÉPÔT SANS DOCUMENT N'EST PAS UN DÉPÔT. Le laisser passer enverrait
    // au directeur une notification pour un dossier vide, et il ne saurait ni
    // quoi valider ni quoi motiver en refusant.
    if (!depot.fileKey) {
      throw new BadRequestException('Téléversez le document avant de soumettre.');
    }

    const soumis = await db.deposit.update({
      where: { id },
      data: { status: 'soumis', submittedAt: new Date() },
    });

    // ⚠ ON NE PRÉVIENT QU'À LA PREMIÈRE SOUMISSION — mesuré par la session
    // frontend : trois tentatives d'envoi vers le même directeur en deux
    // minutes (soumission, retrait, resoumission). Muet en développement ; en
    // production, un étudiant qui hésite inonde son directeur, et un directeur
    // inondé cesse de lire — donc il ne lira pas non plus le jour où ça compte.
    //
    // Une resoumission après retrait n'est pas une information nouvelle : le
    // dépôt est toujours dans sa liste. SAUF si le directeur a changé entre les
    // deux, et la comparaison le dit sans condition supplémentaire.
    if (soumis.notifiedDirectorId === soumis.directorId) {
      // ⚠ ON OMET `notification`, on ne rend PAS `{ sent: false }`. « Déjà
      // prévenu » n'est pas « pas pu être prévenu » : un échec appelle un
      // recours, un silence délibéré n'appelle rien. Les confondre ferait dire
      // à l'écran qu'un envoi a échoué alors que tout va bien.
      return { depot: soumis };
    }

    return { depot: soumis, notification: await this.notifierDirecteur(db, soumis) };
  }

  /**
   * LE DÉPOSANT RETIRE SON DÉPÔT SOUMIS — il reprend la main.
   *
   * ⚠ SANS ELLE, UN DÉPÔT SOUMIS N'AVAIT AUCUNE SORTIE QUI NE DÉPENDE D'UN
   * AUTRE. Ses deux sorties — valider, refuser — étaient réservées au directeur
   * DÉSIGNÉ, et `designerDirecteur` refusait tout ce qui n'est pas un
   * brouillon. Un directeur qui perd `depot.valider` — rôle changé, compte
   * désactivé, départ de l'établissement — laissait le dépôt bloqué pour
   * toujours, et l'étudiant lisait « en attente de votre directeur » sans
   * recours.
   *
   * ⚠ C'EST SON DÉPÔT, et il ne doit dépendre de personne pour en reprendre la
   * main. Il repasse en brouillon : il redésigne, il resoumet.
   *
   * ⚠ ET LE DIRECTEUR EST PRÉVENU. Le dépôt disparaît de sa liste « à
   * valider » ; sans un mot, c'est un silence de plus — il aurait examiné un
   * document qui s'évapore. La notification suit la règle du circuit : l'issue
   * est RENDUE telle quelle, jamais un « envoyé » écrit en dur, et un échec de
   * courriel ne fait pas échouer le retrait.
   */
  async retirer(db: TenantDb, id: string, deposantId: string) {
    const depot = await this.exigerDepot(db, id);
    if (depot.depositorId !== deposantId) {
      throw new NotFoundException('Dépôt introuvable.');
    }
    this.exigerTransition(depot.status as EtatDepot, 'brouillon', 'deposant');

    // ⚠ `submittedAt` EST EFFACÉ : un brouillon n'a pas été soumis, et laisser
    // la date en ferait une ligne vraie hier et fausse aujourd'hui. La trace de
    // la soumission vit au journal d'audit, qui est fait pour ça.
    const retire = await db.deposit.update({
      where: { id },
      data: { status: 'brouillon', submittedAt: null },
    });

    return {
      depot: retire,
      notification: await this.notifierDirecteurDuRetrait(db, depot),
    };
  }

  /**
   * LE BIBLIOTHÉCAIRE RÉATTRIBUE un dépôt soumis à un autre directeur.
   *
   * ⚠ LA SECONDE PORTE, et elle sert quand le déposant ne peut plus agir — un
   * étudiant parti, un compte suspendu. Le dépôt reste `soumis` : seul son
   * directeur change, et le nouveau le voit apparaître dans sa liste.
   *
   * ⚠ PAS SOUS `depot.valider`, et c'est la consigne : résoudre un blocage par
   * le droit qui manque serait tourner en rond. Voir le contrôleur pour la
   * fonction retenue et son motif.
   *
   * ⚠ LA TRACE NOMME L'ANCIEN DIRECTEUR. « Réattribué » sans dire de qui à qui
   * ne raconte rien — et c'est précisément ce qu'on veut relire six mois plus
   * tard, quand quelqu'un demande pourquoi ce dépôt a changé de mains.
   */
  async reattribuer(db: TenantDb, id: string, nouveauDirecteurId: string) {
    const depot = await this.exigerDepot(db, id);
    if (depot.status !== 'soumis') {
      throw new BadRequestException(
        `Ce dépôt est « ${depot.status} » : seule une soumission en attente se réattribue.`,
      );
    }
    if (depot.directorId === nouveauDirecteurId) {
      throw new BadRequestException('Ce dépôt est déjà attribué à cette personne.');
    }
    await this.exigerDirecteur(db, nouveauDirecteurId);

    const ancien = depot.directorId
      ? await db.user.findUnique({
          where: { id: depot.directorId },
          select: { id: true, firstName: true, lastName: true },
        })
      : null;

    const misAJour = await db.deposit.update({
      where: { id },
      data: { directorId: nouveauDirecteurId },
    });

    return {
      depot: misAJour,
      /** ⚠ RENDU POUR LA TRACE : « réattribué » sans dire de qui ne raconte rien. */
      ancienDirecteur: ancien
        ? { id: ancien.id, nom: `${ancien.firstName} ${ancien.lastName}`.trim() }
        : null,
      notification: await this.notifierDirecteur(db, misAJour),
    };
  }

  /**
   * Le directeur valide le CONTENU. Aucune notice n'est créée ici.
   *
   * ⚠ ET LE DÉPOSANT EST PRÉVENU. Ni `valider` ni `refuser` n'envoyaient rien :
   * l'étudiant n'apprenait la décision qu'en revenant de lui-même sur « Mon
   * dépôt », c'est-à-dire en se demandant chaque jour si quelque chose a
   * changé. L'issue de l'envoi est RENDUE, jamais écrite en dur.
   */
  async valider(db: TenantDb, id: string, directeurId: string) {
    const depot = await this.exigerDepotDeSonDirecteur(db, id, directeurId);
    this.exigerTransition(depot.status as EtatDepot, 'valide', 'directeur');

    const valide = await db.deposit.update({
      where: { id },
      data: { status: 'valide', decidedAt: new Date(), decidedById: directeurId },
    });
    return { depot: valide, notification: await this.notifierDeposant(db, valide, null) };
  }

  /**
   * Le directeur refuse, AVEC SON MOTIF.
   *
   * ⚠ Aucune donnée n'est supprimée : le dépôt reste, son fichier reste, et le
   * motif est conservé. Un étudiant qui veut redéposer crée un NOUVEAU dépôt —
   * les deux subsistent, ce qui est précisément ce qu'on veut pouvoir relire.
   */
  async refuser(db: TenantDb, id: string, directeurId: string, motif: string) {
    const depot = await this.exigerDepotDeSonDirecteur(db, id, directeurId);
    this.exigerTransition(depot.status as EtatDepot, 'refuse', 'directeur');

    const propre = motif.trim();
    if (!propre) {
      // ⚠ UN REFUS SANS MOTIF EST UN REFUS QU'ON NE PEUT PAS CORRIGER.
      // L'étudiant saurait que c'est non, sans savoir quoi reprendre.
      throw new BadRequestException('Indiquez le motif du refus.');
    }

    const refuse = await db.deposit.update({
      where: { id },
      data: {
        status: 'refuse',
        refusalReason: propre,
        decidedAt: new Date(),
        decidedById: directeurId,
      },
    });
    // ⚠ LE MOTIF PART AVEC LE COURRIEL. C'est tout l'objet de cet envoi : un
    // refus demande une ACTION, et le directeur a pris la peine d'écrire
    // pourquoi. Le laisser découvrir en revenant sur l'écran ferait dépendre
    // une correction du hasard d'une visite.
    return { depot: refuse, notification: await this.notifierDeposant(db, refuse, propre) };
  }

  /**
   * L'URL de lecture du document déposé — et sans elle, le circuit demandait à
   * un directeur de VALIDER UN CONTENU QU'IL NE POUVAIT PAS LIRE.
   *
   * ⚠ ONZE ROUTES, AUCUNE NE SERVAIT LE FICHIER. Le téléversement le stockait,
   * le catalogage en recopiait les clés — et entre les deux, la seule personne
   * dont le métier est de juger le contenu n'y avait aucun accès. Le déposant
   * non plus ne pouvait pas relire ce qu'il avait envoyé, donc pas vérifier
   * qu'il avait envoyé le bon fichier.
   *
   * ⚠ TROIS POPULATIONS, ET LA DÉCISION EST ICI, PAS DANS UNE GARDE. Le
   * déposant (le sien), le directeur désigné (ceux qu'il dirige), le
   * bibliothécaire (`catalogue.gerer`, pour cataloguer). `@RequiresFunctions`
   * exige TOUTES les fonctions listées : il ne sait pas dire « ou ». Écrire la
   * décision au point de décision est ce qu'on a déjà fait pour l'embargo, et
   * pour la même raison — une liste de gardes par surface se complète mal.
   *
   * ⚠ ET LE REFUS EST « INTROUVABLE », par la symétrie du reste du module : un
   * 403 dirait à un étudiant qu'un dépôt existe sous cet identifiant et qu'il
   * appartient à quelqu'un d'autre.
   */
  async urlDeLectureDuDocument(
    db: TenantDb,
    id: string,
    demandeurId: string,
    fonctions: string[],
  ) {
    const depot = await this.exigerDepot(db, id);

    const sien = depot.depositorId === demandeurId;
    const leDirige = depot.directorId === demandeurId;
    const catalogue = fonctions.includes(FONCTIONS.CATALOGUE_GERER);
    if (!sien && !leDirige && !catalogue) {
      throw new NotFoundException('Dépôt introuvable.');
    }

    if (!depot.fileKey) {
      throw new NotFoundException('Ce dépôt n’a pas de document.');
    }

    // ⚠ LE CLAIR, PAS LE CHIFFRÉ. Le blob AEAD segmenté n'est lisible que par
    // le lecteur natif, avec une licence : le servir ici donnerait un fichier
    // que personne ne peut ouvrir. C'est le même partage que pour les copies
    // numériques — le clair sert la lecture en ligne, le chiffré la lecture
    // hors-ligne.
    const url = await this.storage.getSignedDownloadUrl(
      depot.fileKey,
      depot.fileName ?? 'document',
      TTL_LECTURE_DEPOT_SECONDES,
    );
    return {
      url,
      expiresInSeconds: TTL_LECTURE_DEPOT_SECONDES,
      fileFormat: depot.fileFormat,
      fileName: depot.fileName,
    };
  }

  /** Les dépôts du déposant — il suit le sien, sinon il redéposera. */
  mesDepots(db: TenantDb, deposantId: string) {
    return db.deposit.findMany({
      where: { depositorId: deposantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * Les dépôts qu'un directeur a à valider.
   *
   * ⚠ AUTO-PORTÉE, et c'est ce qui rend `depot.valider` acceptable comme
   * élargissement : un directeur ne voit QUE les dépôts dont il est le
   * directeur désigné, jamais ceux d'un collègue. Propriété testée.
   */
  aValider(db: TenantDb, directeurId: string) {
    return db.deposit.findMany({
      where: { directorId: directeurId, status: 'soumis' },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * TOUS LES DÉPÔTS SOUMIS — la vue du personnel, et sans elle la réattribution
   * était INUTILISABLE.
   *
   * ⚠ AUCUNE ROUTE NE LES LISTAIT. `a-valider` est auto-portée au directeur
   * désigné, `a-cataloguer` ne rend que les VALIDÉS, `mes-depots` est celle du
   * déposant. Le bibliothécaire ne pouvait donc pas obtenir l'identifiant du
   * dépôt bloqué — c'est-à-dire le cas exact que la réattribution existe pour
   * résoudre. Une route sans moyen d'atteindre son argument.
   *
   * ⚠ TOUS LES SOUMIS, PAS SEULEMENT LES BLOQUÉS, et le premier motif décide :
   * « le directeur ne peut plus agir » n'est PAS calculable de façon fiable. Un
   * compte désactivé se voit ; un enseignant parti dont le compte tourne encore,
   * non. Un filtre qui rate le cas réel est pire qu'une liste complète.
   *
   * Et la liste a une valeur propre : elle dit combien attendent et depuis
   * quand. Triée par ancienneté, elle rend le problème VISIBLE avant qu'un
   * étudiant se plaigne.
   *
   * ⚠ ELLE NE PERMET NI DE VALIDER NI DE REFUSER, et ce n'est pas une omission :
   * décider reste au directeur. La propriété tient par CONSTRUCTION — `valider`
   * et `refuser` passent par `exigerDepotDeSonDirecteur`, qui rend
   * « introuvable » à quiconque n'est pas le directeur désigné, fût-il muni de
   * l'identifiant que cette liste lui donne. Éprouvé plutôt que supposé.
   */
  async soumis(db: TenantDb, maintenant: Date = new Date()) {
    // ⚠ LES DIRECTEURS DÉSIGNABLES PARTENT AVEC LA LISTE, ET C'EST LE POINT DU
    // LOT. `POST :id/reattribuer` prend DEUX arguments : le dépôt, et le
    // nouveau directeur. Cette route donnait le premier ; le second vivait
    // derrière `GET /depots/directeurs`, sous `depot.deposer` — que le
    // bibliothécaire n'a pas.
    //
    // ⚠ ÉLARGIR `depot.deposer` AURAIT ÉTÉ LA MAUVAISE RÉPONSE : elle donne le
    // droit de DÉPOSER, qui n'a aucun sens pour un bibliothécaire. On aurait
    // accordé un droit d'écriture pour résoudre un problème de LECTURE.
    //
    // Une requête de plus ici, aucune fonction à élargir, et l'information
    // arrive au moment où elle sert — dans l'écran qui va s'en servir.
    const [depots, directeurs] = await Promise.all([
      this.depotsSoumis(db),
      this.directeursDesignables(db),
    ]);
    return { depots: await this.decorerSoumis(db, depots, maintenant), directeurs };
  }

  private depotsSoumis(db: TenantDb) {
    return db.deposit.findMany({
      where: { status: 'soumis' },
      // Le plus ancien d'abord : c'est celui qui attend depuis trois mois qu'on
      // veut voir en haut, pas le dernier arrivé.
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Met chaque ligne en forme : le NOM du directeur, et l'ancienneté. */
  private async decorerSoumis(
    db: TenantDb,
    depots: { id: string; title: string; authorName: string; documentType: string; submittedAt: Date | null; directorId: string | null }[],
    maintenant: Date,
  ) {
    const directeurs = await db.user.findMany({
      where: { id: { in: [...new Set(depots.map((d) => d.directorId).filter(Boolean))] as string[] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const parId = new Map(directeurs.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    return depots.map((d) => ({
      id: d.id,
      title: d.title,
      authorName: d.authorName,
      documentType: d.documentType,
      submittedAt: d.submittedAt,
      directorId: d.directorId,
      /** Le NOM du directeur désigné — un identifiant ne se lit pas. */
      directeur: d.directorId ? (parId.get(d.directorId) ?? null) : null,
      /**
       * ⚠ L'ANCIENNETÉ, PAS SEULEMENT LA DATE. « Soumis il y a 94 jours » se
       * lit ; « 2026-06-10 » demande un calcul, et personne ne le fait en
       * parcourant une liste.
       *
       * ⚠ `null` quand la date de soumission manque — et c'est un cas réel
       * depuis que le retrait l'efface. Zéro voudrait dire « aujourd'hui », ce
       * qui est exactement faux pour un dépôt dont on ignore l'âge.
       */
      joursDepuisSoumission: d.submittedAt ? joursEntre(d.submittedAt, maintenant) : null,
    }));
  }

  /** Les dépôts validés dont la notice reste à créer — le travail du bibliothécaire. */
  async aCataloguer(db: TenantDb) {
    const valides = await db.deposit.findMany({
      where: { status: 'valide' },
      orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    });
    // Le prédicat est nommé une seule fois (`etats.ts`) et réutilisé ici : un
    // `status === 'valide' && recordId === null` recopié dans cinq requêtes est
    // exactement la forme qui dérive.
    return valides.filter(enAttenteDeCatalogage);
  }

  /**
   * Rattache la notice créée par le bibliothécaire au dépôt.
   *
   * ⚠ ON NE CRÉE PAS LA NOTICE ICI, ET C'EST DÉLIBÉRÉ. `CatalogingService.
   * createRecord` porte des invariants — au moins un auteur principal, au moins
   * trois mots-clés — que le formulaire de dépôt ne fournit pas et n'a pas à
   * fournir. Créer la notice depuis ce service demanderait un TROISIÈME chemin
   * d'écriture aux règles plus souples, c'est-à-dire une porte ouverte sur ces
   * invariants. Le bibliothécaire catalogue par le chemin normal, puis rattache.
   */
  async rattacherNotice(db: TenantDb, id: string, recordId: string) {
    const depot = await this.exigerDepot(db, id);
    if (!enAttenteDeCatalogage(depot)) {
      throw new BadRequestException(
        depot.recordId
          ? 'Ce dépôt a déjà une notice.'
          : `Ce dépôt est « ${depot.status} » : seul un dépôt validé se catalogue.`,
      );
    }
    if (!depot.fileKey || !depot.fileFormat) {
      throw new BadRequestException('Ce dépôt n’a pas de document à rattacher.');
    }

    // ⚠ ON COPIE DES VALEURS DE COLONNES, PAS DES OCTETS. Le blob chiffré et la
    // CEK enveloppée restent exactement où le dépôt les a mis : rien n'est
    // re-chiffré, rien n'est recopié dans le seau. La CEK est enveloppée par la
    // KEK SERVEUR, qui ne dépend d'aucune notice.
    //
    // ⚠ Les deux écritures sont dans la MÊME transaction : une notice qui
    // pointerait un fichier sans que le dépôt le sache — ou l'inverse — serait
    // un document orphelin que personne ne retrouve.
    return db.$transaction(async (tx) => {
      await tx.digitalCopy.create({
        data: {
          recordId,
          objectKey: depot.fileKey!,
          fileFormat: depot.fileFormat as never,
          fileSizeBytes: depot.fileSize ?? 0,
          originalName: depot.fileName ?? 'document',
          encObjectKey: depot.encObjectKey,
          encWrappedCek: depot.encWrappedCek,
          encSegSize: depot.encSegSize,
          encAlgo: depot.encAlgo,
          encStatus: depot.encStatus,
          encError: depot.encError,
          xrefValidatedAt: depot.xrefValidatedAt,
          encryptedAt: depot.encryptedAt,
        },
      });
      return tx.deposit.update({ where: { id }, data: { recordId } });
    });
  }

  // ── Aides ───────────────────────────────────────────────────────────────

  private async exigerDepot(db: TenantDb, id: string) {
    const depot = await db.deposit.findUnique({ where: { id } });
    if (!depot) throw new NotFoundException('Dépôt introuvable.');
    return depot;
  }

  /** Le dépôt existe ET le demandeur en est le directeur désigné. */
  private async exigerDepotDeSonDirecteur(db: TenantDb, id: string, directeurId: string) {
    const depot = await this.exigerDepot(db, id);
    if (depot.directorId !== directeurId) {
      // ⚠ « Introuvable » et non « interdit » : répondre 403 dirait à un
      // enseignant qu'un dépôt existe sous cet identifiant et qu'un collègue
      // le dirige. Ce n'est pas son affaire.
      throw new NotFoundException('Dépôt introuvable.');
    }
    return depot;
  }

  private exigerTransition(courant: EtatDepot, vers: EtatDepot, par: ActeurDepot) {
    const refus = refusDeTransition(courant, vers, par);
    if (refus) throw new BadRequestException(refus);
  }

  /**
   * LA GARDE — et elle demande la bonne chose.
   *
   * ⚠ ELLE VÉRIFIAIT QUE LE COMPTE EXISTE. Un dépôt adressé à un camarade
   * passait donc, et restait « soumis » pour toujours : le camarade ne le voit
   * pas (il n'a pas `depot.valider`, donc `a-valider` lui est fermée), le
   * bibliothécaire ne le voit pas (il ne voit que les dépôts VALIDÉS), et
   * l'étudiant attend une réponse que personne n'est en mesure de donner. Rien
   * n'échouait, rien ne se passait.
   *
   * ⚠ ET LE REFUS NOMME SA CAUSE, en deux messages distincts. « Ce compte
   * n'existe pas » et « cette personne ne peut pas diriger » envoient chercher
   * deux choses différentes : le premier dit qu'on s'est trompé de personne, le
   * second qu'on a la bonne personne et qu'elle n'a pas ce rôle dans l'école.
   * Les confondre ferait chercher une faute de saisie là où il faut demander un
   * droit à l'administrateur.
   */
  private async exigerDirecteur(db: TenantDb, directorId: string) {
    const compte = await db.user.findUnique({
      where: { id: directorId },
      select: SELECTION_CANDIDAT_DIRECTEUR,
    });
    if (!compte) {
      throw new BadRequestException(
        'Le directeur désigné n’a pas de compte dans cet établissement.',
      );
    }
    if (!peutDirigerUnDepot(compte)) {
      throw new BadRequestException(
        'Cette personne ne peut pas diriger un mémoire ou une thèse.',
      );
    }
  }

  /**
   * Les directeurs qu'un étudiant peut désigner — le menu déroulant.
   *
   * ⚠ CE N'EST PAS L'ANNUAIRE DES COMPTES. Il en sort un identifiant et un nom
   * affichable, rien d'autre : ni courriel, ni matricule, ni statut, ni rôle.
   * Ce qu'un déposant a besoin de savoir, c'est à QUI adresser son travail.
   *
   * ⚠ LA DÉCISION REPASSE SUR LE RÉSULTAT DE LA REQUÊTE. Le `where` n'est qu'un
   * pré-filtre : si un jour il s'élargit par accident, `peutDirigerUnDepot`
   * écarte quand même. Une erreur de requête ne peut donc que faire MANQUER
   * quelqu'un — jamais en proposer un que la garde refusera ensuite.
   */
  async directeursDesignables(db: TenantDb) {
    const candidats = await db.user.findMany({
      where: OU_CANDIDAT_DIRECTEUR,
      select: SELECTION_CANDIDAT_DIRECTEUR,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    return candidats.filter(peutDirigerUnDepot).map(versDirecteurDesignable);
  }

  /**
   * Désigne — ou remplace — le directeur d'un BROUILLON.
   *
   * ⚠ SANS ELLE, `directorId` ne se posait qu'à la création, et il y était
   * FACULTATIF : un brouillon créé sans directeur ne pouvait plus jamais être
   * soumis ni corrigé. Un formulaire dont une étape mène à un dossier
   * définitivement bloqué est une inertie, pas une contrainte.
   *
   * ⚠ BROUILLON SEULEMENT. Changer le directeur d'un dépôt déjà soumis
   * retirerait le dossier des mains de quelqu'un qui l'examine, sans que rien
   * ne le lui dise.
   */
  async designerDirecteur(
    db: TenantDb,
    id: string,
    deposantId: string,
    directorId: string,
  ) {
    const depot = await this.exigerDepot(db, id);
    if (depot.depositorId !== deposantId) {
      throw new NotFoundException('Dépôt introuvable.');
    }
    if (depot.status !== ETAT_INITIAL) {
      throw new BadRequestException(
        `Ce dépôt est « ${depot.status} » : son directeur ne peut plus être changé.`,
      );
    }
    await this.exigerDirecteur(db, directorId);
    return db.deposit.update({ where: { id }, data: { directorId } });
  }

  /**
   * Prévient le DÉPOSANT de la décision, et rend ce qui est arrivé à l'envoi.
   *
   * ⚠ UNE SEULE MÉTHODE POUR LES DEUX DÉCISIONS : la différence tient au motif,
   * pas au chemin. Deux méthodes jumelles auraient divergé au premier
   * changement — l'une prévenant, l'autre non.
   */
  private async notifierDeposant(
    db: TenantDb,
    depot: { id: string; title: string; depositorId: string },
    motifDeRefus: string | null,
  ): Promise<MailOutcome> {
    const deposant = await db.user.findUnique({ where: { id: depot.depositorId } });
    if (!deposant?.email) return { sent: false, reason: 'aucun_destinataire' };

    const resultat = motifDeRefus
      ? await this.mail.sendDepositRefused(deposant.email, {
          titre: depot.title,
          motif: motifDeRefus,
        })
      : await this.mail.sendDepositApproved(deposant.email, { titre: depot.title });

    if (!resultat.sent) {
      this.logger.warn(
        `Déposant non prévenu de la décision sur ${depot.id} : ${resultat.reason}` +
          `${resultat.detail ? ` — ${resultat.detail}` : ''}`,
      );
    }
    return resultat;
  }

  /**
   * Prévient le directeur qu'un dépôt a été RETIRÉ de sa liste.
   *
   * ⚠ Même forme que la notification de soumission : l'issue est RENDUE, et un
   * échec n'interrompt rien. Le dépôt est retiré dans tous les cas — refuser le
   * retrait parce qu'un courriel ne part pas remettrait l'étudiant dans
   * l'impasse qu'on vient d'ouvrir.
   */
  private async notifierDirecteurDuRetrait(
    db: TenantDb,
    depot: { id: string; title: string; authorName: string; directorId: string | null },
  ): Promise<MailOutcome> {
    if (!depot.directorId) return { sent: false, reason: 'aucun_destinataire' };
    const directeur = await db.user.findUnique({ where: { id: depot.directorId } });
    if (!directeur?.email) return { sent: false, reason: 'aucun_destinataire' };

    const resultat = await this.mail.sendDepositWithdrawn(directeur.email, {
      titre: depot.title,
      auteur: depot.authorName,
    });
    if (!resultat.sent) {
      this.logger.warn(
        `Directeur non prévenu du retrait du dépôt ${depot.id} : ${resultat.reason}`,
      );
    }
    return resultat;
  }

  /** Prévient le directeur, et rend CE QUI EST ARRIVÉ à l'envoi. */
  private async notifierDirecteur(
    db: TenantDb,
    depot: { id: string; title: string; authorName: string; directorId: string | null },
  ): Promise<MailOutcome> {
    if (!depot.directorId) return { sent: false, reason: 'aucun_destinataire' };
    const directeur = await db.user.findUnique({ where: { id: depot.directorId } });
    if (!directeur?.email) return { sent: false, reason: 'aucun_destinataire' };

    const resultat = await this.mail.sendDepositSubmitted(directeur.email, {
      titre: depot.title,
      auteur: depot.authorName,
    });
    if (!resultat.sent) {
      this.logger.warn(
        `Directeur non prévenu du dépôt ${depot.id} : ${resultat.reason}` +
          `${resultat.detail ? ` — ${resultat.detail}` : ''}`,
      );
      // ⚠ ON N'INSCRIT RIEN SUR UN ÉCHEC. Marquer « prévenu » rendrait ce
      // directeur muet pour toujours : la prochaine soumission le croirait
      // informé. Une école sans SMTP retentera donc à chaque soumission — des
      // TENTATIVES, pas des courriels.
      return resultat;
    }

    await db.deposit.update({
      where: { id: depot.id },
      data: { notifiedDirectorId: depot.directorId },
    });
    return resultat;
  }
}

/** Jours calendaires entiers écoulés — l'ancienneté d'une attente. */
function joursEntre(debut: Date, fin: Date): number {
  return Math.max(0, Math.floor((fin.getTime() - debut.getTime()) / 86_400_000));
}

/** Neutralise les caractères à risque dans un nom de fichier utilisateur. */
function nomDeFichierSur(nom: string): string {
  return nom.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
}
