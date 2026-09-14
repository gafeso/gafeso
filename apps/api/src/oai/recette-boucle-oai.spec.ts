import { describe, expect, it } from 'vitest';
import { ClientOai } from '../moissonnage/client-oai';
import { mapperOaiDc } from '../moissonnage/mapper-oai-dc';
import { analyserIdentifiant } from '../opac/identifiant-perenne';

/**
 * ⚠ LA BOUCLE : NOTRE CLIENT MOISSONNE NOTRE PROPRE ENTREPÔT.
 *
 * *Écrite le 13 septembre 2026, en cherchant ce qui n'avait jamais été traversé.
 * Le relevé a donné deux surfaces à zéro recette réelle : `storage` et `oai`.*
 *
 * L'entrepôt OAI est la surface par laquelle DICAMES viendra chercher nos
 * thèses — et le contexte terrain est sans ambiguïté : **une publication non
 * déposée dans DICAMES ne compte pas pour la promotion.** Une réponse mal
 * formée rend le fonds d'une université invisible, sans que rien chez nous ne
 * le signale : nous répondons 200, et le moissonneur distant repart vide.
 *
 * Ses six specs existantes éprouvent le XML **contre des doublures de base**.
 * Aucune ne l'avait éprouvé contre un MOISSONNEUR.
 *
 * ⚠ ET LA BOUCLE VAUT MIEUX QU'UNE ASSERTION SUR DU XML, pour une raison
 * précise : notre client vient d'être éprouvé contre DSpace et arXiv, deux
 * entrepôts que nous ne maîtrisons pas. S'il lit le nôtre, c'est que le nôtre
 * ressemble à ceux-là — et pas seulement à l'idée que nous nous en faisons.
 *
 *   RAPPELS_REEL=1 … non : celle-ci n'a besoin que de l'API de développement.
 *   BOUCLE_OAI=1 npx vitest run src/oai/recette-boucle-oai.spec.ts
 *
 * ⚠ Elle n'écrit RIEN : elle LIT notre entrepôt, comme le ferait un tiers.
 */

const BASE = process.env.OAI_BASE_URL ?? 'http://localhost:4000/oai';

describe.runIf(process.env.BOUCLE_OAI === '1')('⚠ Notre entrepôt, lu par notre moissonneur', () => {
  it('il est moissonnable, et le JETON DE REPRISE fonctionne sur NOUS aussi', async () => {
    // ⚠ Deux pages exactement : l'entrepôt rend 100 notices par page et en
    // annonce 352. C'est donc notre propre pagination qu'on éprouve — celle
    // que nous imposons à DICAMES.
    const issue = await new ClientOai(fetch, 2).moissonner({
      baseUrl: BASE,
      metadataPrefix: 'oai_dc',
    });

    // eslint-disable-next-line no-console
    console.log(`[boucle] ${issue.etat}` + ('motif' in issue ? ` — ${issue.motif}` : ''));

    // Une API arrêtée n'est pas un défaut de l'entrepôt : on le dit et on sort.
    if (issue.etat === 'injoignable' && !issue.partiel) {
      // eslint-disable-next-line no-console
      console.log('[boucle] API de développement arrêtée — recette non jouée');
      return;
    }

    const ramassage = issue.etat === 'moisson' ? issue : 'partiel' in issue ? issue.partiel : null;
    expect(ramassage, 'notre entrepôt n’a rien rendu à notre propre client').toBeTruthy();
    expect(ramassage!.notices.length, 'aucune notice ramassée').toBeGreaterThan(100);
    // ⚠ Plus de 100 veut dire que la SECONDE page est arrivée : le jeton de
    // reprise que NOUS émettons a été accepté par un client qui le renvoie
    // seul, comme le protocole l'exige. C'est ce que fera DICAMES.
    // eslint-disable-next-line no-console
    console.log(
      `[boucle] ${ramassage!.notices.length} notice(s) en ${ramassage!.pages} page(s), ` +
        `reprise=${ramassage!.reprise ? 'oui' : 'non'}`,
    );
  }, 60_000);

  it('⚠ nos notices sont TRADUISIBLES par un client qui ne nous connaît pas', async () => {
    // C'est la question que personne ne pose à son propre entrepôt : le XML est
    // valide, mais dit-il quelque chose ? Un `oai_dc` sans titre est conforme au
    // schéma et inutile à un moissonneur.
    const issue = await new ClientOai(fetch, 1).moissonner({
      baseUrl: BASE,
      metadataPrefix: 'oai_dc',
    });
    const ramassage = issue.etat === 'moisson' ? issue : 'partiel' in issue ? issue.partiel : null;
    if (!ramassage) return;

    const traduites = ramassage.notices.map((n) => mapperOaiDc(n.metadonnees));
    const avecTitre = traduites.filter(Boolean).length;
    // eslint-disable-next-line no-console
    console.log(`[boucle] mapper : ${avecTitre}/${traduites.length} notices traduites`);
    expect(
      avecTitre,
      'nos notices ne se traduisent pas : un moissonneur repartirait avec du vide',
    ).toBe(traduites.length);

    // ⚠ ET L'IDENTIFIANT PÉRENNE EST LISIBLE PAR CE MÊME CLIENT. P7-2 a rendu
    // `oai:<école>:<uuid>` résolvable ; ici on vérifie qu'il sort bien de
    // l'entrepôt sous la forme que notre propre analyseur reconnaît.
    const analyses = ramassage.notices.map((n) => analyserIdentifiant(n.identifiant));
    expect(
      analyses.filter(Boolean).length,
      'nos identifiants ne sont pas analysables par notre propre analyseur',
    ).toBe(analyses.length);
    expect(analyses[0]!.slug).toBeTruthy();
  }, 60_000);

  it('⚠ un `from` dans le futur rend un VIDE CONFIRMÉ, jamais une panne', async () => {
    // Le moissonnage incrémental de DICAMES enverra des `from`. Un entrepôt qui
    // répond mal à une fenêtre sans résultat ferait conclure à une source
    // cassée — et nos thèses disparaîtraient de leurs moissons.
    const demain = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    const issue = await new ClientOai(fetch, 1).moissonner({
      baseUrl: BASE,
      metadataPrefix: 'oai_dc',
      from: demain,
    });
    if (issue.etat === 'injoignable' && !issue.partiel) return;
    // eslint-disable-next-line no-console
    console.log(`[boucle] from=demain → ${issue.etat}`);
    expect(issue.etat, 'une fenêtre vide doit être un vide CONFIRMÉ').toBe('vide');
  }, 30_000);
});
