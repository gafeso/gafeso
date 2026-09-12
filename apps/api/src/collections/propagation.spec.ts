import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { planifierPropagation } from './propagation';
import { AccessControlService } from '../access-control/access-control.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';

/**
 * LA PROPAGATION EXPLICITE — compensateur du non-héritage. P6-1 bis.
 *
 * Deux exigences commandent ce lot, et ce fichier les éprouve toutes deux :
 *  1. elle LISTE ce qu'elle va toucher AVANT d'écrire ;
 *  2. elle passe au JOURNAL D'AUDIT — un élargissement de droits sans trace est
 *     ce que ce dépôt corrige depuis deux jours.
 */

// Faculté ── Département ── Thèses, et une branche d'une AUTRE école.
const NOEUDS = [
  { id: 'fac', parentId: null, nom: 'Faculté de Droit', tenantId: 't1' },
  { id: 'dep', parentId: 'fac', nom: 'Département Privé', tenantId: 't1' },
  { id: 'theses', parentId: 'dep', nom: 'Thèses', tenantId: 't1' },
  { id: 'autre-ecole', parentId: 'fac', nom: 'Branche école B', tenantId: 't2' },
  { id: 'partagee', parentId: 'fac', nom: 'Collection partagée', tenantId: null },
];
const L1 = { tenantId: 't1', className: 'L1_DROIT', subscriptionTier: null };

describe('Le PLAN — ce que la propagation ferait', () => {
  it('les deux descendantes de l’école reçoivent la règle, et le total est dit', () => {
    const plan = planifierPropagation({
      noeuds: NOEUDS,
      regles: [{ collectionId: 'fac', ...L1 }],
      sourceId: 'fac',
      tenantId: 't1',
    });

    expect(plan.reglesSource).toEqual([{ ...L1 }]);
    // `dep`, `theses` et la collection partagée (tenantId null) — pas l'école B.
    expect(plan.destinations.map((d) => d.collectionId).sort()).toEqual([
      'dep',
      'partagee',
      'theses',
    ]);
    // ⚠ LE CHIFFRE QUI COMPTE : combien de règles seront écrites.
    expect(plan.reglesAEcrire).toBe(3);
  });

  it('⚠ une descendante d’une AUTRE école est écartée, AVEC SON MOTIF', () => {
    // La hiérarchie vit dans la table publique : rien n'empêche
    // structurellement qu'un arbre traverse deux écoles, et propager y
    // donnerait à l'école A un droit sur le contenu de l'école B.
    //
    // ⚠ Écartée AVEC son motif, pas en silence : une omission muette ferait
    // croire que la propagation a couvert tout l'arbre.
    const plan = planifierPropagation({
      noeuds: NOEUDS,
      regles: [{ collectionId: 'fac', ...L1 }],
      sourceId: 'fac',
      tenantId: 't1',
    });

    expect(plan.ecartees).toEqual([
      { collectionId: 'autre-ecole', nom: 'Branche école B', motif: 'appartient à un autre établissement' },
    ]);
    expect(plan.destinations.map((d) => d.collectionId)).not.toContain('autre-ecole');
  });

  it('⚠ une sous-collection qui porte ses PROPRES règles est ÉPARGNÉE, et nommée', () => {
    // TROISIÈME CAS, tranché le 12 septembre 2026. Ma première écriture ne le
    // distinguait pas : elle AJOUTAIT les règles de la source par-dessus les
    // siennes. Rien n'était écrasé — les règles d'accès sont un OU de
    // permissions — et c'est précisément ce qui rendait le défaut retors : une
    // collection restreinte exprès gardait sa règle restrictive, VISIBLE, et
    // n'était plus restreinte du tout.
    const plan = planifierPropagation({
      noeuds: NOEUDS,
      regles: [
        { collectionId: 'fac', ...L1 },
        // `dep` a SA règle, différente : un choix délibéré d'administrateur.
        { collectionId: 'dep', tenantId: 't1', className: 'M2_DROIT', subscriptionTier: null },
      ],
      sourceId: 'fac',
      tenantId: 't1',
    });

    expect(plan.destinations.map((d) => d.collectionId)).not.toContain('dep');
    expect(plan.epargnees).toEqual([
      {
        collectionId: 'dep',
        nom: 'Département Privé',
        reglesPropres: 1,
        motif: 'porte déjà ses propres règles d’accès',
      },
    ]);
    // Seules `theses` et la partagée reçoivent.
    expect(plan.reglesAEcrire).toBe(2);
  });

  it('⚠ une règle IDENTIQUE épargne aussi — relancer n’ajoute rien', () => {
    // L'idempotence est désormais un cas particulier de l'épargne : une
    // collection déjà pourvue porte ses propres règles, donc on n'y touche pas.
    const plan = planifierPropagation({
      noeuds: NOEUDS,
      regles: [
        { collectionId: 'fac', ...L1 },
        { collectionId: 'dep', ...L1 },
      ],
      sourceId: 'fac',
      tenantId: 't1',
    });
    expect(plan.epargnees.map((e) => e.collectionId)).toEqual(['dep']);
    expect(plan.reglesAEcrire).toBe(2);
  });

  it('⚠ les règles d’une AUTRE école n’épargnent pas — cette école n’a rien décidé ici', () => {
    // Une collection partagée peut porter les règles de l'école B. Pour
    // l'école A, elle reste vierge : l'épargner reviendrait à lui prêter une
    // décision qu'elle n'a pas prise.
    const plan = planifierPropagation({
      noeuds: NOEUDS,
      regles: [
        { collectionId: 'fac', ...L1 },
        { collectionId: 'partagee', tenantId: 't2', className: null, subscriptionTier: null },
      ],
      sourceId: 'fac',
      tenantId: 't1',
    });
    expect(plan.epargnees).toEqual([]);
    expect(plan.destinations.map((d) => d.collectionId).sort()).toEqual([
      'dep',
      'partagee',
      'theses',
    ]);
  });

  it('une collection SANS règle ne propage rien, et le plan le dit', () => {
    const plan = planifierPropagation({
      noeuds: NOEUDS,
      regles: [],
      sourceId: 'fac',
      tenantId: 't1',
    });
    expect(plan.reglesSource).toEqual([]);
    expect(plan.reglesAEcrire).toBe(0);
    // Les destinations sont tout de même listées : « rien à propager » et
    // « aucune sous-collection » sont deux réponses différentes.
    expect(plan.destinations.length).toBe(3);
    expect(plan.epargnees).toEqual([]);
  });

  it('une feuille n’a aucune destination', () => {
    const plan = planifierPropagation({
      noeuds: NOEUDS,
      regles: [{ collectionId: 'theses', ...L1 }],
      sourceId: 'theses',
      tenantId: 't1',
    });
    expect(plan.destinations).toEqual([]);
    expect(plan.reglesAEcrire).toBe(0);
  });
});

describe('⚠ L’ÉCRITURE ET SA TRACE SONT ATOMIQUES', () => {
  function service(options: { auditEchoue?: boolean } = {}) {
    const createMany = vi.fn().mockResolvedValue({ count: 3 });
    const auditCreate = vi.fn(async () => {
      if (options.auditEchoue) throw new Error('journal indisponible');
      return {};
    });
    const prisma = {
      collection: {
        findUnique: vi.fn().mockResolvedValue({ id: 'fac', tenantId: 't1', type: 'INTERNAL' }),
        findMany: vi.fn().mockResolvedValue(
          NOEUDS.map((n) => ({ id: n.id, parentId: n.parentId, name: n.nom, tenantId: n.tenantId })),
        ),
      },
      accessRule: { findMany: vi.fn().mockResolvedValue([{ collectionId: 'fac', ...L1 }]) },
      $transaction: vi.fn(async (travail: (tx: unknown) => Promise<unknown>) =>
        travail({ accessRule: { createMany }, auditLog: { create: auditCreate } }),
      ),
    };
    return {
      svc: new AccessControlService(prisma as never),
      createMany,
      auditCreate,
      prisma,
    };
  }

  const ACTEUR = { id: 'u1', email: 'admin@exemple.bf', role: 'ADMIN', ip: '10.0.0.1' };

  it('les règles et l’entrée d’audit passent par la MÊME transaction', async () => {
    const { svc, createMany, auditCreate, prisma } = service();

    const resultat = await svc.propagerRegles('fac', 't1', ACTEUR);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(resultat.ecrites).toBe(3);
  });

  it('⚠ l’audit NOMME les collections touchées — sinon la trace ne permet pas de défaire', async () => {
    const { svc, auditCreate } = service();
    await svc.propagerRegles('fac', 't1', ACTEUR);

    const entree = auditCreate.mock.calls[0] as unknown as [
      {
        data: {
          action: string;
          targetId: string;
          actorEmail: string;
          metadata: Record<string, unknown>;
        };
      },
    ];
    const { data } = entree[0];
    expect(data.action).toBe(AUDIT_ACTIONS.COLLECTION_RULES_PROPAGATE);
    expect(data.targetId).toBe('fac');
    expect(data.actorEmail).toBe('admin@exemple.bf');
    expect(data.metadata.reglesEcrites).toBe(3);
    const noms = (data.metadata.destinations as { nom: string }[]).map((d) => d.nom);
    expect(noms.sort()).toEqual(['Collection partagée', 'Département Privé', 'Thèses']);
    // ⚠ La trace porte aussi les épargnées et les écartées : une propagation
    // qui a sauté des sous-collections n'a pas fait ce que son nom dit, et
    // relire l'audit dans six mois doit le montrer.
    expect(data.metadata).toHaveProperty('epargnees');
    expect(data.metadata).toHaveProperty('ecartees');
  });

  it('⚠ si la TRACE échoue, l’opération ÉCHOUE — rien n’est élargi en silence', async () => {
    // Le cœur de la seconde exigence. Le motif ailleurs dans ce dépôt est
    // `void this.audit.log(...)`, et `AuditService.log` avale de surcroît son
    // propre échec. Pour une action ordinaire c'est le bon compromis ; pour un
    // ÉLARGISSEMENT DE DROITS, « laisse une trace » ne peut pas vouloir dire
    // « probablement ».
    const { svc } = service({ auditEchoue: true });

    await expect(svc.propagerRegles('fac', 't1', ACTEUR)).rejects.toThrow(/journal indisponible/);
  });

  it('rien à écrire → AUCUNE transaction, AUCUNE trace', async () => {
    // Il n'y a pas eu d'élargissement : une entrée d'audit affirmerait un
    // geste qui n'a pas eu lieu.
    const { svc, prisma } = service();
    prisma.accessRule.findMany.mockResolvedValue([]); // la source n'a pas de règle

    const resultat = await svc.propagerRegles('fac', 't1', ACTEUR);

    expect(resultat.ecrites).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('⚠ elle ne passe PAS par AuditService.log, qui rattraperait l’erreur', () => {
    // Assertion de STRUCTURE, et elle est nécessaire : un futur refactor qui
    // « harmoniserait » cette action sur le motif `void this.audit.log(...)`
    // rétablirait le silence sans faire tomber les tests de comportement —
    // la doublure d'audit continuerait d'être appelée.
    const source = readFileSync(
      join(__dirname, '..', 'access-control', 'access-control.service.ts'),
      'utf8',
    );
    const bloc = source.slice(
      source.indexOf('async propagerRegles'),
      source.indexOf('LIBELLÉ d’un document local'),
    );
    expect(bloc).toContain('tx.auditLog.create');
    expect(bloc).not.toContain('this.audit.log');
  });
});
