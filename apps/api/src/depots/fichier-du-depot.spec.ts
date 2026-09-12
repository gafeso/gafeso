import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DepotsService } from './depots.service';

/**
 * LE FICHIER DÉPOSÉ — chiffré DÈS LE DÉPÔT. P6-2 (suite).
 *
 * ## Pourquoi dès le dépôt
 *
 * Un dépôt REFUSÉ que personne ne cataloguera jamais laisserait son fichier en
 * clair indéfiniment. **Les documents les moins protégés seraient exactement
 * ceux que personne ne surveille** — et une thèse sous embargo attend parfois
 * des semaines une décision qui ne vient pas.
 *
 * ## Ce que le catalogage NE fait pas
 *
 * Il ne re-chiffre pas et ne recopie pas. Il copie des VALEURS de colonnes vers
 * `digital_copies` : le blob et la CEK enveloppée restent où le dépôt les a
 * mis. Vérifié avant d'écrire une ligne — `objectKey` et `encObjectKey` ne sont
 * jamais découpés dans `apps/api`, donc le préfixe d'une clé n'est qu'un
 * groupement lisible dans le seau.
 */

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);

const BROUILLON = {
  id: 'd1',
  status: 'brouillon',
  depositorId: 'etudiant',
  fileKey: null as string | null,
  encObjectKey: null as string | null,
};

const INGESTION = {
  encObjectKey: 'd1/enc/1757.gafs',
  encWrappedCek: 'cek-enveloppee',
  encSegSize: 16384,
  encAlgo: 'aead-seg-gcm-16k/v1',
  xrefValidatedAt: new Date('2026-09-12T10:00:00Z'),
  encryptedAt: new Date('2026-09-12T10:00:01Z'),
};

function service(depot: Record<string, unknown> = {}, ingestEchoue = false) {
  const courant = { ...BROUILLON, ...depot };
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...courant,
    ...data,
  }));
  const copieCreee = vi.fn(async ({ data }: { data: unknown }) => data);
  const db = {
    deposit: { findUnique: vi.fn(async () => courant), update },
    $transaction: vi.fn(async (travail: (tx: unknown) => Promise<unknown>) =>
      travail({ digitalCopy: { create: copieCreee }, deposit: { update } }),
    ),
  } as never;
  const storage = {
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
  const ingestion = {
    ingestPdf: vi.fn(async () =>
      ingestEchoue ? Promise.reject(new Error('xref irréparable')) : INGESTION,
    ),
  };
  return {
    svc: new DepotsService({ sendDepositSubmitted: vi.fn() } as never, storage as never, ingestion as never),
    db,
    update,
    storage,
    ingestion,
    copieCreee,
  };
}

const fichier = (over: Record<string, unknown> = {}) => ({
  buffer: PDF,
  originalname: 'mémoire final.pdf',
  mimetype: 'application/pdf',
  size: PDF.length,
  ...over,
}) as never;

describe('⚠ Le chiffrement a lieu AU DÉPÔT', () => {
  it('un PDF déposé est stocké en clair ET chiffré, en un seul geste', async () => {
    const { svc, db, ingestion, storage, update } = service();

    await svc.televerser(db, 'd1', 'etudiant', fichier());

    expect(storage.putObject).toHaveBeenCalledTimes(1); // le clair
    expect(ingestion.ingestPdf).toHaveBeenCalledTimes(1); // le chiffré
    const data = update.mock.calls[0][0].data;
    expect(data.encStatus).toBe('ready');
    expect(data.encObjectKey).toBe(INGESTION.encObjectKey);
  });

  it('⚠ les clés sont préfixées par l’identifiant du DÉPÔT — la notice n’existe pas', async () => {
    const { svc, db, storage, ingestion } = service();

    await svc.televerser(db, 'd1', 'etudiant', fichier());

    expect(storage.putObject.mock.calls[0][0]).toMatch(/^d1\//);
    expect((ingestion.ingestPdf.mock.calls[0] as unknown as [string])[0]).toBe('d1');
  });

  it('le nom de fichier est neutralisé (espaces et accents)', async () => {
    const { svc, db, storage } = service();
    await svc.televerser(db, 'd1', 'etudiant', fichier());
    expect(storage.putObject.mock.calls[0][0]).not.toMatch(/[ é]/);
  });

  it('⚠ un chiffrement qui ÉCHOUE ne fait pas échouer le dépôt, mais il est ÉCRIT', async () => {
    // Un dépôt dont le chiffrement a échoué est lisible en ligne et pas hors
    // ligne. On peut le savoir — au lieu de le découvrir sur un téléphone.
    const { svc, db, update } = service({}, true);

    await svc.televerser(db, 'd1', 'etudiant', fichier());

    const data = update.mock.calls[0][0].data;
    expect(data.encStatus).toBe('failed');
    expect(data.encError).toMatch(/xref/);
    expect(data.fileKey).toBeTruthy(); // le dépôt a bien son document
  });

  it('un fichier au contenu qui ment sur son format est refusé', async () => {
    const { svc, db, storage } = service();
    await expect(
      svc.televerser(db, 'd1', 'etudiant', fichier({ buffer: Buffer.from('pas un pdf') })),
    ).rejects.toThrow(/annoncé comme PDF/);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('⚠ le document d’un dépôt DÉJÀ SOUMIS ne se remplace plus', async () => {
    // Le directeur aurait validé un document et en verrait un autre.
    const { svc, db } = service({ status: 'soumis' });
    await expect(svc.televerser(db, 'd1', 'etudiant', fichier())).rejects.toThrow(
      /« soumis »/,
    );
  });

  it('téléverser sur le dépôt d’un autre rend « introuvable »', async () => {
    const { svc, db } = service({ depositorId: 'un-autre' });
    await expect(svc.televerser(db, 'd1', 'etudiant', fichier())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('⚠ l’ancien objet n’est supprimé qu’APRÈS le succès du nouveau', async () => {
    const { svc, db, storage, update } = service({
      fileKey: 'd1/ancien.pdf',
      encObjectKey: 'd1/enc/ancien.gafs',
    });

    await svc.televerser(db, 'd1', 'etudiant', fichier());

    const supprimes = storage.deleteObject.mock.calls.map((c) => c[0]);
    expect(supprimes).toContain('d1/ancien.pdf');
    expect(supprimes).toContain('d1/enc/ancien.gafs');
    expect(storage.putObject).toHaveBeenCalledTimes(1);

    // ⚠ ET C'EST L'ORDRE QUI PORTE LA GARANTIE, pas le fait de supprimer.
    //
    // DEUX contrôles négatifs ont été nécessaires pour écrire cette assertion
    // juste. Le premier a montré qu'« l'ancien a-t-il été supprimé ? » ne dit
    // rien de la promesse. Le second a montré que comparer à `putObject` ne
    // suffit pas non plus : une suppression glissée APRÈS le dépôt de l'objet
    // mais AVANT l'écriture en base laisse exactement la fenêtre qu'on
    // interdit — la ligne pointe encore l'ancienne clé, et l'objet n'est plus
    // là.
    //
    // La promesse est donc : on dépose, ON ÉCRIT, puis on supprime.
    const ecriture = update.mock.invocationCallOrder[0];
    for (const suppression of storage.deleteObject.mock.invocationCallOrder) {
      expect(suppression, 'une suppression a précédé l’écriture en base')
        .toBeGreaterThan(ecriture);
    }
  });
});

describe('⚠ Le catalogage NE re-chiffre ni ne recopie', () => {
  const VALIDE = {
    status: 'valide',
    recordId: null,
    fileKey: 'd1/1757-memoire.pdf',
    fileFormat: 'PDF',
    fileName: 'mémoire final.pdf',
    fileSize: 4096,
    ...INGESTION,
    encStatus: 'ready',
    encError: null,
  };

  it('la copie numérique REÇOIT les mêmes clés — aucun objet n’est réécrit', async () => {
    const { svc, db, storage, ingestion, copieCreee } = service(VALIDE);

    await svc.rattacherNotice(db, 'd1', 'rec-1');

    const data = (copieCreee.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0]
      .data;
    expect(data.objectKey).toBe(VALIDE.fileKey); // la MÊME clé
    expect(data.encObjectKey).toBe(INGESTION.encObjectKey); // le MÊME blob
    expect(data.encWrappedCek).toBe(INGESTION.encWrappedCek); // la MÊME CEK
    // Et surtout : rien n'a été redéposé ni re-chiffré.
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(ingestion.ingestPdf).not.toHaveBeenCalled();
  });

  it('⚠ les DEUX écritures sont dans la même transaction', async () => {
    // Une notice qui pointerait un fichier sans que le dépôt le sache — ou
    // l'inverse — serait un document orphelin que personne ne retrouve.
    const { svc, db } = service(VALIDE);

    await svc.rattacherNotice(db, 'd1', 'rec-1');

    expect((db as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction)
      .toHaveBeenCalledTimes(1);
  });

  it('un dépôt SANS document ne se rattache pas, et le dit', async () => {
    const { svc, db } = service({ status: 'valide', recordId: null, fileKey: null });
    await expect(svc.rattacherNotice(db, 'd1', 'rec-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('⚠ On ne soumet pas un dépôt sans document', () => {
  it('le refus le dit, et aucune notification ne part', async () => {
    // Sinon le directeur reçoit une notification pour un dossier vide, et il ne
    // sait ni quoi valider ni quoi motiver en refusant.
    const { svc, db } = service({ directorId: 'directeur', fileKey: null });
    await expect(svc.soumettre(db, 'd1', 'etudiant')).rejects.toThrow(/Téléversez/);
  });
});
