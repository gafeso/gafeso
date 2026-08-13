-- AlterTable : idempotence de l'email « réservation disponible ».
-- Colonne NULLable (aucun défaut) → le rattrapage sync-schema des écoles déjà
-- provisionnées peut l'ajouter sans réécrire les lignes existantes.
ALTER TABLE "holds" ADD COLUMN     "notified_at" TIMESTAMP(3);
