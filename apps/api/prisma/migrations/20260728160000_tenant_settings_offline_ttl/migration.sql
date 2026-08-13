-- TTL (jours) du bail de licence hors-ligne, par tenant. Schéma public
-- (pas de sync-schema) → défaut non-null sans risque sur les lignes existantes.
-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "offline_license_ttl_days" INTEGER NOT NULL DEFAULT 14;
