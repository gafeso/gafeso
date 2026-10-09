/**
 * ⭐ LE COMPTEUR MONTE — mesuré contre le SERVEUR, pas contre une doublure.
 *
 * *Preuve exigée par Jean le 6 octobre 2026 : « compteur qui monte ; contrôle
 * négatif ».*
 *
 * ⚠ CE QU'UNE DOUBLURE NE PEUT PAS PROUVER, et c'est tout l'objet de ce
 * fichier : que les NOMS DE COLONNES existent, que la purge touche les bonnes
 * lignes, et que l'agrégat par filière compte des PERSONNES et non des
 * événements. Un `vi.fn()` accepte n'importe quelle charge — il a d'ailleurs
 * accepté `userId` pendant que la colonne n'existait pas encore.
 *
 * ## Discipline : `nettoyage-recense`
 *
 * ⚠ On RETIENT LES IDENTIFIANTS préexistants et on nettoie par DIFFÉRENCE
 * D'ENSEMBLES — jamais « je supprime ce que je crois avoir créé ». L'école de
 * développement porte 503 lignes réelles, et une suppression trop large les
 * emporterait.
 *
 * ## ⚠ PARAMÉTRÉ PAR ÉTABLISSEMENT — corrigé le 8 octobre 2026
 *
 * Ce garde portait `const SLUG = 'zinda'`. Il mesurait donc UNE école et rendait
 * VERT sur toutes les autres : une violation semée sur `horizon` seul ne le
 * faisait pas tomber, et son vert était HONNÊTE — il avait mesuré ce qu'il
 * déclarait. C'est « un garde qui NE LIT PAS ce qu'il déclare » dans sa forme la
 * moins visible, parce qu'il ne déclarait rien.
 *
 * ⚠ Mesuré avant de corriger, parce que l'ampleur décide : sur les dix gardes
 * vivants du dépôt, **celui-ci était le seul** mono-école. Les neuf autres
 * dérivent déjà leur population — ou mesurent un objet du schéma `public`, où la
 * question ne se pose pas.
 *
 * La population est DÉRIVÉE (`ecolesPortant`), jamais listée, et la sortie la
 * NOMME : un garde par-école qui ne dit pas ses écoles laisse son lecteur
 * supposer qu'il les a toutes vues.
 *
 * ⚠ Et la découverte a lieu AU CHARGEMENT, sous le drapeau. Hors `PG_LIVE=1`
 * elle n'est pas tentée — sinon `npm test` exigerait une base sur toute machine,
 * ce qui est exactement ce que le gatage existe pour éviter.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ecolesMesurees, ecolesPortant } from '../common/base-injoignable';
import {
  SEUIL_PUBLICATION,
  USAGE_CONSULTATION,
  USAGE_TELECHARGEMENT,
  UsageService,
} from './usage.service';

const VIVANT = process.env.PG_LIVE === '1';

/**
 * ⚠ LE MESSAGE QUE LE CROCHET DE PRÉ-PUBLICATION LIT pour distinguer « la
 * propriété est violée » de « la base est injoignable ». La forme interdite est
 * Un retour anticipé sur base absente rendrait VERT un test qui n'a rien
 * mesuré — c'est la forme que `gardes-vivants.spec.ts` interdit, et il la
 * cherche dans la SOURCE BRUTE, commentaires compris.
 */
const MESSAGE_BASE_INJOIGNABLE =
  'base injoignable : ce garde ne peut pas MESURER, donc il échoue. ' +
  'Un test qui ne peut pas mesurer n’est pas un test qui passe — c’est au ' +
  'crochet de pré-publication de faire la part des choses.';
function client(slug: string): PrismaClient {
  const base = process.env.DATABASE_URL ?? '';
  const url = new URL(base);
  // ⚠ `searchParams.set` ÉCRASE. `replace('schema=public', …)` ne ferait rien
  // sur une URL qui porte d'autres paramètres, et la connexion partirait sur le
  // GABARIT — voir `scripts/lib/base-tenant.mjs`, même piège, même correction.
  url.searchParams.set('schema', `tenant_${slug}`);
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

/**
 * Les écoles qui portent `usage_events` — découvertes, jamais listées.
 *
 * ⚠ LA TABLE SONDÉE EST CELLE QU'ON VA LIRE. Une école à demi provisionnée porte
 * `biblio_records` sans porter `usage_events` : demander « qui a la table que je
 * vais lire » est la seule question qui ne se trompe pas, et elle distingue
 * « école absente » (on passe) de « colonne absente » (on LÈVE).
 */
async function ecolesDeLaSuite(): Promise<string[]> {
  const racine = new PrismaClient();
  try {
    return await ecolesPortant(racine as never, 'usage_events');
  } finally {
    await racine.$disconnect();
  }
}

// ⚠ Découverte au chargement, SOUS LE DRAPEAU. Si la base est injoignable alors
// que le drapeau est posé, cette ligne LÈVE : le fichier sort ROUGE avec le
// message que le crochet de pré-publication sait reconnaître — et c'est le
// comportement voulu, « un test qui ne peut pas mesurer n'est pas un test qui
// passe ».
//
// ⚠ ET PAS DE `await` AU PREMIER NIVEAU, bien que vitest l'accepte : le `tsc`
// du dépôt compile en `module: commonjs` et le REFUSE (TS1378). Mesuré le
// 8 octobre 2026 — c'est la vérification de types de `scripts/`, câblée une
// heure plus tôt, qui l'a dit du premier coup. La découverte vit donc dans
// `beforeAll`, et chaque cas PARCOURT les écoles.
describe.runIf(VIVANT)('la trace d’usage, EN BASE', () => {
  /** Une connexion par école — la population est DÉCOUVERTE, jamais listée. */
  let bases: Map<string, PrismaClient>;
  let service: UsageService;
  /** Les identifiants PRÉEXISTANTS, PAR ÉCOLE — la référence du nettoyage. */
  let avant: Map<string, Set<string>>;
  let notices: Map<string, string>;
  let joignable = false;

  beforeAll(async () => {
    // ⚠ RIEN ne se construit dans le corps du `describe` : gaté, il serait
    // ÉVALUÉ quand même et lèverait sur une machine sans base.
    bases = new Map();
    avant = new Map();
    notices = new Map();
    service = new UsageService();
    const racine = new PrismaClient();
    let ecoles: string[] = [];
    try {
      ecoles = await ecolesPortant(racine as never, 'usage_events');
      joignable = true;
    } catch {
      joignable = false;
    } finally {
      await racine.$disconnect();
    }
    // ⚠ CONDITION INVERSÉE, DÉLIBÉRÉMENT — et c'est `gardes-vivants.spec.ts`
    // qui me l'a imposé, pas ma relecture : j'avais écrit la forme interdite
    // dans le fichier qui PORTE l'avertissement contre elle, trois commentaires
    // plus bas. Un garde sur le CHEMIN du geste vaut tous ceux qui constatent.
    if (joignable) {
      console.log(ecolesMesurees('usage-nominatif', ecoles));
      for (const slug of ecoles) {
        const db = client(slug);
        bases.set(slug, db);
        avant.set(
          slug,
          new Set((await db.usageEvent.findMany({ select: { id: true } })).map((l) => l.id)),
        );
        const notice = await db.biblioRecord.findFirst({ select: { id: true } });
        expect(
          notice,
          `« ${slug} » : il faut une notice réelle pour que la mesure veuille dire quelque chose`,
        ).toBeTruthy();
        notices.set(slug, notice!.id);
      }
    }
  });

  /**
   * Exécute un cas SUR CHAQUE ÉCOLE, et NOMME celle qui a échoué.
   *
   * ⚠ Les deux assertions d'entrée ne sont pas décoratives :
   *   · `joignable` — un test qui ne peut pas mesurer doit être ROUGE ;
   *   · `bases.size > 1` — un garde redevenu mono-école rendrait VERT sur une
   *     violation semée ailleurs, et son vert serait honnête. Un témoin de
   *     PRÉSENCE (« au moins une ») ne l'attraperait pas.
   */
  async function parEcole(
    f: (db: PrismaClient, slug: string, recordId: string) => Promise<void>,
  ): Promise<void> {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(
      bases.size,
      'ce garde doit mesurer PLUSIEURS écoles : une violation semée sur une ' +
        'seule ne doit pas pouvoir passer. Si une école a disparu, dites ' +
        'pourquoi ; si la découverte ne trouve plus rien, c’est l’instrument ' +
        'qu’il faut regarder.',
    ).toBeGreaterThan(1);
    for (const [slug, db] of bases) {
      try {
        await f(db, slug, notices.get(slug)!);
      } catch (erreur) {
        // Le nom de l'école entre dans le message : sans lui, « 1 échec » ne
        // dit pas LEQUEL des deux fonds l'a produit.
        throw new Error(`école « ${slug} » — ${(erreur as Error).message}`);
      }
    }
  }

  afterAll(async () => {
    // ⚠ CONDITION INVERSÉE, DÉLIBÉRÉMENT. Le retour anticipé sur base absente
    // est la forme que `gardes-vivants.spec.ts` interdit. Ici elle serait
    // légitime — il n'y a rien à nettoyer sans base —, mais un garde de FORME ne
    // peut pas distinguer un `afterAll` d'un corps de test, et je n'élargis pas
    // un garde pour mon cas particulier : j'écris la forme qu'il accepte.
    //
    // ⚠ Et le garde lit la SOURCE BRUTE : le motif ne doit pas non plus
    // apparaître dans un commentaire. C'est « un détecteur qui lit l'intérieur
    // des commentaires », déjà payé deux fois dans ce dépôt.
    if (joignable) {
      for (const [slug, db] of bases) {
        // Nettoyage par DIFFÉRENCE, école par école : tout ce qui n'existait
        // pas avant. Un recensement commun aux deux écoles aurait confondu
        // leurs lignes — et le compte final n'aurait désigné personne.
        const recensement = avant.get(slug)!;
        const apres = await db.usageEvent.findMany({ select: { id: true } });
        const nes = apres.map((l) => l.id).filter((id) => !recensement.has(id));
        if (nes.length > 0) await db.usageEvent.deleteMany({ where: { id: { in: nes } } });
        const reste = (await db.usageEvent.findMany({ select: { id: true } })).map((l) => l.id);
        // ⚠ On confronte au RECENSEMENT, jamais à sa propre empreinte.
        expect(
          reste.length,
          `« ${slug} » : le nettoyage doit ramener au recensement de départ`,
        ).toBe(recensement.size);
      }
    }
    for (const db of bases.values()) await db.$disconnect();
  });

  it('⭐ LE COMPTEUR MONTE — et d’exactement une ligne par geste', () =>
    parEcole(async (db, slug, recordId) => {
      const debut = new Date(Date.now() - 60_000);
      const fin = new Date(Date.now() + 60_000);
      const avantJour = await service.parJour(db, debut, fin);
      const c0 = avantJour.reduce((n, j) => n + j.consultations, 0);

      expect(
        await service.enregistrer(db, recordId, USAGE_CONSULTATION, {
          userId: 'u-recette-1',
          className: 'RECETTE_FILIERE',
        }),
      ).toBe(true);

      const apresJour = await service.parJour(db, debut, fin);
      const c1 = apresJour.reduce((n, j) => n + j.consultations, 0);
      expect(c1, 'une consultation de plus, exactement').toBe(c0 + 1);
    }));

  it('⚠ et les colonnes nominatives arrivent VRAIMENT en base', () =>
    parEcole(async (db, slug, recordId) => {
      // Le défaut qu'une doublure ne voit pas : un nom de colonne faux.
      await service.enregistrer(db, recordId, USAGE_TELECHARGEMENT, {
        userId: 'u-recette-1',
        className: 'RECETTE_FILIERE',
      });
      const mien = await service.miennes(db, 'u-recette-1');
      expect(mien.length).toBeGreaterThanOrEqual(2);
      expect(mien.map((l) => l.kind).sort()).toContain(USAGE_TELECHARGEMENT);
    }));

  it('🔴 L’AGRÉGAT PAR FILIÈRE MASQUE sous le seuil, et il le DIT', () =>
    parEcole(async (db, slug, recordId) => {
      const debut = new Date(Date.now() - 60_000);
      const fin = new Date(Date.now() + 60_000);
      const lignes = await service.parFiliere(db, debut, fin);
      const mienne = lignes.find((l) => l.cle === 'RECETTE_FILIERE');
      expect(mienne, 'la filière de la recette doit apparaître').toBeTruthy();
      // UNE seule personne distincte : sous le seuil de 5.
      expect(mienne!.publiable, `1 personne < seuil ${SEUIL_PUBLICATION}`).toBe(false);

      // ⭐ ET LA PROPRIÉTÉ QUE CE TEST EXISTE POUR TENIR : **AUCUN NOMBRE**.
      //
      // ⚠ Elle ne se vérifie PAS champ par champ. Nommer `consultations`,
      // `telechargements` et `effectif` serait un relevé de ce à quoi on a
      // pensé — et le jour où un quatrième compte s'ajoute, il sortirait en
      // silence. On inspecte donc la charge ENTIÈRE et on compte les nombres.
      const valeurs = Object.entries(mienne!).filter(([, v]) => typeof v === 'number');
      expect(
        valeurs,
        'sous le seuil, la ligne ne doit porter AUCUN nombre — ni compte, ni ' +
          'effectif, ni sentinelle. Trouvés : ' +
          valeurs.map(([k, v]) => `${k}=${String(v)}`).join(', '),
      ).toEqual([]);

      // ⚠ Et le motif DIT la règle sans dire le nombre : l'effectif réel est
      // précisément la donnée que le seuil protège.
      expect(mienne!.publiable).toBe(false);
      if (mienne!.publiable === false) {
        expect(mienne!.motif).toContain(String(SEUIL_PUBLICATION));
        expect(
          mienne!.motif,
          'le motif ne doit pas révéler l’effectif réel (1 personne ici)',
        ).not.toMatch(/\b1\b/);
      }

      // ⚠ La LIGNE reste présente — « une absence muette se lit comme un zéro ».
      expect(mienne!.cle).toBe('RECETTE_FILIERE');
    }));

  it('⭐ au-delà du seuil, les comptes SORTENT', () =>
    parEcole(async (db, slug, recordId) => {
      // Cinq personnes distinctes : le seuil est atteint.
      for (let i = 2; i <= SEUIL_PUBLICATION; i += 1) {
        await service.enregistrer(db, recordId, USAGE_CONSULTATION, {
          userId: `u-recette-${i}`,
          className: 'RECETTE_FILIERE',
        });
      }
      const lignes = await service.parFiliere(
        db,
        new Date(Date.now() - 60_000),
        new Date(Date.now() + 60_000),
      );
      const mienne = lignes.find((l) => l.cle === 'RECETTE_FILIERE')!;

      // ⭐ LE TÉMOIN D'ABSENCE DU SEUIL : il doit prouver que le masquage sait
      // dire NON. Sans ce cas, un seuil qui masquerait TOUT serait
      // indiscernable d'un seuil juste — et plus rassurant, puisqu'il ne
      // publierait jamais rien.
      expect(mienne.publiable, `${SEUIL_PUBLICATION} personnes ≥ seuil`).toBe(true);
      if (mienne.publiable === true) {
        expect(mienne.effectif).toBe(SEUIL_PUBLICATION);
        expect(mienne.consultations).toBeGreaterThan(0);
        // ⚠ Et on COMPTE les nombres ici aussi, dans l'autre sens : au-dessus du
        // seuil la ligne en porte, et c'est la moitié qui manquait.
        const valeurs = Object.values(mienne).filter((v) => typeof v === 'number');
        expect(valeurs.length, 'au-dessus du seuil, les comptes SORTENT').toBeGreaterThanOrEqual(3);
      }
    }));

  it('⭐ LA PURGE retire le NOM et garde la LIGNE — l’agrégat survit', () =>
    parEcole(async (db, slug, recordId) => {
      // Une ligne VIEILLE de 13 mois, donc au-delà de la rétention.
      const vieux = new Date();
      vieux.setMonth(vieux.getMonth() - 13);
      const ligne = await db.usageEvent.create({
        data: {
          recordId,
          kind: USAGE_CONSULTATION,
          userId: 'u-recette-vieux',
          className: 'RECETTE_ANCIENNE',
          occurredAt: vieux,
        },
      });

      const n = await service.purgerLeNominatif(db);
      expect(n, 'au moins la ligne de 13 mois a été anonymisée').toBeGreaterThanOrEqual(1);

      const relu = await db.usageEvent.findUnique({ where: { id: ligne.id } });
      // ⭐ LES DEUX MOITIÉS, et c'est leur CONJONCTION qui prouve le compromis :
      expect(relu, 'la LIGNE reste — supprimer réécrirait l’histoire').toBeTruthy();
      expect(relu!.userId, 'le NOM est parti').toBeNull();
      expect(relu!.anonymiseLe, 'et la purge DIT qu’elle a eu lieu').toBeTruthy();
      expect(relu!.className, 'la filière SURVIT : c’est elle qui porte l’agrégat').toBe(
        'RECETTE_ANCIENNE',
      );

      // Et l'historique nominatif ne le rend plus.
      expect(await service.miennes(db, 'u-recette-vieux')).toEqual([]);
    }));

  it('⚠ et la purge ÉPARGNE les lignes récentes — sinon elle ne garderait rien', () =>
    parEcole(async (db, slug, recordId) => {
      // Témoin d'ABSENCE sur la confusion plausible : une purge qui prendrait TOUT.
      const mien = await service.miennes(db, 'u-recette-1');
      expect(mien.length, 'les consultations du jour sont intactes').toBeGreaterThanOrEqual(2);
    }));
});
