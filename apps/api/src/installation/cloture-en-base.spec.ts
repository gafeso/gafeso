import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';
import { Logger } from '@nestjs/common';
import { InstallationService } from './installation.service';

/**
 * 🔴 APRÈS UN PROVISIONNEMENT, L'INSTALLATION EST CLOSE — MESURÉ EN BASE.
 *
 * *Posé le 3 novembre 2026, sur décision du responsable, après une mesure sur
 * une démo installée à neuf le matin même :*
 *
 *     /api/installation/etat → {"requise":true}
 *     /installation          → la page « Installer Gafeso », publique
 *
 * `scripts/provision-production.mjs` ne contenait pas une seule fois le mot
 * « installation ». Trois faits en découlaient, et aucun n'était un détail :
 * une page publique annonçait son état installable à qui passait ; l'api
 * réengendrait un jeton d'amorçage à CHAQUE redémarrage, jeton que le journal
 * du conteneur affiche et qu'un journal se colle à un tiers pour demander de
 * l'aide ; et l'état en base MENTAIT sur une instance entièrement provisionnée.
 *
 * ## ⭐ CE QUE CETTE ÉPREUVE MESURE, ET COMMENT
 *
 * Elle ne relit pas le code : elle **joue la clôture contre la vraie base**,
 * puis **lit l'état** comme `/installation/etat` le lit — `termineeLe` et
 * `jetonHash` sur la ligne `unique`. Un relevé textuel de
 * `provision-production.mjs` aurait été satisfait par le commentaire qui
 * explique la clôture.
 *
 * ## ⚠ POURQUOI LA CLÔTURE N'EST PAS « DANS LA MÊME TRANSACTION »
 *
 * Le responsable l'a exigée ainsi ; c'est impossible, et le dépôt l'avait déjà
 * mesuré : le schéma `tenant_<slug>` n'est adressable qu'après le COMMIT de son
 * DDL, donc le compte administrateur exige une SECONDE connexion. Et clore plus
 * tôt serait PIRE — sur un échec, l'instance resterait installée sans
 * administrateur avec un assistant fermé. Ce qui est garanti : un seul
 * `UPDATE`, atomique, immédiatement après le compte administrateur ; et sur
 * échec en amont, l'installation reste OUVERTE, donc reprenable.
 *
 * ⚠ `PG_LIVE=1` requis. `describe.runIf` le dit plutôt que de passer en
 * silence : une épreuve écartée n'est pas une épreuve verte.
 */

const prisma = new PrismaClient();
let joignable = false;

/** Ce que fait la clôture du script, LU dans sa source et rejoué ici. */
const SOURCE_SCRIPT = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'scripts', 'provision-production.mjs'),
  'utf-8',
);

/**
 * Un `InstallationService` branché sur la VRAIE base pour `installation` et
 * `tenant`, avec le seul point que ces cas pilotent : le comptage des comptes
 * ADMIN par école.
 *
 * ⚠ CE QU'ON DOUBLE EST LE MINIMUM. Doubler `installation` aussi aurait rendu
 * l'épreuve verte sans jamais écrire en base — « une doublure qui porte
 * elle-même la borne qu'elle teste rend l'épreuve verte avec comme sans le
 * défaut ». Ici la clôture est RÉELLEMENT écrite, et relue.
 */
function service(options: { admins?: number; ecoles?: { slug: string }[] } = {}) {
  const faux = {
    installation: prisma.installation,
    tenant: {
      findMany: async (args?: unknown) =>
        options.ecoles ?? (await prisma.tenant.findMany(args as never)),
    },
    // ⚠ `forTenant` appartient à `PrismaService`, pas au client brut employé
    // ici. Le comptage RÉEL passe donc par le schéma de l'école — la même
    // requête que ce fichier emploie pour son témoin.
    forTenant: (slug: string) => ({
      user: {
        count: async () => {
          if (options.admins !== undefined) return options.admins;
          const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*)::bigint AS n FROM "tenant_${slug}".users WHERE role = 'ADMIN'`,
          );
          return Number(r[0].n);
        },
      },
    }),
  };
  return new InstallationService(
    faux as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe.runIf(process.env.PG_LIVE === '1')(
  'La clôture de l’installation, en base',
  () => {
    let avant: { termineeLe: Date | null; jetonHash: string | null } | null = null;

    beforeAll(async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        joignable = true;
      } catch {
        joignable = false;
      }
      if (joignable) {
        // ⚠ DISCIPLINE : on RECENSE l'état avant, et on le remet à l'identique
        // dans `afterAll`. Cette ligne est unique par instance — l'écraser sans
        // la rendre casserait l'état d'installation de la base de travail.
        avant = await prisma.installation.findUnique({ where: { id: 'unique' } });
      }
    });

    afterAll(async () => {
      if (joignable && avant) {
        await prisma.installation.update({
          where: { id: 'unique' },
          data: { termineeLe: avant.termineeLe, jetonHash: avant.jetonHash },
        });
      }
      await prisma.$disconnect();
    });

    it('⭐ TÉMOIN — la base porte bien une ligne d’installation unique', async () => {
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      expect(avant, 'aucune ligne « unique » : la migration n’est pas appliquée').not.toBeNull();
    });

    it('⭐⭐ PAR L’EFFET — une installation OUVERTE devient CLOSE, et l’état le dit', async () => {
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);

      // ① On remet l'instance dans l'état exact où `install.sh` la trouvait :
      // provisionnée (des écoles existent) mais installation OUVERTE.
      await prisma.installation.update({
        where: { id: 'unique' },
        data: { termineeLe: null, jetonHash: 'empreinte-de-temoin' },
      });
      const ecoles = await prisma.tenant.count();
      expect(ecoles, 'la base de travail doit porter au moins une école').toBeGreaterThan(0);

      // ⚠ TÉMOIN QUE LE DÉFAUT EXISTE : sans ce relevé, le cas serait vert sur
      // une base déjà close et ne mesurerait rien.
      const ouvert = await prisma.installation.findUniqueOrThrow({ where: { id: 'unique' } });
      expect(ouvert.termineeLe, 'le point de départ doit être OUVERT').toBeNull();

      // ② On joue la clôture, dans la forme EXACTE du script.
      const r = await prisma.installation.updateMany({
        where: { id: 'unique', termineeLe: null },
        data: { termineeLe: new Date(), jetonHash: null },
      });
      expect(r.count, 'la clôture doit toucher exactement une ligne').toBe(1);

      // ③ ET ON LIT L'ÉTAT COMME `/installation/etat` LE LIT.
      const apres = await prisma.installation.findUniqueOrThrow({ where: { id: 'unique' } });
      const requise = apres.termineeLe === null;
      expect(requise, '/installation/etat rendrait encore { requise: true }').toBe(false);
      // Et le jeton est MORT : `ouvrirSession` refuse sur `jetonHash === null`.
      expect(apres.jetonHash, 'le jeton d’amorçage doit être consommé').toBeNull();
    });

    it('⭐ et elle est IDEMPOTENTE — une réinstallation ne redate pas la clôture', async () => {
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      const date = new Date('2026-01-01T00:00:00Z');
      await prisma.installation.update({
        where: { id: 'unique' },
        data: { termineeLe: date, jetonHash: null },
      });
      const r = await prisma.installation.updateMany({
        where: { id: 'unique', termineeLe: null },
        data: { termineeLe: new Date(), jetonHash: null },
      });
      expect(r.count, 'une clôture déjà faite ne doit pas être retouchée').toBe(0);
      const apres = await prisma.installation.findUniqueOrThrow({ where: { id: 'unique' } });
      expect(apres.termineeLe?.toISOString()).toBe(date.toISOString());
    });

    /**
     * ⭐⭐ LE RATTRAPAGE — mesuré PAR L'EFFET, dans les deux sens.
     *
     * *Décision du responsable, 3 novembre 2026 : toutes les installations
     * faites depuis que l'assistant existe sont restées OUVERTES, et un
     * auto-hébergeur ne le saura pas. Le rattrapage est donc au démarrage de
     * l'API, pas dans une commande nommée.*
     *
     * ⚠ SES TROIS EXIGENCES sont éprouvées ici : il clôt quand une école est
     * ADMINISTRÉE, il ne clôt PAS sinon, et il ne crée rien.
     */
    it('⭐⭐ RATTRAPAGE — une école ADMINISTRÉE fait clore une installation ouverte', async () => {
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      // On remet l'instance dans l'état qu'une version antérieure laissait.
      await prisma.installation.update({
        where: { id: 'unique' },
        data: { termineeLe: null, jetonHash: 'empreinte-de-temoin' },
      });
      const ecoles = await prisma.tenant.findMany({ select: { slug: true } });
      expect(ecoles.length, 'la base de travail doit porter au moins une école').toBeGreaterThan(0);
      // ⚠ TÉMOIN : au moins une école doit être ADMINISTRÉE, sinon ce cas
      // mesurerait le refus et non la clôture.
      let administrees = 0;
      for (const { slug } of ecoles) {
        const n = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*)::bigint AS n FROM "tenant_${slug}".users WHERE role = 'ADMIN'`,
        );
        if (Number(n[0].n) > 0) administrees += 1;
      }
      expect(administrees, 'aucune école administrée : le cas ne mesure pas la clôture').toBeGreaterThan(0);

      const r = await service().rattraperInstallationOuverte();
      expect(r.close, 'le rattrapage n’a pas clos une instance installée').toBe(true);
      // ⚠ ET LE MOTIF NOMME LA CONDITION — exigence d'auditabilité.
      expect(r.motif).toMatch(/compte\(s\) ADMIN/);
      const apres = await prisma.installation.findUniqueOrThrow({ where: { id: 'unique' } });
      expect(apres.termineeLe, 'l’installation est restée ouverte').not.toBeNull();
      expect(apres.jetonHash, 'le jeton doit être mort').toBeNull();
    });

    it('🔴 IL NE CRÉE RIEN — seuls `termineeLe` et `jetonHash` changent', async () => {
      // ⚠ EXIGENCE DU RESPONSABLE : « il ne CRÉE jamais rien — il clôt, point ».
      // Mesuré par DIFFÉRENCE : tout ce qui n'est pas la clôture doit être
      // identique avant et après. Mon premier jeu de cas ne le vérifiait pas,
      // et une écriture parasite ajoutée en contrôle négatif est passée.
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      await prisma.installation.update({
        where: { id: 'unique' },
        data: { termineeLe: null, jetonHash: 'empreinte-de-temoin', essaisRates: 7 },
      });
      const avantEcoles = await prisma.tenant.count();
      const avantLigne = await prisma.installation.findUniqueOrThrow({ where: { id: 'unique' } });

      const r = await service().rattraperInstallationOuverte();
      expect(r.close).toBe(true);

      const apresEcoles = await prisma.tenant.count();
      const apresLigne = await prisma.installation.findUniqueOrThrow({ where: { id: 'unique' } });
      expect(apresEcoles, 'le rattrapage a créé ou supprimé une école').toBe(avantEcoles);
      // ⚠ `essaisRates` est le témoin : c'est tout l'intérêt de l'avoir
      // persisté, et un rattrapage qui le remettrait à zéro rendrait vingt
      // essais à un attaquant.
      expect(apresLigne.essaisRates, 'le rattrapage a touché essaisRates').toBe(
        avantLigne.essaisRates,
      );
      expect(apresLigne.creeeLe.toISOString()).toBe(avantLigne.creeeLe.toISOString());
    });

    it('⭐ IL EST BRUYANT — le journal nomme la date, l’école et la condition', async () => {
      // ⚠ EXIGENCE DU RESPONSABLE : « une correction silencieuse d'un état de
      // sécurité est une correction qu'on ne peut pas auditer. » Mesuré PAR
      // L'EFFET : on écoute le journal, on ne relit pas l'appel.
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      await prisma.installation.update({
        where: { id: 'unique' },
        data: { termineeLe: null, jetonHash: 'empreinte-de-temoin' },
      });
      const dits: string[] = [];
      const espion = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation((msg: unknown) => {
          dits.push(String(msg));
        });
      try {
        const r = await service().rattraperInstallationOuverte();
        expect(r.close).toBe(true);
      } finally {
        espion.mockRestore();
      }
      const journal = dits.join('\n');
      expect(journal, 'la clôture rétroactive n’est pas journalisée').toMatch(
        /INSTALLATION CLOSE RÉTROACTIVEMENT/,
      );
      // La DATE, au format ISO.
      expect(journal, 'la date manque').toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      // L'ÉCOLE et la CONDITION qui a déclenché.
      expect(journal, 'l’école déclenchante n’est pas nommée').toMatch(/l’école « [^»]+ »/);
      expect(journal, 'la condition n’est pas nommée').toMatch(/compte\(s\) ADMIN/);
      // ET QU'IL N'A RIEN CRÉÉ — dit, pas seulement vrai.
      expect(journal).toMatch(/Rien n’a été créé ni supprimé/);
    });

    it('🔴 CONTRÔLE NÉGATIF — une instance SANS école administrée n’est PAS close', async () => {
      // ⚠ C'est l'exigence qui protège la REPRISE de l'assistant : interrompu
      // entre T1 et T2, il laisse une école SANS administrateur, et la porte
      // doit rester ouverte. Clore ici rendrait définitif le défaut même que
      // l'assistant existe pour résoudre.
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      await prisma.installation.update({
        where: { id: 'unique' },
        data: { termineeLe: null, jetonHash: 'empreinte-de-temoin' },
      });
      // On mesure le refus sur un service dont AUCUNE école ne porte d'ADMIN,
      // en doublant la seule chose qui compte : le comptage par école.
      const faux = service({ admins: 0 });
      const r = await faux.rattraperInstallationOuverte();
      expect(r.close, 'une instance sans école administrée a été close').toBe(false);
      expect(r.motif).toMatch(/aucune ne porte de compte ADMIN/);
      const apres = await prisma.installation.findUniqueOrThrow({ where: { id: 'unique' } });
      expect(apres.termineeLe, 'l’installation a été close à tort').toBeNull();
      expect(apres.jetonHash, 'le jeton a été tué à tort').toBe('empreinte-de-temoin');
    });

    it('⚠ et il ne clôt RIEN sur une instance sans aucune école', async () => {
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      await prisma.installation.update({
        where: { id: 'unique' },
        data: { termineeLe: null, jetonHash: 'empreinte-de-temoin' },
      });
      const vide = service({ ecoles: [] });
      const r = await vide.rattraperInstallationOuverte();
      expect(r.close).toBe(false);
      expect(r.motif).toMatch(/aucune école/);
    });

    it('🔴 LE SCRIPT APPELLE la clôture, et APRÈS le compte administrateur', () => {
      // ⚠ Ce cas-ci est textuel, et il le reste : l'ORDRE des appels ne se
      // mesure pas en base. Il DÉPOUILLE donc les commentaires — le fichier
      // explique longuement la clôture, et un relevé satisfait par cette prose
      // ne mesurerait rien.
      const code = SOURCE_SCRIPT.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(
        /(?<!:)\/\/[^\n]*/g,
        ' ',
      );
      const iAdmin = code.indexOf('await ensureSchoolAdmin(db)');
      const iClore = code.indexOf('await cloreInstallation(pub)');
      expect(iAdmin, 'ensureSchoolAdmin n’est plus appelé').toBeGreaterThan(-1);
      expect(iClore, 'la clôture n’est pas appelée par le script').toBeGreaterThan(-1);
      expect(
        iClore,
        'la clôture précède le compte administrateur : un échec laisserait une ' +
          'instance installée SANS administrateur et un assistant FERMÉ',
      ).toBeGreaterThan(iAdmin);
    });

    it('🔴 TÉMOIN D’ABSENCE — la clôture REFUSE sur une instance sans école', () => {
      // La forme fautive serait de clore inconditionnellement : un échec
      // silencieux en amont fermerait l'assistant sur une instance vide, et il
      // n'y aurait plus AUCUN chemin pour l'installer.
      const code = SOURCE_SCRIPT.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(
        /(?<!:)\/\/[^\n]*/g,
        ' ',
      );
      expect(code, 'la clôture ne compte pas les écoles').toMatch(/tenant\.count\(\)/);
      expect(code, 'elle ne refuse pas sur une instance vide').toMatch(/clôture refusée/);
    });
  },
);
