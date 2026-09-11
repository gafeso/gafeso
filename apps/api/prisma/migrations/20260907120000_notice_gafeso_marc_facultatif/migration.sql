-- Notice Gafeso — le MARC devient facultatif (lot 1 du chantier « noyau de
-- notice et profils de description », voir docs/architecture-notice.md).
--
-- Trois changements, et rien d'autre. Aucune donnée existante n'est modifiée :
-- les notices déjà en base gardent leur `marc_data`, leur `marc_format` et
-- reçoivent le profil `bibliographique` par défaut.
--
-- ⚠ TABLE TENANT. `biblio_records` existe dans CHAQUE schéma `tenant_<slug>`,
-- copié par `CREATE TABLE ... (LIKE public... INCLUDING ALL)` au provisioning.
-- Cette migration ne touche que le gabarit `public` : les écoles déjà
-- provisionnées gardent leur `marc_data NOT NULL` et leur enum `MarcFormat`
-- sans `GAFESO` tant que `POST /admin/tenants/:slug/sync-schema` n'a pas été
-- rejoué (étapes 5 et 6 de `AdminService.syncTenantSchema`). Voir DEPLOY.md.

-- 1) Le modèle plat propriétaire a un nom, et une valeur qui le désigne.
--    Une notice saisie dans Gafeso n'est ni du MARC21 ni de l'UNIMARC.
ALTER TYPE "MarcFormat" ADD VALUE IF NOT EXISTS 'GAFESO';

-- 2) Les métadonnées natives (couche 3) sont facultatives : une notice sans
--    source MARC n'en a pas. `{"fields": []}` la faisait passer pour une
--    notice MARC vide — une affirmation fausse inscrite dans le schéma.
ALTER TABLE "biblio_records" ALTER COLUMN "marc_data" DROP NOT NULL;

-- 3) Profil de description (couche 2). Ne pilote encore AUCUN comportement :
--    la colonne est posée maintenant pour ne pas migrer deux fois une table
--    de notices déjà en service. Toutes les notices existantes sont
--    `bibliographique` ; le classement des thèses en `academique` est une
--    décision de la phase C, pas un effet de bord de cette migration.
ALTER TABLE "biblio_records" ADD COLUMN "profile" TEXT NOT NULL DEFAULT 'bibliographique';
