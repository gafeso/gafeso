import { createServer, Server, Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

/**
 * ⚠ LA TRAVERSÉE RÉELLE DE L'ENVOI — SANS RIEN ÉMETTRE VERS L'EXTÉRIEUR.
 *
 * Envoyer un courriel est une action SORTANTE : elle arrive chez quelqu'un, et
 * elle ne se reprend pas. Elle n'est donc pas à ma main, et cette recette n'en
 * envoie aucun.
 *
 * ⚠ CE QU'ELLE FAIT À LA PLACE : un serveur SMTP jouet, en mémoire, lié à
 * `127.0.0.1` sur un port éphémère. Nodemailer lui parle VRAIMENT — poignée de
 * main, EHLO, MAIL FROM, DATA — et rien ne quitte la machine. C'est la seule
 * façon d'éprouver le transport sans devenir un émetteur.
 *
 * ## Pourquoi ça valait la peine
 *
 * Le 12 septembre, quatre appelants affirmaient un envoi qui n'avait pas eu
 * lieu, parce que `send()` rendait `void` et traitait « SMTP absent » comme un
 * succès. Le type a été corrigé, et chaque site a reçu son test — **contre une
 * doublure de `MailService`**. Ce qui n'avait jamais été traversé, c'est le
 * transport lui-même : est-ce que `{ sent: true }` correspond à un message
 * réellement accepté par un serveur ?
 */

/** Un serveur SMTP minimal : il accepte, il retient, et il ne relaie rien. */
function serveurJouet(options: { refuse?: boolean } = {}) {
  const recus: string[] = [];
  let serveur: Server;

  const demarrer = () =>
    new Promise<number>((resolve) => {
      serveur = createServer((socket: Socket) => {
        let tampon = '';
        let dansLesDonnees = false;
        socket.write('220 jouet.local ESMTP\r\n');
        socket.on('data', (morceau) => {
          const texte = morceau.toString('utf8');
          if (dansLesDonnees) {
            tampon += texte;
            if (tampon.includes('\r\n.\r\n')) {
              dansLesDonnees = false;
              recus.push(tampon);
              tampon = '';
              socket.write('250 OK\r\n');
            }
            return;
          }
          for (const ligne of texte.split('\r\n').filter(Boolean)) {
            const commande = ligne.slice(0, 4).toUpperCase();
            if (commande.startsWith('EHLO') || commande.startsWith('HELO')) {
              // ⚠ On n'annonce NI STARTTLS NI AUTH : nodemailer parle alors en
              // clair, ce qui est exactement ce qu'on veut d'un jouet local.
              socket.write('250-jouet.local\r\n250 SIZE 10485760\r\n');
            } else if (commande.startsWith('MAIL') || commande.startsWith('RCPT')) {
              socket.write(options.refuse ? '550 refus du jouet\r\n' : '250 OK\r\n');
            } else if (commande.startsWith('DATA')) {
              dansLesDonnees = true;
              socket.write('354 go\r\n');
            } else if (commande.startsWith('QUIT')) {
              socket.write('221 bye\r\n');
              socket.end();
            } else {
              socket.write('250 OK\r\n');
            }
          }
        });
        socket.on('error', () => undefined);
      });
      serveur.listen(0, '127.0.0.1', () => resolve((serveur.address() as { port: number }).port));
    });

  return { demarrer, recus, arreter: () => new Promise<void>((r) => serveur.close(() => r())) };
}

function service(port: number | null) {
  const valeurs: Record<string, string> = {
    MAIL_FROM: 'Gafeso <no-reply@gafeso.local>',
    ...(port ? { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: 'false' } : {}),
  };
  return new MailService({ get: (k: string) => valeurs[k] } as unknown as ConfigService);
}

describe('⚠ Le transport, éprouvé sans devenir un émetteur', () => {
  const jouet = serveurJouet();
  let port = 0;

  beforeAll(async () => {
    port = await jouet.demarrer();
  });
  afterAll(async () => {
    await jouet.arreter();
  });

  it('⚠ `{ sent: true }` correspond à un message RÉELLEMENT accepté', async () => {
    // C'est le point : jusqu'ici, `sent: true` n'avait jamais été confronté à
    // un serveur. Il venait d'une doublure qui disait oui.
    const issue = await service(port).sendSetPasswordLink(
      'etudiant@exemple.bf',
      'https://exemple.bf/definir-mot-de-passe?t=xyz',
    );
    expect(issue).toEqual({ sent: true });
    expect(jouet.recus.length, 'le serveur n’a reçu aucun message').toBe(1);
    // Et le message porte bien ce qu'on croit y mettre.
    expect(jouet.recus[0]).toContain('definir-mot-de-passe');
  });

  it('⚠ un serveur qui REFUSE rend `smtp_error`, jamais un succès', async () => {
    const refusant = serveurJouet({ refuse: true });
    const p = await refusant.demarrer();
    const issue = await service(p).sendSetPasswordLink('x@exemple.bf', 'https://exemple.bf/x');
    await refusant.arreter();

    expect(issue.sent).toBe(false);
    if (issue.sent) return;
    expect(issue.reason).toBe('smtp_error');
  });

  it('⚠ SMTP absent rend `smtp_absent` — ni succès, ni exception', async () => {
    // Le no-op de développement est délibéré ; ce qui était faux, c'est qu'il
    // ressemblait à un succès. Trois états, et celui-ci est le troisième.
    const issue = await service(null).sendSetPasswordLink('x@exemple.bf', 'https://exemple.bf/x');
    expect(issue.sent).toBe(false);
    if (issue.sent) return;
    expect(issue.reason).toBe('smtp_absent');
  });

  it('⚠ un hôte injoignable ne LÈVE pas — il rend `smtp_error`', async () => {
    // Deux modes d'échec obligeraient chaque appelant à traiter les deux, et
    // aucun ne traitait le premier. Un seul canal, et le type force à le lire.
    const issue = await service(1).sendSetPasswordLink('x@exemple.bf', 'https://exemple.bf/x');
    expect(issue.sent).toBe(false);
  }, 20_000);
});
