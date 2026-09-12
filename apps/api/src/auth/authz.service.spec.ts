import { describe, expect, it, vi } from 'vitest';
import { AuthzService } from './authz.service';
import { FONCTIONS, functionsForLegacyRole, TOUTES_LES_FONCTIONS } from './functions';

function makeDb(user: unknown) {
  return { user: { findUnique: vi.fn().mockResolvedValue(user) } } as any;
}

const service = new AuthzService();

describe('AuthzService — résolution des fonctions', () => {
  it('rôle dynamique assigné : ses fonctions priment sur l’enum', async () => {
    const db = makeDb({
      role: 'STUDENT', // enum trompeur : le rôle dynamique doit gagner
      status: 'ACTIVE',
      customRole: { functions: ['document.lire', 'catalogue.gerer'] },
    });
    expect(await service.getFunctions(db, 'u1')).toEqual([
      'document.lire',
      'catalogue.gerer',
    ]);
  });

  it('sans rôle dynamique : repli sur les fonctions du rôle système de l’enum', async () => {
    const db = makeDb({ role: 'LIBRARIAN', status: 'ACTIVE', customRole: null });
    const functions = await service.getFunctions(db, 'u1');
    expect(functions).toContain(FONCTIONS.DOCUMENT_LIRE);
    expect(functions).toContain(FONCTIONS.CATALOGUE_GERER);
    // Le bibliothécaire lit mais ne télécharge pas.
    expect(functions).not.toContain(FONCTIONS.DOCUMENT_TELECHARGER);
  });

  it('compte suspendu → aucune fonction (l’accès tombe sans attendre l’expiration du JWT)', async () => {
    const db = makeDb({
      role: 'ADMIN',
      status: 'SUSPENDED',
      customRole: { functions: TOUTES_LES_FONCTIONS },
    });
    expect(await service.getFunctions(db, 'u1')).toEqual([]);
  });

  it('compte inexistant → aucune fonction', async () => {
    expect(await service.getFunctions(makeDb(null), 'ghost')).toEqual([]);
  });

  it('hasFunction : vrai/faux selon la liste résolue', async () => {
    const db = makeDb({ role: 'MANAGER', status: 'ACTIVE', customRole: null });
    expect(await service.hasFunction(db, 'u1', FONCTIONS.COMPTES_ACTIVER)).toBe(true);
    expect(await service.hasFunction(db, 'u1', FONCTIONS.CATALOGUE_GERER)).toBe(false);
  });
});

describe('functionsForLegacyRole — mappage des rôles système', () => {
  it('ADMIN possède toutes les fonctions, dont le téléchargement', () => {
    expect(functionsForLegacyRole('ADMIN')).toEqual(TOUTES_LES_FONCTIONS);
  });

  it('⚠ STUDENT ne porte QUE `depot.deposer` — son accès au fonds reste par access-control', () => {
    // ⚠ IL N'AVAIT AUCUNE FONCTION JUSQU'AU 12 SEPTEMBRE 2026, et ce test le
    // figeait. Le premier élargissement accordé depuis le découpage des
    // permissions l'a fait tomber — son office exact.
    //
    // Ce qui n'a PAS changé, et qui est le fond : l'accès d'un étudiant au
    // fonds ne passe toujours par AUCUNE fonction. Il est décidé par
    // access-control (sa classe, son abonnement). `depot.deposer` n'ouvre que
    // trois routes, toutes sur SON propre dépôt.
    expect(functionsForLegacyRole('STUDENT')).toEqual(['depot.deposer']);
  });

  it('rôle inconnu → aucune fonction (fail-closed)', () => {
    expect(functionsForLegacyRole('PIRATE')).toEqual([]);
  });
});
