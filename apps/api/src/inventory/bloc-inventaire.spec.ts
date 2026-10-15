import { describe, expect, it } from 'vitest';
import { blocInventaire, CLASSES_DE_RECOLEMENT } from './bloc-inventaire';

describe('⭐ le bloc inventaire du scanner : cinq issues, trois classes', () => {
  const ISSUES = ['SEEN', 'ALREADY', 'UNKNOWN', 'OUT_OF_SCOPE', 'ON_LOAN'] as const;

  it('⚠ TÉMOIN : les CINQ issues du service sont couvertes, pas quatre', () => {
    // Sans ce compte, une issue ajoutée au service tomberait dans un défaut
    // sans que personne le sache — et le récolement classerait de travers.
    for (const i of ISSUES) {
      const b = blocInventaire(i, 'ZIN-1');
      expect(CLASSES_DE_RECOLEMENT, `« ${i} » doit rendre une classe connue`).toContain(b.resultat);
      expect(b.message.length, `« ${i} » doit porter une phrase`).toBeGreaterThan(10);
    }
  });

  it('🔴 un prêt en cours est « ailleurs », JAMAIS « inconnu »', () => {
    // Le compter manquant ferait chercher un livre qui est chez un lecteur.
    expect(blocInventaire('ON_LOAN', 'ZIN-1').resultat).toBe('ailleurs');
    expect(blocInventaire('ON_LOAN', 'ZIN-1').message).toMatch(/prêt/);
  });

  it('déjà scanné reste « vu », et la phrase évite un second passage', () => {
    expect(blocInventaire('ALREADY', 'ZIN-1').resultat).toBe('vu');
    expect(blocInventaire('ALREADY', 'ZIN-1').message).toMatch(/Déjà/);
  });

  it('⚠ chaque classe est ATTEINTE par au moins une issue', () => {
    // Une classe que rien ne produit est une branche morte dans l'application.
    const rendues = new Set(ISSUES.map((i) => blocInventaire(i, 'x').resultat));
    expect([...rendues].sort()).toEqual([...CLASSES_DE_RECOLEMENT].sort());
  });

  it('le code-barres est rendu TEL QUEL — l’app l’affiche sans le recomposer', () => {
    expect(blocInventaire('SEEN', 'ZIN-004812').codeBarre).toBe('ZIN-004812');
  });
});
