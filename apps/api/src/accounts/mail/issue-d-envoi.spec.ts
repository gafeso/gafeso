import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { sansDetail } from './mail-outcome';
import { TwoFactorService } from '../../auth/two-factor.service';
import { AuthController } from '../../auth/auth.controller';

/**
 * « SENT: TRUE » N'EST PLUS ÉCRIT, IL EST MESURÉ.
 *
 * ## Le défaut, et pourquoi il était invisible
 *
 * `MailService.send()` traitait « SMTP absent » comme un envoi RÉUSSI : pas de
 * transporteur, une ligne de journal, retour normal. Le no-op était délibéré —
 * le développement n'exige pas de serveur de courriel — et chaque appelant
 * rapportait ensuite ce silence comme un succès.
 *
 * ⚠ Il était invisible parce qu'il ne se manifeste que SANS SMTP, c'est-à-dire
 * jamais en développement (où personne ne regarde la boîte) et jamais en
 * production correctement configurée. Il attendait l'école dont la messagerie
 * n'est pas encore réglée — soit toutes, le premier jour.
 *
 * ## Les quatre mensonges, mesurés le 12 septembre 2026
 *
 * | Où | Ce qui était affirmé |
 * |---|---|
 * | `POST /auth/login/2fa/email` | `{ sent: true }` écrit en dur — et c'est le REPLI de double authentification |
 * | moteur de rappels | `reminderLog.status = 'SENT'`, PERSISTÉ puis affiché en statistiques |
 * | notification de réservation | `sent += 1` et `notificationTenteeA` conservé |
 * | notification des gestionnaires | un `return` nu quand l'école n'a AUCUN gestionnaire actif |
 *
 * Le premier est le plus grave : il ferme la seule porte qui reste à quelqu'un
 * déjà enfermé dehors. Le quatrième a été trouvé par le COMPILATEUR, une fois
 * le type de retour changé — personne ne l'avait signalé.
 */

const config = (valeurs: Record<string, string> = {}) =>
  ({ get: (k: string) => valeurs[k] }) as unknown as ConfigService;

describe('La racine : `send()` rend ce qui est arrivé', () => {
  it('⚠ SANS SMTP : `smtp_absent`, et AUCUNE tentative réseau', async () => {
    // Pas de SMTP_HOST → pas de transporteur. C'est le cas qui rendait `void`,
    // donc un succès pour tous les appelants.
    const mail = new MailService(config());
    expect(mail.available).toBe(false);

    const r = await mail.sendTwoFactorCode('lecteur@exemple.bf', '123456');
    expect(r).toEqual({ sent: false, reason: 'smtp_absent' });
  });

  it('erreur SMTP : `smtp_error`, avec le détail pour le journal', async () => {
    const mail = new MailService(config({ SMTP_HOST: 'smtp.exemple.bf' }));
    expect(mail.available).toBe(true);
    (mail as unknown as { transporter: unknown }).transporter = {
      sendMail: vi.fn().mockRejectedValue(new Error('certificate mismatch')),
    };

    const r = await mail.sendSetPasswordLink('lecteur@exemple.bf', 'https://x/y');
    expect(r).toMatchObject({ sent: false, reason: 'smtp_error' });
    expect((r as { detail?: string }).detail).toContain('certificate mismatch');
  });

  it('envoi réussi : `sent: true`', async () => {
    const mail = new MailService(config({ SMTP_HOST: 'smtp.exemple.bf' }));
    (mail as unknown as { transporter: unknown }).transporter = {
      sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }),
    };

    expect(await mail.sendCirculationReminder('a@b.bf', 'Sujet', 'Corps')).toEqual({ sent: true });
  });

  it('⚠ les CINQ méthodes publiques rendent une issue — aucune n’en oublie', async () => {
    // ⚠ TÉMOIN QUI COMPTE. Mon premier relevé cherchait `async send[A-Z]` et
    // manquait `notifyManagerPendingAccount`, qui ne commence pas par « send ».
    // Un relevé qui présume une convention de nommage ne voit pas ce qui s'en
    // écarte — et c'est justement cette méthode qui portait le quatrième
    // mensonge.
    const mail = new MailService(config());
    const appels: Promise<unknown>[] = [
      mail.sendCirculationReminder('a@b.bf', 's', 'c'),
      mail.sendTwoFactorCode('a@b.bf', '123456'),
      mail.sendHoldAvailable('a@b.bf', { name: null, title: 'T', pickupDays: 3, expiryDate: null }),
      mail.sendSetPasswordLink('a@b.bf', 'https://x'),
      mail.notifyManagerPendingAccount(['m@b.bf'], 'a@b.bf', 'MAT-1'),
    ];
    expect(appels.length).toBe(5);
    for (const [i, issue] of (await Promise.all(appels)).entries()) {
      expect(issue, `méthode n°${i + 1}`).toEqual({ sent: false, reason: 'smtp_absent' });
    }
  });

  it('aucun destinataire : ce n’est ni une absence de SMTP ni une panne', async () => {
    const mail = new MailService(config({ SMTP_HOST: 'smtp.exemple.bf' }));
    const sendMail = vi.fn();
    (mail as unknown as { transporter: unknown }).transporter = { sendMail };

    const r = await mail.notifyManagerPendingAccount([], 'etudiant@exemple.bf', 'MAT-9');
    expect(r).toEqual({ sent: false, reason: 'aucun_destinataire' });
    // Et surtout : on n'écrit à personne.
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('⚠ Le repli de double authentification — le chemin le plus grave', () => {
  function service(mailIssue: unknown) {
    const mail = { sendTwoFactorCode: vi.fn().mockResolvedValue(mailIssue) };
    return { mail, svc: new TwoFactorService(mail as never) };
  }

  const db = (user: unknown) =>
    ({
      user: {
        findUnique: vi.fn().mockResolvedValue(user),
        update: vi.fn().mockResolvedValue({}),
      },
    }) as never;

  it('SANS SMTP : l’issue REMONTE — plus de « code envoyé » devant une boîte vide', async () => {
    const { svc } = service({ sent: false, reason: 'smtp_absent' });

    const r = await svc.sendEmailOtp(db({ id: 'u1', email: 'a@b.bf', totpEnabledAt: new Date() }), 'u1');

    expect(r).toEqual({ sent: false, reason: 'smtp_absent' });
  });

  it('envoi réussi : `sent: true`, et le code a bien été écrit en base', async () => {
    const { svc } = service({ sent: true });
    const base = db({ id: 'u1', email: 'a@b.bf', totpEnabledAt: new Date() });

    expect(await svc.sendEmailOtp(base, 'u1')).toEqual({ sent: true });
    // Le hash de l'OTP est posé : sans lui le code reçu serait invérifiable.
    expect((base as never as { user: { update: ReturnType<typeof vi.fn> } }).user.update)
      .toHaveBeenCalledTimes(1);
  });

  it('⚠ compte SANS 2FA : refus explicite, plus un succès muet', async () => {
    // Ce garde rendait silencieusement, donc `{ sent: true }` pour la route.
    // Le jeton d'étape n'est émis que si la 2FA est requise : s'il ne l'est
    // plus, il est périmé, et redémarrer la connexion est la seule réponse
    // vraie.
    const { svc, mail } = service({ sent: true });

    await expect(
      svc.sendEmailOtp(db({ id: 'u1', email: 'a@b.bf', totpEnabledAt: null }), 'u1'),
    ).rejects.toThrow(UnauthorizedException);
    expect(mail.sendTwoFactorCode).not.toHaveBeenCalled();
  });

  it('⚠ le DÉTAIL technique ne sort pas sur une surface pré-authentifiée', async () => {
    // L'appelant de cette route n'a franchi que l'étape du mot de passe. Le
    // message du serveur SMTP est de la configuration d'infrastructure : il va
    // au journal, pas à lui. Le motif, si — il lui dit quoi faire.
    const dehors = sansDetail({ sent: false, reason: 'smtp_error', detail: 'relay denied for 10.0.0.4' });

    expect(dehors).toEqual({ sent: false, reason: 'smtp_error' });
    expect(JSON.stringify(dehors)).not.toContain('10.0.0.4');
    expect(sansDetail({ sent: true })).toEqual({ sent: true });
  });
});

describe("LA ROUTE elle-même — c'est là que `{ sent: true }` était écrit", () => {
  /**
   * ⚠ CE TEST EST AU NIVEAU DE LA ROUTE, ET C'EST LE POINT.
   *
   * Les tests ci-dessus prouvent que `sendEmailOtp` rend l'issue. Ils ne
   * prouvent PAS que le contrôleur la TRANSMET — et c'était exactement là que
   * le défaut vivait : `await ...; return { sent: true };`. Sans ce dernier
   * maillon, le service pourrait être parfait et la route mentir quand même.
   *
   * ⚠ `jwt.verify` est une DOUBLURE qui rend la charge directement : aucun
   * jeton n'est fabriqué et aucun secret n'est lu. Signer un JWT pour atteindre
   * un chemin authentifié est interdit dans ce dépôt, y compris en test.
   */
  function controleur(issue: unknown) {
    const sendEmailOtp = vi.fn().mockResolvedValue(issue);
    const ctrl = new AuthController(
      {} as never,
      {} as never,
      { sendEmailOtp } as never,
      { forTenant: () => ({}) } as never,
      { get: () => undefined } as never,
      {} as never,
      { verify: () => ({ stage: 'twofactor', tenant: 'zinda', sub: 'u1' }) } as never,
    );
    return { ctrl, sendEmailOtp };
  }

  const tenant = { id: 't1', slug: 'zinda' } as never;
  const dto = { twoFactorToken: 'peu-importe' } as never;

  it('⚠ SANS SMTP : la route rend `sent: false` — plus « Code envoyé ✓ »', async () => {
    const { ctrl } = controleur({ sent: false, reason: 'smtp_absent' });

    expect(await ctrl.loginTwoFactorEmail(tenant, dto)).toEqual({
      sent: false,
      reason: 'smtp_absent',
    });
  });

  it('envoi réussi : la route rend `sent: true`, comme avant', async () => {
    const { ctrl } = controleur({ sent: true });
    expect(await ctrl.loginTwoFactorEmail(tenant, dto)).toEqual({ sent: true });
  });

  it('⚠ le détail SMTP ne franchit PAS la route', async () => {
    const { ctrl } = controleur({
      sent: false,
      reason: 'smtp_error',
      detail: 'relay denied for 10.0.0.4',
    });

    const reponse = await ctrl.loginTwoFactorEmail(tenant, dto);
    expect(reponse).toEqual({ sent: false, reason: 'smtp_error' });
    expect(JSON.stringify(reponse)).not.toContain('10.0.0.4');
  });
});
