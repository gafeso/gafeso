/**
 * Provisioning des schémas tenant (« tenant_<slug> »).
 *
 * Le schéma `public` (créé par Prisma) contient toutes les tables et sert de
 * GABARIT pour la structure des colonnes/index via
 * `CREATE TABLE tenant_x.t (LIKE public.t INCLUDING ALL)`.
 *
 * Subtilité multi-tenant : quand un client Prisma cible le schéma
 * `tenant_<slug>`, il qualifie AUSSI les types enum avec ce schéma
 * (`tenant_x."UserRole"`). Un schéma tenant doit donc être auto-suffisant :
 * on y recrée les types enum, puis on recible les colonnes enum (copiées par
 * LIKE en référençant les enums de `public`) vers les enums locaux.
 */

/** Tables propres à chaque école (schéma tenant). Les autres restent dans `public`. */
export const TENANT_TABLES = [
  'expected_students',
  'roles',
  'users',
  'password_tokens',
  'school_classes',
  'enrollments',
  'categories',
  'biblio_records',
  'authors',
  'record_contributors',
  'keywords',
  'record_keywords',
  'items',
  'checkouts',
  'holds',
  'circulation_rules',
  'patrons',
  'digital_copies',
  // Récolement (vague 2) — sessions avant scans (dépendance FK).
  'inventory_sessions',
  'inventory_scans',
  // Cœur offline (offline-licensing) — devices avant offline_licenses (dépendance FK).
  // Statuts en TEXTE : aucune entrée TENANT_ENUMS/ENUM_COLUMNS nécessaire.
  'devices',
  'offline_licenses',
] as const;

/** Types enum à recréer dans chaque schéma tenant (mêmes libellés que le schéma Prisma). */
const TENANT_ENUMS: Record<string, string[]> = {
  UserRole: ['STUDENT', 'LIBRARIAN', 'MANAGER', 'ACQUISITIONS', 'ADMIN'],
  AccountStatus: ['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED'],
  MarcFormat: ['MARC21', 'UNIMARC'],
  ItemStatus: [
    'AVAILABLE',
    'CHECKED_OUT',
    'ON_HOLD',
    'IN_TRANSIT',
    'DAMAGED',
    'LOST',
    'WITHDRAWN',
    'MISSING',
  ],
  HoldStatus: ['PENDING', 'AVAILABLE', 'FULFILLED', 'CANCELLED', 'EXPIRED'],
  DigitalFormat: ['PDF', 'EPUB'],
};

interface EnumColumn {
  table: string;
  column: string;
  enum: string;
  default: string;
}

/** Colonnes enum à recibler vers les types locaux (avec leur valeur par défaut). */
const ENUM_COLUMNS: EnumColumn[] = [
  { table: 'users', column: 'role', enum: 'UserRole', default: 'STUDENT' },
  { table: 'users', column: 'status', enum: 'AccountStatus', default: 'PENDING' },
  { table: 'biblio_records', column: 'marc_format', enum: 'MarcFormat', default: 'UNIMARC' },
  { table: 'items', column: 'status', enum: 'ItemStatus', default: 'AVAILABLE' },
  { table: 'holds', column: 'status', enum: 'HoldStatus', default: 'PENDING' },
  { table: 'digital_copies', column: 'file_format', enum: 'DigitalFormat', default: 'PDF' },
];

interface ForeignKey {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
  /** Défaut RESTRICT ; CASCADE pour les lignes qui n'existent qu'avec leur parent. */
  onDelete?: 'RESTRICT' | 'CASCADE';
}

/** Clés étrangères internes au schéma tenant (LIKE ne les copie pas). */
const TENANT_FOREIGN_KEYS: ForeignKey[] = [
  { table: 'users', column: 'role_id', refTable: 'roles', refColumn: 'id' },
  { table: 'password_tokens', column: 'user_id', refTable: 'users', refColumn: 'id' },
  { table: 'enrollments', column: 'user_id', refTable: 'users', refColumn: 'id' },
  { table: 'enrollments', column: 'class_id', refTable: 'school_classes', refColumn: 'id' },
  { table: 'items', column: 'record_id', refTable: 'biblio_records', refColumn: 'id' },
  { table: 'checkouts', column: 'item_id', refTable: 'items', refColumn: 'id' },
  { table: 'checkouts', column: 'patron_id', refTable: 'patrons', refColumn: 'id' },
  { table: 'holds', column: 'record_id', refTable: 'biblio_records', refColumn: 'id' },
  { table: 'holds', column: 'patron_id', refTable: 'patrons', refColumn: 'id' },
  { table: 'patrons', column: 'user_id', refTable: 'users', refColumn: 'id' },
  { table: 'digital_copies', column: 'record_id', refTable: 'biblio_records', refColumn: 'id' },
  // CASCADE : un contributeur n'a aucun sens sans sa notice (cahier §2.2) —
  // même comportement que la migration Prisma du gabarit public.
  {
    table: 'record_contributors',
    column: 'record_id',
    refTable: 'biblio_records',
    refColumn: 'id',
    onDelete: 'CASCADE',
  },
  // Lignes de liaison notice↔mot-clé : dépendantes de leurs deux parents.
  {
    table: 'record_keywords',
    column: 'record_id',
    refTable: 'biblio_records',
    refColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    table: 'record_keywords',
    column: 'keyword_id',
    refTable: 'keywords',
    refColumn: 'id',
    onDelete: 'CASCADE',
  },
  // Contribution → fiche d'autorité auteur. RESTRICT : un auteur rattaché à des
  // œuvres ne peut être supprimé (règle « suppression si zéro œuvre »).
  { table: 'record_contributors', column: 'author_id', refTable: 'authors', refColumn: 'id' },
  // Scan de récolement → sa session. CASCADE : supprimer une session efface ses scans.
  {
    table: 'inventory_scans',
    column: 'session_id',
    refTable: 'inventory_sessions',
    refColumn: 'id',
    onDelete: 'CASCADE',
  },
  // Cœur offline. CASCADE partout : un appareil/bail n'a aucun sens sans son
  // utilisateur/appareil/notice parent (mêmes onDelete que les relations Prisma
  // du gabarit public, pour rester cohérent entre public et tenant).
  { table: 'devices', column: 'user_id', refTable: 'users', refColumn: 'id', onDelete: 'CASCADE' },
  {
    table: 'offline_licenses',
    column: 'device_id',
    refTable: 'devices',
    refColumn: 'id',
    onDelete: 'CASCADE',
  },
  { table: 'offline_licenses', column: 'user_id', refTable: 'users', refColumn: 'id', onDelete: 'CASCADE' },
  {
    table: 'offline_licenses',
    column: 'record_id',
    refTable: 'biblio_records',
    refColumn: 'id',
    onDelete: 'CASCADE',
  },
];

interface TenantIndex {
  table: string;
  /** Colonnes (noms SQL/snake_case) dans l'ordre de l'index. */
  columns: string[];
  /** Nom de l'index, identique à celui généré par Prisma dans le gabarit public. */
  name: string;
}

/**
 * Index attendus sur les tables tenant, EN PLUS de ceux copiés par
 * `CREATE TABLE ... LIKE ... INCLUDING ALL` au provisioning (audit performance
 * 2026-07-14). Recensés ici pour pouvoir les (re)créer sur les écoles DÉJÀ
 * provisionnées via sync-schema : LIKE ne s'exécute qu'à la création et ne
 * rattrape jamais les tables existantes — exactement comme pour les colonnes
 * ajoutées après coup (voir buildAddMissingColumnsStatements). Les nouvelles
 * écoles héritent des index par LIKE, la resynchro ne fait alors rien (le
 * contrôle par signature de colonnes ci-dessous évite tout doublon).
 */
const TENANT_INDEXES: TenantIndex[] = [
  { table: 'holds', columns: ['record_id', 'status'], name: 'holds_record_id_status_idx' },
  { table: 'holds', columns: ['patron_id'], name: 'holds_patron_id_idx' },
  { table: 'items', columns: ['record_id'], name: 'items_record_id_idx' },
  {
    table: 'checkouts',
    columns: ['patron_id', 'return_date'],
    name: 'checkouts_patron_id_return_date_idx',
  },
  // Séries temporelles du tableau de bord (audit fonctionnel 2026-07-17).
  { table: 'checkouts', columns: ['checkout_date'], name: 'checkouts_checkout_date_idx' },
  { table: 'checkouts', columns: ['return_date'], name: 'checkouts_return_date_idx' },
];

/**
 * Index UNIQUES à garantir dans chaque schéma tenant.
 *
 * Distincts de TENANT_INDEXES : un index unique ne peut pas être créé si des
 * doublons existent déjà. On produit donc, pour chacun, une instruction de
 * DÉDOUBLONNAGE à exécuter juste avant.
 *
 * `LIKE ... INCLUDING ALL` les copie à la création d'une école ; ce mécanisme
 * ne sert qu'aux écoles DÉJÀ provisionnées, via sync-schema.
 */
interface TenantUniqueIndex {
  table: string;
  columns: string[];
  name: string;
  /** SQL supprimant les doublons, en gardant la ligne la plus pertinente. */
  dedupe: (schema: string) => string;
}

const TENANT_UNIQUE_INDEXES: TenantUniqueIndex[] = [
  {
    table: 'offline_licenses',
    columns: ['user_id', 'device_id', 'record_id'],
    // MÊME NOM que l'index généré par Prisma pour `@@unique`. Les nouvelles
    // écoles le reçoivent déjà par `LIKE ... INCLUDING ALL` : avec ce nom,
    // `IF NOT EXISTS` en fait un no-op chez elles, au lieu de créer un SECOND
    // index unique identique (coût d'écriture doublé sur une table chaude).
    // Ce mécanisme ne sert donc qu'aux écoles provisionnées avant la contrainte.
    name: 'offline_licenses_user_id_device_id_record_id_idx',
    // Préséance : une licence RÉVOQUÉE l'emporte (une révocation prononcée ne
    // doit jamais être annulée par un dédoublonnage), puis la plus tardive.
    dedupe: (schema) => `
      WITH classees AS (
        SELECT id, row_number() OVER (
                 PARTITION BY user_id, device_id, record_id
                 ORDER BY (status = 'revoked' OR revoked_at IS NOT NULL) DESC,
                          expires_at DESC, issued_at DESC
               ) AS rang
        FROM ${quote(schema)}."offline_licenses"
      )
      DELETE FROM ${quote(schema)}."offline_licenses"
      WHERE id IN (SELECT id FROM classees WHERE rang > 1)`.trim(),
  },
];

/**
 * Instructions garantissant les index uniques : dédoublonnage puis création.
 * `IF NOT EXISTS` rend l'ensemble idempotent.
 */
export function buildUniqueIndexStatements(slug: string): string[] {
  const schema = tenantSchemaName(slug);
  const out: string[] = [];
  for (const idx of TENANT_UNIQUE_INDEXES) {
    out.push(idx.dedupe(schema));
    out.push(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${quote(idx.name)} ` +
        `ON ${quote(schema)}.${quote(idx.table)} (${idx.columns.map(quote).join(', ')})`,
    );
  }
  return out;
}

/** Tables tenant portant au moins un index géré ici (pour l'introspection). */
const INDEXED_TENANT_TABLES = [...new Set(TENANT_INDEXES.map((i) => i.table))];

// Slug : minuscule initiale, puis minuscules/chiffres/tirets (2 à 49 caractères).
const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,48}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function tenantSchemaName(slug: string): string {
  if (!isValidSlug(slug)) {
    throw new Error(`Slug de tenant invalide : "${slug}"`);
  }
  return `tenant_${slug}`;
}

/** Identifiant SQL entre guillemets (le slug est déjà validé en amont). */
function quote(identifier: string): string {
  return `"${identifier}"`;
}

/**
 * Retourne les instructions DDL (une par élément) pour créer le schéma d'une
 * école et ses tables. À exécuter séquentiellement dans une transaction.
 */
export function buildProvisionStatements(slug: string): string[] {
  const schema = tenantSchemaName(slug);
  const s = quote(schema);
  const statements: string[] = [];

  statements.push(`CREATE SCHEMA ${s}`);

  // Types enum locaux au schéma tenant
  for (const [name, labels] of Object.entries(TENANT_ENUMS)) {
    const values = labels.map((l) => `'${l}'`).join(', ');
    statements.push(`CREATE TYPE ${s}.${quote(name)} AS ENUM (${values})`);
  }

  // Tables clonées depuis le gabarit public
  for (const table of TENANT_TABLES) {
    statements.push(
      `CREATE TABLE ${s}.${quote(table)} ` +
        `(LIKE ${quote('public')}.${quote(table)} INCLUDING ALL)`,
    );
  }

  // Reciblage des colonnes enum vers les types locaux (une instruction/colonne)
  for (const col of ENUM_COLUMNS) {
    const c = quote(col.column);
    const enumType = `${s}.${quote(col.enum)}`;
    statements.push(
      `ALTER TABLE ${s}.${quote(col.table)} ` +
        `ALTER COLUMN ${c} DROP DEFAULT, ` +
        `ALTER COLUMN ${c} TYPE ${enumType} USING ${c}::text::${enumType}, ` +
        `ALTER COLUMN ${c} SET DEFAULT '${col.default}'::${enumType}`,
    );
  }

  // Clés étrangères internes
  for (const fk of TENANT_FOREIGN_KEYS) {
    const constraint = `${fk.table}_${fk.column}_fkey`;
    statements.push(
      `ALTER TABLE ${s}.${quote(fk.table)} ` +
        `ADD CONSTRAINT ${quote(constraint)} ` +
        `FOREIGN KEY (${quote(fk.column)}) ` +
        `REFERENCES ${s}.${quote(fk.refTable)}(${quote(fk.refColumn)}) ` +
        `ON DELETE ${fk.onDelete ?? 'RESTRICT'} ON UPDATE CASCADE`,
    );
  }

  return statements;
}

/** Instruction DDL pour supprimer entièrement le schéma d'une école. */
export function buildDeprovisionStatement(slug: string): string {
  return `DROP SCHEMA IF EXISTS ${quote(tenantSchemaName(slug))} CASCADE`;
}

/**
 * Requête d'introspection : liste (table, colonne, type déclaré, type énuméré ?)
 * des colonnes réelles d'un schéma donné, pour les tables tenant. Utilisée par
 * syncTenantSchema pour détecter les colonnes ajoutées au modèle Prisma après
 * coup (ex. un champ optionnel ajouté à une table déjà provisionnée chez une
 * école) — `CREATE TABLE ... LIKE` ne s'exécute qu'une fois à la création et
 * ne rattrape jamais les tables déjà existantes.
 */
export function buildColumnIntrospectionQuery(schema: string): string {
  const tables = TENANT_TABLES.map((t) => `'${t}'`).join(', ');
  return `
    SELECT c.relname AS table_name, a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS type_decl,
           t.typtype = 'e' AS is_enum
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = '${schema}' AND c.relname IN (${tables})
      AND a.attnum > 0 AND NOT a.attisdropped
  `.trim();
}

export interface IntrospectedColumn {
  table_name: string;
  column_name: string;
  type_decl: string;
  is_enum: boolean;
}

/**
 * Compare les colonnes du gabarit `public` à celles d'un schéma tenant et
 * génère les `ALTER TABLE ADD COLUMN` pour celles qui manquent. Toujours
 * nullable (jamais de colonne NOT NULL sans défaut sur une table qui contient
 * déjà des lignes). Les colonnes enum sont exclues (log dédié côté appelant)
 * : leur type doit être recréé localement au schéma tenant, comme au
 * provisioning initial — pas géré ici pour rester simple et sûr.
 */
export function buildAddMissingColumnsStatements(
  slug: string,
  publicColumns: IntrospectedColumn[],
  tenantColumns: IntrospectedColumn[],
): { statements: string[]; skippedEnumColumns: string[] } {
  const schema = tenantSchemaName(slug);
  const tenantKeys = new Set(tenantColumns.map((c) => `${c.table_name}.${c.column_name}`));
  const statements: string[] = [];
  const skippedEnumColumns: string[] = [];

  for (const col of publicColumns) {
    const key = `${col.table_name}.${col.column_name}`;
    if (tenantKeys.has(key)) continue;

    if (col.is_enum) {
      skippedEnumColumns.push(key);
      continue;
    }

    statements.push(
      `ALTER TABLE ${quote(schema)}.${quote(col.table_name)} ` +
        `ADD COLUMN ${quote(col.column_name)} ${col.type_decl}`,
    );
  }

  return { statements, skippedEnumColumns };
}

export interface IntrospectedEnumValue {
  enum_name: string;
  value: string;
}

/**
 * Requête d'introspection : les valeurs de chaque type enum d'un schéma donné.
 * Sert à détecter les valeurs d'enum ajoutées au modèle après provisioning
 * (ex. ItemStatus.MISSING) que `CREATE TYPE` (rejoué mais déjà existant) ne
 * rattrape jamais chez une école déjà provisionnée.
 */
export function buildEnumValueIntrospectionQuery(schema: string): string {
  const names = Object.keys(TENANT_ENUMS).map((n) => `'${n}'`).join(', ');
  return `
    SELECT t.typname AS enum_name, e.enumlabel AS value
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '${schema}' AND t.typname IN (${names})
  `.trim();
}

/**
 * Compare les valeurs d'enum attendues (TENANT_ENUMS) à celles réellement
 * présentes chez une école et génère les `ALTER TYPE ... ADD VALUE IF NOT
 * EXISTS` manquants. `ADD VALUE` s'exécute hors transaction (chaque instruction
 * est auto-commit chez l'appelant) et `IF NOT EXISTS` le rend idempotent.
 */
export function buildMissingEnumValueStatements(
  slug: string,
  existing: IntrospectedEnumValue[],
): string[] {
  const schema = tenantSchemaName(slug);
  const present = new Set(existing.map((e) => `${e.enum_name}.${e.value}`));
  const statements: string[] = [];
  for (const [name, values] of Object.entries(TENANT_ENUMS)) {
    for (const value of values) {
      if (present.has(`${name}.${value}`)) continue;
      statements.push(
        `ALTER TYPE ${quote(schema)}.${quote(name)} ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }
  return statements;
}

export interface IntrospectedIndex {
  table_name: string;
  /** Colonnes de l'index, dans l'ordre (noms SQL). */
  columns: string[];
}

/**
 * Requête d'introspection : liste les index existants (table + colonnes
 * ordonnées) d'un schéma donné, pour les tables tenant indexées. Sert à
 * détecter, chez une école déjà provisionnée, les index attendus (TENANT_INDEXES)
 * qui manquent — sans jamais recréer un index déjà présent (comparaison par
 * signature de colonnes, indépendante du nom que Postgres a pu générer via LIKE).
 */
export function buildIndexIntrospectionQuery(schema: string): string {
  const tables = INDEXED_TENANT_TABLES.map((t) => `'${t}'`).join(', ');
  return `
    SELECT t.relname AS table_name,
           array_agg(a.attname ORDER BY k.ord) AS columns
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname = '${schema}' AND t.relname IN (${tables})
      AND a.attnum > 0
    GROUP BY i.oid, t.relname
  `.trim();
}

/** Signature stable d'un index : « table:col1,col2 » (ordre significatif). */
function indexSignature(table: string, columns: string[]): string {
  return `${table}:${columns.join(',')}`;
}

/**
 * Compare les index attendus (TENANT_INDEXES) à ceux réellement présents chez
 * une école et génère les `CREATE INDEX IF NOT EXISTS` pour ceux qui manquent.
 * Idempotent : la comparaison par signature de colonnes évite les doublons
 * (index déjà copié par LIKE sous un autre nom), et `IF NOT EXISTS` protège en
 * plus contre une collision de nom.
 */
export function buildMissingIndexStatements(
  slug: string,
  existing: IntrospectedIndex[],
): string[] {
  const schema = tenantSchemaName(slug);
  const present = new Set(
    existing.map((idx) => indexSignature(idx.table_name, idx.columns)),
  );

  const statements: string[] = [];
  for (const idx of TENANT_INDEXES) {
    if (present.has(indexSignature(idx.table, idx.columns))) continue;
    const cols = idx.columns.map(quote).join(', ');
    statements.push(
      `CREATE INDEX IF NOT EXISTS ${quote(idx.name)} ` +
        `ON ${quote(schema)}.${quote(idx.table)} (${cols})`,
    );
  }
  return statements;
}
