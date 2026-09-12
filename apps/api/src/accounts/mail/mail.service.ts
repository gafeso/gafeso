import { Injectable, Logger } from '@nestjs/common';
import { MailOutcome } from './mail-outcome';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** Échappe le texte destiné au corps HTML d'un email (le corps vient d'un modèle éditable). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Service d'envoi d'e-mails (nodemailer / SMTP).
 * Sans SMTP_HOST configuré, repli en mode journalisation : le contenu est
 * écrit dans les logs au lieu d'être envoyé — le dev fonctionne sans serveur
 * mail. En dev local, Mailpit (docker) attrape les envois : UI sur :8025.
 *
 * ⚠ Sécurité : on n'envoie JAMAIS de mot de passe en clair. Uniquement un lien
 * sécurisé, à usage unique et expirable, vers « définir mon mot de passe ».
 */
/**
 * TLS implicite (`secure: true`) ou STARTTLS ? DÉDUIT DU PORT par défaut.
 *
 * `SMTP_SECURE` valait auparavant `'true'` par défaut dans les fichiers
 * d'exemple, ce qui impose un TLS implicite — correct sur le port 465, FAUX
 * sur 587 et 25, où le serveur attend une connexion en clair puis STARTTLS.
 * La combinaison la plus courante chez les hébergeurs (587 + secure=true)
 * échouait donc à la poignée de main, sans que l'exploitant comprenne
 * pourquoi : « aucun mail ne part » alors que le port répond.
 *
 * Convention : 465 → TLS implicite ; tout autre port (587, 25, 2525) →
 * STARTTLS. Une valeur explicite reste prioritaire, pour les serveurs exotiques.
 */
export function resolveSmtpSecure(explicit: string | undefined, port: number): boolean {
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return port === 465;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null = null;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from =
      config.get<string>('MAIL_FROM') ?? 'Gafeso <no-reply@gafeso.local>';

    const host = config.get<string>('SMTP_HOST');
    if (host) {
      const port = Number(config.get<string>('SMTP_PORT') ?? 587);
      const user = config.get<string>('SMTP_USER');
      const secure = resolveSmtpSecure(config.get<string>('SMTP_SECURE'), port);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass: config.get<string>('SMTP_PASS') } : undefined,
      });
      this.logger.log(
        `SMTP configuré : ${host}:${port} (${secure ? 'TLS implicite' : 'STARTTLS'})`,
      );
    } else {
      this.logger.warn(
        'SMTP non configuré (SMTP_HOST absent) : les emails seront journalisés, pas envoyés.',
      );
    }
  }

  /**
   * ⚠ REND CE QUI EST ARRIVÉ — IL NE LE SUPPOSE PLUS.
   *
   * Cette méthode rendait `void` et traitait « SMTP absent » comme un envoi
   * RÉUSSI : pas de transporteur, une ligne de journal, retour normal. Le
   * no-op était délibéré — le développement n'exige pas de serveur de
   * courriel — mais chaque appelant rapportait ensuite ce silence comme un
   * succès. Trois mensonges mesurés le 12 septembre 2026, dont le REPLI de
   * double authentification. Voir `mail-outcome.ts` pour le tableau.
   *
   * ⚠ ELLE NE JETTE PLUS NON PLUS. Une erreur SMTP devient
   * `{ sent: false, reason: 'smtp_error' }`. C'est délibéré : avec deux modes
   * d'échec — un retour silencieux pour l'absence, une exception pour la
   * panne — chaque appelant devait traiter les deux, et aucun ne traitait le
   * premier. Un seul canal, et le type force à le lire.
   */
  private async send(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<MailOutcome> {
    if (!this.transporter) {
      // Le CORPS n'est PAS journalisé. Il contient, pour les emails de compte,
      // un lien de définition de mot de passe — donc de quoi prendre la main
      // sur le compte. Le déverser dans les logs, c'est le confier à toute
      // personne ayant accès au serveur, sans trace de qui l'a lu.
      // Le canal maîtrisé est GET /accounts/:id/password-link : réservé à
      // « comptes.gerer », à la demande, et journalisé nominativement.
      this.logger.log(`[mail non envoyé, SMTP absent] à ${to} — ${subject}`);
      return { sent: false, reason: 'smtp_absent' };
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      this.logger.log(`Email envoyé à ${to} : ${subject}`);
      return { sent: true };
    } catch (error) {
      const detail = (error as Error).message;
      // ⚠ Le CORPS n'est toujours pas journalisé : seul le message du serveur.
      this.logger.warn(`Email NON envoyé à ${to} (${subject}) : ${detail}`);
      return { sent: false, reason: 'smtp_error', detail };
    }
  }

  /** L'envoi réel est-il possible (SMTP configuré) ? Sinon les codes sont journalisés. */
  get available(): boolean {
    return this.transporter !== null;
  }

  /**
   * Envoi générique d'un rappel de circulation (sujet + corps texte rendus à
   * partir d'un modèle éditable). Le HTML est dérivé du texte (paragraphes),
   * sans balise fournie par l'utilisateur → pas d'injection. PROPAGE l'erreur
   * SMTP : l'appelant (moteur de rappels) journalise l'échec et retentera.
   */
  async sendCirculationReminder(to: string, subject: string, body: string): Promise<MailOutcome> {
    const html = body
      .split('\n')
      .map((line) => escapeHtml(line))
      .join('<br>');
    return this.send(to, subject, body, `<div style="font-family:sans-serif">${html}</div>`);
  }

  /** Code de double authentification (repli email) — expiration courte. */
  async sendTwoFactorCode(email: string, code: string): Promise<MailOutcome> {
    const subject = 'Votre code de connexion — Gafeso';
    const text =
      `Bonjour,\n\nVotre code de connexion à usage unique est : ${code}\n\n` +
      `Il expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette ` +
      `connexion, changez votre mot de passe.`;
    const html =
      `<p>Bonjour,</p><p>Votre code de connexion à usage unique est :</p>` +
      `<p style="font-size:26px;font-weight:700;letter-spacing:4px">${code}</p>` +
      `<p style="color:#666;font-size:13px">Il expire dans 10 minutes. Si vous ` +
      `n'êtes pas à l'origine de cette connexion, changez votre mot de passe.</p>`;
    return this.send(email, subject, text, html);
  }

  /**
   * Réservation disponible : le document réservé est mis de côté au comptoir.
   * PROPAGE l'erreur SMTP (l'appelant gère l'idempotence via holds.notifiedAt).
   */
  async sendHoldAvailable(
    email: string,
    info: { name: string | null; title: string; pickupDays: number; expiryDate: Date | null },
  ): Promise<MailOutcome> {
    const hello = info.name ? `Bonjour ${info.name},` : 'Bonjour,';
    const until = info.expiryDate
      ? ` (jusqu’au ${info.expiryDate.toLocaleDateString('fr-FR')})`
      : '';
    const subject = `Réservation disponible : « ${info.title} »`;
    const text =
      `${hello}\n\n` +
      `Le document « ${info.title} » que vous avez réservé est disponible : ` +
      `il est mis de côté pour vous au comptoir de la bibliothèque pendant ` +
      `${info.pickupDays} jour(s)${until}.\n\n` +
      `Passé ce délai, il sera proposé au lecteur suivant de la file.\n\n` +
      `Cordialement,\nLa bibliothèque`;
    const html =
      `<p>${hello}</p>` +
      `<p>Le document « <strong>${info.title}</strong> » que vous avez réservé est ` +
      `disponible : il est mis de côté pour vous au comptoir pendant ` +
      `<strong>${info.pickupDays} jour(s)</strong>${until}.</p>` +
      `<p style="color:#666;font-size:13px">Passé ce délai, il sera proposé au ` +
      `lecteur suivant de la file.</p>`;
    return this.send(email, subject, text, html);
  }

  /** Envoie le lien de définition de mot de passe (usage unique, 24 h). */
  async sendSetPasswordLink(email: string, url: string): Promise<MailOutcome> {
    const subject = 'Définissez votre mot de passe — Gafeso';
    const text =
      `Bonjour,\n\n` +
      `Votre compte de bibliothèque est actif. Choisissez votre mot de passe ` +
      `en ouvrant ce lien (valable 24 heures, à usage unique) :\n\n${url}\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`;
    const html =
      `<p>Bonjour,</p>` +
      `<p>Votre compte de bibliothèque est actif. Choisissez votre mot de passe ` +
      `en cliquant sur le bouton ci-dessous <strong>(valable 24 heures, à usage unique)</strong> :</p>` +
      `<p><a href="${url}" style="display:inline-block;background:#0F2B46;color:#fff;` +
      `padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">` +
      `Définir mon mot de passe</a></p>` +
      `<p style="color:#666;font-size:13px">Ou copiez ce lien : ${url}<br>` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`;
    return this.send(email, subject, text, html);
  }

  /**
   * Prévient les gestionnaires qu'un compte attend une activation manuelle.
   * matricule null = inscription personnel/autre (le rôle sera défini à
   * l'activation).
   */
  /**
   * Un dépôt vient d'être soumis : le directeur doit le valider (P6-2).
   *
   * ⚠ Pas de lien dans le corps : l'adresse de l'espace professionnel dépend du
   * domaine de l'établissement, et un lien faux vaut moins qu'une phrase juste.
   */
  async sendDepositSubmitted(
    email: string,
    info: { titre: string; auteur: string },
  ): Promise<MailOutcome> {
    const subject = `Dépôt à valider : « ${info.titre} »`;
    const text =
      `Bonjour,\n\n${info.auteur} a déposé « ${info.titre} » et vous a désigné ` +
      `comme directeur.\n\nConnectez-vous à votre bibliothèque pour le valider ` +
      `ou le refuser. Tant qu'il n'est pas validé, le document n'est visible de ` +
      `personne d'autre.`;
    const html =
      `<p>Bonjour,</p><p><strong>${escapeHtml(info.auteur)}</strong> a déposé ` +
      `« ${escapeHtml(info.titre)} » et vous a désigné comme directeur.</p>` +
      `<p>Connectez-vous à votre bibliothèque pour le valider ou le refuser. ` +
      `Tant qu'il n'est pas validé, le document n'est visible de personne d'autre.</p>`;
    return this.send(email, subject, text, html);
  }

  async notifyManagerPendingAccount(
    managerEmails: string[],
    accountEmail: string,
    matricule: string | null,
  ): Promise<MailOutcome> {
    if (managerEmails.length === 0) {
      this.logger.warn(
        `Compte en attente (${matricule ?? 'sans matricule'}, ${accountEmail}) mais aucun gestionnaire actif à notifier.`,
      );
      // ⚠ CE CHEMIN RENDAIT `undefined`, DONC UN SUCCÈS POUR SON APPELANT.
      // Une école sans gestionnaire actif laissait un compte en attente sans
      // que personne ne l'apprenne — avec pour seule trace la ligne de journal
      // ci-dessus, hors de portée de qui pouvait agir.
      return { sent: false, reason: 'aucun_destinataire' };
    }
    const subject = 'Compte en attente d’activation — Gafeso';
    const intro = matricule
      ? 'Un étudiant vient de créer un compte hors liste pré-chargée'
      : 'Une personne (personnel/autre) vient de créer un compte — son rôle sera à définir à l’activation';
    const matriculeLineText = matricule ? `  Matricule : ${matricule}\n` : '';
    const matriculeLineHtml = matricule
      ? `<li>Matricule : <strong>${matricule}</strong></li>`
      : '';
    const text =
      `${intro} :\n\n` +
      matriculeLineText +
      `  Email : ${accountEmail}\n\n` +
      `Vérifiez son identité puis activez le compte depuis l'espace de gestion.`;
    const html =
      `<p>${intro} :</p>` +
      `<ul>${matriculeLineHtml}` +
      `<li>Email : <strong>${accountEmail}</strong></li></ul>` +
      `<p>Vérifiez son identité puis activez le compte depuis l'espace de gestion.</p>`;
    return this.send(managerEmails.join(', '), subject, text, html);
  }
}
