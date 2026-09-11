-- `modules.gerer` atteint les rôles DÉJÀ en base.
--
-- La fonction est nouvelle (P4-1) : elle garde `PATCH /modules/:id`, qui active
-- ou désactive un module pour l'établissement. Éteindre un module retire des
-- écrans à toute l'école — ce n'est pas un réglage, c'est une décision de
-- périmètre, d'où l'Administrateur SEUL (décision 2 du brief).
--
-- ⚠ MÊME RAISON QUE POUR `securite.authentification` : `ensureSystemRoles`
-- réaffirme les fonctions des rôles système, mais seulement quand elle PASSE —
-- au provisionnement d'une école, ou sur `GET /roles`. Sans ce script, la
-- fonction n'atteindrait l'Administrateur qu'APRÈS qu'il ait ouvert l'écran des
-- rôles : d'ici là, 403 sur la route, et rien pour le lui dire. Une règle
-- découverte par un refus est un défaut, pas une procédure.
--
-- ⚠ TABLE TENANT, ET DES DONNÉES : `roles` existe dans chaque schéma
-- `tenant_<slug>`, et une migration de données n'est rattrapée par rien.
--
-- IDEMPOTENTE, et elle ne touche QUE le rôle système Administrateur.

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
    IF to_regclass(format('%I.roles', schema_courant)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format($sql$
      UPDATE %I.roles
      SET functions = array_append(functions, 'modules.gerer')
      WHERE is_system = true
        AND name = 'Administrateur'
        AND NOT ('modules.gerer' = ANY(functions))
    $sql$, schema_courant);

    GET DIAGNOSTICS touches = ROW_COUNT;
    IF touches > 0 THEN
      RAISE NOTICE 'modules.gerer accordée à l''Administrateur dans % (% rôle).',
        schema_courant, touches;
    END IF;
  END LOOP;
END
$migration$;
