import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DepotsService } from './depots.service';
import { ETAT_INITIAL, enAttenteDeCatalogage, refusDeTransition } from './etats';
import { FONCTIONS } from '../auth/functions';

/**
 * LE CIRCUIT DE DÉPÔT — P6-2.
 *
 * Quatre états, trois métiers, et deux propriétés qui portent le lot :
 *  · la NOTICE naît au catalogage, pas au dépôt (protège I1) ;
 *  · `depot.valider` est AUTO-PORTÉE : un directeur ne voit que SES dépôts.
 */

const DEPOT = {
  id: 'd1',
  status: ETAT_INITIAL,
  depositorId: 'etudiant',
  directorId: 'directeur',
  authorName: 'Ouédraogo, Salif',
  title: 'Le droit foncier rural',
  recordId: null as string | null,
  refusalReason: null as string | null,
  // ⚠ Un dépôt sans document ne peut plus être soumis (garde ajouté avec le
  // téléversement) : le jeu d'essai par défaut en porte donc un.
  fileKey: 'd1/1757600000000-memoire.pdf',
  fileFormat: 'PDF',
  fileName: 'memoire.pdf',
  fileSize: 1024,
  encObjectKey: 'd1/enc/1757600000000.gafs',
  encWrappedCek: 'cek-enveloppee',
  encSegSize: 16384,
  encAlgo: 'aead-seg-gcm-16k/v1',
  encStatus: 'ready',
  encError: null as string | null,
  xrefValidatedAt: new Date('2026-09-12T10:00:00Z'),
  encryptedAt: new Date('2026-09-12T10:00:01Z'),
};

function service(depot: Partial<typeof DEPOT> = {}, mailIssue: unknown = { sent: true }) {
  const courant = { ...DEPOT, ...depot };
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...courant,
    ...data,
  }));
  const db = {
    deposit: {
      findUnique: vi.fn(async () => courant),
      findMany: vi.fn(async () => [courant]),
      create: vi.fn(async ({ data }: { data: unknown }) => ({ id: 'neuf', ...(data as object) })),
      update,
    },
    user: {
      // ⚠ LA DOUBLURE REND UN COMPTE COMPLET, ET C'EST NÉCESSAIRE DEPUIS QUE LA
      // GARDE EXIGE `depot.valider`. Elle rendait `{ id, email }` : assez pour
      // « le compte existe », plus assez pour « cette personne peut diriger ».
      // Un jeu d'essai qui n'atteint pas la décision ne l'éprouve pas — c'est
      // la cinquième lecture d'une mutation qui ne casse rien, et ici c'est le
      // garde neuf qui l'a signalée le jour même.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'inconnu') return null;
        if (where.id === 'camarade') {
          // Un étudiant ordinaire : il existe, il ne dirige rien.
          return {
            id: where.id,
            email: `${where.id}@exemple.bf`,
            firstName: 'Moussa',
            lastName: 'Zongo',
            status: 'ACTIVE',
            role: 'STUDENT',
            customRole: null,
          };
        }
        return {
          id: where.id,
          email: `${where.id}@exemple.bf`,
          firstName: 'Awa',
          lastName: 'Traoré',
          status: 'ACTIVE',
          role: 'STUDENT',
          customRole: { functions: [FONCTIONS.DEPOT_VALIDER] },
        };
      }),
    },
    digitalCopy: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    // ⚠ La doublure EXÉCUTE la transaction au lieu de la simuler : le
    // rattachement écrit la copie numérique ET le dépôt ensemble, et un
    // `$transaction` qui ne ferait rien rendrait ce test aveugle sur la moitié
    // de ce qu'il vérifie.
    $transaction: vi.fn(async (travail: (tx: unknown) => Promise<unknown>) =>
      travail({
        digitalCopy: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
        deposit: { update },
      }),
    ),
  } as never;
    // ⚠ LES TROIS ENVOIS DU CIRCUIT. `valider` et `refuser` n'en faisaient AUCUN :
  // l'étudiant n'apprenait la décision qu'en revenant de lui-même sur son
  // écran. La doublure les porte tous les trois pour que le jour où l'un
  // disparaît, c'est un test qui le dise — pas un étudiant.
  const mail = {
    sendDepositSubmitted: vi.fn().mockResolvedValue(mailIssue),
    sendDepositApproved: vi.fn().mockResolvedValue(mailIssue),
    sendDepositRefused: vi.fn().mockResolvedValue(mailIssue),
    sendDepositWithdrawn: vi.fn().mockResolvedValue(mailIssue),
  };
  // Stockage et ingestion : doublures inertes pour les cas qui ne téléversent
  // pas. Le téléversement a ses propres tests, avec des doublures qui parlent.
  const storage = { putObject: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) };
  const ingestion = { ingestPdf: vi.fn() };
  return {
    svc: new DepotsService(mail as never, storage as never, ingestion as never),
    db,
    update,
    mail,
    storage,
    ingestion,
  };
}

describe('Les transitions, et qui les fait', () => {
  it('l’étudiant soumet son brouillon', () => {
    expect(refusDeTransition('brouillon', 'soumis', 'deposant')).toBeNull();
  });

  it('⚠ un ÉTUDIANT ne peut pas valider — le refus nomme qui peut', () => {
    expect(refusDeTransition('soumis', 'valide', 'deposant')).toMatch(/directeur/);
  });

  it('⚠ un dépôt REFUSÉ n’accepte plus rien — la décision d’un directeur ne s’efface pas', () => {
    // Le rouvrir effacerait sa décision. Un étudiant qui veut redéposer crée un
    // NOUVEAU dépôt, et les deux subsistent.
    for (const vers of ['soumis', 'valide'] as const) {
      expect(refusDeTransition('refuse', vers, 'deposant')).toMatch(/n'accepte plus/);
    }
  });

  it('⚠ le refus DIT l’état courant, pas « transition invalide »', () => {
    // « Transition invalide » enverrait chercher une faute de saisie ; « ce
    // dépôt est déjà validé » se comprend.
    expect(refusDeTransition('valide', 'valide', 'directeur')).toMatch(/« valide »/);
  });
});

describe('⚠ La NOTICE naît au catalogage — c’est ce qui protège I1', () => {
  it('valider ne crée AUCUNE notice', async () => {
    // `BiblioRecord.id` est le `docId` des licences hors-ligne signées déjà
    // déployées. Un dépôt refusé ne doit laisser aucun identifiant mort-né dans
    // la table que ces licences indexent.
    const { svc, db, update } = service({ status: 'soumis' });

    const { depot: valide } = await svc.valider(db, 'd1', 'directeur');

    expect(valide.status).toBe('valide');
    expect(update.mock.calls[0][0].data).not.toHaveProperty('recordId');
    expect(valide.recordId).toBeNull();
  });

  it('un dépôt validé est « en attente de catalogage », et le prédicat est nommé', () => {
    expect(enAttenteDeCatalogage({ status: 'valide', recordId: null })).toBe(true);
    expect(enAttenteDeCatalogage({ status: 'valide', recordId: 'rec-1' })).toBe(false);
    expect(enAttenteDeCatalogage({ status: 'soumis', recordId: null })).toBe(false);
  });

  it('le bibliothécaire rattache la notice qu’il a créée ailleurs', async () => {
    const { svc, db } = service({ status: 'valide' });
    const lie = await svc.rattacherNotice(db, 'd1', 'rec-1');
    expect(lie.recordId).toBe('rec-1');
  });

  it('⚠ on ne catalogue pas un dépôt non validé, et le refus le DIT', async () => {
    const { svc, db } = service({ status: 'soumis' });
    await expect(svc.rattacherNotice(db, 'd1', 'rec-1')).rejects.toThrow(/« soumis »/);
  });

  it('un dépôt déjà catalogué ne se recatalogue pas', async () => {
    const { svc, db } = service({ status: 'valide', recordId: 'rec-1' });
    await expect(svc.rattacherNotice(db, 'd1', 'rec-2')).rejects.toThrow(/déjà une notice/);
  });
});

describe('⚠ AUTO-PORTAGE : un directeur ne voit et ne décide que sur SES dépôts', () => {
  it('la liste à valider filtre sur le directeur ET l’état', async () => {
    // C'est ce qui rend `depot.valider` acceptable comme élargissement : on
    // gagne l'accès à des données SUR SOI. Propriété testée, pas déclarée.
    const { svc, db } = service();
    await svc.aValider(db, 'directeur');

    const where = (db as unknown as { deposit: { findMany: ReturnType<typeof vi.fn> } })
      .deposit.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ directorId: 'directeur', status: 'soumis' });
  });

  it('⚠ valider le dépôt d’un COLLÈGUE rend « introuvable », pas « interdit »', async () => {
    // Un 403 dirait à un enseignant qu'un dépôt existe sous cet identifiant et
    // qu'un collègue le dirige. Ce n'est pas son affaire.
    const { svc, db } = service({ status: 'soumis', directorId: 'un-collegue' });

    await expect(svc.valider(db, 'd1', 'directeur')).rejects.toThrow(NotFoundException);
    await expect(svc.refuser(db, 'd1', 'directeur', 'motif')).rejects.toThrow(NotFoundException);
  });

  it('⚠ soumettre le dépôt d’un autre rend « introuvable », par SYMÉTRIE', async () => {
    // Aligné le 12 septembre 2026 sur le refus du directeur : un 403 dirait à
    // un étudiant qu'un dépôt existe sous cet identifiant et qu'il appartient à
    // quelqu'un d'autre. Sans la symétrie, un des deux chemins fuirait ce que
    // l'autre protège.
    const { svc, db } = service({ depositorId: 'quelqu-un-d-autre' });
    await expect(svc.soumettre(db, 'd1', 'etudiant')).rejects.toThrow(NotFoundException);
  });
});

describe('Le refus conserve tout, et exige son motif', () => {
  it('⚠ un refus SANS motif est refusé — sinon l’étudiant ne sait pas quoi reprendre', async () => {
    const { svc, db } = service({ status: 'soumis' });
    await expect(svc.refuser(db, 'd1', 'directeur', '   ')).rejects.toThrow(/motif/);
  });

  it('le motif est conservé, et rien n’est supprimé', async () => {
    const { svc, db, update } = service({ status: 'soumis' });

    const { depot: refuse } = await svc.refuser(db, 'd1', 'directeur', 'Version non soutenue.');

    expect(refuse.status).toBe('refuse');
    expect(refuse.refusalReason).toBe('Version non soutenue.');
    // Aucune suppression : ni `delete`, ni effacement du fichier.
    expect(Object.keys(update.mock.calls[0][0].data)).not.toContain('fileKey');
  });
});

describe('⚠ La notification DIT la vérité sur son envoi', () => {
  it('soumettre rend l’issue de l’envoi, jamais un « envoyé » écrit en dur', async () => {
    const { svc, db } = service({ status: 'brouillon' }, { sent: false, reason: 'smtp_absent' });

    const { depot, notification } = await svc.soumettre(db, 'd1', 'etudiant');

    expect(depot.status).toBe('soumis');
    expect(notification).toEqual({ sent: false, reason: 'smtp_absent' });
  });

  it('⚠ et un échec d’envoi ne fait PAS échouer la soumission', async () => {
    // Le dépôt est soumis, il apparaît dans la liste du directeur, et le
    // circuit reste utilisable sans messagerie. L'écran peut dire « soumis,
    // mais votre directeur n'a pas été prévenu ».
    const { svc, db } = service({ status: 'brouillon' }, { sent: false, reason: 'smtp_error' });
    const { depot } = await svc.soumettre(db, 'd1', 'etudiant');
    expect(depot.submittedAt).toBeInstanceOf(Date);
  });

  it('sans directeur désigné, on ne peut pas soumettre — et le refus le dit', async () => {
    const { svc, db, mail } = service({ status: 'brouillon', directorId: null as never });
    await expect(svc.soumettre(db, 'd1', 'etudiant')).rejects.toThrow(/directeur/);
    expect(mail.sendDepositSubmitted).not.toHaveBeenCalled();
  });
});

describe('La création', () => {
  it('⚠ un directeur sans compte est refusé à la CRÉATION, pas découvert plus tard', async () => {
    // Sans cette vérification, le dépôt existerait avec un directeur que
    // personne ne peut incarner : l'étudiant attendrait indéfiniment sans que
    // rien ne le dise.
    const { svc, db } = service();
    await expect(
      svc.creer(db, 'etudiant', {
        title: 'T',
        authorName: 'A',
        documentType: 'these',
        directorId: 'inconnu',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('⚠ un CAMARADE est refusé aussi — il existe, il ne peut pas diriger', async () => {
    // Le compte existe : l'ancienne garde le laissait passer, et le dépôt
    // restait « soumis » pour toujours — invisible du camarade, qui n'a pas
    // `depot.valider`, et invisible du bibliothécaire, qui ne voit que les
    // dépôts validés. Rien n'échouait, rien ne se passait.
    const { svc, db } = service();
    await expect(
      svc.creer(db, 'etudiant', {
        title: 'T',
        authorName: 'A',
        documentType: 'these',
        directorId: 'camarade',
      }),
    ).rejects.toThrow(/ne peut pas diriger/i);
  });

  it('le dépôt naît en brouillon, et le déposant est l’appelant', async () => {
    const { svc, db } = service();
    const cree = await svc.creer(db, 'etudiant', {
      title: '  Le droit foncier  ',
      authorName: 'Ouédraogo, Salif',
      documentType: 'these',
      directorId: 'directeur',
    });
    expect(cree.status).toBe(ETAT_INITIAL);
    expect(cree.depositorId).toBe('etudiant');
    expect(cree.title).toBe('Le droit foncier');
  });
});
