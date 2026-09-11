-- Un adhérent porte son propre nom.
--
-- Une carte de bibliothèque se délivre à une PERSONNE, pas à un compte
-- applicatif : un lecteur sans adresse e-mail, un visiteur extérieur, un élève
-- trop jeune pour un compte. Jusqu'ici le nom d'un adhérent ne venait que du
-- compte lié — une carte sans compte était donc anonyme, et la bibliothécaire
-- ne pouvait même pas trouver le compte à lier (GET /accounts exige
-- `lecteurs.voir`, qu'elle n'a pas).
--
-- NULLABLES, délibérément : les cartes déjà créées n'ont pas de nom, et une
-- colonne NOT NULL exigerait une valeur inventée. La contrainte « un nom OU un
-- compte lié » se pose dans le DTO, où elle peut être expliquée à l'utilisateur.
--
-- ⚠ TABLE TENANT. `patrons` existe dans CHAQUE schéma `tenant_<slug>`, copié
-- par `CREATE TABLE ... (LIKE public... INCLUDING ALL)` au provisioning — qui ne
-- copie qu'à la CRÉATION. Cette migration ne touche que le gabarit `public` :
-- les écoles déjà provisionnées reçoivent les colonnes en rejouant
-- `POST /admin/tenants/:slug/sync-schema` (voir DEPLOY.md). Sans ce rappel, la
-- migration serait vraie sur le gabarit et fausse partout ailleurs.

ALTER TABLE "patrons" ADD COLUMN IF NOT EXISTS "first_name" TEXT;
ALTER TABLE "patrons" ADD COLUMN IF NOT EXISTS "last_name" TEXT;
