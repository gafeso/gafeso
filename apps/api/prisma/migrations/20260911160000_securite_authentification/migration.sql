-- `securite.authentification` atteint les rôles DÉJÀ en base.
--
-- La fonction est nouvelle : elle garde `PATCH /auth/policy`, qui décide si la
-- double authentification est obligatoire dans l'établissement. Ce réglage se
-- posait jusqu'ici avec `etablissement.apparence` — la permission des couleurs
-- et du logo.
--
-- ⚠ POURQUOI UNE MIGRATION ALORS QUE `ensureSystemRoles` RÉAFFIRME LES
-- FONCTIONS. Elle les réaffirme, mais seulement quand elle PASSE — et elle ne
-- passe qu'au provisionnement d'une école, ou sur `GET /roles`. Sans ce
-- script, la fonction n'atteindrait l'Administrateur qu'APRÈS que quelqu'un ait
-- ouvert l'écran des rôles : d'ici là, la seule personne censée décider de la
-- politique d'authentification recevrait un 403, et rien ne lui dirait qu'il
-- lui suffit d'aller voir un écran sans rapport. Une règle découverte par un
-- refus est un défaut, pas une procédure.
--
-- ⚠ TABLE TENANT, ET DES DONNÉES. `roles` existe dans CHAQUE schéma
-- `tenant_<slug>`, et une migration de DONNÉES n'est rattrapée par rien :
-- `sync-schema` propage les colonnes, pas les lignes. Le script balaie donc
-- tous les schémas, gabarit `public` inclus.
--
-- ⚠ ADMINISTRATEUR SEUL — décision du 11 septembre 2026. Créer la fonction
-- pour un « rôle sécurité » qui n'existe pas serait poser une case que personne
-- ne coche. Le jour où une école crée un tel rôle, elle cochera celle-ci.
--
-- IDEMPOTENTE : la clause WHERE exclut les rôles qui la portent déjà. Rejouée,
-- elle ne change rien. Et elle ne touche QUE le rôle système Administrateur :
-- un rôle personnalisé, même nommé « Administrateur adjoint », n'est pas
-- concerné.

DO $migration$
DECLARE
  schema_courant text;
  touches integer;
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
      UPDATE %I.roles
      SET functions = array_append(functions, 'securite.authentification')
      WHERE is_system = true
        AND name = 'Administrateur'
        AND NOT ('securite.authentification' = ANY(functions))
    $sql$, schema_courant);

    GET DIAGNOSTICS touches = ROW_COUNT;
    IF touches > 0 THEN
      RAISE NOTICE 'securite.authentification accordée à l''Administrateur dans % (% rôle).',
        schema_courant, touches;
    END IF;
  END LOOP;
END
$migration$;
