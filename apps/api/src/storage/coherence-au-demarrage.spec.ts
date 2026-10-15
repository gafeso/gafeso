import { describe, expect, it } from 'vitest';
import { decisionDeCoherence, ECHAPPEMENT } from './coherence-au-demarrage';

/**
 * ⭐ LES TROIS CAS QUE JEAN A NOMMÉS, et un quatrième qu'ils appellent.
 *
 * ⚠ La décision est PURE : ces cas ne montent ni base ni stockage. C'est ce
 * qui permet de les écrire tous — y compris celui qu'une pile réelle rend
 * coûteux à fabriquer (une base pleine et un stockage vide).
 */
describe('⭐ cohérence base ↔ stockage au démarrage', () => {
  it('🔴 base avec documents + stockage VIDE → REFUS, et il NOMME le nombre', () => {
    const d = decisionDeCoherence({ documentsEnBase: 155, objetsDansLeStockage: 0 });
    expect(d.demarre).toBe(false);
    if (d.demarre) throw new Error('inatteignable');
    expect(d.documents).toBe(155);
    // ⚠ Le message doit DIRE QUOI FAIRE, pas seulement ce qui ne va pas :
    // c'est la propriété que ce dépôt exige d'un garde qui refuse.
    expect(d.message).toContain('155');
    expect(d.message).toMatch(/migration/i);
    expect(d.message).toMatch(/DEPLOY\.md/);
    // ⚠ ET IL DOIT RASSURER SUR CE QUI N'EST PAS PERDU. Un exploitant qui lit
    // « stockage vide » à 23 h croit ses documents détruits.
    expect(d.message).toMatch(/ne sont PAS\s*\n?\s*perdus|pas\s*\n?\s*perdus/i);
  });

  it('🔴 base avec documents + bucket ABSENT → REFUS aussi, et il le dit', () => {
    // ⚠ Absent et vide se traitent PAREIL : les deux veulent dire « aucun
    // document trouvable ». Les distinguer inviterait à CRÉER le bucket pour
    // faire taire le garde, ce qui ne restituerait aucun fichier.
    const d = decisionDeCoherence({ documentsEnBase: 3, objetsDansLeStockage: null });
    expect(d.demarre).toBe(false);
    if (d.demarre) throw new Error('inatteignable');
    expect(d.message).toMatch(/ABSENT/);
  });

  it('✓ base VIDE (installation neuve) → démarrage normal', () => {
    // Rien à perdre, rien à dire. Le garde doit être muet ici, sinon toute
    // installation neuve commence par un refus incompréhensible.
    expect(decisionDeCoherence({ documentsEnBase: 0, objetsDansLeStockage: 0 }).demarre).toBe(true);
    expect(decisionDeCoherence({ documentsEnBase: 0, objetsDansLeStockage: null }).demarre).toBe(
      true,
    );
  });

  it('✓ base avec documents + stockage PLEIN → démarrage normal', () => {
    expect(decisionDeCoherence({ documentsEnBase: 155, objetsDansLeStockage: 1 }).demarre).toBe(
      true,
    );
    expect(decisionDeCoherence({ documentsEnBase: 155, objetsDansLeStockage: 999 }).demarre).toBe(
      true,
    );
  });

  describe("l'échappement", () => {
    it('ouvre le démarrage sur la valeur EXACTE, et la cite dans le message', () => {
      const bloque = decisionDeCoherence({ documentsEnBase: 9, objetsDansLeStockage: 0 });
      if (bloque.demarre) throw new Error('inatteignable');
      expect(bloque.message, "le refus doit nommer l'échappement").toContain(ECHAPPEMENT);
      expect(
        decisionDeCoherence({
          documentsEnBase: 9,
          objetsDansLeStockage: 0,
          echappement: 'oui-je-sais-ce-que-je-fais',
        }).demarre,
      ).toBe(true);
    });

    it('⚠ et SEULE cette valeur l’ouvre : une faute de frappe garde le refus', () => {
      // Un drapeau qui basculerait sur toute valeur non vide ferait qu'un
      // `=0`, un `=false` ou un `=non` le DÉSACTIVE — c'est le piège mesuré
      // sur STORAGE_PUBLIC_BUCKET_IN_PATH.
      for (const v of ['1', 'true', 'oui', '', 'false', '0', 'OUI-JE-SAIS-CE-QUE-JE-FAIS']) {
        expect(
          decisionDeCoherence({ documentsEnBase: 9, objetsDansLeStockage: 0, echappement: v })
            .demarre,
          `« ${v} » ne doit PAS ouvrir le démarrage`,
        ).toBe(false);
      }
    });
  });

  it('⚠ TÉMOIN : le refus et le démarrage sont tous deux ATTEINTS par ces cas', () => {
    // Sans ce compte, une décision qui rendrait TOUJOURS `demarre: true`
    // passerait les quatre cas ci-dessus sauf un — et un jeu de cas qui
    // n'exerce qu'une branche ne mesure rien.
    const issues = new Set(
      [
        [155, 0],
        [155, 1],
        [0, 0],
        [3, null],
      ].map(([d, o]) =>
        decisionDeCoherence({ documentsEnBase: d as number, objetsDansLeStockage: o as number | null })
          .demarre,
      ),
    );
    expect([...issues].sort(), 'les deux issues doivent être atteintes').toEqual([false, true]);
  });
});
