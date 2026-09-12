import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECORD_TYPE,
  DEFENSE_RECORD_TYPES,
  RECORD_TYPES,
  estUnTypeDeNotice,
} from './description-profiles';
import { profilPourTypeDeNotice } from './profil-de-notice';

/**
 * LE VOCABULAIRE DES TYPES DE NOTICE — backlog n°22.
 *
 * ⚠ « UN VOCABULAIRE QU'ON N'APPLIQUE PAS N'EST PAS UN VOCABULAIRE. » Il l'a
 * été trois semaines : `@IsString()` libre sur `recordType`, et une valeur par
 * défaut — `'book'` — qui n'existait dans AUCUNE des 8 352 notices.
 *
 * Deux versants, et il en faut deux :
 *  · ICI, non gaté : la liste est cohérente et les portes sont fermées ;
 *  · `vocabulaire-des-types-en-base.spec.ts`, gaté `PG_LIVE=1` : la BASE ne
 *    contient rien hors vocabulaire.
 *
 * Le second n'est pas un luxe. Une liste peut être juste et la base pleine de
 * valeurs qu'elle ignore — c'est même l'état dont on sort. Fermer une porte ne
 * dit rien de ce qui est déjà entré.
 *
 * ⚠ ILS SONT DANS DEUX FICHIERS parce que les gardes VIVANTS se reconnaissent
 * désormais à leur nom — `*-en-base.spec.ts`. Un crochet et un script les
 * ramassent par ce motif : une convention que le nom porte ne peut pas se
 * périmer comme une liste tenue à la main.
 */

describe('⚠ La liste tient debout', () => {
  it('les types de SOUTENANCE sont un sous-ensemble du vocabulaire', () => {
    // Sinon `requireDefenseFields` exigerait l'université de soutenance pour un
    // type qu'aucune notice ne peut porter — une règle inatteignable.
    for (const t of DEFENSE_RECORD_TYPES) {
      expect(RECORD_TYPES as readonly string[], t).toContain(t);
    }
  });

  it('⚠ la valeur par DÉFAUT est du vocabulaire — et elle ne l’était pas', () => {
    // `'book'` n'était dans aucune notice et n'est dans aucune liste. Une
    // bibliothécaire qui créait une notice sans choisir son type fabriquait
    // donc une valeur de plus, en anglais, à côté d'`ouvrage`.
    expect(estUnTypeDeNotice(DEFAULT_RECORD_TYPE)).toBe(true);
    expect(DEFAULT_RECORD_TYPE).toBe('ouvrage');
  });

  it('⚠ le défaut est BIBLIOGRAPHIQUE — un type par défaut ne déduit pas une soutenance', () => {
    // Si le défaut était un type de soutenance, toute notice créée sans type
    // exigerait une université de soutenance : le formulaire deviendrait
    // impassable pour un livre ordinaire.
    expect(profilPourTypeDeNotice(DEFAULT_RECORD_TYPE)).toBe('bibliographique');
  });

  it('le vocabulaire n’a ni doublon ni valeur vide', () => {
    expect(new Set(RECORD_TYPES).size).toBe(RECORD_TYPES.length);
    for (const t of RECORD_TYPES) expect(t.trim()).toBe(t);
  });

  it('⚠ TÉMOIN QUI COMPTE : sept types, une huitième force à relire ceci', () => {
    // Ajouter un type change ce que l'OPAC facette et ce que l'import accepte.
    // Le compte exact oblige à revenir ici plutôt qu'à l'ajouter en passant.
    expect(RECORD_TYPES.length).toBe(7);
  });

  it('`estUnTypeDeNotice` accepte le vocabulaire et refuse le reste', () => {
    for (const t of RECORD_TYPES) expect(estUnTypeDeNotice(t), t).toBe(true);
    for (const faux of ['book', 'BOOK', 'Ouvrage', '', '  ', 'roman'])
      expect(estUnTypeDeNotice(faux), faux).toBe(false);
    expect(estUnTypeDeNotice(null)).toBe(false);
    // Un espace autour reste du vocabulaire : c'est une saisie, pas une valeur.
    expect(estUnTypeDeNotice(' these ')).toBe(true);
  });
});

describe('⚠ LES PORTES : trois, et elles sont fermées', () => {
  const DTO = readFileSync(join(__dirname, 'dto/create-record.dto.ts'), 'utf8');
  const SERVICE = readFileSync(join(__dirname, 'cataloging.service.ts'), 'utf8');

  it('⚠ la porte de CRÉATION n’est plus `@IsString()` libre', () => {
    // Le relevé porte sur la déclaration du champ, pas sur le fichier entier :
    // `@IsString()` reste légitime ailleurs.
    const bloc = DTO.slice(DTO.indexOf('recordType?: string;') - 600, DTO.indexOf('recordType?: string;'));
    expect(bloc).toContain('@IsIn(RECORD_TYPES');
  });

  it('la porte de MODIFICATION hérite de la même validation', () => {
    // `UpdateRecordDto extends PartialType(CreateRecordDto)` : fermer la
    // première ferme la seconde. Ce test existe pour que la disparition de
    // l'héritage se voie.
    const maj = readFileSync(join(__dirname, 'dto/update-record.dto.ts'), 'utf8');
    expect(maj).toMatch(/PartialType\(\s*CreateRecordDto\s*\)/);
  });

  it('⚠ la porte d’IMPORT ne pose plus le type de la source sans le reconnaître', () => {
    // La forme fautive : `recordType: extracted.recordType ?? DEFAULT`. Elle
    // écrivait en base la valeur d'un catalogue étranger, hors vocabulaire.
    expect(SERVICE).not.toContain('recordType: extracted.recordType');
    expect(SERVICE).toContain('estUnTypeDeNotice(typeBrut)');
  });

  // ⚠ « L'import DIT ce qu'il n'a pas reconnu » N'EST PAS TESTÉ ICI, et c'est
  // une correction d'instrument. La première écriture cherchait
  // `/types:\s*\{[\s\S]*valeursInconnues/` dans la source : le motif tombait
  // sur la DÉCLARATION D'INTERFACE, pas sur la valeur rendue. Le contrôle
  // négatif l'a montré — remplacer `valeursInconnues: typesValeursInconnues`
  // par `valeursInconnues: []` ne le faisait pas broncher.
  //
  // Un relevé de source ne peut pas distinguer « ce type promet un champ » de
  // « ce code le remplit ». La propriété est donc éprouvée là où elle vit, sur
  // un vrai fichier ISO 2709 : `cataloging.service.spec.ts`, les trois cas du
  // TYPE (absent ≠ reconnu ≠ inconnu).
});
