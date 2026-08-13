import { describe, expect, it } from 'vitest';
import {
  buildAddMissingColumnsStatements,
  buildColumnIntrospectionQuery,
  buildDeprovisionStatement,
  buildIndexIntrospectionQuery,
  buildMissingEnumValueStatements,
  buildMissingIndexStatements,
  buildProvisionStatements,
  isValidSlug,
  TENANT_TABLES,
  tenantSchemaName,
} from './tenant-schema';

describe('tenant-schema — validation du slug', () => {
  it('accepte des slugs valides', () => {
    for (const slug of ['zinda', 'zinda-kabore', 'ecole1', 'a-b-c']) {
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it('refuse les slugs dangereux ou mal formés', () => {
    for (const slug of [
      'Zinda', // majuscule
      '1ecole', // commence par un chiffre
      'a', // trop court
      'ecole_1', // underscore
      'ecole;drop', // injection
      'ecole"x', // guillemet
      'ecole schema', // espace
      '',
    ]) {
      expect(isValidSlug(slug)).toBe(false);
    }
  });

  it('tenantSchemaName préfixe et rejette un slug invalide', () => {
    expect(tenantSchemaName('zinda-kabore')).toBe('tenant_zinda-kabore');
    expect(() => tenantSchemaName('bad;slug')).toThrow();
  });
});

describe('tenant-schema — génération DDL', () => {
  const stmts = buildProvisionStatements('zinda');

  it('crée le schéma en premier', () => {
    expect(stmts[0]).toBe('CREATE SCHEMA "tenant_zinda"');
  });

  it('recrée les 6 types enum dans le schéma tenant', () => {
    const typeStmts = stmts.filter((s) => s.startsWith('CREATE TYPE'));
    expect(typeStmts.length).toBe(6);
    expect(
      typeStmts.some((s) =>
        s.startsWith(
          "CREATE TYPE \"tenant_zinda\".\"UserRole\" AS ENUM ('STUDENT'",
        ),
      ),
    ).toBe(true);
  });

  it('recible les colonnes enum vers les types locaux (avec défaut)', () => {
    const roleStmt = stmts.find(
      (s) => s.includes('"users"') && s.includes('ALTER COLUMN "role" TYPE'),
    );
    expect(roleStmt).toBeDefined();
    expect(roleStmt).toContain('"tenant_zinda"."UserRole"');
    expect(roleStmt).toContain("SET DEFAULT 'STUDENT'::\"tenant_zinda\".\"UserRole\"");
  });

  it('clone chaque table tenant depuis le gabarit public via LIKE', () => {
    for (const table of TENANT_TABLES) {
      expect(
        stmts.some(
          (s) =>
            s.includes(`CREATE TABLE "tenant_zinda"."${table}"`) &&
            s.includes(`LIKE "public"."${table}" INCLUDING ALL`),
        ),
      ).toBe(true);
    }
  });

  it('ajoute les clés étrangères internes (non copiées par LIKE)', () => {
    const fkStatements = stmts.filter((s) => s.includes('ADD CONSTRAINT'));
    expect(fkStatements.length).toBe(20);
    expect(
      fkStatements.some(
        (s) =>
          s.includes('"tenant_zinda"."password_tokens"') &&
          s.includes('REFERENCES "tenant_zinda"."users"("id")'),
      ),
    ).toBe(true);
    // Scan de récolement → session (CASCADE).
    expect(
      fkStatements.some(
        (s) =>
          s.includes('"tenant_zinda"."inventory_scans"') &&
          s.includes('REFERENCES "tenant_zinda"."inventory_sessions"("id")') &&
          s.includes('ON DELETE CASCADE'),
      ),
    ).toBe(true);

    // Cœur offline : les 4 FK nommées, avec leur cible et CASCADE (resserré sur
    // la vérité, pas un simple compte). devices→users, offline_licenses→{device,
    // user, record}.
    const offlineFks: Array<[string, string]> = [
      ['"tenant_zinda"."devices"', 'REFERENCES "tenant_zinda"."users"("id")'],
      ['"tenant_zinda"."offline_licenses"', 'REFERENCES "tenant_zinda"."devices"("id")'],
      ['"tenant_zinda"."offline_licenses"', 'REFERENCES "tenant_zinda"."users"("id")'],
      ['"tenant_zinda"."offline_licenses"', 'REFERENCES "tenant_zinda"."biblio_records"("id")'],
    ];
    for (const [table, ref] of offlineFks) {
      expect(
        fkStatements.some(
          (s) => s.includes(table) && s.includes(ref) && s.includes('ON DELETE CASCADE'),
        ),
      ).toBe(true);
    }
  });

  it('les contributeurs suivent leur notice (ON DELETE CASCADE), le reste RESTRICT', () => {
    const fkStatements = stmts.filter((s) => s.includes('ADD CONSTRAINT'));
    const contributorsFk = fkStatements.find((s) =>
      s.includes('"tenant_zinda"."record_contributors"'),
    );
    expect(contributorsFk).toContain('ON DELETE CASCADE');
    const itemsFk = fkStatements.find((s) => s.includes('"tenant_zinda"."items"'));
    expect(itemsFk).toContain('ON DELETE RESTRICT');
  });

  it('n’interpole que des identifiants entre guillemets (schéma validé)', () => {
    // Toutes les instructions référencent le schéma quoté, jamais brut.
    expect(stmts.every((s) => !/\btenant_zinda\b(?!")/.test(s.replace(/"tenant_zinda"/g, '')))).toBe(
      true,
    );
  });

  it('buildDeprovisionStatement supprime le schéma en CASCADE', () => {
    expect(buildDeprovisionStatement('zinda')).toBe(
      'DROP SCHEMA IF EXISTS "tenant_zinda" CASCADE',
    );
  });
});

describe('tenant-schema — introspection et rattrapage de colonnes', () => {
  it('buildColumnIntrospectionQuery cible le schéma donné et les tables tenant', () => {
    const query = buildColumnIntrospectionQuery('tenant_zinda');
    expect(query).toContain("n.nspname = 'tenant_zinda'");
    expect(query).toContain("'biblio_records'");
    expect(query).toContain("'digital_copies'");
  });

  it('génère un ADD COLUMN pour une colonne présente dans public mais absente chez le tenant', () => {
    const { statements, skippedEnumColumns } = buildAddMissingColumnsStatements(
      'zinda',
      [
        { table_name: 'biblio_records', column_name: 'title', type_decl: 'text', is_enum: false },
        { table_name: 'biblio_records', column_name: 'publisher', type_decl: 'text', is_enum: false },
      ],
      [{ table_name: 'biblio_records', column_name: 'title', type_decl: 'text', is_enum: false }],
    );
    expect(statements).toEqual([
      'ALTER TABLE "tenant_zinda"."biblio_records" ADD COLUMN "publisher" text',
    ]);
    expect(skippedEnumColumns).toEqual([]);
  });

  it('ne génère rien si toutes les colonnes sont déjà présentes', () => {
    const columns = [
      { table_name: 'biblio_records', column_name: 'title', type_decl: 'text', is_enum: false },
    ];
    const { statements } = buildAddMissingColumnsStatements('zinda', columns, columns);
    expect(statements).toEqual([]);
  });

  it('exclut les colonnes enum manquantes (à traiter comme au provisioning, pas ici)', () => {
    const { statements, skippedEnumColumns } = buildAddMissingColumnsStatements(
      'zinda',
      [
        {
          table_name: 'items',
          column_name: 'new_status',
          type_decl: 'public."SomeEnum"',
          is_enum: true,
        },
      ],
      [],
    );
    expect(statements).toEqual([]);
    expect(skippedEnumColumns).toEqual(['items.new_status']);
  });
});

describe('tenant-schema — rattrapage des index (audit perf 2026-07-14)', () => {
  it('buildIndexIntrospectionQuery cible le schéma donné et les tables indexées', () => {
    const query = buildIndexIntrospectionQuery('tenant_zinda');
    expect(query).toContain("n.nspname = 'tenant_zinda'");
    expect(query).toContain("'holds'");
    expect(query).toContain("'items'");
    expect(query).toContain("'checkouts'");
  });

  it('crée les index attendus absents chez une école (aucun index préexistant)', () => {
    const statements = buildMissingIndexStatements('zinda', []);
    expect(statements).toEqual([
      'CREATE INDEX IF NOT EXISTS "holds_record_id_status_idx" ON "tenant_zinda"."holds" ("record_id", "status")',
      'CREATE INDEX IF NOT EXISTS "holds_patron_id_idx" ON "tenant_zinda"."holds" ("patron_id")',
      'CREATE INDEX IF NOT EXISTS "items_record_id_idx" ON "tenant_zinda"."items" ("record_id")',
      'CREATE INDEX IF NOT EXISTS "checkouts_patron_id_return_date_idx" ON "tenant_zinda"."checkouts" ("patron_id", "return_date")',
      'CREATE INDEX IF NOT EXISTS "checkouts_checkout_date_idx" ON "tenant_zinda"."checkouts" ("checkout_date")',
      'CREATE INDEX IF NOT EXISTS "checkouts_return_date_idx" ON "tenant_zinda"."checkouts" ("return_date")',
    ]);
  });

  it('ne recrée pas un index déjà présent, même sous un nom différent (signature de colonnes)', () => {
    // Cas d'une école neuve : LIKE ... INCLUDING ALL a copié les index, parfois
    // sous un nom généré par Postgres — la comparaison porte sur les colonnes.
    const statements = buildMissingIndexStatements('zinda', [
      { table_name: 'holds', columns: ['record_id', 'status'] },
      { table_name: 'holds', columns: ['patron_id'] },
      { table_name: 'items', columns: ['record_id'] },
      { table_name: 'checkouts', columns: ['patron_id', 'return_date'] },
      { table_name: 'checkouts', columns: ['checkout_date'] },
      { table_name: 'checkouts', columns: ['return_date'] },
    ]);
    expect(statements).toEqual([]);
  });

  it('ne confond pas un index de colonnes différentes ni un ordre différent', () => {
    // holds(patron_id, status) et checkouts(due_date) existent : ils ne
    // couvrent AUCUN des index attendus → les 6 restent à créer.
    const statements = buildMissingIndexStatements('zinda', [
      { table_name: 'holds', columns: ['patron_id', 'status'] },
      { table_name: 'checkouts', columns: ['due_date'] },
      { table_name: 'holds', columns: ['status', 'record_id'] }, // ordre inversé
    ]);
    expect(statements).toHaveLength(6);
  });
});

describe('tenant-schema — synchro des valeurs d’enum', () => {
  // Jeu complet des valeurs d'enum (mêmes libellés que TENANT_ENUMS).
  const ALL_ENUM_ROWS = [
    ...['STUDENT', 'LIBRARIAN', 'MANAGER', 'ACQUISITIONS', 'ADMIN'].map((value) => ({ enum_name: 'UserRole', value })),
    ...['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED'].map((value) => ({ enum_name: 'AccountStatus', value })),
    ...['MARC21', 'UNIMARC'].map((value) => ({ enum_name: 'MarcFormat', value })),
    ...['AVAILABLE', 'CHECKED_OUT', 'ON_HOLD', 'IN_TRANSIT', 'DAMAGED', 'LOST', 'WITHDRAWN', 'MISSING'].map((value) => ({ enum_name: 'ItemStatus', value })),
    ...['PENDING', 'AVAILABLE', 'FULFILLED', 'CANCELLED', 'EXPIRED'].map((value) => ({ enum_name: 'HoldStatus', value })),
    ...['PDF', 'EPUB'].map((value) => ({ enum_name: 'DigitalFormat', value })),
  ];

  it('ajoute une valeur d’enum manquante (ex. ItemStatus.MISSING)', () => {
    // École provisionnée avant MISSING : TOUTES les valeurs présentes sauf elle.
    const existing = ALL_ENUM_ROWS.filter((r) => r.value !== 'MISSING');

    const statements = buildMissingEnumValueStatements('zinda', existing);
    // Seule la valeur manquante est ajoutée.
    expect(statements).toEqual([
      `ALTER TYPE "tenant_zinda"."ItemStatus" ADD VALUE IF NOT EXISTS 'MISSING'`,
    ]);
  });

  it('ne génère rien quand toutes les valeurs sont déjà présentes', () => {
    expect(buildMissingEnumValueStatements('zinda', ALL_ENUM_ROWS)).toEqual([]);
  });
});
