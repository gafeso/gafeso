-- P6-2 · La table des dépôts.
--
-- ⚠ TABLE TENANT : elle porte l'identité d'un étudiant et son fichier. La
-- migration Prisma ne la crée que dans le gabarit `public` ; la boucle en fin
-- de fichier la crée dans les écoles DÉJÀ provisionnées.
-- `CREATE TABLE ... (LIKE ... INCLUDING ALL)` ne s'exécute qu'au provisioning
-- et ne rattrape jamais l'existant. `deposits` est aussi ajoutée à
-- `TENANT_TABLES` pour que `sync-schema` la crée sur toute école future.
--
-- ⚠ AUCUNE CLÉ ÉTRANGÈRE, comme toutes les tables tenant : `LIKE ...
-- INCLUDING ALL` ne copie jamais les contraintes de clé étrangère, donc aucune
-- n'en porte aujourd'hui. On reste cohérent avec l'existant plutôt que
-- d'introduire une asymétrie sur cette seule table.
--
-- ⚠ STATUT EN TEXTE et non enum Postgres : un type enum doit être recréé dans
-- chaque schéma d'école (voir TENANT_ENUMS). Les quatre valeurs sont tenues par
-- `src/depots/etats.ts`, et un test vérifie que le DÉFAUT de la colonne est
-- bien l'état initial déclaré là-bas.

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'brouillon',
    "depositor_id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "director_id" TEXT,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "document_type" TEXT NOT NULL,
    "document_version" TEXT NOT NULL DEFAULT 'version_soutenue',
    "file_key" TEXT,
    "file_name" TEXT,
    "file_size" INTEGER,
    "record_id" TEXT,
    "refusal_reason" TEXT,
    "submitted_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "decided_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE INDEX "deposits_depositor_id_idx" ON "deposits"("depositor_id");

-- CreateIndex
CREATE INDEX "deposits_director_id_status_idx" ON "deposits"("director_id", "status");


-- ── Les écoles DÉJÀ provisionnées
DO $migration$
DECLARE
  schema_courant text;
  faites integer := 0;
BEGIN
  FOR schema_courant IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' ORDER BY nspname
  LOOP
    -- `LIKE public.deposits INCLUDING ALL` copie colonnes, défauts, clé
    -- primaire et index — la même mécanique que le provisioning, donc aucune
    -- divergence possible entre une école créée avant et une créée après.
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.deposits (LIKE public.deposits INCLUDING ALL)',
      schema_courant);
    faites := faites + 1;
  END LOOP;
  RAISE NOTICE 'deposits : % schéma(s) tenant rattrapé(s)', faites;
END
$migration$;
