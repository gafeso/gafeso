import { describe, expect, it, vi } from 'vitest';
import { ClientOai, MAX_PAGES } from './client-oai';

/**
 * LE CLIENT OAI-PMH, ÉPROUVÉ CONTRE UN ENTREPÔT FABRIQUÉ.
 *
 * ⚠ FABRIQUÉ, ET C'EST LA CONSIGNE : le DSpace cité par le brief a son OAI
 * déployé mais son index JAMAIS construit. S'éprouver dessus reviendrait à
 * mesurer un serveur qui ne répond rien — et un client qui « marche » contre un
 * entrepôt vide n'a rien prouvé.
 *
 * Les quatre issues ne se confondent pas, et deux d'entre elles n'étaient pas
 * dans le brief : un entrepôt peut répondre CORRECTEMENT qu'il n'a rien
 * (`noRecordsMatch` — un vide CONFIRMÉ), et il peut répondre une erreur de
 * PROTOCOLE, qui est de notre côté et ne se retente pas.
 */

/** Un entrepôt en une ligne. */
function entrepot(...pages: string[]) {
  let n = 0;
  const appels: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL) => {
    appels.push(String(url));
    const corps = pages[Math.min(n, pages.length - 1)];
    n += 1;
    return { ok: true, text: async () => corps } as unknown as Response;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, appels };
}

const SOURCE = { baseUrl: 'https://depot.exemple.bf/oai', metadataPrefix: 'oai_dc' };

function enveloppe(corps: string) {
  return `<?xml version="1.0"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>2026-09-12T10:00:00Z</responseDate>
  ${corps}
</OAI-PMH>`;
}

function notice(id: string, datestamp = '2026-09-01T00:00:00Z', titre = 'Un titre') {
  return `<record><header><identifier>${id}</identifier>
    <datestamp>${datestamp}</datestamp><setSpec>theses</setSpec></header>
    <metadata><dc><title>${titre}</title></dc></metadata></record>`;
}

describe('⚠ LES QUATRE ISSUES NE SE CONFONDENT PAS', () => {
  it('des notices : `moisson`', async () => {
    const { fetchImpl } = entrepot(enveloppe(`<ListRecords>${notice('oai:x:1')}</ListRecords>`));
    const r = await new ClientOai(fetchImpl).moissonner(SOURCE);
    expect(r.etat).toBe('moisson');
    if (r.etat !== 'moisson') return;
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0].identifiant).toBe('oai:x:1');
    expect(r.notices[0].ensembles).toEqual(['theses']);
  });

  it('⚠ `noRecordsMatch` est un vide CONFIRMÉ, pas une erreur', async () => {
    // Le serveur a répondu correctement qu'il n'avait rien. Le traiter comme
    // une panne ferait retenter sans fin un entrepôt qui va très bien.
    const { fetchImpl } = entrepot(
      enveloppe('<error code="noRecordsMatch">Aucune notice</error>'),
    );
    expect(await new ClientOai(fetchImpl).moissonner(SOURCE)).toEqual({
      etat: 'vide',
      confirme: true,
    });
  });

  it('⚠ une erreur de PROTOCOLE est distincte d’une panne — elle ne se retente pas', async () => {
    // `cannotDisseminateFormat` est de NOTRE côté : le format demandé n'existe
    // pas chez eux. Retenter une requête qui ne marchera jamais est le genre de
    // boucle qu'on ne remarque qu'à la facture réseau.
    const { fetchImpl } = entrepot(
      enveloppe('<error code="cannotDisseminateFormat">Format inconnu</error>'),
    );
    const r = await new ClientOai(fetchImpl).moissonner(SOURCE);
    expect(r.etat).toBe('erreur_protocole');
    if (r.etat === 'erreur_protocole') expect(r.code).toBe('cannotDisseminateFormat');
  });

  it('⚠ INJOIGNABLE n’est pas VIDE — le cas 2 de la recette', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;
    const r = await new ClientOai(fetchImpl).moissonner(SOURCE);
    expect(r.etat).toBe('injoignable');
    if (r.etat === 'injoignable') expect(r.motif).toMatch(/Pas de réponse/);
  });

  it('un HTTP 500 est injoignable, pas vide', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const r = await new ClientOai(fetchImpl).moissonner(SOURCE);
    expect(r.etat).toBe('injoignable');
  });

  it('⚠ une réponse qui n’est pas du OAI-PMH est injoignable, pas vide', async () => {
    // Une page HTML d'erreur derrière un proxy rend 200. La lire comme « zéro
    // notice » ferait croire un entrepôt vidé.
    const { fetchImpl } = entrepot('<html><body>Service indisponible</body></html>');
    expect((await new ClientOai(fetchImpl).moissonner(SOURCE)).etat).toBe('injoignable');
  });
});

describe('⚠ LE JETON DE REPRISE — un moissonnage de 8 000 notices ne tient pas en une réponse', () => {
  it('les pages s’enchaînent jusqu’au jeton vide', async () => {
    const { fetchImpl, appels } = entrepot(
      enveloppe(`<ListRecords>${notice('oai:x:1')}<resumptionToken>J2</resumptionToken></ListRecords>`),
      enveloppe(`<ListRecords>${notice('oai:x:2')}<resumptionToken>J3</resumptionToken></ListRecords>`),
      enveloppe(`<ListRecords>${notice('oai:x:3')}</ListRecords>`),
    );
    const r = await new ClientOai(fetchImpl).moissonner(SOURCE);
    expect(r.etat).toBe('moisson');
    if (r.etat !== 'moisson') return;
    expect(r.notices.map((n) => n.identifiant)).toEqual(['oai:x:1', 'oai:x:2', 'oai:x:3']);
    expect(r.pages).toBe(3);
    expect(appels).toHaveLength(3);
  });

  it('⚠ LE JETON SE TRANSMET SEUL — l’erreur la plus commune des clients OAI', async () => {
    // Le protocole l'exige : `verb` + `resumptionToken`, et RIEN d'autre.
    // Beaucoup d'entrepôts répondent `badArgument` si on renvoie
    // `metadataPrefix` avec le jeton — et le moissonnage s'arrête à la
    // deuxième page sans qu'on comprenne pourquoi.
    const { fetchImpl, appels } = entrepot(
      enveloppe(`<ListRecords>${notice('oai:x:1')}<resumptionToken>J2</resumptionToken></ListRecords>`),
      enveloppe(`<ListRecords>${notice('oai:x:2')}</ListRecords>`),
    );
    await new ClientOai(fetchImpl).moissonner(SOURCE);
    const page2 = new URL(appels[1]);
    expect(page2.searchParams.get('resumptionToken')).toBe('J2');
    expect(page2.searchParams.get('metadataPrefix')).toBeNull();
    expect(page2.searchParams.get('set')).toBeNull();
    expect(page2.searchParams.get('from')).toBeNull();
  });

  it('⚠ UN JETON RÉPÉTÉ ARRÊTE TOUT — c’est le vrai mode de panne, et il est muet', async () => {
    // Un entrepôt qui rend deux fois le même jeton fait tourner le client à
    // l'infini. `MAX_PAGES` ne l'arrêterait qu'après cinq cents requêtes.
    const { fetchImpl } = entrepot(
      enveloppe(`<ListRecords>${notice('oai:x:1')}<resumptionToken>BOUCLE</resumptionToken></ListRecords>`),
    );
    const r = await new ClientOai(fetchImpl).moissonner(SOURCE);
    expect(r.etat).toBe('erreur_protocole');
    if (r.etat === 'erreur_protocole') expect(r.code).toBe('resumptionToken_repete');
  });

  it('⚠ et une pagination sans fin s’arrête à la borne DÉCLARÉE', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () =>
        enveloppe(
          `<ListRecords>${notice(`oai:x:${n}`)}<resumptionToken>J${n++}</resumptionToken></ListRecords>`,
        ),
    })) as unknown as typeof fetch;
    const r = await new ClientOai(fetchImpl, 3).moissonner(SOURCE);
    expect(r.etat).toBe('erreur_protocole');
    if (r.etat === 'erreur_protocole') expect(r.code).toBe('trop_de_pages');
  });

  it('la borne par défaut laisse passer un très gros fonds', () => {
    // 500 pages × 100 notices = 50 000, six fois le plus gros fonds mesuré.
    // Elle existe contre un serveur qui BOUCLE, pas contre un gros entrepôt.
    expect(MAX_PAGES).toBeGreaterThanOrEqual(500);
  });
});

describe('⚠ UNE SUPPRESSION EST SIGNALÉE, JAMAIS APPLIQUÉE — décision 6', () => {
  it('la notice supprimée sort dans `suppressions`, pas dans `notices`', async () => {
    const { fetchImpl } = entrepot(
      enveloppe(
        `<ListRecords>${notice('oai:x:1')}` +
          `<record><header status="deleted"><identifier>oai:x:2</identifier>` +
          `<datestamp>2026-09-05T00:00:00Z</datestamp></header></record></ListRecords>`,
      ),
    );
    const r = await new ClientOai(fetchImpl).moissonner(SOURCE);
    if (r.etat !== 'moisson') throw new Error('attendu : moisson');
    expect(r.notices.map((n) => n.identifiant)).toEqual(['oai:x:1']);
    expect(r.suppressions).toEqual([
      { identifiant: 'oai:x:2', datestamp: '2026-09-05T00:00:00Z' },
    ]);
  });

  it('⚠ un entrepôt qui ne rend QUE des suppressions n’est pas « vide »', async () => {
    // Le confondre avec un vide ferait perdre l'information la plus utile :
    // la source a changé, et elle dit comment.
    const { fetchImpl } = entrepot(
      enveloppe(
        `<ListRecords><record><header status="deleted"><identifier>oai:x:2</identifier>` +
          `<datestamp>2026-09-05T00:00:00Z</datestamp></header></record></ListRecords>`,
      ),
    );
    expect((await new ClientOai(fetchImpl).moissonner(SOURCE)).etat).toBe('moisson');
  });
});

describe('⚠ LE MOISSONNAGE INCRÉMENTAL', () => {
  it('`from` part dans la PREMIÈRE requête', async () => {
    const { fetchImpl, appels } = entrepot(
      enveloppe(`<ListRecords>${notice('oai:x:1')}</ListRecords>`),
    );
    await new ClientOai(fetchImpl).moissonner({ ...SOURCE, from: '2026-09-01T00:00:00Z', set: 'theses' });
    const u = new URL(appels[0]);
    expect(u.searchParams.get('from')).toBe('2026-09-01T00:00:00Z');
    expect(u.searchParams.get('set')).toBe('theses');
  });

  it('⚠ le dernier `datestamp` est le PLUS RÉCENT, suppressions comprises', async () => {
    // Une suppression fait avancer l'horloge de la source autant qu'une
    // création. L'ignorer ferait redemander à chaque passage tout ce qui a été
    // supprimé depuis.
    const { fetchImpl } = entrepot(
      enveloppe(
        `<ListRecords>${notice('oai:x:1', '2026-09-01T00:00:00Z')}` +
          `${notice('oai:x:2', '2026-09-03T00:00:00Z')}` +
          `<record><header status="deleted"><identifier>oai:x:3</identifier>` +
          `<datestamp>2026-09-09T00:00:00Z</datestamp></header></record></ListRecords>`,
      ),
    );
    const r = await new ClientOai(fetchImpl).moissonner(SOURCE);
    if (r.etat !== 'moisson') throw new Error('attendu : moisson');
    expect(r.dernierDatestamp).toBe('2026-09-09T00:00:00Z');
  });

  it('une notice sans identifiant est ignorée, pas comptée', async () => {
    const { fetchImpl } = entrepot(
      enveloppe(
        `<ListRecords><record><header><datestamp>2026-09-01T00:00:00Z</datestamp></header></record>` +
          `${notice('oai:x:1')}</ListRecords>`,
      ),
    );
    const r = await new ClientOai(fetchImpl).moissonner(SOURCE);
    if (r.etat !== 'moisson') throw new Error('attendu : moisson');
    expect(r.notices).toHaveLength(1);
  });
});

/**
 * ⚠ UN MOISSONNAGE INTERROMPU NE JETTE PLUS CE QU'IL A RAMASSÉ.
 *
 * *Ajouté le 12 septembre 2026, en écrivant le moteur.* La première version du
 * client rendait `injoignable` et perdait tout : huit mille notices reçues, une
 * coupure à la page 41, et rien — alors que le protocole donne exactement de
 * quoi ne pas recommencer. La recette du brief le demande en toutes lettres.
 *
 * ⚠ Et c'est aussi ce qui donne un ÉCRIVAIN à `harvest_runs.resumption_token` :
 * sans ces sorties, la colonne existerait et personne ne la remplirait.
 */

/** Un entrepôt dont la Nᵉ page échoue. */
function entrepotQuiTombe(pages: string[], aLaPage: number) {
  let n = 0;
  const fetchImpl = vi.fn(async () => {
    n += 1;
    if (n >= aLaPage) throw new Error('connexion perdue');
    return { ok: true, text: async () => pages[n - 1] } as unknown as Response;
  });
  return fetchImpl as unknown as typeof fetch;
}

const jeton = (valeur: string, expire?: string) =>
  `<resumptionToken${expire ? ` expirationDate="${expire}"` : ''}>${valeur}</resumptionToken>`;

describe('⚠ Interruption : ce qui est ramassé part avec le jeton de reprise', () => {
  it('rend `injoignable` ET le partiel — les notices reçues et de quoi continuer', async () => {
    const pages = [
      enveloppe(`<ListRecords>${notice('oai:a')}${jeton('JETON-2', '2026-09-12T11:00:00Z')}</ListRecords>`),
    ];
    const issue = await new ClientOai(entrepotQuiTombe(pages, 2)).moissonner(SOURCE);

    expect(issue.etat).toBe('injoignable');
    if (issue.etat !== 'injoignable') return;
    expect(issue.partiel?.notices).toHaveLength(1);
    expect(issue.partiel?.reprise).toEqual({
      jeton: 'JETON-2',
      // ⚠ La péremption est LUE, pas supposée : un jeton gardé sans sa limite
      // est une promesse de reprise qu'on ne peut pas tenir.
      expire: '2026-09-12T11:00:00Z',
    });
  });

  it('⚠ `partiel` vaut `null` quand la panne tombe sur la PREMIÈRE requête', async () => {
    // « Rien » et « un peu » ne se valent pas : l'un n'a rien à écrire, l'autre
    // a des notices et un jeton. Les confondre ferait écrire un compte rendu
    // qui annonce zéro reçue là où il y en avait quarante.
    const issue = await new ClientOai(entrepotQuiTombe([], 1)).moissonner(SOURCE);
    expect(issue.etat).toBe('injoignable');
    if (issue.etat !== 'injoignable') return;
    expect(issue.partiel).toBeNull();
  });

  it('un entrepôt qui va au bout ne laisse AUCUNE reprise', async () => {
    // Témoin d'absence : sans lui, un client qui rendrait toujours un jeton
    // serait indiscernable d'un client juste — et le moteur reprendrait sans
    // fin un parcours déjà terminé.
    const { fetchImpl } = entrepot(enveloppe(`<ListRecords>${notice('oai:a')}</ListRecords>`));
    const issue = await new ClientOai(fetchImpl).moissonner(SOURCE);
    expect(issue.etat).toBe('moisson');
    if (issue.etat !== 'moisson') return;
    expect(issue.reprise).toBeNull();
  });

  it('⚠ un jeton qui BOUCLE annule la reprise, mais garde les notices', async () => {
    // C'est le seul cas où l'on jette le jeton : reprendre avec lui rejouerait
    // exactement la panne.
    const page = enveloppe(`<ListRecords>${notice('oai:a')}${jeton('MEME')}</ListRecords>`);
    const { fetchImpl } = entrepot(page, page);
    const issue = await new ClientOai(fetchImpl).moissonner(SOURCE);

    expect(issue.etat).toBe('erreur_protocole');
    if (issue.etat !== 'erreur_protocole') return;
    expect(issue.code).toBe('resumptionToken_repete');
    expect(issue.partiel?.notices.length).toBeGreaterThan(0);
    expect(issue.partiel?.reprise).toBeNull();
  });

  it('⚠ la borne de pages ne PERD plus ce qu’elle a ramassé', async () => {
    const page = (i: number) =>
      enveloppe(`<ListRecords>${notice(`oai:${i}`)}${jeton(`J${i}`)}</ListRecords>`);
    const pages = Array.from({ length: 5 }, (_, i) => page(i));
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      const corps = pages[n % pages.length];
      n += 1;
      return { ok: true, text: async () => corps } as unknown as Response;
    }) as unknown as typeof fetch;

    const issue = await new ClientOai(fetchImpl, 3).moissonner(SOURCE);
    expect(issue.etat).toBe('erreur_protocole');
    if (issue.etat !== 'erreur_protocole') return;
    expect(issue.code).toBe('trop_de_pages');
    expect(issue.partiel?.notices).toHaveLength(3);
    expect(issue.partiel?.reprise?.jeton).toBeTruthy();
  });
});

describe('⚠ REPRENDRE : le jeton part SEUL, dès la première requête', () => {
  it('aucun `metadataPrefix` ni `from` ne l’accompagne', async () => {
    // Le protocole l'exige, et beaucoup d'entrepôts répondent `badArgument`
    // sinon — le moissonnage s'arrête alors à la reprise sans qu'on comprenne.
    const { fetchImpl, appels } = entrepot(
      enveloppe(`<ListRecords>${notice('oai:z')}</ListRecords>`),
    );
    await new ClientOai(fetchImpl).moissonner({
      ...SOURCE,
      from: '2026-01-01',
      set: 'theses',
      reprise: 'JETON-REPRIS',
    });

    const url = new URL(appels[0]);
    expect(url.searchParams.get('resumptionToken')).toBe('JETON-REPRIS');
    expect(url.searchParams.get('metadataPrefix')).toBeNull();
    expect(url.searchParams.get('from')).toBeNull();
    expect(url.searchParams.get('set')).toBeNull();
  });
});
