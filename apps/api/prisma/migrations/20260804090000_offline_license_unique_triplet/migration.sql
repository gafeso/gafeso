-- UNE licence par (utilisateur, appareil, document).
--
-- Sans cette contrainte, chaque émission créait une ligne de plus. Révoquer
-- « la » licence n'en révoquait qu'une : les doublons restaient actifs et le
-- blob chiffré restait téléchargeable. Constaté en conditions réelles avec
-- 7 licences actives pour un même document.
--
-- DÉDOUBLONNAGE AVANT CONTRAINTE. On conserve, pour chaque triplet, la ligne
-- la plus PERTINENTE — et non la plus récente : une licence révoquée doit le
-- rester. Ordre de préséance :
--   1. révoquée (une révocation déjà prononcée ne doit jamais être annulée) ;
--   2. à défaut, celle qui expire le plus tard (le droit réellement accordé).
-- Les autres sont supprimées : ce sont des doublons que personne ne pouvait
-- distinguer, et l'appareil n'en suit qu'une par document.
WITH classees AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, device_id, record_id
           ORDER BY (status = 'revoked' OR revoked_at IS NOT NULL) DESC,
                    expires_at DESC,
                    issued_at DESC
         ) AS rang
  FROM "offline_licenses"
)
DELETE FROM "offline_licenses"
WHERE id IN (SELECT id FROM classees WHERE rang > 1);

-- Même nom que celui généré par Prisma pour `@@unique`, afin que les
-- écoles créées ensuite (LIKE ... INCLUDING ALL) n'en reçoivent pas un second.
CREATE UNIQUE INDEX IF NOT EXISTS "offline_licenses_user_id_device_id_record_id_idx"
  ON "offline_licenses" ("user_id", "device_id", "record_id");
