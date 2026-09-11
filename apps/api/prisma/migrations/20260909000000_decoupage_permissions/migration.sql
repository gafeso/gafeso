-- Découpage des permissions — transfert des attributions existantes.
--
-- `etablissement.gerer` commandait SIX écrans, dont le JOURNAL D'AUDIT, sous le
-- libellé « Modifier l'identité visuelle de l'école ». Cette migration remplace
-- les anciennes fonctions par les nouvelles sur chaque rôle déjà en base.
--
-- ⚠ PERSONNE NE PERD, PERSONNE NE GAGNE. Chaque rôle reçoit exactement l'image
-- de ses anciennes fonctions. Aucune composition de rôle n'est touchée.
--
-- ⚠ TABLE TENANT, ET DES DONNÉES — PAS UNE STRUCTURE. `roles` existe dans
-- CHAQUE schéma `tenant_<slug>`. Contrairement aux migrations de structure, que
-- `sync-schema` rattrape après coup, une migration de DONNÉES n'est rattrapée
-- par rien : une école provisionnée AVANT ce changement garderait ses anciennes
-- fonctions pour toujours, et ses comptes perdraient tous leurs écrans le jour
-- où le code ne connaîtrait plus que les nouvelles.
-- Ce script balaie donc explicitement tous les schémas, `public` (le gabarit)
-- inclus.
--
-- IDEMPOTENTE : rejouée, elle ne change rien. Les nouvelles fonctions ne sont
-- l'image d'aucune ancienne et retombent sur la branche ELSE. Une école
-- provisionnée après le changement traverse donc ce script sans dommage.

DO $migration$
DECLARE
  schema_courant text;
BEGIN
  FOR schema_courant IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = 'public' OR nspname LIKE 'tenant\_%'
    ORDER BY nspname
  LOOP
    -- Un schéma sans table `roles` n'est pas un schéma d'établissement
    -- provisionné : on passe, on ne suppose pas.
    IF to_regclass(format('%I.roles', schema_courant)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format($sql$
      UPDATE %I.roles AS r
      SET functions = calcul.nouvelles
      FROM (
        SELECT
          source.id,
          ARRAY(
            SELECT DISTINCT nouvelle
            FROM unnest(source.functions) AS ancienne,
            LATERAL unnest(
              CASE ancienne
                WHEN 'etablissement.gerer' THEN ARRAY[
                  'etablissement.apparence',
                  'etablissement.regles',
                  'diffusion.gerer',
                  'statistiques.voir',
                  'securite.audit',
                  'circulation.retards'
                ]
                WHEN 'catalogue.gerer'    THEN ARRAY['catalogue.gerer', 'outils.catalogue']
                WHEN 'etudiants.importer' THEN ARRAY['outils.lecteurs']
                WHEN 'comptes.voir'       THEN ARRAY['lecteurs.voir']
                WHEN 'classes.gerer'      THEN ARRAY['lecteurs.gerer']
                WHEN 'circulation.gerer'  THEN ARRAY['circulation.faire']
                WHEN 'roles.gerer'        THEN ARRAY['securite.roles']
                ELSE ARRAY[ancienne]
              END
            ) AS nouvelle
          ) AS nouvelles
        FROM %I.roles AS source
      ) AS calcul
      WHERE r.id = calcul.id
        AND r.functions IS DISTINCT FROM calcul.nouvelles
    $sql$, schema_courant, schema_courant);
  END LOOP;
END
$migration$;
