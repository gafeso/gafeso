-- ═══════════════════════════════════════════════════════════════════════════
-- RETOUR EN ARRIÈRE de `20261006180000_usage_nominatif`.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v CONFIRME=oui \
--     -f scripts/migrations/retour-avant-usage-nominatif.sql
--
-- ⚠ À NE LANCER QUE SI LE CODE EST REVENU À UNE VERSION ANTÉRIEURE À rc6, et
-- jamais « pour nettoyer ». Mesuré sur un cluster jetable le 9 octobre 2026 :
--
--   · `prisma migrate deploy` d'une version ANTÉRIEURE sur une base montée à
--     rc6 sort en **0** — « No pending migrations to apply ». Le conteneur
--     DÉMARRE : le schéma n'empêche pas le retour, et les colonnes neuves,
--     nullables, ne gênent aucun `INSERT` de l'ancien code.
--
--   · 🔴 MAIS L'ANCIEN CODE FILTRE SUR LA VALEUR. Le rapport annuel de rc4 fait
--     `count(*) where kind = 'LECTURE'`. Après le renommage, il compte **ZÉRO**
--     — mesuré : 3 lignes en base, 0 comptées. Un zéro muet dans un document
--     remis à une université, c'est-à-dire exactement le faux que ce produit
--     passe son temps à corriger.
--
-- C'est donc le RENOMMAGE qu'il faut défaire, pas les colonnes.
--
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠ CE QUI EST RÉVERSIBLE, ET CE QUI NE L'EST PAS
--
-- | La migration a fait | Défait ici | Perte |
-- |---|---|---|
-- | 3 colonnes + 3 index | NON, exprès | aucune — l'ancien code les ignore |
-- | `LECTURE` → `CONSULTATION` | OUI, borné | aucune, voir ci-dessous |
--
-- ⚠ POURQUOI LES COLONNES RESTENT. Les retirer détruirait les `user_id` et
-- `class_name` collectés depuis le déploiement — la seule donnée que ce lot ait
-- produite. Et rien ne l'exige : un `INSERT` qui ne les nomme pas réussit, et
-- un `SELECT` de Prisma énumère ses colonnes. On ne détruit pas une donnée pour
-- défaire un changement qui ne la gêne pas.
--
-- ⭐ LE DISCRIMINANT EST EXACT, ET IL EST LU EN BASE
--
-- Le renommage est borné par `started_at` de la migration, dans
-- `_prisma_migrations` — posé par `migrate deploy`, vérifié sur le cluster
-- jetable. Toute ligne `CONSULTATION` antérieure a été RENOMMÉE ; toute ligne
-- postérieure est une vraie consultation de rc6.
--
-- ⚠ ET IL N'Y A PAS D'AUTRE DISCRIMINANT. `user_id IS NULL` ne marche PAS : une
-- consultation de BIBLIOTHÉCAIRE est écrite sans auteur, délibérément (« un
-- bibliothécaire qui ouvre un document pour vérifier une notice ne doit pas
-- gonfler la filière de personne »). Elle est donc indiscernable d'une ligne
-- renommée — c'est pourquoi ce fichier REFUSE quand l'horodatage manque, au
-- lieu de retomber sur un critère approchant.
--
-- ⚠ CE QUI RESTE EN 'CONSULTATION' APRÈS CE RETOUR : les consultations
-- réellement enregistrées par rc6. L'ancien code ne les comptera pas — et c'est
-- JUSTE : elles n'existaient pas dans son vocabulaire. Le compte est imprimé,
-- pour que personne ne découvre l'écart dans un rapport.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠ LE REFUS LÈVE, il ne se contente pas d'imprimer.
--
-- Première rédaction : `\q 1`. Mesuré — ce psql répond « extra argument "1"
-- ignored » et sort en **0**. Un garde qui DÉTECTE et laisse passer est pire
-- qu'un garde absent : la ligne « ✗ REFUS » s'affiche, et le script appelant
-- enchaîne. On lève donc une exception SQL, qui rend 3 avec ON_ERROR_STOP.
--
-- ⚠ ET LA LEVÉE TIENT SUR UNE SEULE LIGNE. Mesuré aussi : un `DO $$` sur
-- plusieurs lignes dans une branche `\else` produit « syntax error at or
-- near "||" » — psql traite ses conditionnelles LIGNE PAR LIGNE. Le code de
-- sortie était bien 3, mais pour la mauvaise raison : un refus qui lève sur
-- une faute de syntaxe ne dit pas à l'exploitant ce qu'il doit faire.
\if :{?CONFIRME}
\else
DO $$ BEGIN RAISE EXCEPTION 'REFUS : relancez avec -v CONFIRME=oui. Ce fichier MODIFIE des donnees — il est ecrit pour etre LU avant d''etre lance. Rien n''a ete ecrit.'; END $$;
\endif

BEGIN;

DO $$
DECLARE
  borne   timestamptz;
  s       text;
  renomme bigint := 0;
  rendues bigint := 0;
  n       bigint;
  reste   bigint := 0;
BEGIN
  -- ① LE DISCRIMINANT, OU RIEN.
  SELECT started_at INTO borne
    FROM public._prisma_migrations
   WHERE migration_name = '20261006180000_usage_nominatif'
     AND finished_at IS NOT NULL;

  IF borne IS NULL THEN
    -- ⚠ UN SEUL LITTÉRAL : `RAISE EXCEPTION 'a' || 'b'` N'EST PAS du plpgsql
    -- valide — le mot-clé attend un format, pas une expression. Ma première
    -- rédaction concaténait, et c'est CETTE faute de syntaxe qui faisait
    -- sortir le fichier en 3 : mon contrôle négatif confirmait pour la
    -- mauvaise raison. Un littéral peut tenir sur plusieurs lignes.
    RAISE EXCEPTION 'REFUS : la migration « 20261006180000_usage_nominatif » n''est pas enregistrée comme appliquée dans _prisma_migrations. Sans son horodatage, rien ne distingue une ligne RENOMMÉE d''une vraie consultation de rc6 — une consultation de bibliothécaire est écrite sans auteur, donc user_id IS NULL ne discrimine pas. Rien n''a été écrit.';
  END IF;
  RAISE NOTICE 'borne du renommage : % (started_at de la migration)', borne;

  -- ② LE RENOMMAGE INVERSE, PAR ÉCOLE ET BORNÉ.
  FOR s IN
    SELECT nspname FROM pg_namespace
    WHERE nspname = 'public' OR nspname LIKE 'tenant\_%'
    ORDER BY 1
  LOOP
    IF to_regclass(format('%I.usage_events', s)) IS NULL THEN CONTINUE; END IF;

    EXECUTE format(
      'UPDATE %I.usage_events SET kind = ''LECTURE''
        WHERE kind = ''CONSULTATION'' AND occurred_at < %L', s, borne);
    -- ⚠ DEUX VARIABLES, PAS UNE. Première rédaction : je réutilisais `n` pour
    -- les deux comptes, et le message imprimait « 1 rendues » là où il y en
    -- avait 2 — le second `INTO n` avait écrasé le premier. Un compte faux
    -- dans un message est exactement ce que ce dépôt passe son temps à
    -- corriger, et il était dans la ligne écrite pour rassurer l'exploitant.
    GET DIAGNOSTICS rendues = ROW_COUNT;
    renomme := renomme + rendues;

    EXECUTE format(
      'SELECT count(*) FROM %I.usage_events
        WHERE kind = ''CONSULTATION'' AND occurred_at >= %L', s, borne) INTO n;
    reste := reste + n;
    IF rendues > 0 OR n > 0 THEN
      RAISE NOTICE '  % : % rendues à LECTURE, % consultation(s) de rc6 conservée(s)', s, rendues, n;
    END IF;
  END LOOP;

  -- ③ LE CONTRÔLE : plus AUCUNE 'CONSULTATION' avant la borne, partout.
  FOR s IN
    SELECT nspname FROM pg_namespace
    WHERE nspname = 'public' OR nspname LIKE 'tenant\_%'
  LOOP
    IF to_regclass(format('%I.usage_events', s)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'SELECT count(*) FROM %I.usage_events
        WHERE kind = ''CONSULTATION'' AND occurred_at < %L', s, borne) INTO n;
    IF n <> 0 THEN
      RAISE EXCEPTION 'RETOUR REFUSÉ : % garde % ligne(s) CONSULTATION antérieures à la borne. Rien n''a été écrit.', s, n;
    END IF;
  END LOOP;

  RAISE NOTICE '✓ % ligne(s) rendues à LECTURE.', renomme;
  RAISE NOTICE '⚠ % consultation(s) enregistrées par rc6 restent en CONSULTATION :', reste;
  RAISE NOTICE '  l''ancien code ne les comptera PAS dans son rapport annuel.';
  RAISE NOTICE '  Ce n''est pas une perte de donnée — c''est un mot qu''il ne connaît pas.';
END $$;

COMMIT;
