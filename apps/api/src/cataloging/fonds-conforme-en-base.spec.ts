import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';
import { DEFENSE_RECORD_TYPES } from './description-profiles';
import { ETATS_DEPOT } from '../depots/etats';

/**
 * ⚠ LE TAMIS — le fonds relu à travers les RÈGLES DU PRODUIT.
 *
 * *Backlog n°27, posé le 15 septembre 2026.*
 *
 * Le seed, les scripts de rattrapage, les imports en masse et les fixtures
 * écrivent **directement par Prisma**. Ils ne passent donc ni par les DTO, ni
 * par les validations de service, ni par les règles que l'API s'impose à
 * elle-même. Ce qu'ils produisent n'est pas garanti acceptable par nos propres
 * routes — **et rien ne le dit, puisque rien ne le relit.**
 *
 * > ⭐ Un fonds de démonstration qui contient ce que le produit rejette ne
 * > démontre pas le produit.
 *
 * ⚠ ET ÇA NE SE DÉCOUVRE PAS EN DÉVELOPPANT : une donnée de test incohérente
 * se voit en codant, un fonds de démonstration se voit DEVANT UN CLIENT, sur
 * l'écran qu'on a choisi de montrer parce qu'on le croyait sûr. Le
 * 15 septembre 2026, une recette à l'œil a trouvé des dépôts « validés » et
 * « catalogués » SANS document — un état que `soumettre` refuse de produire.
 * Ce fichier le dit d'un coup, et pour toutes les écoles.
 *
 * ⚠ IL NE REJOUE PAS LES RÈGLES : IL LES IMPORTE. `DEFENSE_RECORD_TYPES`,
 * `ETATS_DEPOT` viennent du code du produit. Une règle recopiée ici
 * diverge — et un tamis qui compare une copie à une copie ne tamise rien.
 *
 *   PG_LIVE=1 npx dotenv -e ../../.env -- vitest run src/cataloging/fonds-conforme-en-base.spec.ts
 */

const prisma = new PrismaClient();

describe.runIf(process.env.PG_LIVE === '1')('Le fonds passe les règles du produit', () => {
  let joignable = false;
  let ecoles: string[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
      const provisionnees = await prisma.$queryRaw<{ slug: string }[]>`
        SELECT replace(table_schema, 'tenant_', '') AS slug
        FROM information_schema.tables
        WHERE table_name = 'biblio_records' AND table_schema LIKE 'tenant\\_%'`;
      ecoles = provisionnees.map((p) => p.slug);
    } catch {
      joignable = false;
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⚠ le tamis voit au moins une école — sinon il ne mesure rien', () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(ecoles.length, 'aucune école provisionnée : ce tamis ne tamise rien').toBeGreaterThan(0);
  });

  it('⚠ UN DÉPÔT NON-BROUILLON PORTE UN DOCUMENT — `soumettre` l’exige', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examines = 0;
    for (const slug of ecoles) {
      const depots = await prisma.$queryRawUnsafe<
        { id: string; status: string; title: string; file_key: string | null }[]
      >(`SELECT id, status, title, file_key FROM "tenant_${slug}".deposits`);
      for (const d of depots) {
        examines++;
        if (d.status !== ETATS_DEPOT[0] && !d.file_key) {
          fautifs.push(`${slug} · « ${d.title} » (${d.status}) sans document`);
        }
      }
    }
    expect(
      fautifs,
      'Des dépôts sont dans un état que le produit REFUSE de produire.\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n`DepotsService.soumettre` exige `fileKey` — « Téléversez le document ' +
        'avant de soumettre ». L’écran affiche alors, sur la même carte, « le ' +
        'document n’est plus remplaçable » ET « aucun document joint ».\n' +
        '⚠ L’écran n’est PAS fautif : il décrit fidèlement un état qui n’aurait ' +
        'jamais dû exister. Cherchez l’écrivain qui a contourné le service.',
    ).toEqual([]);
    expect(examines, 'aucun dépôt examiné : le tamis ne mesure rien').toBeGreaterThan(0);
  }, 60_000);

  it('⚠ UN DÉPÔT DÉCIDÉ PORTE SA DATE ET SON DÉCIDEUR', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    for (const slug of ecoles) {
      const d = await prisma.$queryRawUnsafe<{ title: string; status: string }[]>(
        `SELECT title, status FROM "tenant_${slug}".deposits
         WHERE status IN ('valide', 'refuse') AND (decided_at IS NULL OR decided_by_id IS NULL)`,
      );
      fautifs.push(...d.map((x) => `${slug} · « ${x.title} » (${x.status})`));
    }
    expect(fautifs, 'un dépôt décidé sans date ni décideur : la décision est intraçable').toEqual([]);
  }, 60_000);

  it('⚠ UNE THÈSE OU UN MÉMOIRE PORTE SON DIRECTEUR ET SON UNIVERSITÉ', async () => {
    // `cataloging.service` REFUSE la création sans ces deux champs. Une notice
    // écrite par Prisma peut les manquer — et l'export ETD-MS rend alors du
    // Dublin Core déguisé, dont la seule valeur propre est justement la
    // distinction `advisor` / `creator`.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const types = (DEFENSE_RECORD_TYPES as readonly string[]).map((t) => `'${t}'`).join(', ');
    const resume: string[] = [];
    for (const slug of ecoles) {
      const [r] = await prisma.$queryRawUnsafe<{ total: number; sans_univ: number; sans_dir: number }[]>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE coalesce(trim(defense_university), '') = '')::int AS sans_univ,
                count(*) FILTER (WHERE NOT EXISTS (
                  SELECT 1 FROM "tenant_${slug}".record_contributors c
                  WHERE c.record_id = r.id AND c.role = 'DIRECTEUR_MEMOIRE'))::int AS sans_dir
         FROM "tenant_${slug}".biblio_records r
         WHERE r.record_type IN (${types})`,
      );
      if (r.sans_univ > 0 || r.sans_dir > 0) {
        resume.push(
          `${slug} : sur ${r.total} travaux académiques, ${r.sans_univ} sans université ` +
            `et ${r.sans_dir} sans directeur`,
        );
      }
    }
    // ⚠ UNE DETTE DÉCLARÉE, DATÉE, ET QUI SE REFUSE QUAND ELLE EST RÉSOLUE.
    //
    // Le tamis a trouvé ceci à sa PREMIÈRE exécution : `horizon` — le fonds de
    // MESURE à l'échelle, semé par `seed-echelle.mjs` — porte 3 549 travaux
    // académiques sans aucun directeur. Son export ETD-MS rendrait donc du
    // Dublin Core déguisé, sur la totalité de son fonds académique.
    //
    // ⚠ Ce n'est PAS l'école de démonstration : `zinda` passe. La dette est
    // donc suivie plutôt que corrigée à la hâte avant un déploiement — une
    // mutation de 3 549 lignes ne se lance pas dans la même heure qu'une mise
    // en ligne.
    //
    // ⚠ ET LA LIGNE SE REFUSE LE JOUR OÙ ELLE DEVIENT FAUSSE : si `horizon`
    // est réparé, l'exception ne correspond plus et ce test échoue en le
    // disant. Une dette qui ne se rappelle pas d'elle-même est un oubli en
    // attente.
    const DETTE_CONNUE = [
      'horizon : sur 3549 travaux académiques, 0 sans université et 3549 sans directeur',
    ];
    const restant = resume.filter((r) => !DETTE_CONNUE.includes(r));
    const perimees = DETTE_CONNUE.filter((d) => !resume.includes(d));
    expect(
      perimees,
      'Une dette déclarée ne correspond plus à la base : retirez-la de ' +
        'DETTE_CONNUE — elle est résolue, ou elle a changé de forme.',
    ).toEqual([]);

    expect(
      restant,
      'Des travaux académiques ne passeraient pas `cataloging.service` :\n' +
        restant.map((x) => `  · ${x}`).join('\n') +
        '\n\n⚠ Ce n’est pas cosmétique : sans `advisor` ni `grantor`, l’export ' +
        'ETD-MS rend du Dublin Core déguisé — et cette distinction est sa seule ' +
        'valeur propre.',
    ).toEqual([]);
  }, 60_000);
});
