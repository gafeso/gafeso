import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aplatirChampsDeProfil,
  ecrireChampsDeProfil,
  lireChampsDeProfil,
} from './champs-de-profil';

describe('champs de profil — lecture', () => {
  it('lit les trois clés', () => {
    expect(
      lireChampsDeProfil({
        publicationCity: 'Ouagadougou',
        defenseUniversity: 'Université d’Exemple',
        defensePlace: 'Amphi B',
      }),
    ).toEqual({
      publicationCity: 'Ouagadougou',
      defenseUniversity: 'Université d’Exemple',
      defensePlace: 'Amphi B',
    });
  });

  it('⚠ rend `null` — jamais `undefined` — sur tout ce qui n’est pas un objet', () => {
    // La colonne rendait `null`. Rendre `undefined` ferait DISPARAÎTRE la clé
    // d'une réponse JSON au lieu de la porter à null : une clé de moins, donc
    // I7 cassé, et par un chemin que seul un cas dégradé emprunte.
    for (const entree of [null, undefined, '{}', 42, [], [1, 2]]) {
      expect(lireChampsDeProfil(entree), JSON.stringify(entree)).toEqual({
        publicationCity: null,
        defenseUniversity: null,
        defensePlace: null,
      });
    }
  });

  it('une chaîne vide vaut absence', () => {
    expect(lireChampsDeProfil({ defensePlace: '' }).defensePlace).toBeNull();
  });

  it('ignore les clés étrangères et les valeurs non textuelles', () => {
    const lu = lireChampsDeProfil({ defensePlace: 42, inconnu: 'x', publicationCity: 'Bobo' });
    expect(lu).toEqual({
      publicationCity: 'Bobo',
      defenseUniversity: null,
      defensePlace: null,
    });
  });
});

describe('champs de profil — écriture', () => {
  it('⚠ OMET les clés nulles, au lieu de les mettre à null', () => {
    // Symétrie exigée avec `jsonb_strip_nulls` de la migration : une notice
    // sans champ de profil porte `{}`. Sans cette symétrie, une notice créée
    // par l'API et une notice recopiée par la migration différeraient à
    // l'octet, et le filet signalerait un changement que personne n'a voulu.
    expect(ecrireChampsDeProfil({ publicationCity: null, defensePlace: '' })).toEqual({});
    expect(ecrireChampsDeProfil({})).toEqual({});
  });

  it('l’aller-retour écriture → lecture conserve les valeurs', () => {
    const champs = {
      publicationCity: 'Ouagadougou',
      defenseUniversity: null,
      defensePlace: 'Amphi B',
    };
    expect(lireChampsDeProfil(ecrireChampsDeProfil(champs))).toEqual(champs);
  });
});

describe('champs de profil — aplatissement', () => {
  it('⚠ RETIRE `profileData` et pose les trois champs à plat', () => {
    // C'est ce qui maintient la promesse du lot : les routes d'administration
    // renvoient la ligne entière, donc la colonne s'y serait invitée toute
    // seule — le défaut que P3-4 a corrigé sur la route publique.
    const aplati = aplatirChampsDeProfil({
      id: 'rec-1',
      title: 'T',
      profileData: { defensePlace: 'Amphi B' },
    });
    expect(aplati).toEqual({
      id: 'rec-1',
      title: 'T',
      publicationCity: null,
      defenseUniversity: null,
      defensePlace: 'Amphi B',
    });
    expect(aplati).not.toHaveProperty('profileData');
  });
});

/**
 * ⚠ LE VOCABULAIRE EST DANS LE SQL AUSSI — QUATRIÈME OCCURRENCE DE LA CLASSE.
 *
 * La migration écrit les clés `publicationCity`, `defenseUniversity` et
 * `defensePlace` ; `lireChampsDeProfil` les relit. Une faute de frappe d'un
 * côté ne lèverait RIEN : la lecture rendrait `null`, la réponse porterait une
 * valeur vide, et la colonne — encore présente pendant le temps 1 — donnerait
 * l'illusion que tout va bien jusqu'au temps 2.
 */
describe('champs de profil — le SQL et le code nomment les mêmes clés', () => {
  const sql = readFileSync(
    join(__dirname, '../../prisma/migrations/20260911180000_profil_donnees_temps_1/migration.sql'),
    'utf-8',
  );

  it('la migration existe et construit bien un objet (témoin positif)', () => {
    expect(sql).toContain('jsonb_build_object');
    expect(sql).toContain('jsonb_strip_nulls');
  });

  it('⚠ les clés du SQL sont EXACTEMENT celles que le code lit', () => {
    const clesSql = new Set([...sql.matchAll(/'([a-z][A-Za-z]+)',\s+\w+/g)].map((m) => m[1]));
    expect(clesSql.size).toBe(3); // témoin de COMPTE, pas de présence
    const clesCode = Object.keys(
      lireChampsDeProfil({ publicationCity: 'x', defenseUniversity: 'x', defensePlace: 'x' }),
    );
    expect([...clesSql].sort()).toEqual(clesCode.sort());
  });

  it('⚠ le SQL utilise `jsonb_strip_nulls`, comme `ecrireChampsDeProfil` omet les nulls', () => {
    // Les deux règles doivent coïncider, sinon `{}` d'un côté et
    // `{"defensePlace": null}` de l'autre — deux octets différents pour la
    // même absence.
    expect(sql).toMatch(/jsonb_strip_nulls\(jsonb_build_object\(/);
    expect(ecrireChampsDeProfil({ defensePlace: null })).toEqual({});
  });
});
