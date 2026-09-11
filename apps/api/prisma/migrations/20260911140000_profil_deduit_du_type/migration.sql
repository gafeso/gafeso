-- Le profil de chaque notice est déduit de son type (P3-2).
--
-- La colonne `profile` existait depuis P0 et portait UNE SEULE valeur partout :
-- `bibliographique`. Les mémoires et les thèses étaient donc classés comme des
-- ouvrages. Le code déduit désormais le profil à l'écriture
-- (`profilPourTypeDeNotice`) ; cette migration rattrape l'existant, sans quoi
-- `profile` serait un champ qui mentirait dès sa naissance.
--
-- ⚠ CHANGEMENT DE RÉPONSE ANNONCÉ, ET C'EST LE SEUL. `profile` est SERVI par
-- `GET /opac/records/:id` — la surface que protège l'invariant I7. La valeur
-- change donc pour les notices de soutenance. Aucun consommateur ne LIT cette
-- valeur (relevé §3 : « emporté », nommé par la seule administration), et la
-- FORME de la réponse est inchangée : I7 tient. Mais la différence doit être
-- exactement celle-là, et le filet de comparaison la vérifie.
--
-- ⚠ TABLE TENANT, ET DES DONNÉES — PAS UNE STRUCTURE. `biblio_records` existe
-- dans CHAQUE schéma `tenant_<slug>`. Une migration de DONNÉES n'est rattrapée
-- par RIEN : `sync-schema` propage les colonnes et les valeurs d'énumération,
-- pas les lignes. Une école provisionnée avant ce changement garderait ses
-- thèses classées « bibliographique » pour toujours. Ce script balaie donc tous
-- les schémas, le gabarit `public` inclus.
--
-- ⚠ ET LE VOCABULAIRE EST ICI POUR LA QUATRIÈME FOIS. La liste des types de
-- soutenance vit dans `description-profiles.ts` (DEFENSE_RECORD_TYPES), d'où la
-- déduction et la règle des champs obligatoires la tirent toutes deux. Le SQL ne
-- peut pas l'importer : il la recopie. C'est exactement la classe de défaut du
-- §2 du relevé — un même vocabulaire en plusieurs endroits qui ne se parlent
-- pas. Le garde est donc un test : `profil-de-notice.spec.ts` compare la liste
-- de CE FICHIER à la liste TypeScript et échoue si elles divergent.
--
-- IDEMPOTENTE : la clause WHERE ne retient que les lignes dont le profil diffère
-- déjà du profil déduit. Rejouée, elle ne change rien.

DO $migration$
DECLARE
  schema_courant text;
  reclassees integer;
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

    EXECUTE format($sql$
      UPDATE %I.biblio_records
      SET profile = CASE
        WHEN record_type IN ('these', 'memoire', 'licence', 'master', 'these_unique')
          THEN 'academique'
        ELSE 'bibliographique'
      END
      WHERE profile IS DISTINCT FROM CASE
        WHEN record_type IN ('these', 'memoire', 'licence', 'master', 'these_unique')
          THEN 'academique'
        ELSE 'bibliographique'
      END
    $sql$, schema_courant);

    GET DIAGNOSTICS reclassees = ROW_COUNT;
    IF reclassees > 0 THEN
      RAISE NOTICE 'Profils déduits du type : % notice(s) reclassée(s) dans %.',
        reclassees, schema_courant;
    END IF;
  END LOOP;
END
$migration$;
