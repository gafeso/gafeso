/**
 * ⭐ LE COMPTE FILTRÉ EST EXACT — et c'est le garde qui voit l'index DÉRIVER.
 *
 * *Posé le 9 octobre 2026, avec l'indexation de `hasDigital`.*
 *
 * ## Pourquoi ce garde existe, et pourquoi il mesure un EFFET
 *
 * `hasDigital` est désormais un attribut FILTRABLE de l'index. L'index cesse
 * donc d'être un miroir du catalogue : il en devient une SECONDE SOURCE du même
 * fait, et deux sources d'un même fait finissent par divergier.
 *
 * ⚠ Les écrivains sont fermés — `DigitalCopyService.reindexerApresTransition`
 * est appelée aux DEUX transitions. Mais « les écrivains sont fermés » est une
 * affirmation sur du code ; elle ne couvre ni un seed qui écrit en base
 * directement, ni un correctif SQL, ni une réindexation qui a échoué pendant
 * que Meilisearch redémarrait. Un garde de FORME ne verrait rien de tout ça.
 *
 * > ⭐ **Celui-ci compare deux COMPTES : ce que le moteur dit, et ce que la base
 * > porte.** Il voit donc la dérive quel qu'en soit l'auteur — c'est pour cette
 * > raison que les gardes d'EFFET ont le meilleur rendement de ce dépôt, et
 * > pour cette raison qu'ils coûtent une base et un moteur.
 *
 * ## ⚠ CE QU'IL NE PEUT PAS FAIRE, écrit plutôt que découvert
 *
 * Il ne distingue pas « l'index est périmé » de « Meilisearch est injoignable » :
 * dans le second cas la recherche DÉGRADE (résultat vide) par dessein, et le
 * compte serait 0. Le témoin ci-dessous refuse donc un moteur muet AVANT de
 * comparer — sinon un moteur éteint rendrait ce garde vert sur deux zéros.
 */
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ecolesMesurees, ecolesPortant } from '../common/base-injoignable';
import { SearchService } from '../search/search.service';

/**
 * ## Discipline : `lecture-seule`
 *
 * ⚠ Ce garde ne fait que COMPTER — deux `count(*)` en base, deux recherches
 * dans le moteur. Il n'écrit nulle part, ni en base ni dans l'index : une
 * réindexation déclenchée depuis un test toucherait l'index que l'autre session
 * emploie, et un garde qui modifie ce qu'il mesure ne mesure plus rien.
 */

const VIVANT = process.env.PG_LIVE === '1';

/**
 * ⚠ LE MESSAGE QUE LE CROCHET DE PRÉ-PUBLICATION LIT. La forme interdite est
 * le retour anticipé sur base absente — et je ne la CITE pas ici : le garde des
 * gardes vivants lit la SOURCE BRUTE, commentaires compris, et il a refusé ma
 * première rédaction qui l'écrivait en exemple. Un test qui ne peut pas mesurer
 * doit être ROUGE ; c'est au crochet de distinguer « la propriété est violée »
 * de « la base est injoignable ».
 */
const MESSAGE_BASE_INJOIGNABLE =
  'base injoignable : ce garde ne peut pas MESURER, donc il échoue. ' +
  'Un test qui ne peut pas mesurer n’est pas un test qui passe — c’est au ' +
  'crochet de pré-publication de faire la part des choses.';

describe.runIf(VIVANT)('le compte filtré par le moteur est EXACT', () => {
  let racine: PrismaClient;
  let search: SearchService;
  let ecoles: string[] = [];
  let joignable = false;

  beforeAll(async () => {
    // ⚠ RIEN ne se construit dans le corps du `describe` : gaté, il serait
    // ÉVALUÉ quand même et lèverait sur une machine sans infrastructure.
    racine = new PrismaClient();
    search = new SearchService(
      {
        get: (cle: string) =>
          ({
            SEARCH_ENGINE: process.env.SEARCH_ENGINE ?? 'meilisearch',
            MEILI_HOST: process.env.MEILI_HOST ?? 'http://localhost:7700',
            MEILI_MASTER_KEY: process.env.MEILI_MASTER_KEY,
          })[cle],
      } as unknown as ConfigService,
    );
    try {
      ecoles = await ecolesPortant(racine as never, 'digital_copies');
      joignable = true;
    } catch {
      joignable = false;
    }
    if (joignable) console.log(ecolesMesurees('compte-filtre-exact', ecoles));
  });

  afterAll(async () => {
    // ⚠ Condition INVERSÉE, délibérément : le retour anticipé sur base absente
    // est la forme que `gardes-vivants.spec.ts` interdit — et il lit la SOURCE
    // BRUTE, commentaires compris. Je ne l'écris donc nulle part, pas même en
    // exemple : c'est la deuxième fois aujourd'hui qu'un garde refuse le texte
    // écrit pour l'expliquer.
    if (racine) await racine.$disconnect();
  });

  it('⭐ `hasDigital = true` rend EXACTEMENT le compte de la base, école par école', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(
      ecoles.length,
      'ce garde doit mesurer PLUSIEURS écoles : une dérive sur une seule ne ' +
        'doit pas pouvoir passer',
    ).toBeGreaterThan(1);

    const ecarts: string[] = [];
    let mesurees = 0;
    for (const slug of ecoles) {
      const db = racine as unknown as { $queryRawUnsafe<T>(sql: string): Promise<T> };
      const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "tenant_${slug}".biblio_records r
          WHERE EXISTS (SELECT 1 FROM "tenant_${slug}".digital_copies c
                         WHERE c.record_id = r.id)`,
      );
      const enBase = Number(n);

      const res = await search.search(slug, {
        q: undefined,
        filter: ['hasDigital = true'],
        page: 1,
        hitsPerPage: 1,
        facets: [],
      });

      // ⚠ LE TÉMOIN QUI REFUSE UN MOTEUR MUET. Sans lui, un Meilisearch éteint
      // rendrait `indisponible`, le compte vaudrait 0, et ce garde serait VERT
      // sur une école vide de résultats. « Une sortie vide ne prouve rien. »
      expect(
        res.etat,
        `moteur de recherche indisponible pour « ${slug} » : ce garde ne mesure ` +
          'RIEN. Démarrez Meilisearch (profil docker) avant de conclure.',
      ).not.toBe('indisponible');
      mesurees += 1;

      const parLeMoteur = res.etat === 'indisponible' ? -1 : res.totalHits;
      if (parLeMoteur !== enBase) {
        ecarts.push(
          `${slug} : le moteur dit ${parLeMoteur}, la base porte ${enBase}`,
        );
      }
    }

    // Témoin de COMPTE : chaque école déclarée doit avoir été interrogée.
    expect(mesurees, 'chaque école doit avoir été mesurée').toBe(ecoles.length);
    expect(
      ecarts,
      'L’INDEX A DÉRIVÉ de la base sur `hasDigital` :\n' +
        ecarts.map((e) => `  · ${e}`).join('\n') +
        '\n\n⚠ La recherche filtrée propose donc des notices sans document — ou ' +
        'cache des notices qui en ont un. Les deux transitions réindexent ' +
        '(`reindexerApresTransition`) ; une dérive vient donc d’AILLEURS : un ' +
        'seed écrivant en base, un correctif SQL, ou une réindexation qui a ' +
        'échoué pendant que le moteur redémarrait.\n' +
        'Remède : POST /admin/tenants/<slug>/reindex.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ et le filtre DISCRIMINE : vrai + faux = le fonds entier', async () => {
    // Témoin d'ABSENCE sur le filtre lui-même. Sans lui, un filtre IGNORÉ par le
    // moteur rendrait le même total dans les deux cas — et l'assertion
    // ci-dessus passerait le jour où `hasDigital` cesse d'être filtrable,
    // puisque le total non filtré égalerait... le total non filtré.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    for (const slug of ecoles) {
      const compte = async (f: string[]) => {
        const r = await search.search(slug, {
          q: undefined,
          filter: f,
          page: 1,
          hitsPerPage: 1,
          facets: [],
        });
        expect(r.etat, `moteur indisponible pour « ${slug} »`).not.toBe('indisponible');
        return r.etat === 'indisponible' ? -1 : r.totalHits;
      };
      const avec = await compte(['hasDigital = true']);
      const sans = await compte(['hasDigital = false']);
      const tout = await compte([]);
      expect(
        avec + sans,
        `« ${slug} » : ${avec} avec document + ${sans} sans ≠ ${tout} au total. ` +
          'Soit le filtre est IGNORÉ par le moteur — alors les deux comptes ' +
          'valent le total —, soit des notices n’ont pas d’attribut `hasDigital` ' +
          'du tout, ce qui arrive après un ajout de champ SANS réindexation.',
      ).toBe(tout);
    }
  }, 60_000);
});
