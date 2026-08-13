-- CreateTable
CREATE TABLE "record_contributors" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "record_contributors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "record_contributors_record_id_idx" ON "record_contributors"("record_id");

-- AddForeignKey
ALTER TABLE "record_contributors" ADD CONSTRAINT "record_contributors_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "biblio_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

