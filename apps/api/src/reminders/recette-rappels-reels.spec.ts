import { createServer, Server, Socket } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { RemindersService } from './reminders.service';
import { MailService } from '../accounts/mail/mail.service';

/**
 * ⚠ LE MOTEUR DE RAPPELS, TRAVERSÉ DE BOUT EN BOUT — gaté `RAPPELS_REEL=1`.
 *
 * Le dernier des quatre circuits, et celui où un échec est irrattrapable : un
 * rappel qu'on croit parti laisse un adhérent ignorer son retard, et le statut
 * `SENT` est PERSISTÉ puis affiché en statistiques à une bibliothécaire.
 *
 * ## Ce qui n'était pas traversé, et pourquoi ça comptait
 *
 * Le 12 septembre, ce moteur écrivait `SENT` sur un non-événement. Corrigé — et
 * le test de la correction double `MailService`. La chaîne complète — un prêt
 * en retard réel → le parcours → l'envoi → la ligne écrite en base — n'avait
 * jamais tourné.
 *
 * ## ⚠ CE QU'IL ÉCRIT, ET COMMENT IL LE REND
 *
 * Il ne peut PAS s'annuler par une transaction : `reminder_logs` vit dans
 * `public`, les prêts dans le schéma de l'école — deux clients Prisma, donc
 * deux transactions qu'on ne peut pas joindre. Il MUTE donc réellement la base
 * de développement, avec l'accord de Jean, et selon la discipline apprise le
 * matin même :
 *
 * 1. **recensement des lignes AVANT**, retenu en mémoire ;
 * 2. création d'un SEUL prêt, dont l'identifiant est suivi ;
 * 3. nettoyage explicite ;
 * 4. ⚠ **et un contrôle qui COMPTE ce qui reste** — « j'ai mis un nettoyage »
 *    n'est pas « rien n'est resté ».
 *
 * ⚠ Aucun courriel ne part : un serveur SMTP jouet, en mémoire, sur 127.0.0.1.
 *
 *   RAPPELS_REEL=1 npx dotenv -e ../../.env -- vitest run src/reminders/recette-rappels-reels.spec.ts
 */

/** Le même jouet que la recette d'envoi : il accepte, il retient, il ne relaie rien. */
function serveurJouet(options: { refuse?: boolean } = {}) {
  const recus: string[] = [];
  let serveur: Server;
  const demarrer = () =>
    new Promise<number>((resolve) => {
      serveur = createServer((socket: Socket) => {
        let tampon = '';
        let donnees = false;
        socket.write('220 jouet.local ESMTP\r\n');
        socket.on('data', (m) => {
          const t = m.toString('utf8');
          if (donnees) {
            tampon += t;
            if (tampon.includes('\r\n.\r\n')) {
              donnees = false;
              recus.push(tampon);
              tampon = '';
              socket.write('250 OK\r\n');
            }
            return;
          }
          for (const l of t.split('\r\n').filter(Boolean)) {
            const c = l.slice(0, 4).toUpperCase();
            if (c.startsWith('EHLO') || c.startsWith('HELO')) socket.write('250-jouet.local\r\n250 SIZE 10485760\r\n');
            else if (c.startsWith('MAIL') || c.startsWith('RCPT')) socket.write(options.refuse ? '550 refus\r\n' : '250 OK\r\n');
            else if (c.startsWith('DATA')) { donnees = true; socket.write('354 go\r\n'); }
            else if (c.startsWith('QUIT')) { socket.write('221 bye\r\n'); socket.end(); }
            else socket.write('250 OK\r\n');
          }
        });
        socket.on('error', () => undefined);
      });
      serveur.listen(0, '127.0.0.1', () => resolve((serveur.address() as { port: number }).port));
    });
  return { demarrer, recus, arreter: () => new Promise<void>((r) => serveur.close(() => r())) };
}

function mail(port: number | null) {
  const v: Record<string, string> = {
    MAIL_FROM: 'Gafeso <no-reply@gafeso.local>',
    ...(port ? { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: 'false' } : {}),
  };
  return new MailService({ get: (k: string) => v[k] } as unknown as ConfigService);
}

describe.runIf(process.env.RAPPELS_REEL === '1')('⚠ LES RAPPELS, de bout en bout', () => {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://x/y');
  let pub: PrismaClient;
  let zdb: PrismaClient;
  let checkoutId: string | null = null;
  /**
   * ⚠ LES LIGNES QUI EXISTAIENT AVANT — et c'est la correction du premier essai.
   *
   * `runForTenant` parcourt TOUTE l'école : mon prêt n'était pas seul en
   * retard, et le premier passage a écrit **37** lignes au lieu d'une. Mon
   * nettoyage ne visait que MON `checkoutId`, et mon contrôle « rien n'est
   * resté » était scopé de la même façon — il passait pendant que 36 lignes
   * restaient, marquées SENT pour des adhérents que personne n'avait prévenus.
   *
   * ⚠ J'avais PRIS le recensement de départ et je ne l'avais jamais comparé.
   * La discipline ne vaut que si le compte final est confronté à lui.
   */
  let logsAvant: Set<string> = new Set();
  const etapes: string[] = [];

  afterAll(async () => {
    // ── NETTOYAGE, puis le COMPTE qui le vérifie.
    if (zdb && pub) {
      // ⚠ TOUT CE QUE LA RECETTE A ÉCRIT, pas seulement ce qui vient de MON prêt.
      await pub.reminderLog
        .deleteMany({ where: { id: { notIn: [...logsAvant] } } })
        .catch(() => undefined);
      if (checkoutId) await zdb.checkout.delete({ where: { id: checkoutId } }).catch(() => undefined);
    }
    if (pub) await pub.$disconnect();
    if (zdb) await zdb.$disconnect();
    // eslint-disable-next-line no-console
    console.log(['', '── Étapes ──', ...etapes.map((e) => '  ' + e)].join('\n'));
  });

  it('un prêt en retard produit un rappel ENVOYÉ, puis ÉCHOUÉ quand le serveur refuse', async () => {
    pub = new PrismaClient();
    zdb = new PrismaClient({
      datasources: { db: { url: url.toString().replace('schema=public', 'schema=tenant_zinda') } },
    });

    // ── 0 · LE RECENSEMENT AVANT. C'est la sauvegarde : sans lui, « nettoyé »
    // n'est qu'une intention.
    const avant = {
      checkouts: await zdb.checkout.count(),
      logs: await pub.reminderLog.count(),
    };
    // ⚠ LES IDENTIFIANTS, PAS SEULEMENT LE NOMBRE. Un compte ne dit pas QUOI
    // retirer : la recette écrit des lignes pour des prêts qu'elle n'a pas
    // créés, et seule la différence des ensembles les désigne.
    logsAvant = new Set((await pub.reminderLog.findMany({ select: { id: true } })).map((l) => l.id));
    etapes.push(`0 · avant : ${avant.checkouts} prêts, ${avant.logs} lignes de rappel`);

    const tenant = await pub.tenant.findUnique({ where: { slug: 'zinda' } });
    // ⚠ La relation `patron → user` n'est pas déclarée côté Prisma : on passe
    // par `userId`, comme le service le fait lui-même.
    // On part de la FICHE D'ADHÉRENT liée à un compte, pas l'inverse : tous les
    // comptes n'ont pas de fiche.
    const patron = await zdb.patron.findFirst({ where: { userId: { not: null } } });
    const utilisateur = patron
      ? await zdb.user.findUnique({ where: { id: patron.userId! } })
      : null;
    const item = await zdb.item.findFirst({ where: { status: 'AVAILABLE' } });
    expect(utilisateur?.email, 'aucun adhérent avec courriel').toBeTruthy();
    expect(patron, 'aucune fiche d’adhérent liée à ce compte').toBeTruthy();
    expect(item, 'aucun exemplaire disponible').toBeTruthy();

    // ── 1 · UN SEUL PRÊT, en retard de dix jours.
    //
    // ⚠ Créé DIRECTEMENT par Prisma, pas par le service de circulation : celui-ci
    // changerait le statut de l'exemplaire, ce qui sortirait du périmètre qu'on
    // s'est donné et qu'on devra défaire.
    const echeance = new Date(Date.now() - 10 * 24 * 3600_000);
    const pret = await zdb.checkout.create({
      data: {
        itemId: item!.id,
        patronId: patron!.id,
        dueDate: echeance,
        checkoutDate: new Date(Date.now() - 24 * 24 * 3600_000),
      },
    });
    checkoutId = pret.id;
    etapes.push(`1 · prêt créé, échéance il y a 10 jours (${pret.id.slice(0, 8)}…)`);

    // ── 2 · LE PARCOURS, avec un serveur qui ACCEPTE.
    const jouet = serveurJouet();
    const port = await jouet.demarrer();
    const svc = new RemindersService(
      { ...pub, forTenant: () => zdb } as never,
      mail(port),
      { estActif: async () => true } as never,
    );

    const compteurs = await svc.runForTenant(tenant!.id, 'zinda');
    await jouet.arreter();

    expect(compteurs.sent, 'aucun rappel envoyé').toBeGreaterThan(0);
    // ⚠ LE MESSAGE EST RÉELLEMENT PARTI vers le jouet : c'est la différence
    // avec tous les tests précédents, qui doublaient l'envoi.
    expect(jouet.recus.length, 'le serveur n’a rien reçu').toBeGreaterThan(0);
    etapes.push(`2 · parcours : ${compteurs.sent} envoyé(s), ${jouet.recus.length} message(s) reçus par le jouet`);

    const ligne = await pub.reminderLog.findFirst({ where: { checkoutId: pret.id } });
    expect(ligne?.status, 'la ligne n’est pas SENT').toBe('SENT');
    expect(ligne?.recipientEmail).toBe(utilisateur!.email);
    etapes.push(`3 · base : status=${ligne?.status}, destinataire enregistré`);

    // ── 4 · LE MÊME PRÊT, SERVEUR QUI REFUSE → FAILED, jamais SENT.
    //
    // On efface la ligne pour rejouer l'étape : sans cela le moteur répond
    // « already-sent », ce qui est sa bonne réponse et ne mesure rien ici.
    await pub.reminderLog.deleteMany({ where: { checkoutId: pret.id } });
    const refusant = serveurJouet({ refuse: true });
    const port2 = await refusant.demarrer();
    const svc2 = new RemindersService(
      { ...pub, forTenant: () => zdb } as never,
      mail(port2),
      { estActif: async () => true } as never,
    );
    const c2 = await svc2.runForTenant(tenant!.id, 'zinda');
    await refusant.arreter();

    expect(c2.failed, 'un refus SMTP n’a pas été compté comme échec').toBeGreaterThan(0);
    const ligne2 = await pub.reminderLog.findFirst({ where: { checkoutId: pret.id } });
    // ⚠ C'EST LA PROPRIÉTÉ QUI COMPTE : le mensonge du 12 septembre écrivait
    // SENT ici. Une bibliothécaire lisait « rappels envoyés » pour des courriels
    // jamais partis, et les adhérents n'étaient jamais prévenus.
    expect(ligne2?.status, 'un refus SMTP a été écrit SENT').toBe('FAILED');
    expect(ligne2?.error).toContain('smtp_error');
    etapes.push(`4 · serveur refusant : status=${ligne2?.status}, motif conservé`);
  }, 120_000);

  it('⚠ ET RIEN N’EST RESTÉ — le compte, pas l’intention', async () => {
    // ⚠ « J'ai mis un nettoyage » n'est pas « rien n'est resté ». Ce contrôle
    // vient d'une faute commise ce matin même : une recette dont la transaction
    // était complète à un `throw` près, et qui a laissé deux dépôts en base.
    if (checkoutId) {
      // ⚠ ON RETIRE TOUT CE QUI N'EXISTAIT PAS AVANT, par différence
      // d'ensembles. Nettoyer « ce que j'ai créé » laissait 36 lignes.
      await pub.reminderLog.deleteMany({ where: { id: { notIn: [...logsAvant] } } });
      await zdb.checkout.delete({ where: { id: checkoutId } }).catch(() => undefined);
      checkoutId = null;

      // ⚠ ET LE CONTRÔLE SE CONFRONTE AU RECENSEMENT, pas à mon empreinte.
      // C'est toute la différence : le premier essai comptait ce qu'il savait
      // avoir fait, et passait pendant que le reste demeurait.
      const apres = new Set(
        (await pub.reminderLog.findMany({ select: { id: true } })).map((l) => l.id),
      );
      const surnumeraires = [...apres].filter((id) => !logsAvant.has(id));
      expect(surnumeraires, 'la recette a laissé des lignes de rappel en base').toEqual([]);
      expect(apres.size, 'le compte final diffère du recensement initial').toBe(logsAvant.size);
      etapes.push(`5 · nettoyé, et VÉRIFIÉ contre le recensement : ${apres.size} ligne(s), comme avant`);
    }
  });
});
