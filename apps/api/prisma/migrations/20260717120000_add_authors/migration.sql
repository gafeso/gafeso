-- CreateTable : fiche d'autorité auteur (gabarit public ; répliquée par
-- CREATE TABLE ... LIKE dans chaque schéma tenant au provisioning / sync-schema)
CREATE TABLE "authors" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "bio" TEXT,
    "birth_year" INTEGER,
    "death_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "authors_normalized_name_idx" ON "authors"("normalized_name");
CREATE INDEX "authors_display_name_idx" ON "authors"("display_name");

-- AlterTable : lien contribution → fiche d'autorité (NULLable, name dénormalisé gardé)
ALTER TABLE "record_contributors" ADD COLUMN     "author_id" TEXT;

-- CreateIndex
CREATE INDEX "record_contributors_author_id_idx" ON "record_contributors"("author_id");

-- AddForeignKey (RESTRICT : pas de suppression d'un auteur rattaché à des œuvres)
ALTER TABLE "record_contributors" ADD CONSTRAINT "record_contributors_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
