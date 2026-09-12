import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * ⚠ Client tenant exigé par `getRecordAccessStatus` depuis P6-4 : l'embargo vit
 * sur la notice, donc dans le schéma de l'école. Ici aucune notice n'est sous
 * embargo — ces cas éprouvent les règles de classe et de palier, pas l'embargo,
 * qui a sa propre suite (`embargo.spec.ts`).
 */
const dbSansEmbargo = { biblioRecord: { findUnique: vi.fn(async () => null) } } as never;

import { AccessControlService } from './access-control.service';

/**
 * ⚠ UNE PROPRIÉTÉ DÉFENDUE DANS LA DÉCISION PURE PEUT ÊTRE CONTOURNÉE PAR LE
 * PRÉ-FILTRE DE LA REQUÊTE.
 *
 * Trouvé le 12 septembre 2026 en recettant P6-1. Le non-héritage des règles
 * d'accès était testé sur la fonction pure ; un contrôle négatif a montré que
 * l'héritage s'introduisait aussi bien par le `where` SQL, qui décide AVANT
 * elle — et que ma première version du test ne pouvait détecter ni l'un ni
 * l'autre, faute d'un jeu d'essai où les sous-collections arrivent jusqu'à la
 * décision.
 *
 * ## Le relevé qui a suivi : ce n'était pas un cas, c'était une STRUCTURE
 *
 * `hasAccessViaRules` est appelée à TROIS endroits, et chacun a la même
 * forme — une requête qui pré-filtre, une fonction pure qui décide :
 *
 * | Méthode | Ce qu'elle garde |
 * |---|---|
 * | `getVisibleCollections` | ce que l'étudiant VOIT |
 * | `canAccessTitle` | l'accès à un titre commercial |
 * | `getRecordAccessStatus` | ⚠ **l'URL de lecture en ligne ET la licence HORS-LIGNE** |
 *
 * La troisième est la plus grave, et c'est précisément celle que mes deux
 * premiers tests ne couvraient pas : une licence hors-ligne émise laisse le
 * téléphone avec le blob chiffré et la clé pour toute la durée du bail. L'OPAC
 * se referme au rechargement suivant ; un appareil, non.
 *
 * ## L'invariant, plutôt que trois tests
 *
 * `hasAccessViaRules` ne connaît RIEN de la hiérarchie — par construction, elle
 * ne reçoit que des règles. L'héritage ne peut donc s'introduire que par CE QUI
 * LUI EST PASSÉ. D'où l'invariant : chaque appel reçoit les règles PROPRES
 * d'une collection, et aucune requête qui les charge ne remonte l'arbre.
 */

const SOURCE = readFileSync(join(__dirname, 'access-control.service.ts'), 'utf8');

/** Les arguments de chaque appel à la décision, tels qu'ils sont écrits. */
function argumentsDeLaDecision(source: string): string[] {
  return [...source.matchAll(/hasAccessViaRules\(([^,]+),/g)].map((m) => m[1].trim());
}

describe("L'instrument : le relevé des points de décision", () => {
  it('⚠ il en trouve EXACTEMENT trois — un quatrième force à relire ceci', () => {
    // ⚠ TÉMOIN QUI COMPTE. « Au moins un » confirmerait que le relevé
    // fonctionne ; seul un compte exact signale la décision ajoutée demain par
    // quelqu'un qui n'aura jamais entendu parler de ce fichier.
    const appels = argumentsDeLaDecision(SOURCE);
    expect(appels.length).toBe(3);
  });

  it('le relevé voit bien la décision la plus grave', () => {
    // Témoin nommé : `getRecordAccessStatus` garde l'URL de lecture et la
    // licence hors-ligne. Un relevé qui ne la verrait pas rendrait un vert
    // rassurant sur le cas qui compte le plus.
    const bloc = SOURCE.slice(SOURCE.indexOf('async getRecordAccessStatus'));
    expect(bloc).toContain('hasAccessViaRules(');
  });
});

describe("⚠ L'INVARIANT : la décision ne reçoit que les règles PROPRES", () => {
  it('chaque appel passe un `.accessRules` direct, sans union ni concaténation', () => {
    // Une union (`[...a, ...b]`, `.concat(`, `a.accessRules.concat`) est la
    // façon naturelle de mélanger les règles d'un ancêtre. Elle est interdite
    // ici, et sa forme est reconnaissable.
    for (const argument of argumentsDeLaDecision(SOURCE)) {
      expect(argument, argument).toMatch(/^[A-Za-z_][\w.]*\.accessRules$/);
    }
  });

  it('⚠ aucune requête chargeant des règles ne remonte l’arbre', () => {
    // L'autre porte d'entrée, et la plus probable : élargir le `where` en
    // `OR: [{ parent: { accessRules: … } }]`. On éprouve la SOURCE parce que
    // c'est là que la traversée s'écrirait.
    const lignes = SOURCE.split('\n')
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => l.includes('accessRules') && !l.trimStart().startsWith('//'));

    expect(lignes.length, 'le relevé doit voir les lignes de règles').toBeGreaterThan(5);
    for (const { n, l } of lignes) {
      for (const mot of ['parent', 'children', 'ancestor', 'ancetre']) {
        expect(l, `ligne ${n} : « ${mot} » n’a rien à faire dans une requête de règles`)
          .not.toContain(mot);
      }
    }
  });
});

// ── Les deux décisions que mes premiers tests ne couvraient pas ─────────────
//
// Même jeu d'essai que `non-heritage.spec.ts`, et pour la même raison : un
// parent VISIBLE et un enfant RESTRICTIF. Un contrôle négatif ne vaut que sur
// le cas RÉEL — avec une sous-collection sans règle, elle n'arriverait même pas
// à la décision et l'héritage passerait inaperçu.
const CTX = { tenantId: 't1', className: 'L1_DROIT', subscriptionTier: 'gratuit' };

const FACULTATIVE = { tenantId: 't1', className: 'L1_DROIT', subscriptionTier: null };
const RESTRICTIVE = { tenantId: 't1', className: 'M2_DROIT', subscriptionTier: null };

/**
 * Le document n'appartient QU'À « Thèses », qui vise M2_DROIT.
 *
 * ⚠ MA PREMIÈRE ÉCRITURE RENVOYAIT AUSSI LE LIEN DE LA FACULTÉ, et les deux
 * tests échouaient — à juste titre : un document réellement placé dans deux
 * collections est accessible par l'une OU l'autre, et ce n'est pas de
 * l'héritage. La vraie requête filtre sur `recordId` : elle ne rend que les
 * collections qui CONTIENNENT le document, et la faculté n'en fait pas partie.
 *
 * ⚠ La faculté est donc représentée là où l'héritage la ferait apparaître :
 * dans le `parent` de la collection chargée (voir `liensAvecParentCharge`).
 */
function liens() {
  return [{ collection: { id: 'theses', parentId: 'fac', accessRules: [RESTRICTIVE] } }];
}

/**
 * Le même lien, mais avec les règles de l'ancêtre DÉJÀ CHARGÉES.
 *
 * ⚠ C'EST CE JEU D'ESSAI QUI REND LA MUTATION DE DÉCISION DÉTECTABLE. Dans ces
 * deux méthodes, l'héritage ne peut entrer que par la requête — élargir le
 * `where` ou le `include`. Un test qui ne double que la requête actuelle ne
 * pourrait donc jamais voir une décision fautive.
 *
 * Ici, on SIMULE l'`include` élargi : le parent arrive avec ses règles
 * permissives. Si la décision les lit, l'accès est accordé et le test tombe.
 * Si elle les ignore — le comportement voulu —, il passe.
 */
function liensAvecParentCharge() {
  return [
    {
      collection: {
        id: 'theses',
        parentId: 'fac',
        accessRules: [RESTRICTIVE],
        parent: { id: 'fac', parentId: null, accessRules: [FACULTATIVE] },
      },
    },
  ];
}

function service(lignes: unknown[]) {
  const findMany = vi.fn(async () => lignes);
  return { svc: new AccessControlService({ collectionTitle: { findMany } } as never), findMany };
}

describe('⚠ La lecture en ligne ET la licence hors-ligne — la décision la plus grave', () => {
  it('un document dans une sous-collection RESTRICTIVE est refusé', async () => {
    // Sous héritage, la faculté ouvrirait ce document. Et ce refus-ci ne garde
    // pas seulement un écran : `offline-licenses.service` décide sur le même
    // `granted`. Une licence émise à tort ne se rappelle pas.
    const { svc } = service(liens());

    const statut = await svc.getRecordAccessStatus(dbSansEmbargo, CTX, 'rec-1');

    expect(statut.granted).toBe(false);
    // Le refus s'explique, il ne se tait pas.
    if (!statut.granted) expect(statut.message).toBeTruthy();
  });

  it('⚠ même avec les règles de l’ANCÊTRE chargées, la décision les IGNORE', async () => {
    // Le cas qui rend une décision fautive détectable : le parent arrive avec
    // ses règles permissives, comme le ferait un `include` élargi. La décision
    // ne doit regarder que les règles PROPRES de la collection.
    const { svc } = service(liensAvecParentCharge());

    expect((await svc.getRecordAccessStatus(dbSansEmbargo, CTX, 'rec-1')).granted).toBe(false);
    expect(await svc.canAccessTitle(CTX, 'titre-1')).toBe(false);
  });

  it('le même document, avec une règle qui l’autorise LUI, est accordé', async () => {
    const ouverts = [
      { collection: { id: 'theses', parentId: 'fac', accessRules: [
        { tenantId: 't1', className: 'L1_DROIT', subscriptionTier: null },
      ] } },
    ];
    expect((await service(ouverts).svc.getRecordAccessStatus(dbSansEmbargo, CTX, 'rec-1')).granted).toBe(true);
  });

  it('`canAccessTitle` refuse aussi — la troisième porte est gardée', async () => {
    const { svc } = service(liens());
    expect(await svc.canAccessTitle(CTX, 'titre-1')).toBe(false);
  });

  it('⚠ et la REQUÊTE de ces deux méthodes ne remonte pas l’arbre non plus', async () => {
    const { svc, findMany } = service(liens());
    await svc.getRecordAccessStatus(dbSansEmbargo, CTX, 'rec-1');

    const where = JSON.stringify(
      (findMany.mock.calls[0] as unknown as [{ where: unknown }])[0].where,
    );
    expect(where).toContain('accessRules');
    for (const mot of ['parent', 'children', 'OR']) {
      expect(where, `la requête ne doit pas mentionner « ${mot} »`).not.toContain(mot);
    }
  });
});
