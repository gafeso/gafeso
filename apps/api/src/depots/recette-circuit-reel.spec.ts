import { afterAll, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { DepotsService } from './depots.service';
import { StorageService } from '../storage/storage.service';
import { OfflineKeysService } from '../offline-licensing/offline-keys.service';
import { ContentIngestionService } from '../offline-licensing/content-ingestion.service';
import { decryptSegment, unwrapCekWithKek } from '../offline-licensing/content-crypto';

/**
 * LA TRAVERSÉE RÉELLE DU CIRCUIT DE DÉPÔT — gatée `DEPOT_REEL=1`.
 *
 * ⚠ CE N'EST PAS LA RECETTE DU FRONT, ET C'EST VOULU. Il a parcouru les écrans
 * hier soir, en trois sessions réelles. Ce qui n'avait JAMAIS été traversé,
 * c'est ce côté-ci : les transitions vues du service, ce que la base porte à
 * chaque étape, la notification qui remonte, et **le fichier chiffré de bout en
 * bout** — le seul endroit où une erreur laisse un document illisible sur un
 * appareil qu'on ne contrôle plus.
 *
 * ⚠ CE N'EST PAS UN GARDE. Il touche MinIO, la base de développement et des
 * horloges ; le brancher sur `npm test` le rendrait rouge le jour où MinIO est
 * arrêté. Il existe pour traverser une fois, et pour se rejouer d'une ligne.
 *
 *   DEPOT_REEL=1 npx dotenv -e ../../.env -- vitest run src/depots/recette-circuit-reel.spec.ts
 *
 * ## Ce qui est vrai, et ce qui ne l'est pas
 *
 * ⚠ **La base est réelle, et la transaction est ANNULÉE.** Rien ne persiste —
 * pas un dépôt, pas une notice.
 *
 * ⚠ **MinIO n'est PAS transactionnel.** Le blob chiffré est réellement écrit, et
 * il est supprimé à la fin — avec vérification que la suppression a eu lieu.
 * C'est la seule pièce qui n'est pas protégée par l'annulation, et la seule
 * qu'on nettoie à la main.
 *
 * ⚠ **Le courriel est doublé**, évidemment : traverser pour de vrai enverrait
 * du courrier à des adresses de jeu d'essai. Ce qui est mesuré est que le
 * `MailOutcome` REMONTE — pas qu'un message parte.
 */

const ACTIF = process.env.DEPOT_REEL === '1';

/** Un PDF réel, fabriqué ici : la chaîne de chiffrement valide le xref. */
async function pdfReel(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText('Mémoire de recette — Gafeso', { x: 60, y: 760, size: 18 });
  page.drawText('Ce document existe pour traverser le circuit une fois.', { x: 60, y: 720, size: 11 });
  return Buffer.from(await doc.save());
}

describe.runIf(ACTIF)('⚠ LE CIRCUIT DE DÉPÔT, traversé pour de vrai', () => {
  // ⚠ CONSTRUITS DANS LE TEST, PAS DANS LE `describe`.
  //
  // `describe.runIf(false)` SAUTE les tests mais ÉVALUE quand même le corps du
  // describe, pour les collecter. Construits ici, `StorageService` et
  // `OfflineKeysService` levaient « MINIO_ROOT_USER manquant » à chaque
  // `npm test` — un fichier gaté qui fait tomber la suite qu'il ne devait
  // jamais concerner.
  //
  // C'est la suite normale qui l'a dit, et pas ma relecture : je l'avais
  // éprouvé UNIQUEMENT avec la porte ouverte.
  let prisma: PrismaClient;
  let storage: StorageService;
  let keys: OfflineKeysService;
  let ingestion: ContentIngestionService;

  /** Les objets réellement écrits dans MinIO — nettoyés à la fin. */
  const objets: string[] = [];
  const etapes: string[] = [];

  afterAll(async () => {
    if (!storage || !prisma) return;
    for (const cle of objets) {
      await storage.deleteObject(cle).catch(() => undefined);
    }
    await prisma.$disconnect();
    // eslint-disable-next-line no-console
    console.log(['', '── Étapes traversées ──', ...etapes.map((e) => '  ' + e)].join('\n'));
  });

  it('de la création au catalogage, en vérifiant la base à chaque étape', async () => {
    const url = new URL(process.env.DATABASE_URL ?? 'postgresql://x/y');
    url.searchParams.set('schema', 'tenant_zinda');
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const config = new ConfigService();
    storage = new StorageService(config);
    keys = new OfflineKeysService(config);
    ingestion = new ContentIngestionService(storage, keys);

    await storage.onModuleInit();

    const mail = {
      sendDepositSubmitted: vi.fn(async () => ({ sent: true as const })),
      sendDepositWithdrawn: vi.fn(async () => ({ sent: true as const })),
      sendDepositApproved: vi.fn(async () => ({ sent: true as const })),
      sendDepositRejected: vi.fn(async () => ({ sent: true as const })),
    };
    const depots = new DepotsService(mail as never, storage, ingestion);

    const clair = await pdfReel();

    try {
      await prisma.$transaction(
        async (tx) => {
          // ⚠ LA TRANSACTION EST APLATIE, ET IL FAUT LE DIRE.
          //
          // `rattacherNotice` ouvre sa PROPRE transaction, et un client de
          // transaction Prisma n'a pas de `$transaction` — impossible
          // d'imbriquer. Le mandataire ci-dessous fait exécuter la transaction
          // interne DANS l'externe : c'est exactement ce qu'on veut pour
          // pouvoir tout annuler, et c'est la seule entorse au « rien n'est
          // doublé ».
          //
          // Ce que ça coûte en fidélité : l'atomicité PROPRE de
          // `rattacherNotice` n'est pas éprouvée ici — elle l'est par ses tests
          // unitaires. Ce qui est éprouvé, c'est ce qu'elle ÉCRIT.
          const db = new Proxy(tx as unknown as PrismaClient, {
            get(cible, propriete, recepteur) {
              if (propriete === '$transaction') {
                return (travail: (c: PrismaClient) => unknown) =>
                  Promise.resolve(travail(tx as unknown as PrismaClient));
              }
              return Reflect.get(cible, propriete, recepteur);
            },
          });

          // ── Les deux personnes, prises dans l'école RÉELLE.
          const etudiant = await db.user.findFirst({ where: { role: 'STUDENT', status: 'ACTIVE' } });
          const directeur = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
          expect(etudiant, 'aucun étudiant actif dans tenant_zinda').toBeTruthy();
          expect(directeur, 'aucun directeur possible dans tenant_zinda').toBeTruthy();

          // ── 1 · CRÉATION
          const brouillon = await depots.creer(db, etudiant!.id, {
            title: 'Mémoire de recette — traversée réelle',
            authorName: 'Traoré, Awa',
            documentType: 'memoire',
          } as never);
          expect(brouillon.status).toBe('brouillon');
          expect(brouillon.submittedAt).toBeNull();
          etapes.push(`1 · créé : status=${brouillon.status}, submittedAt=${brouillon.submittedAt}`);

          // ── 2 · SOUMETTRE SANS DIRECTEUR → refus, et le refus DIT quoi faire
          await expect(depots.soumettre(db, brouillon.id, etudiant!.id)).rejects.toThrow(
            /directeur/i,
          );
          etapes.push('2 · soumission sans directeur : REFUSÉE, le message nomme le directeur');

          // ── 3 · DÉSIGNER LE DIRECTEUR
          const avecDirecteur = await depots.designerDirecteur(
            db,
            brouillon.id,
            etudiant!.id,
            directeur!.id,
          );
          expect(avecDirecteur.directorId).toBe(directeur!.id);
          etapes.push('3 · directeur désigné');

          // ── 4 · SOUMETTRE SANS FICHIER → refus
          await expect(depots.soumettre(db, brouillon.id, etudiant!.id)).rejects.toThrow(
            /document/i,
          );
          etapes.push('4 · soumission sans document : REFUSÉE');

          // ── 5 · LE TÉLÉVERSEMENT, ET LA CHAÎNE DE CHIFFREMENT
          const televerse = await depots.televerser(db, brouillon.id, etudiant!.id, {
            buffer: clair,
            originalname: 'memoire-recette.pdf',
            mimetype: 'application/pdf',
            size: clair.length,
          } as never);
          if (televerse.fileKey) objets.push(televerse.fileKey);
          if (televerse.encObjectKey) objets.push(televerse.encObjectKey);

          expect(televerse.fileKey, 'le CLAIR doit être conservé (lecture en ligne)').toBeTruthy();
          expect(televerse.encObjectKey, 'le blob chiffré manque').toBeTruthy();
          expect(televerse.encWrappedCek, 'la CEK enveloppée manque').toBeTruthy();
          expect(televerse.xrefValidatedAt, 'le xref n’a pas été validé').toBeTruthy();
          expect(televerse.encAlgo).toBe('aead-seg-gcm-16k/v1');
          etapes.push(
            `5 · téléversé : clair + blob ${televerse.encAlgo}, seg=${televerse.encSegSize}, ` +
              `xref validé, CEK enveloppée (${String(televerse.encWrappedCek).length} car.)`,
          );

          // ── 6 · ⚠ LA CHAÎNE EST-ELLE RÉVERSIBLE ? C'est LA question.
          //
          // Tout le reste peut être juste et ce point faux : un blob qu'on ne
          // sait pas déchiffrer laisse un document illisible sur un appareil
          // qu'on ne contrôle plus. Les spikes ont validé les briques ; la
          // chaîne, jamais.
          const cek = unwrapCekWithKek(televerse.encWrappedCek!, keys.contentKek);
          expect(cek.length, 'la CEK déballée n’a pas 32 octets').toBe(32);
          etapes.push('6a · CEK déballée avec la KEK serveur : 32 octets');

          const blob = await lireObjet(storage, televerse.encObjectKey!);
          const segment0 = decryptSegment(blob, 0, cek);
          expect(segment0.length).toBeGreaterThan(0);
          // ⚠ UN PDF COMMENCE PAR `%PDF`. Si le premier segment déchiffré ne le
          // porte pas, la chaîne est réversible « en octets » et fausse en
          // contenu — exactement le genre de vrai-faux qu'on ne voit qu'ici.
          expect(segment0.subarray(0, 4).toString('latin1')).toBe('%PDF');
          etapes.push(`6b · segment 0 déchiffré : ${segment0.length} octets, commence par %PDF`);

          // ── 7 · SOUMETTRE — la transition, et la notification qui REMONTE
          const soumis = await depots.soumettre(db, brouillon.id, etudiant!.id);
          expect(soumis.depot.status).toBe('soumis');
          expect(soumis.depot.submittedAt).toBeTruthy();
          // ⚠ Ce qui est mesuré n'est pas qu'un courriel parte — le service de
          // courrier est doublé — mais que son ISSUE remonte jusqu'à l'appelant.
          expect(soumis.notification).toEqual({ sent: true });
          expect(mail.sendDepositSubmitted).toHaveBeenCalledTimes(1);
          etapes.push(
            `7 · soumis : submittedAt posé, notification=${JSON.stringify(soumis.notification)}`,
          );

          // ── 8 · RETIRER puis RESOUMETTRE — la règle du silence
          const retire = await depots.retirer(db, brouillon.id, etudiant!.id);
          expect(retire.depot.status).toBe('brouillon');
          // ⚠ `submittedAt` EFFACÉ : un brouillon n'a pas été soumis.
          expect(retire.depot.submittedAt).toBeNull();
          // ⚠ ET LE RETRAIT PRÉVIENT : c'est le seul geste qui RETIRE quelque
          // chose de la liste du directeur.
          expect(retire.notification).toEqual({ sent: true });
          etapes.push('8 · retiré : submittedAt effacé, et le directeur EST prévenu');

          const resoumis = await depots.soumettre(db, brouillon.id, etudiant!.id);
          expect(resoumis.depot.status).toBe('soumis');
          // ⚠ SILENCE : même directeur, il sait déjà. Et `notification` est
          // OMISE, pas rendue à `{ sent: false }`.
          expect('notification' in resoumis).toBe(false);
          expect(mail.sendDepositSubmitted).toHaveBeenCalledTimes(1);
          etapes.push('9 · resoumis au MÊME directeur : aucun second envoi, notification OMISE');

          // ── 10 · VALIDER PAR QUELQU'UN D'AUTRE → « introuvable »
          await expect(depots.valider(db, brouillon.id, etudiant!.id)).rejects.toThrow(
            /introuvable/i,
          );
          etapes.push('10 · validation par un tiers : « introuvable », jamais « interdit »');

          // ── 11 · VALIDER PAR LE DIRECTEUR
          const valide = await depots.valider(db, brouillon.id, directeur!.id);
          expect(valide.depot.status).toBe('valide');
          expect(valide.depot.decidedAt).toBeTruthy();
          expect(valide.depot.decidedById).toBe(directeur!.id);
          expect(valide.notification).toEqual({ sent: true });
          etapes.push(
            `11 · validé : decidedAt posé, décideur enregistré, déposant prévenu ` +
              `(${JSON.stringify(valide.notification)})`,
          );

          // ── 12 · CATALOGUER — et ⚠ LA PROMESSE DU SCHÉMA : aucun re-chiffrement
          const notice = await db.biblioRecord.create({
            data: {
              title: 'Notice de recette — traversée réelle',
              author: 'Traoré, Awa',
              recordType: 'memoire',
              marcFormat: 'GAFESO',
              marcData: {},
            },
          });
          const rattache = await depots.rattacherNotice(db, brouillon.id, notice.id);
          expect(rattache.recordId).toBe(notice.id);

          const copie = await db.digitalCopy.findFirst({ where: { recordId: notice.id } });
          expect(copie, 'aucune copie numérique créée au catalogage').toBeTruthy();
          // ⚠ LES MÊMES CLÉS, À L'OCTET PRÈS. Le schéma affirme que le
          // rattachement « ne re-chiffre ni ne recopie rien » : c'est vérifié
          // ici, pas supposé. Un re-chiffrement invaliderait les licences déjà
          // signées pour ce document.
          expect(copie!.encObjectKey).toBe(televerse.encObjectKey);
          expect(copie!.encWrappedCek).toBe(televerse.encWrappedCek);
          expect(copie!.objectKey).toBe(televerse.fileKey);
          etapes.push(
            '12 · catalogué : la copie numérique porte les MÊMES clés — aucun re-chiffrement',
          );

          // ⚠ L'ANNULATION, ET ELLE MANQUAIT À LA PREMIÈRE ÉCRITURE.
          //
          // Ce `throw` est la seule chose qui empêche cette recette d'écrire
          // dans la base de développement. Je l'avais oublié : la première
          // exécution a laissé un dépôt `brouillon` dans `tenant_zinda`,
          // pointant vers des objets MinIO que le nettoyage venait d'effacer —
          // une ligne qui promet un document disparu.
          //
          // ⚠ Et le `catch` de l'appelant l'attendait DÉJÀ : il avale
          // `ROLLBACK_VOULU` et relève tout le reste. Le filet était posé, la
          // pierre n'y était pas jetée. C'est la forme la plus ordinaire de
          // l'erreur — un dispositif complet à une ligne près, et rien pour le
          // dire puisque tout le reste PASSE.
          throw new Error('ROLLBACK_VOULU');
        },
        { timeout: 180_000 },
      );
    } catch (e) {
      if ((e as Error).message !== 'ROLLBACK_VOULU') throw e;
    }

    // ⚠ ET ON VÉRIFIE QUE RIEN N'A PERSISTÉ — c'est la moitié qu'on oublie.
    // « J'ai mis une transaction » n'est pas « rien n'est resté » : la première
    // exécution AVAIT la transaction, il lui manquait le `throw`, et la suite
    // était verte.
    const restes = await prisma.deposit.count({
      where: { title: 'Mémoire de recette — traversée réelle' },
    });
    expect(restes, 'la recette a laissé un dépôt dans la base de développement').toBe(0);
    etapes.push(`13 · vérifié : ${restes} dépôt laissé en base`);
  }, 200_000);
});

/** Relit un objet du seau par son URL signée — la seule lecture exposée. */
async function lireObjet(storage: StorageService, cle: string): Promise<Buffer> {
  const url = await storage.getSignedDownloadUrl(cle, 'recette.gafs', 120);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lecture de ${cle} : HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
