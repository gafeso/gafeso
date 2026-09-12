import { describe, expect, it, vi } from 'vitest';
import { AccessControlService } from './access-control.service';
import { sousEmbargo } from './access-control.matching';
import { COLONNES_SERVIES } from '../opac/contrat-notice-publique';
import { CLASSEMENT_NOTICE } from '../cataloging/notice-gafeso';

/**
 * L'EMBARGO — P6-4. Métadonnées visibles, fichier non, levée automatique.
 *
 * ## Trois décisions, et chacune a son motif
 *
 * 1. **Une DATE, pas un drapeau.** « Un embargo qu'il faut penser à lever ne se
 *    lève jamais. » La levée est une COMPARAISON : aucune tâche planifiée, donc
 *    rien qui puisse ne pas tourner.
 * 2. **Au point de décision, pas dans une liste de surfaces.** Une liste aurait
 *    dû être complétée à chaque surface nouvelle, et la manquante aurait été la
 *    dernière écrite — celle que personne ne relit.
 * 3. **AVANT les règles de classe.** L'embargo ne dépend pas de qui demande :
 *    évaluer la classe d'abord produirait « réservé aux M2 » pour une thèse que
 *    même un M2 ne peut pas lire — un refus exact et trompeur.
 */

const LEVEE = new Date('2027-01-01T00:00:00Z');
const CTX = { tenantId: 't1', className: 'L1_DROIT', subscriptionTier: 'gratuit' };

function service(embargoUntil: Date | null) {
  const db = {
    biblioRecord: { findUnique: vi.fn(async () => ({ embargoUntil })) },
  } as never;
  const prisma = {
    collectionTitle: {
      findMany: vi.fn(async () => [
        {
          collection: {
            id: 'c1',
            accessRules: [{ tenantId: 't1', className: 'L1_DROIT', subscriptionTier: null }],
          },
        },
      ]),
    },
  };
  return { svc: new AccessControlService(prisma as never), db };
}

describe('La levée est une COMPARAISON, pas un état', () => {
  it('la veille : sous embargo', () => {
    expect(sousEmbargo(LEVEE, new Date('2026-12-31T23:59:59Z'))).toBe(true);
  });

  it('⚠ À LA SECONDE EXACTE : LIBRE', () => {
    // Borne délibérément exclusive : « jusqu'au 1er janvier » se comprend comme
    // « libre le 1er janvier ». Une borne inclusive ferait durer l'embargo un
    // instant de trop, et ce serait invisible.
    expect(sousEmbargo(LEVEE, LEVEE)).toBe(false);
  });

  it('après : libre', () => {
    expect(sousEmbargo(LEVEE, new Date('2027-01-01T00:00:01Z'))).toBe(false);
  });

  it('sans date : jamais sous embargo', () => {
    expect(sousEmbargo(null, new Date())).toBe(false);
    expect(sousEmbargo(undefined, new Date())).toBe(false);
  });

  it('⚠ aucune tâche planifiée n’est nécessaire — c’est le point', () => {
    // La même notice, la même donnée en base, deux instants : la réponse change
    // toute seule. Rien à lever, donc rien qui puisse être oublié.
    expect(sousEmbargo(LEVEE, new Date('2026-06-01'))).toBe(true);
    expect(sousEmbargo(LEVEE, new Date('2027-06-01'))).toBe(false);
  });
});

describe('⚠ La DÉCISION : le fichier est refusé, et le refus DIT pourquoi', () => {
  it('sous embargo : refusé, avec la date dans le message', async () => {
    const { svc, db } = service(LEVEE);

    const statut = await svc.getRecordAccessStatus(db, CTX, 'rec-1', new Date('2026-09-12'));

    expect(statut.granted).toBe(false);
    if (!statut.granted) {
      expect(statut.code).toBe('EMBARGO');
      // ⚠ Le message porte la DATE : « pourquoi ? » a sa réponse avant qu'on la
      // pose, et le lecteur ne conclut pas à une panne.
      expect(statut.message).toMatch(/01\/01\/2027/);
      expect(statut.message).toMatch(/description reste consultable/);
    }
  });

  it('⚠ l’embargo prime sur la RÈGLE, même quand la classe correspond', async () => {
    // L'étudiant est en L1_DROIT et la collection autorise L1_DROIT : sans
    // embargo, l'accès serait accordé. C'est ce qui prouve que la décision
    // passe AVANT les règles.
    const { svc, db } = service(LEVEE);
    expect((await svc.getRecordAccessStatus(db, CTX, 'rec-1', new Date('2026-09-12'))).granted)
      .toBe(false);

    const libre = service(null);
    expect((await libre.svc.getRecordAccessStatus(libre.db, CTX, 'rec-1')).granted).toBe(true);
  });

  it('embargo LEVÉ : l’accès redevient celui des règles, sans intervention', async () => {
    const { svc, db } = service(LEVEE);
    const apres = await svc.getRecordAccessStatus(db, CTX, 'rec-1', new Date('2027-06-01'));
    expect(apres.granted).toBe(true);
  });
});

describe('⚠ Les MÉTADONNÉES restent visibles — c’est la moitié de l’embargo', () => {
  it('la date est SERVIE par le contrat public', () => {
    // Une notice dont le fichier refuse SANS DIRE POURQUOI serait le faux
    // silencieux qu'on corrige partout ailleurs : le lecteur conclurait à une
    // panne et réessaierait.
    expect(COLONNES_SERVIES).toContain('embargoUntil');
  });

  it('⚠ elle est classée dans sa PROPRE couche, ni noyau ni profil', () => {
    // Le noyau et les profils DÉCRIVENT le document ; celui-ci dit à partir de
    // quand le fichier s'ouvre. Une thèse sous embargo et la même thèse
    // libérée sont le même document, décrit à l'identique.
    expect(CLASSEMENT_NOTICE.acces).toContain('embargoUntil');
    for (const couche of ['noyau', 'profilAcademique', 'description']) {
      expect(CLASSEMENT_NOTICE[couche], couche).not.toContain('embargoUntil');
    }
  });
});

describe('⚠ LA LICENCE HORS-LIGNE — la surface qui ne se rattrape pas', () => {
  /**
   * ⚠ SEULE SURFACE OÙ LE CONTOURNEMENT `document.lire` EST ÉCARTÉ, et c'est
   * une décision prise seule, rapportée, et réversible en quatre lignes.
   *
   * Lire une thèse sous embargo EN LIGNE est le métier d'un bibliothécaire : il
   * la catalogue, il vérifie que le fichier est le bon. L'emporter HORS LIGNE
   * est autre chose — le téléphone garde le blob ET la clé pour toute la durée
   * du bail, et une licence émise ne se rappelle pas. L'OPAC se referme au
   * rechargement suivant ; un appareil, non.
   */
  async function droit(embargoUntil: Date | null, avecDocumentLire: boolean) {
    const { OfflineLicensesService } = await import(
      '../offline-licensing/offline-licenses.service'
    );
    const db = {
      biblioRecord: { findUnique: vi.fn(async () => ({ embargoUntil })) },
      user: { findUnique: vi.fn(async () => ({ className: 'L1_DROIT', subscriptionTier: 'gratuit' })) },
    } as never;
    // Ordre du constructeur : prisma, authz, access, keys, audit, storage.
    const svc = new OfflineLicensesService(
      {} as never,
      { hasFunction: vi.fn(async () => avecDocumentLire) } as never,
      {
        buildStudentContext: vi.fn(async () => CTX),
        getRecordAccessStatus: vi.fn(async () => ({ granted: true })),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    // `hasAccess` est privée : on l'atteint par son nom, c'est elle qu'on éprouve.
    return (svc as unknown as {
      hasAccess: (db: unknown, t: unknown, u: string, r: string) => Promise<boolean>;
    }).hasAccess(db, { id: 't1' }, 'u1', 'rec-1');
  }

  it('⚠ le PERSONNEL n’emporte pas une thèse sous embargo hors ligne', async () => {
    expect(await droit(LEVEE, true)).toBe(false);
  });

  it('sans embargo, le personnel garde son accès hors ligne', async () => {
    expect(await droit(null, true)).toBe(true);
  });

  it('un étudiant non plus, évidemment', async () => {
    expect(await droit(LEVEE, false)).toBe(false);
  });

  it('embargo levé : tout le monde retrouve son droit', async () => {
    expect(await droit(new Date('2020-01-01'), true)).toBe(true);
  });
});
