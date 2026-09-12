import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ROLES_SYSTEME } from '../auth/functions';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';

/**
 * ⚠ LES RÔLES SYSTÈME, TELS QUE LA BASE LES PORTE — pas tels que le code les
 * définit.
 *
 * *Posé le 12 septembre 2026, après que la session frontend a mesuré
 * `tenant_zinda.roles` « Étudiant » à `{}` là où le code donne
 * `depot.deposer`.*
 *
 * C'est la famille du trigger absent : le code dit une chose, la base en porte
 * une autre, et **rien ne les confronte**. Un test unitaire lit `ROLES_SYSTEME`
 * et se confirme lui-même ; seul le serveur sait ce qu'un compte recevra
 * réellement, puisque `AuthzService` résout les fonctions EN BASE à chaque
 * requête.
 *
 * ## Ce que la dérive coûte, et pourquoi elle est silencieuse
 *
 * Un rôle système qui a moins de fonctions en base qu'en code ne lève rien : il
 * REFUSE, poliment, à des gens qui devraient passer. Un circuit entier peut
 * être livré, testé, déployé, et rester inerte — c'est exactement ce qui est
 * arrivé au dépôt étudiant.
 *
 * ## La cause, et elle n'est ni le seed ni un écrasement
 *
 * `RolesService.ensureSystemRoles` réaffirme bien les fonctions (upsert). Mais
 * **rien ne l'appelle au démarrage** : seulement le provisioning d'une école et
 * l'ouverture de l'écran des rôles (`RolesService.list`). Une école provisionnée
 * avant qu'une fonction soit accordée garde donc l'ancienne liste jusqu'à ce que
 * quelqu'un ouvre cet écran — et personne n'a de raison de l'ouvrir.
 *
 * ⚠ Le commentaire d'`ensureSystemRoles` dit « se propage ainsi sans
 * migration ». C'était vrai de la méthode, faux du produit : une propagation
 * qui attend une visite n'est pas une propagation.
 *
 * ## Gaté, et il n'écrit RIEN
 *
 *   PG_LIVE=1 npx vitest run src/roles/roles-systeme-en-base.spec.ts
 *
 * Il ne fait que lire : aucune transaction, aucune écriture, aucun rattrapage.
 * Réparer serait une mutation de données, et sur une instance en service elle
 * ne s'improvise pas.
 */

const prisma = new PrismaClient();

interface RoleEnBase {
  name: string;
  functions: string[];
}

describe.runIf(process.env.PG_LIVE === '1')('Les rôles système, en base', () => {
  let joignable = false;
  let schemas: string[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
      const lignes = await prisma.$queryRawUnsafe<{ nspname: string }[]>(
        `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\\_%' ORDER BY nspname`,
      );
      schemas = lignes.map((l) => l.nspname);
    } catch {
      console.warn('[rôles système] base injoignable — scénarios ignorés.');
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⚠ le relevé voit au moins une école — sinon il ne mesure rien', () => {
    // ⚠ TÉMOIN. Sans lui, une base sans schéma d'école rendrait ce fichier VERT
    // sur zéro comparaison : la boucle ci-dessous ne tournerait pas, et les
    // lignes vertes se liraient comme de la couverture. C'est la forme exacte
    // du piège « le signal d'attente est la grandeur mesurée ».
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(schemas.length, 'aucun schéma tenant_* : ce garde n’a rien comparé').toBeGreaterThan(
      0,
    );
  });

  it('⚠ chaque rôle système porte EN BASE exactement ce que le code lui donne', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);

    const ecarts: string[] = [];
    for (const schema of schemas) {
      const lignes = await prisma.$queryRawUnsafe<RoleEnBase[]>(
        `SELECT name, functions FROM "${schema}".roles WHERE is_system`,
      );
      const enBase = new Map(lignes.map((l) => [l.name, new Set(l.functions)]));

      for (const def of ROLES_SYSTEME) {
        const porte = enBase.get(def.name);
        if (!porte) {
          ecarts.push(`${schema} · ${def.name} — ABSENT de la base`);
          continue;
        }
        const manque = def.functions.filter((f) => !porte.has(f));
        const enTrop = [...porte].filter((f) => !def.functions.includes(f));
        if (manque.length) ecarts.push(`${schema} · ${def.name} — manque ${manque.join(', ')}`);
        if (enTrop.length) ecarts.push(`${schema} · ${def.name} — en trop ${enTrop.join(', ')}`);
      }
    }

    expect(
      ecarts,
      'Un rôle système porte en base autre chose que sa définition.\n' +
        'Ce n’est pas un défaut de code : `ensureSystemRoles` réaffirme les ' +
        'fonctions, mais rien ne l’appelle au démarrage — seulement le ' +
        'provisioning d’une école et l’ouverture de l’écran des rôles.\n' +
        'Deux issues :\n' +
        ' · en développement — ouvrez `GET /roles` sur l’école concernée, ou ' +
        'relancez le provisioning ; la dérive se résorbe seule ;\n' +
        ' · sur une instance EN SERVICE — c’est une mutation de données, elle ' +
        'ne s’improvise pas : elle revient à Jean.\n' +
        '⚠ Une dérive qui MANQUE des fonctions ne lève rien : elle refuse ' +
        'poliment à des gens qui devraient passer, et un circuit entier peut ' +
        'rester inerte après avoir été livré, testé et déployé.',
    ).toEqual([]);
  });
});
