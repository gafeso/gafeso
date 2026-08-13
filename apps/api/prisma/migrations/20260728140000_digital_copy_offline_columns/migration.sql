-- Colonnes d'ingestion offline sur digital_copies (toutes NULLABLES : le clair
-- est conservé pour la lecture en ligne ; le blob chiffré + la CEK enveloppée
-- s'ajoutent en parallèle). Pas d'enum. Le sync-schema rattrape ces colonnes sur
-- les écoles déjà provisionnées (buildAddMissingColumnsStatements).
-- AlterTable
ALTER TABLE "digital_copies" ADD COLUMN     "enc_algo" TEXT,
ADD COLUMN     "enc_error" TEXT,
ADD COLUMN     "enc_object_key" TEXT,
ADD COLUMN     "enc_seg_size" INTEGER,
ADD COLUMN     "enc_status" TEXT,
ADD COLUMN     "enc_wrapped_cek" TEXT,
ADD COLUMN     "encrypted_at" TIMESTAMP(3),
ADD COLUMN     "xref_validated_at" TIMESTAMP(3);
