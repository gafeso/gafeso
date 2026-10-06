import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, UserRole } from '@prisma/client';
import { AccountsService } from '../accounts/accounts.service';
import { MailService } from '../accounts/mail/mail.service';
import type { MailOutcome } from '../accounts/mail/mail-outcome';
import { AdminService } from '../admin/admin.service';
import { dependantsDe, MODULES } from '../modules/registre-modules';
import { PrismaService } from '../prisma/prisma.service';
import { VERSION_PUBLIEE } from '../health/version';
import { effacerLeJeton, empreintesEgales, hacher } from './jeton-amorcage';
import { SessionAssistantService } from './session-assistant.service';
import type { TerminerInstallationDto } from './dto/terminer-installation.dto';

/**
 * ⚠ Au-delà de ce nombre d'essais FAUX, l'assistant refuse définitivement.
 *
 * Un installateur qui se trompe vingt fois ne se trompe pas : il est attaqué.
 * Le compteur est PERSISTÉ, parce qu'un attaquant qui ferait redémarrer l'API
 * remettrait sinon le compteur à zéro — et le redémarrage est précisément ce
 * qu'un conteneur fait tout seul quand sa sonde échoue.
 */
const ESSAIS_MAX = 20;

@Injectable()
export class InstallationService {
  private readonly logger = new Logger(InstallationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly admin: AdminService,
    private readonly accounts: AccountsService,
    private readonly mail: MailService,
    private readonly sessions: SessionAssistantService,
  ) {}

  private async ligne() {
    return this.prisma.installation.findUnique({ where: { id: 'unique' } });
  }

  /** L'installation est-elle encore à faire ? */
  async estRequise(): Promise<boolean> {
    const l = await this.ligne();
    return l !== null && l.termineeLe === null;
  }

  /**
   * ⚠ ELLE NE REND QUE CE BOOLÉEN. Tout ce qu'on ajouterait ici serait lisible
   * SANS jeton : ni nom d'établissement, ni domaine, ni version.
   */
  async etat(): Promise<{ requise: boolean }> {
    return { requise: await this.estRequise() };
  }

  /** Échange le jeton d'amorçage contre une session courte. */
  async ouvrirSession(jetonClair: string) {
    const l = await this.ligne();
    if (!l || l.termineeLe !== null) {
      throw new GoneException('L’installation de cette instance est terminée.');
    }
    if (l.jetonHash === null) {
      throw new GoneException('Le jeton d’amorçage a déjà été consommé.');
    }
    if (l.essaisRates >= ESSAIS_MAX) {
      throw new ForbiddenException(
        `Trop de jetons faux présentés (${l.essaisRates}). L’assistant est ` +
          'verrouillé. Si vous êtes l’installateur légitime, contactez votre ' +
          'hébergeur : le verrou se lève en base, délibérément.',
      );
    }

    if (!empreintesEgales(hacher(jetonClair), l.jetonHash)) {
      const apres = await this.prisma.installation.update({
        where: { id: 'unique' },
        data: { essaisRates: { increment: 1 } },
      });
      // ⚠ On journalise le COMPTE, jamais ce qui a été présenté.
      this.logger.warn(
        `Jeton d’installation FAUX présenté (${apres.essaisRates}/${ESSAIS_MAX}).`,
      );
      throw new UnauthorizedException(
        `Jeton d’amorçage invalide (essai ${apres.essaisRates} sur ${ESSAIS_MAX}). ` +
          'Il se trouve dans le fichier que le démarrage de l’API a nommé dans son journal.',
      );
    }

    // ⚠ Un essai RÉUSSI remet le compteur à zéro : sinon dix-neuf fautes de
    // frappe légitimes laisseraient l'installateur à un essai du verrou.
    if (l.essaisRates > 0) {
      await this.prisma.installation.update({
        where: { id: 'unique' },
        data: { essaisRates: 0 },
      });
    }
    return this.sessions.ouvrir();
  }

  /**
   * Ce que l'environnement porte déjà, et que l'assistant NE PEUT PAS changer.
   *
   * ⚠ `smtp.hote` et jamais `smtp.motDePasse` — même derrière une session
   * d'assistant. Un secret qui n'a pas besoin de sortir ne sort pas.
   */
  constat() {
    const hote = this.config.get<string>('SMTP_HOST')?.trim() ?? '';
    const appUrl = this.config.get<string>('APP_URL')?.trim() ?? '';
    return {
      appUrl: appUrl || null,
      smtp: { configure: this.mail.available, hote: hote || null },
      version: VERSION_PUBLIEE.version,
      commit: VERSION_PUBLIEE.commit,
      /**
       * ⚠ CE QUE L'ASSISTANT NE PEUT PAS FAIRE, dit à l'écran plutôt que
       * découvert après coup : ces valeurs vivent dans l'environnement du
       * conteneur, donc leur correction demande d'éditer `.env.prod` et de
       * redémarrer. L'assistant ne les écrit pas, et il ne prétend pas le faire.
       */
      horsPortee: [
        'APP_URL et les trois domaines servis par Caddy',
        'la configuration SMTP (hôte, port, identifiants)',
        'les secrets de production (JWT, KEK, clé de licence, MinIO, Meilisearch)',
      ],
    };
  }

  /**
   * La liste LUE dans le registre — le front ne la recopie pas.
   *
   * ⚠ `ecransPerdus` projette `e.quoi`, exactement comme `ModulesService.etat`.
   * Les deux ne peuvent pas être fondus ici : `etat` exige un `tenantId`, et
   * l'assistant n'a pas encore d'école. `installation-lit-le-registre.spec.ts`
   * refuse donc toute divergence entre les deux projections — c'est une
   * obligation, pas une relecture.
   */
  modules() {
    return MODULES.map((m) => ({
      id: m.id,
      libelle: m.libelle,
      description: m.description,
      noyau: m.noyau,
      dependances: [...m.dependances],
      ecransPerdus: m.ecrans.map((e) => e.quoi),
    }));
  }

  /**
   * LE TEST D'ENVOI, ET IL DIT LA VÉRITÉ.
   *
   * ⚠ 200 et non 201 : cette route ne crée rien. Et un échec d'envoi est un
   * 200 avec `envoye: false` — l'information « ça n'a pas marché, voici
   * pourquoi » est une réponse RÉUSSIE à la question posée.
   *
   * ⚠ ET LA CORRECTION DE MA PROPRE CONCEPTION. Elle annonçait CINQ motifs
   * (dont « authentification ») ; `MailOutcome` n'en distingue que TROIS, et
   * c'est tout ce que le mécanisme sait produire. Annoncer plus de précision
   * que le code n'en a est exactement la forme fautive que ce dépôt traque :
   * on rend donc les trois motifs réels, plus le message BRUT du serveur quand
   * il y en a un — qui est la seule chose capable de distinguer une
   * authentification refusée d'un hôte injoignable.
   */
  async testerCourriel(destinataire: string) {
    const issue: MailOutcome = await this.mail.sendInstallationTest(destinataire);
    if (issue.sent) {
      return {
        envoye: true,
        message:
          'Le serveur SMTP a ACCEPTÉ le message. Vérifiez la boîte de réception : ' +
          'accepté n’est pas arrivé — un message accepté peut encore être rejeté ' +
          'plus loin, ou classé en indésirable.',
      };
    }
    const gestes: Record<string, string> = {
      smtp_absent:
        'Aucun serveur SMTP n’est configuré : renseignez SMTP_HOST, SMTP_PORT, ' +
        'SMTP_USER et SMTP_PASS dans .env.prod, puis redémarrez le conteneur api. ' +
        'Rien n’est parti, et rien ne partira tant que la configuration ne change pas.',
      smtp_error:
        'Le serveur SMTP a refusé le message. Lisez son message ci-dessous : il ' +
        'distingue une authentification refusée (corrigez SMTP_USER / SMTP_PASS) ' +
        'd’un hôte injoignable (corrigez SMTP_HOST / SMTP_PORT / SMTP_SECURE). ' +
        'Puis redémarrez le conteneur api.',
      aucun_destinataire: 'Aucune adresse de destination n’a été fournie.',
    };
    return {
      envoye: false,
      motif: issue.reason,
      message:
        'Le message n’est PAS parti. Vous pouvez terminer l’installation sans ' +
        'courriel : le lien de définition du mot de passe vous sera affiché une fois.',
      geste: gestes[issue.reason] ?? 'Vérifiez la configuration SMTP.',
      // ⚠ Le message brut du serveur sort, parce qu'il ne contient pas de secret
      // et qu'il est la seule chose qui désigne la vraie cause.
      detailServeur: issue.detail ?? null,
    };
  }

  /**
   * TERMINE L'INSTALLATION.
   *
   * ⚠ MA CONCEPTION ANNONÇAIT « TOUT EN UNE TRANSACTION ». C'EST IMPOSSIBLE, et
   * c'est mesuré dans `AdminService.provisionTenant` : le schéma `tenant_<slug>`
   * n'est adressable qu'après le COMMIT de son DDL, donc le compte
   * administrateur — qui vit dans ce schéma — exige une SECONDE connexion. Le
   * provisioning seede déjà hors transaction pour cette raison.
   *
   * Ce qui est donc garanti, et dans cet ordre :
   *
   *   T1  école + schéma + collection socle   (transactionnel, dans `public`)
   *   T2  compte administrateur + jeton de mot de passe (transactionnel, école)
   *   T3  installation marquée terminée + jeton d'amorçage consommé
   *
   * ⚠ L'ORDRE EST LE DISPOSITIF. Marquer l'installation terminée en T1
   * laisserait, sur un échec de T2, une instance INSTALLÉE SANS ADMINISTRATEUR
   * et un assistant FERMÉ — c'est-à-dire exactement le défaut que l'assistant
   * existe pour résoudre, rendu définitif.
   *
   * ⚠ D'où la REPRENABILITÉ : si l'école existe déjà et n'a aucun compte, on
   * reprend à T2. Un second appel après un échec doit aboutir, pas buter sur
   * « une école existe déjà avec ce slug ».
   *
   * ⚠ LA FORME FAUTIVE, et c'est celle qu'on prendra : envelopper le tout dans
   * un `catch` qui DÉPROVISIONNE l'école en cas d'échec. Elle paraît propre —
   * « on nettoie derrière soi » — et elle détruit une école sur une erreur
   * passagère (un SMTP qui tousse, une connexion coupée). On ne supprime jamais
   * pour réparer un demi-succès : on reprend.
   */
  async terminer(dto: TerminerInstallationDto) {
    if (!(await this.estRequise())) {
      throw new GoneException('L’installation de cette instance est déjà terminée.');
    }

    const slug = dto.etablissement.slug;
    const email = dto.administrateur.email.trim().toLowerCase();

    // ── T1 — l'école, si elle n'existe pas déjà (reprise après échec de T2)
    const dejaLa = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!dejaLa) {
      await this.admin.provisionTenant({
        name: dto.etablissement.nom,
        slug,
        domain: dto.domaine,
      });
      this.logger.log(`Installation : école « ${slug} » créée.`);
    } else {
      this.logger.log(
        `Installation : école « ${slug} » existait déjà — reprise à la création du compte.`,
      );
    }

    // Les modules désactivés, avant tout compte : un module éteint ne doit pas
    // s'allumer le temps d'une fenêtre.
    const eteints = dto.modulesDesactives ?? [];
    const inconnus = eteints.filter((id) => !MODULES.some((m) => m.id === id && !m.noyau));
    if (inconnus.length > 0) {
      throw new BadRequestException(
        `Modules inconnus ou de noyau (non désactivables) : ${inconnus.join(', ')}.`,
      );
    }
    // ⚠ ÉTEINDRE UN MODULE DONT UN AUTRE DÉPEND, EN LAISSANT L'AUTRE ALLUMÉ,
    // produirait une école incohérente dès son premier jour — et l'écran des
    // modules refuse déjà ce geste après l'installation. On refuse ici avec les
    // MÊMES aides du registre (`dependantsDe`), jamais avec une table recopiée.
    const incoherents = eteints.flatMap((id) =>
      dependantsDe(id)
        .filter((d) => !eteints.includes(d))
        .map((d) => `${d} dépend de ${id}`),
    );
    if (incoherents.length > 0) {
      throw new BadRequestException(
        'Dépendances incohérentes : ' +
          incoherents.join(' ; ') +
          '. Éteignez aussi les modules dépendants, ou laissez celui-ci allumé.',
      );
    }
    if (eteints.length > 0) {
      const t = await this.prisma.tenant.findUniqueOrThrow({ where: { slug } });
      await this.prisma.tenantSettings.update({
        where: { tenantId: t.id },
        data: { modulesDesactives: eteints },
      });
    }

    // ── T2 — l'administrateur, dans le schéma de l'école
    const db = this.prisma.forTenant(slug);
    const existant = await db.user.findUnique({ where: { email } });
    const { utilisateur, lien } = existant
      ? // ⚠ Reprise : le compte est là, on régénère SON lien plutôt que d'échouer.
        {
          utilisateur: existant,
          lien: await this.accounts.creerLienMotDePasse(db, existant.id),
        }
      : await db.$transaction(async (tx) => {
          const cree = await tx.user.create({
            data: {
              email,
              firstName: dto.administrateur.prenom.trim(),
              lastName: dto.administrateur.nom.trim(),
              role: UserRole.ADMIN,
              status: AccountStatus.ACTIVE,
              activatedAt: new Date(),
            },
          });
          const url = await this.accounts.creerLienMotDePasseDans(tx, cree.id);
          return { utilisateur: cree, lien: url };
        });

    // ── L'envoi, et son issue est RAPPORTÉE, jamais supposée
    const envoi = await this.mail.sendSetPasswordLink(utilisateur.email, lien);

    // ── T3 — l'installation se ferme, et le jeton meurt avec elle
    await this.prisma.installation.update({
      where: { id: 'unique' },
      data: { termineeLe: new Date(), jetonHash: null },
    });
    this.sessions.fermerToutes();
    effacerLeJeton();
    this.logger.log(
      `Installation TERMINÉE — école « ${slug} », administrateur ${utilisateur.email}. ` +
        'Le jeton d’amorçage est consommé et son fichier effacé.',
    );

    return {
      termine: true,
      etablissement: { nom: dto.etablissement.nom, slug },
      administrateur: { email: utilisateur.email },
      /**
       * ⚠ RENDU DANS TOUS LES CAS, que le courriel soit parti ou non. Sans lui,
       * un échec d'envoi laisse l'administrateur sans AUCUN chemin vers son
       * compte — et c'est le seul compte de l'instance.
       */
      lienMotDePasse: lien,
      courrielEnvoye: envoi.sent,
      motifCourriel: envoi.sent ? null : envoi.reason,
      avertissement:
        'Ce lien n’est affiché qu’UNE FOIS et vaut 24 heures. Notez-le avant de ' +
        'quitter cette page. Passé ce délai, la reprise d’accès se fait avec ' +
        'scripts/reprendre-acces-comptes.mjs (voir DEPLOY.md).',
    };
  }
}
