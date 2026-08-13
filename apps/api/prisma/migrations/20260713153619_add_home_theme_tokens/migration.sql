-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "lattice_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "theme_tokens" JSONB;

