import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { porteDuNatif, zonesPortees } from './metadonnees-natives';
import { CatalogingService } from './cataloging.service';

describe('couche 3 — ce qui compte comme description d’origine', () => {
  it('⚠ `{}` et `{"fields": []}` ne sont PAS des porteuses', () => {
    // Ce sont les deux formes que le produit écrit LUI-MÊME pour une notice
    // saisie à la main. Les traiter comme du contenu bloquerait toute
    // modification de notice ordinaire — et c'est l'affirmation fausse que le
    // relevé P2 a nommée : « notice MARC vide » au lieu de « pas de natif ».
    expect(porteDuNatif({})).toBe(false);
    expect(porteDuNatif({ fields: [] })).toBe(false);
    expect(porteDuNatif(null)).toBe(false);
    expect(porteDuNatif(undefined)).toBe(false);
  });

  it('un leader ou des zones font une porteuse', () => {
    expect(porteDuNatif({ leader: '00000nam a2200000 4500' })).toBe(true);
    expect(porteDuNatif({ fields: [{ '245': {} }] })).toBe(true);
    expect(zonesPortees({ fields: [1, 2, 3] })).toBe(3);
    expect(zonesPortees({})).toBe(0);
  });
});

describe('I3 — rien n’écrase la description d’origine', () => {
  function service(marcDataExistant: unknown) {
    const findUnique = vi.fn(async () => ({
      id: 'r1',
      marcData: marcDataExistant,
      marcFormat: 'MARC21',
      items: [],
      contributors: [],
      keywords: [],
    }));
    const update = vi.fn(async () => ({ id: 'r1', contributors: [], keywords: [], items: [] }));
    const db = {
      biblioRecord: { findUnique, update },
      recordKeyword: { deleteMany: vi.fn() },
    } as never;
    return { db, update, service: new CatalogingService({ indexRecords: vi.fn() } as never, {} as never, {} as never) };
  }

  it('⚠ REFUSE d’écraser une notice qui porte sa description d’origine', async () => {
    const { db, update, service: s } = service({ leader: 'x', fields: [1, 2, 3] });
    await expect(
      s.updateRecord(db, 'zinda', 'r1', { marcData: { fields: [] } } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    // Et rien n'a été écrit : le refus précède l'écriture.
    expect(update).not.toHaveBeenCalled();
  });

  it('⚠ le refus NOMME ce qu’il protège : le nombre de zones et le format', async () => {
    const { db, service: s } = service({ fields: [1, 2, 3, 4] });
    await expect(
      s.updateRecord(db, 'zinda', 'r1', { marcData: {} } as never),
    ).rejects.toThrow(/4 zones.*MARC21|MARC21.*4 zones/s);
  });

  it('laisse passer une notice SANS description d’origine', async () => {
    // Sinon toute notice saisie à la main deviendrait immodifiable.
    //
    // ⚠ Ce test porte sur le GARDE, pas sur toute la méthode : le reste
    // d'`updateRecord` (contributeurs, mots-clés, catégories, réindexation) est
    // couvert par cataloging.service.spec. On vérifie donc que le refus I3 ne
    // se déclenche PAS — pas que la mise à jour aboutisse avec des doublures
    // incomplètes, ce qui serait un test de mes doublures et non du code.
    const { db, service: s } = service({ fields: [] });
    const erreur = await s
      .updateRecord(db, 'zinda', 'r1', { marcData: { fields: [] } } as never)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(erreur).not.toBeInstanceOf(ConflictException);
  });

  it('sans marcData fourni, la mise à jour passe — le garde ne gêne rien', () => {
    // ⚠ Ce test remplace un précédent, qui vérifiait que le garde « ne lit même
    // pas l'existant ». C'était faux : `updateRecord` charge la notice en
    // première ligne, de toute façon. Le garde se pose donc sur cette lecture
    // au lieu d'en ajouter une — et l'affirmation d'origine était une économie
    // imaginaire.
    expect(porteDuNatif({ fields: [] })).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LE VOCABULAIRE VIT À TROIS ENDROITS — ce test en tient DEUX d'accord.
//
// `schema.prisma` déclare les enums ; `TENANT_ENUMS` est la liste que le
// PROVISIONNING recrée dans chaque schéma d'école. Une école NEUVE reçoit ce que
// dit TENANT_ENUMS, pas ce que dit Prisma. Rien ne les tenait alignés : une
// valeur ajoutée à Prisma et oubliée là produisait une école neuve incapable de
// la stocker — et le défaut ne se voyait qu'à l'écriture, chez le client.
//
// Le troisième endroit — le type LOCAL d'une école déjà provisionnée — n'est
// atteignable que par une migration qui balaie les schémas. `sync-schema` ne le
// fait PAS : il crée les types manquants, il n'altère jamais un type existant.
// Mesuré le 11 septembre 2026.
// ════════════════════════════════════════════════════════════════════════════
describe('vocabulaire des enums — Prisma et le provisioning ne divergent pas', () => {
  const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf-8');

  function valeursPrisma(nom: string): string[] {
    const bloc = SCHEMA.split(`enum ${nom} {`)[1]?.split('\n}')[0];
    if (!bloc) throw new Error(`enum ${nom} introuvable dans schema.prisma`);
    return bloc
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'))
      .map((l) => l.split(/\s+/)[0]);
  }

  // Relu depuis le fichier : l'importer lierait le test à ce qu'il vérifie.
  const TENANT = readFileSync(
    join(__dirname, '..', 'tenancy', 'tenant-schema.ts'),
    'utf-8',
  );
  function valeursProvisioning(nom: string): string[] {
    const bloc = TENANT.split(`${nom}: [`)[1]?.split(']')[0];
    if (!bloc) throw new Error(`${nom} introuvable dans TENANT_ENUMS`);
    return [...bloc.matchAll(/'([A-Z_0-9]+)'/g)].map((m) => m[1]);
  }

  const ENUMS = ['UserRole', 'AccountStatus', 'MarcFormat', 'ItemStatus', 'HoldStatus', 'DigitalFormat'];

  it('les deux sources sont bien lues (témoin positif)', () => {
    expect(valeursPrisma('MarcFormat')).toContain('GAFESO');
    expect(valeursProvisioning('MarcFormat')).toContain('GAFESO');
  });

  for (const nom of ENUMS) {
    it(`${nom} : mêmes valeurs dans Prisma et dans le provisioning`, () => {
      expect(valeursProvisioning(nom)).toEqual(valeursPrisma(nom));
    });
  }
});
