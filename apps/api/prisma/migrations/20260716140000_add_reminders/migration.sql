-- AlterTable : paramètres de rappels par établissement (schéma public)
ALTER TABLE "tenant_settings" ADD COLUMN     "reminders_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminder_days_before" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "overdue_repeat_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "reminder_templates" JSONB;

-- CreateTable : journal des rappels envoyés (schéma public, dénormalisé, comme audit_logs)
CREATE TABLE "reminder_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "checkout_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stage_key" TEXT NOT NULL,
    "recipient_email" TEXT,
    "recipient_name" TEXT,
    "item_barcode" TEXT,
    "record_title" TEXT,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex : garantie d'idempotence (un rappel = une ligne, jamais deux)
CREATE UNIQUE INDEX "reminder_logs_checkout_id_type_stage_key_key" ON "reminder_logs"("checkout_id", "type", "stage_key");

-- CreateIndex : consultation du journal bornée au tenant, triée par date
CREATE INDEX "reminder_logs_tenant_id_created_at_idx" ON "reminder_logs"("tenant_id", "created_at");
