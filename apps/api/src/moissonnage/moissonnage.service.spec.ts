import { describe, expect, it, vi } from 'vitest';
import { MoissonnageService } from './moissonnage.service';
import { ClientOai, IssueMoissonnage, SourceOai } from './client-oai';

/**
 * ⚠ LES TROIS PROPRIÉTÉS DU MOTEUR, et chacune vient d'un défaut connu :
 *
 *  1. le curseur n'avance qu'à l'ABOUTISSEMENT ;
 *  2. une source injoignable n'est PAS une source vide ;
 *  3. rien n'est écrasé, rien n'est supprimé.
 *
 * ⚠ LA DOUBLURE DE BASE PROJETTE ET FILTRE, elle ne rend pas tout à tout le
 * monde. Une doublure qui ignore `where` fait passer des contrôles négatifs qui
 * devraient tomber — c'est le défaut qui a coûté le plus de temps dans ce dépôt.
 */

const SOURCE = {
  id: 's1',
  baseUrl: 'https://depot.exemple.bf/oai',
  metadataPrefix: 'oai_dc',
  setSpec: '',
  lastDatestamp: null as string | null,
};

function base(source = SOURCE, moissonnees: Record<string, unknown>[] = []) {
  const harvested = moissonnees.map((h) => ({ ...h }));
  const runs: Record<string, unknown>[] = [];
  const sources = [{ ...source }];

  const db = {
    harvestSource: {
      findUnique: vi.fn(async ({ where }: never) =>
        sources.find((s) => s.id === (where as { id: string }).id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: never) => {
        const s = sources.find((x) => x.id === (where as { id: string }).id)!;
        Object.assign(s, data);
        return s;
      }),
    },
    harvestRun: {
      create: vi.fn(async ({ data }: never) => {
        const r = { id: `r${runs.length + 1}`, ...(data as object) };
        runs.push(r);
        return r;
      }),
      update: vi.fn(async ({ where, data }: never) => {
        const r = runs.find((x) => x.id === (where as { id: string }).id)!;
        Object.assign(r, data as object);
        return r;
      }),
      findFirst: vi.fn(async ({ where }: never) => {
        const w = where as { sourceId: string };
        // ⚠ Le `where` est HONORÉ : sans cela, une doublure rendrait le jeton
        // d'une autre source et la reprise paraîtrait fonctionner.
        return (
          [...runs].reverse().find(
            (r) => r.sourceId === w.sourceId && r.resumptionToken,
          ) ?? null
        );
      }),
    },
    harvestedRecord: {
      findMany: vi.fn(async ({ where }: never) => {
        const w = where as { sourceId: string; oaiIdentifier: { in: string[] } };
        return harvested.filter(
          (h) => h.sourceId === w.sourceId && w.oaiIdentifier.in.includes(h.oaiIdentifier as string),
        );
      }),
      create: vi.fn(async ({ data }: never) => {
        const h = { id: `h${harvested.length + 1}`, ...(data as object) };
        harvested.push(h);
        return h;
      }),
      update: vi.fn(async ({ where, data }: never) => {
        const h = harvested.find((x) => x.id === (where as { id: string }).id)!;
        Object.assign(h, data as object);
        return h;
      }),
    },
  } as never;
  return { db, runs, sources, harvested };
}

function service(issue: IssueMoissonnage, ids: string[] = ['rec-1']) {
  // ⚠ LA DOUBLURE DÉCLARE SON ARGUMENT, et ce n'est pas un détail de typage :
  // sans lui, `moissonner.mock.calls[0][0]` est un accès hors d'un tuple vide.
  // Vitest s'en moque — il transpile —, `tsc` non. Les assertions sur CE QUE
  // LA REQUÊTE EMPORTE (le jeton de reprise, le `from` tu) seraient restées
  // non typées, c'est-à-dire non vérifiées.
  const moissonner = vi.fn(async (_source: SourceOai) => issue);
  const importer = vi.fn(async (_db: never, _slug: string, e: unknown[]) => ids.slice(0, e.length));
  const svc = new MoissonnageService(
    { importerNoticesMoissonnees: importer } as never,
    { moissonner } as unknown as ClientOai,
  );
  return { svc, moissonner, importer };
}

const notice = (id: string, datestamp: string, titre = 'Un titre') => ({
  identifiant: id,
  datestamp,
  ensembles: [],
  metadonnees: { dc: { title: titre, creator: 'Traoré, Awa', subject: ['foncier'] } },
});

describe('⚠ 1 · LE CURSEUR N’AVANCE QU’À L’ABOUTISSEMENT', () => {
  it('une moisson complète fait avancer `lastDatestamp` de la source', async () => {
    const { db, sources } = base();
    const { svc } = service({
      etat: 'moisson',
      notices: [notice('oai:a', '2026-09-01T00:00:00Z')],
      suppressions: [],
      pages: 1,
      dernierDatestamp: '2026-09-01T00:00:00Z',
      reprise: null,
    });
    await svc.executer(db, 'zinda', 's1');
    expect(sources[0].lastDatestamp).toBe('2026-09-01T00:00:00Z');
  });

  it('⚠ un parcours INTERROMPU ne le fait PAS avancer — la perte serait définitive', async () => {
    // Avancer après une interruption ferait sauter les notices d'une page
    // jamais reçue : on ne redemanderait plus jamais cette fenêtre.
    const { db, sources } = base();
    const { svc } = service({
      etat: 'injoignable',
      motif: 'connexion perdue',
      partiel: {
        notices: [notice('oai:a', '2026-09-01T00:00:00Z')],
        suppressions: [],
        pages: 1,
        dernierDatestamp: '2026-09-01T00:00:00Z',
        reprise: { jeton: 'J2', expire: null },
      },
    });
    await svc.executer(db, 'zinda', 's1');
    expect(sources[0].lastDatestamp).toBeNull();
  });

  it('⚠ ni une moisson qui s’arrête avec un jeton en main', async () => {
    // Le cas subtil : l'état est `moisson`, tout s'est bien passé — mais
    // l'entrepôt a encore des pages. Le parcours n'a pas ABOUTI.
    const { db, sources } = base();
    const { svc } = service({
      etat: 'moisson',
      notices: [notice('oai:a', '2026-09-01T00:00:00Z')],
      suppressions: [],
      pages: 1,
      dernierDatestamp: '2026-09-01T00:00:00Z',
      reprise: { jeton: 'J2', expire: null },
    });
    await svc.executer(db, 'zinda', 's1');
    expect(sources[0].lastDatestamp).toBeNull();
  });
});

describe('⚠ 2 · UNE SOURCE INJOIGNABLE N’EST PAS UNE SOURCE VIDE', () => {
  it('l’issue du client est écrite telle quelle, avec son motif', async () => {
    const { db, runs } = base();
    const { svc } = service({ etat: 'injoignable', motif: 'connexion perdue', partiel: null });
    await svc.executer(db, 'zinda', 's1');

    expect(runs[0].outcome).toBe('injoignable');
    expect(runs[0].reason).toBe('connexion perdue');
    // ⚠ Et surtout : pas de « 0 notice ». Les compteurs n'ont pas été touchés.
    expect(runs[0].received).toBeUndefined();
  });

  it('un vide CONFIRMÉ est un vide, et il se distingue', async () => {
    const { db, runs } = base();
    const { svc } = service({ etat: 'vide', confirme: true });
    await svc.executer(db, 'zinda', 's1');
    expect(runs[0].outcome).toBe('vide');
    expect(runs[0].reason).toBeUndefined();
  });

  it('une erreur de PROTOCOLE garde ce qui a été ramassé avant elle', async () => {
    const { db, runs } = base();
    const { svc } = service({
      etat: 'erreur_protocole',
      code: 'trop_de_pages',
      motif: 'Arrêt après 3 pages.',
      partiel: {
        notices: [notice('oai:a', '2026-09-01T00:00:00Z')],
        suppressions: [],
        pages: 3,
        dernierDatestamp: '2026-09-01T00:00:00Z',
        reprise: { jeton: 'J4', expire: null },
      },
    });
    await svc.executer(db, 'zinda', 's1');

    expect(runs[0].outcome).toBe('erreur_protocole');
    expect(runs[0].created).toBe(1);
    expect(runs[0].resumptionToken).toBe('J4');
  });
});

describe('⚠ 3 · RIEN N’EST ÉCRASÉ, RIEN N’EST SUPPRIMÉ', () => {
  it('⚠ une notice déjà connue dont la source a changé la version est une COLLISION', async () => {
    const { db, harvested } = base(SOURCE, [
      {
        id: 'h1',
        sourceId: 's1',
        oaiIdentifier: 'oai:a',
        datestamp: '2026-08-01T00:00:00Z',
        recordId: 'rec-ancienne',
        status: 'importee',
      },
    ]);
    const { svc, importer } = service({
      etat: 'moisson',
      notices: [notice('oai:a', '2026-09-01T00:00:00Z', 'Titre CHANGÉ')],
      suppressions: [],
      pages: 1,
      dernierDatestamp: '2026-09-01T00:00:00Z',
      reprise: null,
    });
    await svc.executer(db, 'zinda', 's1');

    expect(harvested[0].status).toBe('collision');
    // ⚠ LA NOTICE LOCALE N'EST PAS TOUCHÉE : aucune écriture de notice.
    expect(importer).not.toHaveBeenCalled();
    expect(harvested[0].recordId).toBe('rec-ancienne');
  });

  it('⚠ une suppression signalée n’efface RIEN — elle se note', async () => {
    // Un moissonneur qui supprime sur absence transforme une panne de la source
    // en perte de données.
    const { db, harvested, runs } = base(SOURCE, [
      {
        id: 'h1',
        sourceId: 's1',
        oaiIdentifier: 'oai:a',
        datestamp: '2026-08-01T00:00:00Z',
        recordId: 'rec-1',
        status: 'importee',
      },
    ]);
    const { svc } = service({
      etat: 'moisson',
      notices: [],
      suppressions: [{ identifiant: 'oai:a', datestamp: '2026-09-02T00:00:00Z' }],
      pages: 1,
      dernierDatestamp: '2026-09-02T00:00:00Z',
      reprise: null,
    });
    await svc.executer(db, 'zinda', 's1');

    expect(harvested[0].status).toBe('supprimee_a_la_source');
    expect(harvested[0].recordId, 'la notice locale a été détachée').toBe('rec-1');
    expect(runs[0].deletions).toBe(1);
  });

  it('une notice redonnée À L’IDENTIQUE est ignorée, pas recréée', async () => {
    const { db, runs, harvested } = base(SOURCE, [
      {
        id: 'h1',
        sourceId: 's1',
        oaiIdentifier: 'oai:a',
        datestamp: '2026-09-01T00:00:00Z',
        recordId: 'rec-1',
        status: 'importee',
      },
    ]);
    const { svc, importer } = service({
      etat: 'moisson',
      notices: [notice('oai:a', '2026-09-01T00:00:00Z')],
      suppressions: [],
      pages: 1,
      dernierDatestamp: '2026-09-01T00:00:00Z',
      reprise: null,
    });
    await svc.executer(db, 'zinda', 's1');

    expect(importer).not.toHaveBeenCalled();
    expect(runs[0].ignored).toBe(1);
    expect(harvested[0].status).toBe('importee');
  });
});

describe('⚠ LA REPRISE N’EST TENTÉE QUE DANS SA FENÊTRE', () => {
  function avecJeton(expire: Date | null) {
    const b = base();
    b.runs.push({
      id: 'r0',
      sourceId: 's1',
      resumptionToken: 'JETON-PRECEDENT',
      resumptionExpires: expire,
      startedAt: new Date('2026-09-12T09:00:00Z'),
    });
    return b;
  }

  it('un jeton encore valide est renvoyé, et le `from` incrémental est tu', async () => {
    // Le protocole l'exige : un jeton se transmet SEUL.
    const { db } = avecJeton(new Date('2026-09-12T12:00:00Z'));
    const { svc, moissonner } = service({ etat: 'vide', confirme: true });
    await svc.executer(db, 'zinda', 's1', new Date('2026-09-12T10:00:00Z'));

    expect(moissonner.mock.calls[0][0]).toMatchObject({ reprise: 'JETON-PRECEDENT' });
    expect(moissonner.mock.calls[0][0].from).toBeUndefined();
  });

  it('⚠ un jeton PÉRIMÉ est abandonné — sinon la panne ressemble à une source cassée', async () => {
    const { db } = avecJeton(new Date('2026-09-12T09:30:00Z'));
    const { svc, moissonner } = service({ etat: 'vide', confirme: true });
    await svc.executer(db, 'zinda', 's1', new Date('2026-09-12T10:00:00Z'));

    expect(moissonner.mock.calls[0][0].reprise).toBeUndefined();
  });
});

describe('⚠ L’ARITHMÉTIQUE DU COMPTE RENDU TOMBE JUSTE', () => {
  /**
   * ⚠ CES DEUX TESTS VIENNENT D'UNE TRAVERSÉE RÉELLE, PAS D'UNE RELECTURE.
   * Contre le DSpace de démonstration, le compte rendu disait « 100 reçues,
   * 99 créées, 0 ignorée, 0 collision, 0 suppression ». Une ligne manquait, et
   * rien ne disait laquelle : une suppression signalée pour une notice que nous
   * n'avions jamais eue tombait dans un `continue` sans être comptée.
   *
   * Personne n'en serait mort. Mais quelqu'un aurait cherché un défaut qui
   * n'existe pas — et c'est le coût réel d'un compte qui ne tombe pas juste.
   */
  it('reçues = créées + ignorées + collisions + suppressions', async () => {
    const { db, runs } = base(SOURCE, [
      {
        id: 'h1',
        sourceId: 's1',
        oaiIdentifier: 'oai:connue',
        datestamp: '2026-08-01T00:00:00Z',
        recordId: 'rec-1',
        status: 'importee',
      },
    ]);
    const { svc } = service(
      {
        etat: 'moisson',
        notices: [
          notice('oai:neuve', '2026-09-01T00:00:00Z'),
          // Déjà connue, datestamp changé → collision.
          notice('oai:connue', '2026-09-02T00:00:00Z'),
        ],
        suppressions: [
          // Connue → comptée en suppression.
          { identifiant: 'oai:connue', datestamp: '2026-09-03T00:00:00Z' },
          // ⚠ JAMAIS VUE — c'est elle qui n'était comptée nulle part.
          { identifiant: 'oai:jamais-vue', datestamp: '2026-09-03T00:00:00Z' },
        ],
        pages: 1,
        dernierDatestamp: '2026-09-03T00:00:00Z',
        reprise: null,
      },
      ['rec-neuve'],
    );

    await svc.executer(db, 'zinda', 's1');
    const r = runs[0] as Record<string, number>;

    expect(r.received).toBe(4);
    expect(
      r.created + r.ignored + r.collided + r.deletions,
      `le compte ne tombe pas : ${JSON.stringify(r)}`,
    ).toBe(r.received);
  });

  it('⚠ une exécution ne se termine PAS avant d’avoir commencé', async () => {
    // Mesuré contre un vrai entrepôt : `finishedAt` précédait `startedAt` de
    // sept millisecondes, parce que l'heure employée était celle capturée AVANT
    // l'appel réseau. Un faux que personne n'écrit exprès et que personne ne
    // relit.
    const { db, runs } = base();
    const { svc } = service({ etat: 'vide', confirme: true });
    const avant = new Date();
    await svc.executer(db, 'zinda', 's1', new Date('2020-01-01T00:00:00Z'));

    const fin = (runs[0] as Record<string, Date>).finishedAt;
    expect(fin.getTime()).toBeGreaterThanOrEqual(avant.getTime());
  });
});
