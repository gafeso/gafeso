import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LIMITE_IDENTIFIANT_POSTGRES,
  LONGUEUR_SLUG_MAX_SCHEMA,
  tenantSchemaName,
} from './tenant-schema';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';

/**
 * 🔴 LA LIMITE D'IDENTIFIANT POSTGRESQL — LUE SUR LE SERVEUR, PAS CITÉE.
 *
 * *Posée le 3 novembre 2026 avec la borne du slug.*
 *
 * `LIMITE_IDENTIFIANT_POSTGRES = 63` est une CONSTANTE ÉCRITE, et une constante
 * écrite « s'accorde par coïncidence avec sa propre valeur » : `expect(63).toBe(63)`
 * passerait sur n'importe quel nombre. Elle n'est pas arbitraire — c'est
 * `NAMEDATALEN - 1`, fixé à la compilation de PostgreSQL — mais rien dans ce
 * dépôt ne le VÉRIFIAIT, et un serveur compilé autrement la démentirait sans
 * bruit : les noms de schéma seraient TRONQUÉS, donc deux écoles aux slugs
 * proches partageraient un schéma.
 *
 * ## ⭐ MESURÉE PAR L'EFFET, ET SANS RIEN CRÉER
 *
 * Le cast vers le type `name` applique la troncature réelle du serveur. Aucun
 * `CREATE`, aucune écriture : on demande à PostgreSQL ce qu'il FAIT d'un
 * identifiant trop long, au lieu de lui demander ce qu'il en DIT.
 *
 * ⚠ `PG_LIVE=1` requis — et `describe.runIf` le dit plutôt que de passer en
 * silence : une épreuve écartée n'est pas une épreuve verte.
 */

const prisma = new PrismaClient();
let joignable = false;

describe.runIf(process.env.PG_LIVE === '1')(
  'La limite d’identifiant, sur le serveur RÉEL',
  () => {
    beforeAll(async () => {
      // ⚠ PAS `if (!joignable) return` : cette forme rend VERT un test qui n'a
      // rien mesuré. Chaque cas l'AFFIRME, et tombe quand la base manque.
      try {
        await prisma.$queryRaw`SELECT 1`;
        joignable = true;
      } catch {
        joignable = false;
      }
    });
    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('⭐ le serveur TRONQUE à la longueur que nous avons écrite', async () => {
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      // ⚠ L'EFFET : ce que PostgreSQL fait d'un identifiant de 200 caractères.
      const r = await prisma.$queryRaw<{ n: number }[]>`
        SELECT length(repeat('a', 200)::name)::int AS n
      `;
      expect(
        Number(r[0].n),
        `le serveur tronque à ${r[0].n} et non à ${LIMITE_IDENTIFIANT_POSTGRES} : ` +
          'les noms de schéma tenant_<slug> seraient TRONQUÉS, et deux écoles aux ' +
          'slugs proches partageraient un schéma',
      ).toBe(LIMITE_IDENTIFIANT_POSTGRES);
    });

    it('⭐ et le serveur le DIT aussi — les deux voies concordent', async () => {
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      // Deux façons de l'obtenir : ce qu'il annonce, et ce qu'il fait. Si elles
      // divergeaient, c'est l'EFFET qui aurait raison, et il faudrait le savoir.
      const r = await prisma.$queryRaw<{ v: string }[]>`
        SELECT current_setting('max_identifier_length') AS v
      `;
      expect(Number(r[0].v)).toBe(LIMITE_IDENTIFIANT_POSTGRES);
    });

    it('🔴 le slug le plus long tient dans un nom de schéma SANS être tronqué', async () => {
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      // C'est la propriété qui compte vraiment : la borne du motif est-elle
      // compatible avec le préfixe ? Un `tenant_` plus long la périmerait.
      const nom = tenantSchemaName('a' + 'b'.repeat(LONGUEUR_SLUG_MAX_SCHEMA - 1));
      expect(nom.length).toBe(LIMITE_IDENTIFIANT_POSTGRES);
      const r = await prisma.$queryRaw<{ n: number }[]>`
        SELECT length(${nom}::name)::int AS n
      `;
      expect(
        Number(r[0].n),
        'le nom de schéma du slug maximal est tronqué par le serveur',
      ).toBe(nom.length);
    });

    it('🔴 TÉMOIN D’ABSENCE — un caractère de plus EST tronqué', async () => {
      expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
      // Sans ce cas, une limite trop GRANDE passerait les trois précédents :
      // tout tiendrait, et on ne saurait pas que la frontière est ailleurs.
      const trop = 'tenant_' + 'b'.repeat(LIMITE_IDENTIFIANT_POSTGRES);
      const r = await prisma.$queryRaw<{ n: number }[]>`
        SELECT length(${trop}::name)::int AS n
      `;
      expect(Number(r[0].n)).toBeLessThan(trop.length);
      expect(Number(r[0].n)).toBe(LIMITE_IDENTIFIANT_POSTGRES);
    });
  },
);
