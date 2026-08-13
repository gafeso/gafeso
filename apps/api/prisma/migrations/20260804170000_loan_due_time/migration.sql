-- Échéance des prêts à une HEURE FIXE, dans le fuseau de l'établissement.
--
-- L'échéance était un instant (« emprunt + 14 × 24 h ») : un prêt fait à 17 h
-- était dû à 17 h, et rendu à 17 h 30 le jour dit il coûtait un jour d'amende
-- — incompréhensible pour un bibliothécaire qui lit « dû le 15 ».
--
-- Réglage et non constante : une valeur figée redevient fausse chez le client
-- suivant. Le fuseau, lui, existait DÉJÀ (tenant_settings.timezone) — il était
-- simplement inutilisé pour les prêts ; on le réutilise plutôt que d'en ajouter
-- un second, qui aurait pu diverger.
ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "loan_due_time" TEXT NOT NULL DEFAULT '16:00';
