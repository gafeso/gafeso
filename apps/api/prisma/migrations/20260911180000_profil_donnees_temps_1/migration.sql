-- P3-3, temps 1 : les champs de profil rejoignent `profile_data`.
--
-- `publicationCity`, `defenseUniversity` et `defensePlace` sont des champs de
-- PROFIL logés dans le noyau. L'invariant I2 dit que le noyau ne grossit
-- jamais : chaque champ de profil ajouté en colonne le fait grossir et coûte
-- une migration multi-établissements. Une colonne JSON les accueille tous, et
-- un profil nouveau (`archives`, `iconographique`) n'en coûtera aucune.
--
-- ⚠ TEMPS 1 SUR DEUX, ET C'EST LE TEMPS RÉVERSIBLE. Les trois colonnes
-- RESTENT. Les écritures alimentent les deux endroits, les lectures passent par
-- `profile_data`. Le temps 2 retirera les colonnes, et lui seul est
-- irréversible — c'est la raison du découpage : 61 points de code à reprendre,
-- un consommateur manqué doit pouvoir être rattrapé.
--
-- ⚠ AUCUNE RÉPONSE NE CHANGE. Les trois valeurs continuent de voyager À PLAT,
-- aux clés que le mobile connaît (I7). `profile_data` n'est PAS servi — voir
-- `opac/contrat-notice-publique.ts`, où il est déclaré NON SERVI pour que le
-- garde-fou du contrat ne le laisse pas se glisser dans la réponse.
--
-- ⚠ ET `defenseUniversity` RESTE CHERCHABLE. Sortir un champ du noyau ne le
-- retire pas de la recherche : c'est un attribut cherchable PONDÉRÉ
-- (SEARCHABLE_ATTRIBUTES), pas une facette, et le document d'indexation
-- continue de le porter au premier niveau, avec la même valeur. Aucune
-- réindexation n'est due — mesuré avant le lot, pas supposé.
--
-- ⚠ POURQUOI CE SCRIPT AJOUTE LA COLONNE DANS CHAQUE SCHÉMA, alors que
-- l'idiome est « le gabarit public, puis sync-schema ». Parce que la RECOPIE
-- doit suivre l'ajout : une école non encore synchronisée verrait la colonne
-- arriver plus tard, vide, et rien ne repasserait remplir ses notices. Ajouter
-- et recopier dans le même balayage supprime cette fenêtre. `IF NOT EXISTS`
-- rend le geste inoffensif là où sync-schema est déjà passé.
--
-- IDEMPOTENTE, et même CONVERGENTE : la clause finale compare la valeur
-- existante à celle qu'on calcule. Rejouée, elle ne touche rien ; jouée après
-- une correction de colonne, elle rattrape l'écart.

DO $migration$
DECLARE
  schema_courant text;
  recopiees integer;
BEGIN
  FOR schema_courant IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = 'public' OR nspname LIKE 'tenant\_%'
    ORDER BY nspname
  LOOP
    -- Un schéma sans `biblio_records` n'est pas un schéma d'établissement
    -- provisionné : on passe, on ne suppose pas.
    IF to_regclass(format('%I.biblio_records', schema_courant)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.biblio_records '
      'ADD COLUMN IF NOT EXISTS profile_data jsonb NOT NULL DEFAULT ''{}''::jsonb',
      schema_courant);

    -- `jsonb_strip_nulls` retire les clés dont la valeur est NULL : une notice
    -- sans champ de profil garde donc `{}`, et non trois clés à null. Les clés
    -- sont en camelCase — ce sont les noms que l'application lit.
    EXECUTE format($sql$
      UPDATE %I.biblio_records
      SET profile_data = jsonb_strip_nulls(jsonb_build_object(
        'publicationCity',   publication_city,
        'defenseUniversity', defense_university,
        'defensePlace',      defense_place
      ))
      WHERE profile_data IS DISTINCT FROM jsonb_strip_nulls(jsonb_build_object(
        'publicationCity',   publication_city,
        'defenseUniversity', defense_university,
        'defensePlace',      defense_place
      ))
    $sql$, schema_courant);

    GET DIAGNOSTICS recopiees = ROW_COUNT;
    IF recopiees > 0 THEN
      RAISE NOTICE 'profile_data : % notice(s) recopiée(s) dans %.', recopiees, schema_courant;
    END IF;
  END LOOP;
END
$migration$;
