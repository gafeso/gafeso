import { describe, expect, it } from 'vitest';
import {
  SEUIL_PETITE_POPULATION,
  annee,
  appliquerSeuil,
  dernierJour,
  libellePeriode,
} from './rapport-annuel';
import { RapportAnnuelDto } from './dto/rapport-annuel.dto';

/**
 * ⚠ LES BORNES, LE SEUIL, ET CE QUE LE DOCUMENT AFFIRME.
 *
 * *P8-2, 15 septembre 2026.*
 */
describe('Rapport annuel — les bornes de la période', () => {
  it('⚠ un prêt du 31 DÉCEMBRE compte, celui du 1er JANVIER suivant non', () => {
    // ⚠ C'EST LE CAS QU'ON RATE TOUJOURS. Une borne inclusive d'un côté et
    // exclusive de l'autre produit un chiffre faux d'un jour — invisible, et
    // permanent parce que le document est archivé.
    const p = annee(2026);
    const dernierInstantDe2026 = new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999));
    const premierInstantDe2027 = new Date(Date.UTC(2027, 0, 1, 0, 0, 0, 0));

    const compte = (d: Date) => d >= p.debut && d < p.fin;
    expect(compte(new Date(Date.UTC(2026, 0, 1))), '1er janvier exclu à tort').toBe(true);
    expect(compte(dernierInstantDe2026), '31 décembre exclu à tort').toBe(true);
    expect(compte(premierInstantDe2027), '1er janvier suivant compté à tort').toBe(false);
  });

  it('⚠ la borne AFFICHÉE est le dernier jour COMPTÉ, pas la borne exclue', () => {
    // Le défaut trouvé dans `reportCsv` avant même ce lot : il imprimait
    // `period.to` telle quelle, donc un rapport 2026 s'intitulait
    // « 2026-01-01 → 2027-01-01 ». Le calcul était juste, l'étiquette fausse
    // d'un jour — et c'est l'étiquette que lit l'université.
    const p = annee(2026);
    expect(p.fin.toISOString().slice(0, 10)).toBe('2027-01-01'); // la borne, exclue
    expect(dernierJour(p).toISOString().slice(0, 10)).toBe('2026-12-31'); // ce qu'on affiche
  });

  it('le libellé se lit sans connaître la convention', () => {
    expect(libellePeriode(annee(2026))).toBe('du 1er janvier au 31 décembre 2026');
  });

  it('⚠ une année BISSEXTILE ne décale rien', () => {
    // 2024 a 366 jours. Une arithmétique en « +365 jours » aurait rendu le
    // 30 décembre, et personne ne l'aurait vu.
    expect(dernierJour(annee(2024)).toISOString().slice(0, 10)).toBe('2024-12-31');
    expect(libellePeriode(annee(2024))).toBe('du 1er janvier au 31 décembre 2024');
  });
});

describe('Rapport annuel — le seuil des petites populations', () => {
  it('⚠ un groupe de moins de 5 n’est pas publié, et la ligne DIT pourquoi', () => {
    const lignes = appliquerSeuil([
      { libelle: 'L1 Droit', nombre: 120 },
      { libelle: 'M2 Droit privé', nombre: 3 },
      { libelle: 'Doctorat', nombre: 4 },
      { libelle: 'Agrégation', nombre: 5 },
    ]);
    expect(lignes[0]).toEqual({ libelle: 'L1 Droit', nombre: 120 });
    expect(lignes[1].nombre, 'un groupe de 3 a été publié').toBeNull();
    expect(lignes[2].nombre, 'un groupe de 4 a été publié').toBeNull();
    // ⚠ LA BORNE EXACTE : 5 passe. Un seuil « strictement supérieur à 5 »
    // masquerait un groupe qui n'a pas à l'être, et personne ne le verrait.
    expect(lignes[3].nombre, 'le seuil lui-même a été masqué').toBe(SEUIL_PETITE_POPULATION);
  });

  it('⚠ LA LIGNE RESTE — une absence muette se lirait comme un zéro', () => {
    const lignes = appliquerSeuil([{ libelle: 'M2 Droit privé', nombre: 3 }]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].libelle).toBe('M2 Droit privé');
    expect(lignes[0].masque).toMatch(/inférieur à 5/);
  });

  it('un groupe VIDE reste à zéro : il ne révèle personne', () => {
    // Zéro ne masque rien — et le masquer ferait croire à un effectif caché.
    expect(appliquerSeuil([{ libelle: 'Auditeurs libres', nombre: 0 }])[0].nombre).toBe(0);
  });
});

describe('Rapport annuel — l’année demandée', () => {
  it('⚠ le défaut est l’année ÉCOULÉE, pas l’année en cours', () => {
    // Un rapport annuel se produit en janvier POUR l'année qui vient de finir.
    // Proposer l'année courante rendrait un document PARTIEL que rien ne
    // signale comme tel — et il serait remis tel quel.
    const dto = new RapportAnnuelDto();
    expect(dto.anneeDemandee(new Date(Date.UTC(2027, 0, 12)))).toBe(2026);
    expect(dto.anneeDemandee(new Date(Date.UTC(2026, 6, 1)))).toBe(2025);
  });

  it('une année explicite est respectée', () => {
    const dto = new RapportAnnuelDto();
    dto.annee = 2024;
    expect(dto.anneeDemandee(new Date(Date.UTC(2027, 0, 12)))).toBe(2024);
  });
});
