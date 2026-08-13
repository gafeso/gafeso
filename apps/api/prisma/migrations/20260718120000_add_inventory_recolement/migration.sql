-- Récolement / inventaire (vague 2) : statut MISSING + tables de session/scan.

-- AlterEnum : statut « introuvable au récolement ».
ALTER TYPE "ItemStatus" ADD VALUE 'MISSING';

-- CreateTable
CREATE TABLE "inventory_sessions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "inventory_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_scans" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "item_id" TEXT,
    "result" TEXT NOT NULL,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_scans_session_id_idx" ON "inventory_scans"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_scans_session_id_barcode_key" ON "inventory_scans"("session_id", "barcode");

-- AddForeignKey
ALTER TABLE "inventory_scans" ADD CONSTRAINT "inventory_scans_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
