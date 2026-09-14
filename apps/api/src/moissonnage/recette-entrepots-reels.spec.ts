import { describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ClientOai } from './client-oai';
import { mapperOaiDc } from './mapper-oai-dc';
import { MoissonnageService } from './moissonnage.service';
import { ProvenanceService } from './provenance.service';
import { CatalogingService } from '../cataloging/cataloging.service';
import { AuthorsService } from '../authors/authors.service';

/**
 * RECETTE CONTRE DES ENTREPÔTS OAI-PMH RÉELS — gatée `OAI_REEL=1`.
 *
 * ⚠ CE N'EST PAS UN GARDE, ET IL NE DOIT JAMAIS LE DEVENIR. Il dépend de
 * services publics que nous ne maîtrisons pas : le brancher sur `npm test` ou
 * sur le crochet de pré-publication rendrait notre suite rouge le jour où
 * arXiv est en maintenance. Un test qui échoue pour une raison extérieure au
 * dépôt se fait désactiver, et il emporte les vrais en partant.
 *
 * Il existe pour une seule chose : **traverser le circuit une fois en
 * conditions réelles**. Le client, le mapper et le moteur étaient éprouvés par
 * doublures — c'est-à-dire contre ce que je crois qu'un entrepôt répond.
 *
 *   OAI_REEL=1 npx vitest run src/moissonnage/recette-entrepots-reels.spec.ts
 *
 * ⚠ POLITESSE ENVERS UN SERVICE PUBLIC : fenêtre `from` d'un jour, et jamais de
 * parcours complet. Un premier essai qui tire tout serait impoli, et long chez
 * nous pour rien.
 */

const ENTREPOTS = [
  { nom: 'DSpace (démo officielle)', baseUrl: 'https://demo.dspace.org/server/oai/request' },
  { nom: 'arXiv', baseUrl: 'https://export.arxiv.org/oai2' },
  { nom: 'DSpace@MIT', baseUrl: 'https://dspace.mit.edu/oai/request' },
];

/** Hier, au format court — la granularité que tous acceptent. */
function hier(): string {
  const d = new Date(Date.now() - 24 * 3600_000);
  return d.toISOString().slice(0, 10);
}

describe.runIf(process.env.OAI_REEL === '1')('Le client, contre de vrais entrepôts', () => {
  for (const entrepot of ENTREPOTS) {
    it(
      `${entrepot.nom} — répond, et l'issue est l'une des quatre`,
      async () => {
        const issue = await new ClientOai(fetch, 2).moissonner({
          baseUrl: entrepot.baseUrl,
          metadataPrefix: 'oai_dc',
          from: hier(),
        });

        // ⚠ AUCUNE DES QUATRE ISSUES N'EST UN ÉCHEC DE RECETTE, et c'est le
        // point. `injoignable` est le cas 2 du brief : on veut justement le
        // voir en conditions réelles. Ce qui serait un échec, c'est une issue
        // hors des quatre, ou une exception qui remonte.
        expect(['moisson', 'vide', 'injoignable', 'erreur_protocole']).toContain(issue.etat);
        // eslint-disable-next-line no-console
        console.log(`[${entrepot.nom}] ${issue.etat}` +
          ('motif' in issue ? ` — ${issue.motif}` : '') +
          (issue.etat === 'moisson'
            ? ` — ${issue.notices.length} notice(s), ${issue.suppressions.length} suppression(s), ` +
              `${issue.pages} page(s), reprise=${issue.reprise ? 'oui' : 'non'}`
            : ''));

        if (issue.etat === 'moisson' && issue.notices.length) {
          // ⚠ ET LE MAPPER SUR DU RÉEL : c'est la seule manière de savoir si
          // `extraireDc` trouve le `dc` là où CES entrepôts le mettent.
          const traduites = issue.notices.map((n) => mapperOaiDc(n.metadonnees));
          const avecTitre = traduites.filter(Boolean).length;
          // eslint-disable-next-line no-console
          console.log(`[${entrepot.nom}] mapper : ${avecTitre}/${traduites.length} notices traduites`);
          expect(
            avecTitre,
            'aucune notice traduite : le `dc` n’est pas là où le mapper le cherche',
          ).toBeGreaterThan(0);
        }
      },
      60_000,
    );
  }
});

describe.runIf(process.env.OAI_REEL === '1')('⚠ LE JETON DE REPRISE, en conditions réelles', () => {
  /**
   * ⚠ C'EST LE CHEMIN QU'AUCUNE DOUBLURE NE PROUVE. Nos tests fabriquent un
   * `<resumptionToken>` et vérifient qu'on le renvoie seul ; ils ne disent pas
   * qu'un entrepôt RÉEL l'accepte — or l'erreur la plus commune des clients OAI
   * est de le renvoyer accompagné, ce à quoi beaucoup répondent `badArgument`.
   *
   * arXiv est le bon terrain : des millions de notices, donc une pagination
   * garantie. ⚠ On borne à DEUX pages : il s'agit de prouver que la reprise
   * fonctionne, pas de moissonner arXiv.
   */
  it('arXiv rend un jeton, et le jeton renvoyé SEUL rend la page suivante', async () => {
    const source = {
      baseUrl: 'https://export.arxiv.org/oai2',
      metadataPrefix: 'oai_dc',
      // Une fenêtre large exprès : c'est la pagination qu'on cherche.
      from: new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10),
    };

    const premier = await new ClientOai(fetch, 1).moissonner(source);
    // eslint-disable-next-line no-console
    console.log(`[arXiv] 1re passe : ${premier.etat}` + ('motif' in premier ? ` — ${premier.motif}` : ''));

    // ⚠ UN ENTREPÔT INJOIGNABLE N'EST PAS UN ÉCHEC DE RECETTE — c'est le cas 2
    // du brief, et on préfère le voir ici qu'en production.
    if (premier.etat === 'injoignable' || premier.etat === 'vide') return;

    expect(premier.etat).toBe('erreur_protocole');
    if (premier.etat !== 'erreur_protocole') return;
    expect(premier.code).toBe('trop_de_pages');

    const jeton = premier.partiel?.reprise?.jeton;
    // eslint-disable-next-line no-console
    console.log(
      `[arXiv] ${premier.partiel?.notices.length} notice(s) ramassées, jeton=${jeton ? 'oui' : 'NON'}` +
        `, expire=${premier.partiel?.reprise?.expire ?? 'non annoncé'}`,
    );
    expect(jeton, 'arXiv n’a pas rendu de jeton : la pagination n’a pas été atteinte').toBeTruthy();
    expect(premier.partiel!.notices.length).toBeGreaterThan(0);

    // ⚠ ET LA REPRISE : le jeton part SEUL, et l'entrepôt répond.
    const suite = await new ClientOai(fetch, 1).moissonner({ ...source, reprise: jeton });
    // eslint-disable-next-line no-console
    console.log(`[arXiv] reprise : ${suite.etat}` + ('motif' in suite ? ` — ${suite.motif}` : ''));

    const ramasse =
      suite.etat === 'moisson'
        ? suite.notices.length
        : 'partiel' in suite
          ? (suite.partiel?.notices.length ?? 0)
          : 0;
    expect(
      ramasse,
      'la reprise n’a rien rendu : le jeton a été refusé, ou renvoyé accompagné',
    ).toBeGreaterThan(0);
  }, 120_000);
});

/**
 * ⚠ LE CIRCUIT ENTIER, UNE FOIS, EN CONDITIONS RÉELLES — et il ne laisse RIEN.
 *
 * Tout ce qui précède éprouve des morceaux. Ceci traverse : un vrai entrepôt →
 * le client → le mapper → l'écriture des notices → l'identité moissonnée → le
 * compte rendu → la provenance.
 *
 * ## Ce qu'il touche, et ce qu'il ne touche pas
 *
 * ⚠ **Tout se passe dans une transaction ANNULÉE.** Même forme que
 * `hierarchie-en-base.spec.ts` : la base de développement est RÉELLE — contrainte
 * d'unicité, clés étrangères, types —, et rien ne persiste. Sans cela, une
 * recette laisserait vingt-neuf notices d'un DSpace de démonstration dans le
 * catalogue de l'école de dev, que quelqu'un trouverait un jour sans comprendre.
 *
 * ⚠ **L'INDEXATION EST DOUBLÉE, ET C'EST LA SEULE PIÈCE QUI NE L'EST PAS.**
 * Meilisearch n'est pas transactionnel : indexer puis annuler la transaction
 * laisserait des documents orphelins dans l'index de dev, et `index-sante`
 * signalerait une dérive que personne n'aurait causée. Ce qui est mesuré ici est
 * donc le circuit SAUF l'indexation — qui, elle, est couverte par les tests
 * d'`importMarc` depuis longtemps.
 *
 * ⚠ GATÉ SUR `OAI_REEL` SEUL, ET SURTOUT PAS SUR `PG_LIVE`. `PG_LIVE` est la
 * marque des GARDES VIVANTS — des tests qui interrogent le serveur PostgreSQL
 * et qui doivent être ROUGES quand il ne répond pas. Celui-ci n'en est pas un :
 * il dépend de services publics tiers, donc il ne peut pas garder une
 * propriété. `gardes-vivants.spec.ts` a refusé la première version pour cette
 * raison exacte, et il avait raison — la base indisponible se constate ici
 * en silence, parce qu'une recette non jouée n'est pas une propriété violée.
 *
 *   OAI_REEL=1 npx dotenv -e ../../.env -- vitest run src/moissonnage/recette-entrepots-reels.spec.ts
 */
describe.runIf(process.env.OAI_REEL === '1')(
  '⚠ LE CIRCUIT ENTIER — vrai entrepôt, vraie base, rien de laissé',
  () => {
    it('moissonne DSpace, écrit les notices, et rend un compte rendu vrai', async () => {
      const url = new URL(process.env.DATABASE_URL ?? '');
      url.searchParams.set('schema', 'tenant_horizon');
      const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        // eslint-disable-next-line no-console
        console.log('[circuit] base injoignable — recette non jouée');
        await prisma.$disconnect();
        return;
      }

      // La doublure d'indexation, et elle seule.
      const search = {
        ensureIndex: async () => {},
        indexRecords: async () => {},
      } as never;
      const cataloging = new CatalogingService(search, {} as never, new AuthorsService());
      const moissonnage = new MoissonnageService(cataloging, new ClientOai(fetch, 1));

      let rapport: Record<string, unknown> | null = null;
      let provenance: unknown = null;

      try {
        await prisma.$transaction(
          async (tx) => {
            const db = tx as unknown as PrismaClient;
            const source = await moissonnage.creerSource(db, {
              name: 'Recette — DSpace de démonstration',
              baseUrl: 'https://demo.dspace.org/server/oai/request',
              metadataPrefix: 'oai_dc',
            });

            const run = (await moissonnage.executer(
              db,
              'horizon',
              source.id,
            )) as unknown as Record<string, unknown>;
            rapport = run;

            const moissonnees = await db.harvestedRecord.findMany({
              where: { sourceId: source.id },
            });
            const avecNotice = moissonnees.filter((m) => m.recordId);
            if (avecNotice.length) {
              provenance = await new ProvenanceService().provenance(db, avecNotice[0].recordId!);
            }

            throw new Error('ROLLBACK_VOULU');
          },
          { timeout: 120_000 },
        );
      } catch (e) {
        if ((e as Error).message !== 'ROLLBACK_VOULU') throw e;
      }

      // eslint-disable-next-line no-console
      console.log('[circuit] compte rendu :', JSON.stringify(rapport));
      // eslint-disable-next-line no-console
      console.log('[circuit] provenance d’une notice :', JSON.stringify(provenance));

      expect(rapport, 'aucun compte rendu : le circuit n’a pas été traversé').toBeTruthy();
      // ⚠ Les quatre issues restent admises : un entrepôt de DÉMONSTRATION est
      // réinitialisé régulièrement, et son indisponibilité est une information,
      // pas un échec de notre code.
      expect(['moisson', 'vide', 'injoignable', 'erreur_protocole']).toContain(rapport!.outcome);

      if (rapport!.outcome === 'moisson') {
        expect(rapport!.created, 'aucune notice créée sur une moisson non vide').toBeGreaterThan(0);
        expect(provenance, 'la notice créée n’a pas de provenance').toBeTruthy();
      }

      // ⚠ ET RIEN N'A PERSISTÉ : c'est la moitié qu'on oublie de vérifier.
      const restes = await prisma.harvestSource.count({
        where: { name: 'Recette — DSpace de démonstration' },
      });
      expect(restes, 'la recette a laissé une source derrière elle').toBe(0);

      await prisma.$disconnect();
    }, 180_000);
  },
);
