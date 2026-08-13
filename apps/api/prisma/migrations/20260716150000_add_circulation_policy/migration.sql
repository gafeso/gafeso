-- AlterTable : politique de circulation en ligne (schéma public, défauts non-null sûrs)
ALTER TABLE "tenant_settings" ADD COLUMN     "online_renewal_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "online_renewal_max" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "online_renewal_days" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "online_renewal_refuse_overdue" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hold_pickup_days" INTEGER NOT NULL DEFAULT 7;
