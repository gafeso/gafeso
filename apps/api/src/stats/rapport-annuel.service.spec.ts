import { describe, expect, it, vi } from 'vitest';
import { RapportAnnuelService } from './rapport-annuel.service';
import { annee } from './rapport-annuel';

/**
 * ⚠ CE QUE LE RAPPORT AFFIRME, ET CE QU'IL REFUSE D'AFFIRMER.
 *
 * *P8-2, 15 septembre 2026.*
 */
function fauxDb(over: Record<string, unknown> = {}) {
  const compte = (n: number) => vi.fn().mockResolvedValue(n);
  return {
    biblioRecord: {
      count: compte(352),
      groupBy: vi.fn().mockResolvedValue([
        { category: 'Droit', _count: { _all: 200 } },
        { category: 'Médecine', _count: { _all: 3 } },
      ]),
    },
    item: { count: compte(364) },
    digitalCopy: { count: compte(155) },
    patron: {
      count: compte(63),
      groupBy: vi.fn().mockResolvedValue([{ category: 'etudiant', _count: { _all: 60 } }]),
    },
    checkout: {
      count: compte(100),
      findMany: vi.fn().mockResolvedValue([{ patronId: 'p1' }, { patronId: 'p2' }]),
    },
    usageEvent: { count: compte(42) },
    offlineLicense: { count: compte(7) },
    deposit: { count: compte(2) },
    ...over,
  };
}

const service = (db: unknown) =>
  new RapportAnnuelService({ forTenant: () => db } as never);

describe('Rapport annuel — ce qu’il affirme', () => {
  it('⚠ AUCUNE DONNÉE PERSONNELLE dans la SORTIE — vérifié sur le document, pas sur l’intention', async () => {
    // ⚠ LE CONTRÔLE PORTE SUR LE JSON SÉRIALISÉ, pas sur les champs qu'on a
    // pensé à regarder. Un nom qui apparaîtrait dans un libellé de catégorie,
    // dans un motif ou dans une réserve serait attrapé ici — pas par une
    // relecture des types.
    const rapport = await service(fauxDb()).produire('zinda', 'Lycée Zinda', annee(2026));
    const texte = JSON.stringify(rapport);

    for (const interdit of [
      'patronId', 'userId', 'email', 'firstName', 'lastName', 'barcode',
      'actorEmail', 'ip', 'recipientEmail', 'deviceId',
    ]) {
      expect(texte, `le rapport porte « ${interdit} »`).not.toContain(interdit);
    }
    // Témoin : le document n'est pas vide — sinon le balayage ci-dessus passe
    // sur rien, et sa ligne verte se lit comme une garantie.
    expect(texte.length).toBeGreaterThan(400);
    expect(rapport.etablissement).toBe('Lycée Zinda');
  });

  it('⚠ LA DIFFUSION est ABSENTE et NOMMÉE — jamais zéro', async () => {
    // Un zéro se lirait « personne ne nous moissonne », ce qui est une
    // AFFIRMATION que nous ne pouvons pas faire. Et c'est précisément le
    // chiffre qui prouverait la valeur DICAMES de l'école.
    const rapport = await service(fauxDb()).produire('zinda', 'Zinda', annee(2026));
    expect(rapport.diffusion.etat).toBe('non_calculable');
    if (rapport.diffusion.etat === 'non_calculable') {
      expect(rapport.diffusion.motif).toMatch(/OAI/);
      expect(rapport.diffusion.motif, 'le motif doit distinguer « inconnu » de « zéro »').toMatch(
        /pas zéro|inconnu/i,
      );
    }
  });

  it('⚠ le seuil s’applique AUSSI au fonds : une catégorie de 3 n’est pas publiée', async () => {
    const rapport = await service(fauxDb()).produire('zinda', 'Zinda', annee(2026));
    expect(rapport.fonds.etat).toBe('calcule');
    if (rapport.fonds.etat !== 'calcule') return;
    const medecine = rapport.fonds.valeurs.parCategorie.find((l) => l.libelle === 'Médecine');
    expect(medecine?.nombre, 'une catégorie de 3 documents a été publiée').toBeNull();
    expect(medecine?.masque).toMatch(/inférieur à 5/);
  });

  it('⚠ « actifs dans l’année » compte des PERSONNES, pas des prêts', async () => {
    // Sans `distinct`, un lecteur assidu vaudrait dix — et le rapport
    // annoncerait plus d'actifs que d'inscrits.
    const db = fauxDb();
    const rapport = await service(db).produire('zinda', 'Zinda', annee(2026));
    expect(db.checkout.findMany.mock.calls[0][0]).toMatchObject({ distinct: ['patronId'] });
    if (rapport.lecteurs.etat !== 'calcule') throw new Error('bloc absent');
    expect(rapport.lecteurs.valeurs.actifsDansLAnnee).toBe(2);
  });

  it('⚠ CHAQUE compte du dépôt porte SA date — pas toutes `createdAt`', async () => {
    // Un dépôt créé en 2025 et validé en 2026 compte dans les DÉPOSÉS de 2025
    // et dans les VALIDÉS de 2026. Les compter tous sur `createdAt` aurait
    // rendu un tableau cohérent et FAUX.
    const db = fauxDb();
    await service(db).produire('zinda', 'Zinda', annee(2026));
    const champs = (db.deposit.count.mock.calls as unknown[][]).map((appel) =>
      Object.keys((appel[0] as { where: Record<string, unknown> }).where)
        .filter((k) => k.endsWith('At'))
        .join(''),
    );
    expect(champs).toEqual(['createdAt', 'submittedAt', 'decidedAt', 'decidedAt', 'decidedAt']);
  });

  it('⚠ le taux de rotation est ABSENT quand il n’y a aucun exemplaire, jamais zéro', async () => {
    // Une division par zéro n'est pas « un taux de 0 » : c'est un taux qui
    // n'existe pas. Zéro se lirait « les documents ne tournent pas ».
    const db = fauxDb({ item: { count: vi.fn().mockResolvedValue(0) } });
    const rapport = await service(db).produire('zinda', 'Zinda', annee(2026));
    if (rapport.circulation.etat !== 'calcule') throw new Error('bloc absent');
    expect(rapport.circulation.valeurs.tauxDeRotation).toBeNull();
  });

  it('⚠ les RÉSERVES sont en tête du document, pas en note de bas de page', async () => {
    const rapport = await service(fauxDb()).produire('zinda', 'Zinda', annee(2026));
    expect(rapport.reserves.length).toBeGreaterThanOrEqual(3);
    // Ce que le lecteur DOIT savoir pour ne pas se tromper sur les chiffres.
    expect(rapport.reserves.join(' ')).toMatch(/ACQUISITION/);
    expect(rapport.reserves.join(' ')).toMatch(/ÉVÉNEMENTS, pas des personnes/);
    expect(rapport.reserves.join(' ')).toMatch(/moins de 5/);
  });

  it('⚠ CAS 5 DE LA RECETTE : le rapport d’une école ne porte QUE ses chiffres', async () => {
    // ⚠ TOUTE lecture passe par le client lié au SCHÉMA de l'école. C'est
    // PostgreSQL qui isole, pas une colonne — mais encore faut-il que le
    // service n'interroge jamais le client `public` par distraction.
    //
    // Le contrôle porte donc sur les DEUX moitiés : `forTenant` reçoit bien le
    // slug demandé, et il est le SEUL chemin d'accès aux données.
    const db = fauxDb();
    const slugsDemandes: string[] = [];
    const prisma = {
      forTenant: (slug: string) => {
        slugsDemandes.push(slug);
        return db;
      },
      // ⚠ Un piège à distraction : si le service interrogeait le client public,
      // il tomberait ici et le test le dirait. Une doublure qui rend un objet
      // vide laisserait passer l'erreur en silence.
      biblioRecord: {
        count: () => {
          throw new Error('le rapport a lu le schéma PUBLIC au lieu de celui de l’école');
        },
      },
    };
    const rapport = await new RapportAnnuelService(prisma as never).produire(
      'horizon',
      'Université Horizon',
      annee(2026),
    );

    expect(slugsDemandes, 'le rapport doit lire le schéma de l’école demandée').toEqual(['horizon']);
    expect(rapport.etablissement).toBe('Université Horizon');
  });

  it('la période affichée dit le dernier jour COMPTÉ', async () => {
    const rapport = await service(fauxDb()).produire('zinda', 'Zinda', annee(2026));
    expect(rapport.periode).toEqual({
      debut: '2026-01-01',
      fin: '2026-12-31',
      libelle: 'du 1er janvier au 31 décembre 2026',
    });
  });
});
