import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';

/**
 * LES ÉTUDIANTS ATTENDUS — le fantôme qu'on ne pouvait pas retirer, et le
 * remplacement qui dit avant d'agir.
 *
 * ⚠ L'IMPORT FAIT UN `upsert` PAR MATRICULE. Un matricule saisi de travers crée
 * une ligne SOUS UNE AUTRE CLÉ ; réimporter le fichier corrigé met à jour les
 * bonnes lignes et laisse la fausse. La liste accumulait donc des gens qui ne
 * s'inscriront jamais, comptés dans l'effectif attendu de la classe.
 */

const CSV = [
  'matricule,email,prenom,nom,classe',
  'M-1,a@ex.bf,Awa,Traoré,L1_DROIT',
  'M-2,b@ex.bf,Moussa,Zongo,L1_DROIT',
].join('\n');

function service(existantes: Record<string, unknown>[] = []) {
  const deleteMany = vi.fn(async () => ({ count: 0 }));
  const upsert = vi.fn(async () => ({}));
  const del = vi.fn(async () => ({}));
  const db = {
    expectedStudent: {
      findMany: vi.fn(async () => existantes),
      findUnique: vi.fn(async () => existantes[0] ?? null),
      upsert,
      delete: del,
      deleteMany,
    },
  } as never;
  const svc = new AccountsService({} as never, {} as never, {} as never, {} as never);
  return { svc, db, deleteMany, upsert, del };
}

const FANTOME = {
  id: 'e-1',
  matricule: 'M-999',
  firstName: 'Fantôme',
  lastName: 'Saisi',
  className: 'L1_DROIT',
  claimed: false,
};

describe('⚠ RETIRER une ligne — le geste qui manquait', () => {
  it('une ligne non réclamée est retirée', async () => {
    const { svc, db, del } = service([FANTOME]);
    await expect(svc.retirerExpectedStudent(db, 'e-1')).resolves.toEqual({
      deleted: true,
      matricule: 'M-999',
    });
    expect(del).toHaveBeenCalledWith({ where: { id: 'e-1' } });
  });

  it('⚠ une ligne RÉCLAMÉE est refusée — elle explique une activation', async () => {
    // Un compte a été activé automatiquement PARCE QUE cette ligne existait.
    // La retirer rendrait cette activation inexplicable.
    const { svc, db, del } = service([{ ...FANTOME, claimed: true }]);
    await expect(svc.retirerExpectedStudent(db, 'e-1')).rejects.toThrow(BadRequestException);
    expect(del).not.toHaveBeenCalled();
  });

  it('une ligne inexistante est « introuvable »', async () => {
    const { svc, db } = service([]);
    await expect(svc.retirerExpectedStudent(db, 'e-9')).rejects.toThrow(NotFoundException);
  });
});

describe('⚠ L’APERÇU — ce que l’import ferait, sans rien écrire', () => {
  it('il ne fait AUCUNE écriture', async () => {
    const { svc, db, upsert, deleteMany } = service([FANTOME]);
    await svc.apercuImportExpectedStudents(db, CSV);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('⚠ il NOMME les premiers retraits, pas seulement leur nombre', async () => {
    // « 47 lignes seront supprimées » ne se vérifie pas ; « Fantôme Saisi,
    // … et 46 autres » se reconnaît — ou ne se reconnaît pas, et c'est alors
    // qu'on s'arrête.
    const { svc, db } = service([FANTOME]);
    const a = await svc.apercuImportExpectedStudents(db, CSV);
    expect(a.retraits.total).toBe(1);
    expect(a.retraits.premiers[0]).toEqual({
      matricule: 'M-999',
      nom: 'Fantôme Saisi',
      className: 'L1_DROIT',
    });
  });

  it('⚠ la PORTÉE est la classe, et seulement les classes du FICHIER', async () => {
    // Un fichier qui ne contient que L1 Droit ne peut rien retirer à M2
    // Médecine. C'est ce qui borne le pire cas : quelqu'un exportera la moitié
    // d'un tableur.
    const { svc, db } = service([]);
    await svc.apercuImportExpectedStudents(db, CSV);
    const where = (db as unknown as { expectedStudent: { findMany: ReturnType<typeof vi.fn> } })
      .expectedStudent.findMany.mock.calls[0][0].where;
    expect(where.className.in).toEqual(['L1_DROIT']);
    // ⚠ Et jamais une ligne réclamée.
    expect(where.claimed).toBe(false);
  });

  it('une ligne du fichier n’est pas un retrait — elle est conservée', async () => {
    const { svc, db } = service([
      { ...FANTOME, id: 'e-2', matricule: 'M-1', firstName: 'Awa', lastName: 'Traoré' },
    ]);
    expect((await svc.apercuImportExpectedStudents(db, CSV)).retraits.total).toBe(0);
  });
});

describe('⚠ LE REMPLACEMENT — explicite, et il confirme le nombre vu', () => {
  it('sans `remplacer`, RIEN n’est retiré', async () => {
    const { svc, db, deleteMany } = service([FANTOME]);
    const r = await svc.importExpectedStudents(db, CSV);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(r.retires).toBe(0);
  });

  it('⚠ `remplacer` SANS le nombre confirmé est REFUSÉ', async () => {
    const { svc, db, deleteMany } = service([FANTOME]);
    await expect(
      svc.importExpectedStudents(db, CSV, { remplacer: true }),
    ).rejects.toThrow(BadRequestException);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('⚠ un nombre qui NE CORRESPOND PLUS est refusé — le fichier a changé', async () => {
    // C'est la garantie que l'aperçu et l'écriture portent sur le MÊME
    // fichier. Sans elle, rien n'empêche d'appliquer un fichier différent de
    // celui qu'on a prévisualisé.
    const { svc, db, deleteMany } = service([FANTOME]);
    await expect(
      svc.importExpectedStudents(db, CSV, { remplacer: true, confirmeRetraits: 5 }),
    ).rejects.toThrow(/l’aperçu annonçait 5 retrait\(s\), le fichier en produit 1/);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('le nombre EXACT applique le retrait', async () => {
    const { svc, db, deleteMany } = service([FANTOME]);
    const r = await svc.importExpectedStudents(db, CSV, {
      remplacer: true,
      confirmeRetraits: 1,
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['e-1'] } } });
    expect(r.retires).toBe(1);
  });

  it('⚠ ZÉRO retrait confirmé passe — `0` est un nombre, pas une absence', async () => {
    // `confirmeRetraits: 0` doit être accepté : un fichier complet ne retire
    // rien, et le refuser obligerait à distinguer deux cas identiques.
    const { svc, db } = service([]);
    await expect(
      svc.importExpectedStudents(db, CSV, { remplacer: true, confirmeRetraits: 0 }),
    ).resolves.toMatchObject({ retires: 0, imported: 2 });
  });
});

describe('⚠ L’aperçu et l’import lisent le fichier de la MÊME façon', () => {
  it('les deux comptent les mêmes lignes et les mêmes erreurs', async () => {
    // Deux analyses séparées s'accorderaient aujourd'hui et divergeraient au
    // premier changement de règle — « deux sources qui s'accordent par
    // coïncidence ». Un aperçu qui annonce 47 retraits pendant que l'import en
    // fait 48 est pire qu'une absence d'aperçu.
    const fautif = [CSV, 'M-3,pas-un-email,Issa,Kaboré,L1_DROIT'].join('\n');
    const { svc, db } = service([]);
    const a = await svc.apercuImportExpectedStudents(db, fautif);
    const i = await svc.importExpectedStudents(db, fautif);
    expect(a.aImporter).toBe(i.imported);
    expect(a.enErreur).toBe(i.skipped);
  });
});
