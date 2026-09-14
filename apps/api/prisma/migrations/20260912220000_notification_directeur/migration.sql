-- QUI A DÉJÀ ÉTÉ PRÉVENU D'UNE SOUMISSION — et rien d'autre.
--
-- ⚠ POURQUOI. Trois tentatives d'envoi vers le même directeur en deux minutes,
-- mesurées par la session frontend : soumission, retrait, resoumission. Muet en
-- développement ; en production, un étudiant qui hésite inonde son directeur, et
-- un directeur inondé cesse de lire — donc il ne lira pas non plus le jour où le
-- message compte.
--
-- La règle tient en une ligne grâce à cette colonne :
--     prévenir SI notified_director_id <> director_id
--
--   première soumission            NULL ≠ directeur  → prévenu
--   resoumission, même directeur   égal              → SILENCE
--   resoumission, autre directeur  diffère           → prévenu
--
-- ⚠ LE RETRAIT, LUI, PRÉVIENT TOUJOURS. Il est le seul des trois qui RETIRE
-- quelque chose de la liste du directeur : quelqu'un qui a commencé à lire un
-- mémoire retiré perd son temps sans le savoir.
--
-- ⚠ TEXTE ET NON RELATION DÉCLARÉE : c'est un ÉTAT D'ENVOI, pas un lien. Une
-- clé étrangère sur `users` ferait dépendre l'historique des notifications de
-- la survie du compte, et supprimer un enseignant rejouerait des courriels
-- déjà envoyés.
--
-- ⚠ LE REMPLISSAGE N'EST PAS UNE COQUETTERIE — même raison que `closed_as`.
-- Sans lui, NULL voudrait dire deux choses : « jamais prévenu » et « prévenu
-- avant ce lot ». Après remplissage, NULL veut dire « aucune notification de
-- soumission n'a abouti », et rien d'autre.
--
-- ⚠ ET SA LIMITE, écrite plutôt que tue : un dépôt RETIRÉ avant ce lot est
-- `brouillon` et son `submitted_at` a été effacé — rien ne dit qu'il avait été
-- soumis. Ceux-là produiront UNE notification de trop à leur resoumission, puis
-- se tairont. On ne sait pas les distinguer, et on n'invente pas.
--
-- Idempotente : `IF NOT EXISTS`, et le remplissage ne touche que les lignes
-- encore nulles.

DO $$
DECLARE
  s text;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace
     WHERE nspname = 'public' OR nspname LIKE 'tenant_%'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = s AND table_name = 'deposits'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.deposits ADD COLUMN IF NOT EXISTS notified_director_id text', s
      );
      EXECUTE format(
        'UPDATE %I.deposits SET notified_director_id = director_id
          WHERE status IN (''soumis'', ''valide'', ''refuse'')
            AND director_id IS NOT NULL
            AND notified_director_id IS NULL', s
      );
    END IF;
  END LOOP;
END $$;
