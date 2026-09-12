import { describe, expect, it, vi } from 'vitest';
import { AccessControlService } from './access-control.service';
import { hasAccessViaRules } from './access-control.matching';

/**
 * ⚠ LES RÈGLES D'ACCÈS NE S'HÉRITENT PAS DANS LA HIÉRARCHIE — P6-1.
 *
 * Décision du 12 septembre 2026, et ce fichier est ce qui la DÉFEND. Le motif
 * complet est en tête d'`access-control.matching.ts` ; l'essentiel tient en
 * deux points :
 *
 *  1. Les règles sont un OU de permissions (`hasAccessViaRules` : au moins une
 *     autorise). Hériter, c'est AJOUTER des règles — ça ne peut qu'élargir.
 *  2. Le danger est DIFFÉRÉ : le geste dangereux n'est pas de poser la règle
 *     sur la faculté, c'est de créer une sous-collection six mois plus tard,
 *     qui hériterait d'une règle que personne ne réexamine.
 *
 * ⚠ CE TEST PORTE UNE PROPRIÉTÉ, PAS UN CAS. Il échoue le jour où quelqu'un
 * ajoute une remontée d'ancêtres au chargement des règles — y compris pour de
 * bonnes raisons, y compris sans le dire. C'est exactement ce qu'on veut : un
 * élargissement de droits ne doit pas pouvoir arriver par refactor.
 */

const CTX = { tenantId: 't1', className: 'L1_DROIT', subscriptionTier: 'gratuit' };

/** Faculté (ouverte à L1_DROIT) → Département → Thèses (aucune règle). */
function base() {
  const collections = [
    {
      id: 'fac',
      name: 'Faculté de Droit',
      parentId: null,
      accessRules: [{ tenantId: 't1', className: 'L1_DROIT', subscriptionTier: null }],
      titles: [],
    },
    {
      id: 'dep',
      name: 'Département Privé',
      parentId: 'fac',
      // ⚠ VISIBLE POUR L'ÉTUDIANT, ET C'EST DÉLIBÉRÉ. Avec un département sans
      // règle, le parent DIRECT de « Thèses » n'autorisait personne : une
      // mutation qui hérite d'un seul niveau ne pouvait rien ouvrir, et le
      // contrôle négatif ne tombait pas. Mesuré deux fois.
      //
      // Ici le département est accessible et sa sous-collection est
      // restrictive : c'est le cas RÉEL de l'embargo, et le seul qui détecte
      // un héritage, qu'il remonte d'un niveau ou de tous.
      accessRules: [{ tenantId: 't1', className: 'L1_DROIT', subscriptionTier: null }],
      titles: [],
    },
    {
      id: 'theses',
      name: 'Thèses sous embargo',
      parentId: 'dep',
      // ⚠ SA PROPRE RÈGLE, RESTRICTIVE — et c'est ce qui rend ce jeu d'essai
      // capable de détecter l'héritage. Avec une liste VIDE, la collection
      // n'aurait même pas franchi le pré-filtre SQL
      // (`accessRules: { some: { tenantId } }`) : elle n'arriverait jamais à la
      // décision, et un héritage ajouté LÀ passerait inaperçu. Mesuré : un
      // contrôle négatif qui introduisait l'héritage dans le `.filter(...)` ne
      // faisait tomber aucun test.
      //
      // Ici la règle existe, vise la bonne école, et une AUTRE classe. La
      // collection arrive donc à la décision et doit être REFUSÉE — alors que
      // sa faculté, elle, autorise L1_DROIT.
      accessRules: [{ tenantId: 't1', className: 'M2_DROIT', subscriptionTier: null }],
      titles: [],
    },
  ];
  return {
    collection: {
      // La VRAIE requête pré-filtre sur « au moins une règle de cette école ».
      // La doublure applique le même filtre : une doublure plus permissive que
      // la base rendrait ce test aveugle là où la requête décide.
      findMany: vi.fn(async ({ where }: any) =>
        collections.filter((c) =>
          where?.accessRules?.some?.tenantId
            ? c.accessRules.some((r) => r.tenantId === where.accessRules.some.tenantId)
            : true,
        ),
      ),
    },
  } as never;
}

const service = () => new AccessControlService(base());

describe('La règle d’une ancêtre n’ouvre PAS ses descendantes', () => {
  it('⚠ l’étudiant voit ce qui l’autorise LUI, et rien par ricochet', async () => {
    const visibles = await service().getVisibleCollections(CTX);

    expect(visibles.map((c) => c.id).sort()).toEqual(['dep', 'fac']);
    // Nommé exprès : c'est la collection qu'un héritage aurait ouverte.
    expect(visibles.map((c) => c.id)).not.toContain('theses');
  });

  it('⚠ une sous-collection à la règle RESTRICTIVE n’est pas élargie par sa faculté', async () => {
    // Le cœur de la décision, et le cas qui la DÉFEND réellement.
    //
    // « Thèses sous embargo » vise M2_DROIT ; sa faculté vise L1_DROIT. Un
    // étudiant de L1 ne doit pas la voir. Sous héritage, il la verrait — et
    // aucun geste d'élargissement n'aurait eu lieu ni ne serait tracé.
    const visibles = await service().getVisibleCollections(CTX);
    expect(visibles.some((c) => c.id === 'theses')).toBe(false);
  });

  it('⚠ la REQUÊTE ne remonte pas l’arbre — l’héritage s’introduirait là', async () => {
    // L'autre porte d'entrée, et la plus probable : élargir le pré-filtre SQL
    // en `OR: [{ parent: { accessRules: … } }]`. Le contrôle négatif a montré
    // que sans cette assertion, la moitié SQL de la propriété n'est défendue
    // par rien.
    const db = base() as unknown as { collection: { findMany: ReturnType<typeof vi.fn> } };
    await new AccessControlService(db as never).getVisibleCollections(CTX);

    const where = JSON.stringify(db.collection.findMany.mock.calls[0][0].where);
    expect(where).toContain('accessRules');
    for (const mot of ['parent', 'children', 'OR']) {
      expect(where, `la requête ne doit pas mentionner « ${mot} »`).not.toContain(mot);
    }
  });

  it('la décision pure ignore la hiérarchie : elle ne voit que des règles', () => {
    // `hasAccessViaRules` ne reçoit ni parent ni arbre — et c'est structurel.
    // Lui passer les règles de la collection seule est la seule chose possible.
    expect(hasAccessViaRules([], CTX)).toBe(false);
    expect(
      hasAccessViaRules([{ tenantId: 't1', className: null, subscriptionTier: null }], CTX),
    ).toBe(true);
  });

  it('poser la règle SUR la descendante l’ouvre — la propagation est explicite', async () => {
    // L'inconvénient assumé : il faut poser la règle. Il SE VOIT (la collection
    // n'est visible de personne), là où l'inconvénient de l'héritage ne se voit
    // pas (un étudiant accède à ce qu'il ne devrait pas).
    const db = base() as unknown as { collection: { findMany: ReturnType<typeof vi.fn> } };
    const initial = await db.collection.findMany({ where: {} });
    (initial as { id: string; accessRules: unknown[] }[])
      .find((c) => c.id === 'theses')!
      .accessRules.push({ tenantId: 't1', className: 'L1_DROIT', subscriptionTier: null });

    const visibles = await new AccessControlService(db as never).getVisibleCollections(CTX);
    expect(visibles.map((c) => c.id).sort()).toEqual(['dep', 'fac', 'theses']);
  });
});
