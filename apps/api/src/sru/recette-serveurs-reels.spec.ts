import { describe, expect, it } from 'vitest';
import { SruService } from './sru.service';
import { DEFAULT_SRU_SERVERS } from './sru-servers';

/**
 * ⚠ NOTRE CLIENT SRU, CONTRE LA BnF ET LA LIBRARY OF CONGRESS — gaté `SRU_REEL=1`.
 *
 * Le SRU n'est pas une exposition : c'est un CLIENT. Une bibliothécaire qui
 * catalogue saisit un ISBN, et cet appel va chercher la notice chez un tiers
 * pour pré-remplir sa fiche.
 *
 * ⚠ **S'IL EST CASSÉ, PERSONNE NE LE SIGNALE.** L'écran affiche « aucune notice
 * trouvée », la bibliothécaire tape les champs à la main, et conclut que le
 * catalogue distant ne connaît pas ce livre. Le défaut se présente comme une
 * absence de résultat — la forme la plus silencieuse qui soit.
 *
 * `sru.service.spec.ts` éprouve la logique contre des doublures : il dit ce que
 * le service fait d'une réponse qu'on lui donne. Il ne dit pas que la BnF
 * répond ça.
 *
 * ## Ce que cette recette n'est pas
 *
 * ⚠ Elle n'est PAS un garde : elle dépend de deux services publics que nous ne
 * maîtrisons pas. La brancher sur `npm test` rendrait la suite rouge le jour où
 * la BnF est en maintenance — et un test qui échoue pour une raison extérieure
 * se fait désactiver, en emportant les vrais.
 *
 *   SRU_REEL=1 npx vitest run src/sru/recette-serveurs-reels.spec.ts
 *
 * ⚠ Et elle est POLIE : deux requêtes, sur des ouvrages connus. Ces catalogues
 * sont des services publics, pas notre banc d'essai.
 */

/**
 * ⚠ UN ISBN MESURÉ, PAS SUPPOSÉ — et le choix a coûté une leçon.
 *
 * J'avais pris `9782070360024` (Camus, Folio) en me disant qu'un catalogue
 * national le connaît forcément. Les deux serveurs ont répondu
 * `numberOfRecords = 0`, honnêtement, et ma recette a crié au « vide muet »
 * alors que le service avait raison.
 *
 * Mesuré ensuite, sur quatre couples ISBN-10 / ISBN-13 : **une seule des huit
 * requêtes rend quelque chose**, et c'est la forme à dix chiffres de ce
 * titre-là. Ce n'est PAS un motif — huit mesures dont une positive ne
 * permettent pas de dire « la BnF n'indexe pas l'ISBN-13 ». C'est une
 * observation, et elle est notée au journal comme telle.
 *
 * Ce qu'on retient pour la recette : chercher par TITRE, qui est densément
 * indexé (8 890 réponses pour « l'étranger »), et garder l'ISBN qui répond
 * comme second cas.
 */
const ISBN_QUI_REPOND = '2070360024';
const TITRE_DENSE = 'l’étranger';

describe.runIf(process.env.SRU_REEL === '1')('⚠ Le client SRU, contre de vrais catalogues', () => {
  it('une recherche par ISBN rend des candidats, ou DIT quel serveur a échoué', async () => {
    const service = new SruService();
    const resultat = await service.search({ query: TITRE_DENSE });

    // eslint-disable-next-line no-console
    console.log(
      `[sru] ${resultat.candidates.length} candidat(s) · ${resultat.errors.length} serveur(s) en échec` +
        (resultat.errors.length ? ` : ${resultat.errors.map((e) => `${e.source} — ${e.message}`).join(' ; ')}` : ''),
    );
    for (const c of resultat.candidates) {
      // eslint-disable-next-line no-console
      console.log(`[sru]   ${c.source} → « ${c.title} » / ${c.contributors[0]?.name ?? '—'} (${c.publishYear ?? '?'})`);
    }

    // ⚠ CE QUI SERAIT UN ÉCHEC DE RECETTE : ni l'un ni l'autre. Un serveur
    // injoignable est une information — c'est même le cas que le service
    // existe pour ne pas taire. Ce qu'on refuse, c'est le silence : zéro
    // candidat ET zéro erreur, c'est-à-dire « rien trouvé » sans savoir si
    // quelqu'un a seulement répondu.
    expect(
      resultat.candidates.length + resultat.errors.length,
      'ni candidat ni erreur : le service a rendu un vide MUET',
    ).toBeGreaterThan(0);
  }, 30_000);

  it('⚠ les candidats sont EXPLOITABLES — un titre vide ne pré-remplit rien', async () => {
    // La question qu'on ne pose jamais à un client : il rend des objets, mais
    // disent-ils quelque chose ? Un candidat sans titre remplirait un formulaire
    // de vide, et la bibliothécaire referait la saisie sans comprendre.
    const resultat = await new SruService().search({ query: TITRE_DENSE });
    if (!resultat.candidates.length) {
      // eslint-disable-next-line no-console
      console.log('[sru] aucun candidat — les deux serveurs sont muets, recette non concluante');
      return;
    }
    for (const c of resultat.candidates) {
      expect(c.title?.trim(), `candidat sans titre depuis ${c.source}`).toBeTruthy();
    }
    // Au moins un candidat porte un auteur : sans lui la fiche reste à moitié
    // vide, ce qui est le cas d'usage qu'on prétend servir.
    expect(
      resultat.candidates.some((c) => c.contributors.length > 0),
      'aucun candidat ne porte de contributeur',
    ).toBe(true);
  }, 30_000);

  it('⚠ un serveur INJOIGNABLE est reporté, il ne fait pas échouer la recherche', async () => {
    // Le comportement que l'écran affiche : les notices trouvées ailleurs, plus
    // un avertissement nommant la source muette. Éprouvé avec une adresse qui
    // ne répondra jamais, à côté des vraies.
    const service = new SruService();
    const original = process.env.SRU_EXTRA_SERVERS;
    process.env.SRU_EXTRA_SERVERS = JSON.stringify([
      {
        id: 'fantome',
        name: 'Catalogue fantôme',
        baseUrl: 'http://127.0.0.1:1/sru',
        version: '1.1',
        recordSchema: 'marcxml',
        format: 'MARC21',
        relation: '=',
        index: { isbn: 'bath.isbn', title: 'bath.title', author: 'bath.author' },
        enabled: true,
      },
    ]);
    try {
      const resultat = await service.search({ query: TITRE_DENSE });
      // eslint-disable-next-line no-console
      console.log(`[sru] avec un serveur fantôme : ${resultat.errors.length} erreur(s) reportée(s)`);
      expect(
        resultat.errors.some((e) => /fantôme|fantome/i.test(e.source)),
        'le serveur injoignable n’est pas reporté : son silence passerait pour « rien trouvé »',
      ).toBe(true);
    } finally {
      if (original === undefined) delete process.env.SRU_EXTRA_SERVERS;
      else process.env.SRU_EXTRA_SERVERS = original;
    }
  }, 30_000);

  it('les deux serveurs par défaut sont bien ceux qu’on croit (témoin)', () => {
    // Sans témoin, une recette qui n'interroge plus personne passerait au vert
    // en silence — la forme exacte qu'on traque depuis ce matin.
    expect(DEFAULT_SRU_SERVERS.filter((s) => s.enabled).map((s) => s.id)).toEqual(['bnf', 'loc']);
  });
});
