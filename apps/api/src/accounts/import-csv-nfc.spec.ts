import { describe, expect, it, vi } from 'vitest';
import { AccountsService } from './accounts.service';

/**
 * ⚠ LA FRONTIÈRE OÙ LE TEXTE NE S'AFFICHE PAS : IL DÉCIDE.
 *
 * *Posé le 14 septembre 2026, dernière des frontières Unicode relevées le 13.*
 *
 * Les deux autres — le SRU, l'import MARC — laissaient entrer un titre
 * décomposé : la notice s'affiche bien, la recherche la manque, une fiche
 * d'autorité se dédouble. Celle-ci est d'un autre ordre, et c'est `className`
 * qui fait la différence :
 *
 * · `access-control.matching.ts` compare les classes par ÉGALITÉ STRICTE ;
 * · `enrollment` et `access-control` cherchent la classe par
 *   `findUnique({ where: { name } })`.
 *
 * Une école exporte sa liste depuis Excel sous macOS — forme décomposée. La
 * classe saisie à l'écran est composée. **Les deux s'affichent à l'identique et
 * ne s'égalent pas.** L'étudiant se voit refuser les collections de sa propre
 * classe, et le message de refus NOMME cette classe. Rien, à l'écran, ne permet
 * de comprendre.
 *
 * ⚠ Le jeu d'essai compose la forme décomposée explicitement, et le dit :
 * ici ce n'est pas le réalisme d'un octet venu du dehors qui est en cause mais
 * une ÉGALITÉ, et un témoin vérifie que les deux chaînes diffèrent bien avant
 * l'import — sans quoi le cas ne mesurerait rien.
 */
describe('Import CSV : la forme décomposée ne décide de rien', () => {
  const service = new AccountsService(
    null as never, null as never, null as never, null as never,
  );

  /** `Traoré` / `L1 Droit Général`, en décomposé — comme un export macOS. */
  const NOM_NFD = 'Traoré';
  const CLASSE_NFD = 'L1 Droit Général';

  function db() {
    const upserts: { create: Record<string, string> }[] = [];
    return {
      lignes: upserts,
      db: {
        expectedStudent: {
          upsert: vi.fn(async (a: { create: Record<string, string> }) => {
            upserts.push(a);
            return a.create;
          }),
          deleteMany: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };
  }

  it('⚠ TÉMOIN : les deux formes diffèrent bien avant l’import', () => {
    expect(NOM_NFD).not.toBe('Traoré');
    expect(CLASSE_NFD).not.toBe('L1 Droit Général');
    // Et elles sont bien la MÊME chose une fois composées — sinon le cas
    // éprouverait deux noms différents, pas deux formes du même.
    expect(NOM_NFD.normalize('NFC')).toBe('Traoré');
    expect(CLASSE_NFD.normalize('NFC')).toBe('L1 Droit Général');
  });

  it('⚠ un CSV décomposé produit des lignes COMPOSÉES', async () => {
    const { db: faux, lignes } = db();
    const csv =
      'matricule,email,prenom,nom,classe\n' +
      `E001,awa@exemple.bf,Awa,${NOM_NFD},${CLASSE_NFD}\n`;

    const res = await service.importExpectedStudents(faux as never, csv);

    expect(res.imported, 'la ligne n’a pas été importée').toBe(1);
    expect(lignes).toHaveLength(1);
    const ligne = lignes[0].create;

    // ⚠ CE QUI DÉCIDE : la classe. Écrite décomposée, elle refuserait à
    // l'étudiant les collections de sa propre classe.
    expect(
      ligne.className,
      'la classe entre décomposée : la décision d’accès la comparera à une autre chaîne',
    ).toBe('L1 Droit Général');
    expect(ligne.lastName).toBe('Traoré');

    // La différence est réelle, pas une égalité qui se vérifie elle-même.
    expect(ligne.className).not.toBe(CLASSE_NFD);
  });

  it('⚠ un CSV déjà composé traverse inchangé', async () => {
    const { db: faux, lignes } = db();
    const csv =
      'matricule,email,prenom,nom,classe\n' +
      'E002,kofi@exemple.bf,Kofi,Ouédraogo,M2 Médecine\n';

    await service.importExpectedStudents(faux as never, csv);
    expect(lignes[0].create.lastName).toBe('Ouédraogo');
    expect(lignes[0].create.className).toBe('M2 Médecine');
  });

  it('⚠ la structure du CSV survit à la composition', async () => {
    // Un CSV n'a que des délimiteurs ASCII : composer ne peut pas les déplacer.
    // Ce cas le VÉRIFIE plutôt que de l'affirmer — une valeur entre guillemets
    // contenant une virgule et un accent décomposé.
    const { db: faux, lignes } = db();
    const csv =
      'matricule,email,prenom,nom,classe\n' +
      `E003,ali@exemple.bf,Ali,"Bà, dit Amadou",${CLASSE_NFD}\n`;

    await service.importExpectedStudents(faux as never, csv);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].create.lastName).toBe('Bà, dit Amadou');
    expect(lignes[0].create.className).toBe('L1 Droit Général');
  });
});
