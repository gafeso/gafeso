-- `notified_at` DIT UN ÉTAT LÀ OÙ LA COLONNE STOCKE UN ÉVÉNEMENT.
--
-- Le nom affirme « a été notifié ». Le code y pose la date pour dire « la
-- tentative est SOLDÉE, ne rescannez plus » — et il l'y laisse même quand
-- personne n'a pu être prévenu, faute d'adresse exploitable (retrait au
-- guichet). En recettant, l'écran disait honnêtement « n'a PAS pu être
-- prévenu » à la seconde où la base portait `notified_at = 16:34:56`.
--
-- ⚠ CE N'EST PAS UN COMMENTAIRE PÉRIMÉ : rien n'a vieilli. Le nom était déjà
-- trompeur le jour où il a été écrit, et il le restera. Ce n'est pas une dette
-- qui s'est formée, c'est une dette qui est née — et elle se relit faux à
-- chaque fois, par tout le monde, indéfiniment.
--
-- ⚠ AUCUNE DONNÉE NE CHANGE. C'est un RENOMMAGE : les valeurs, les index et la
-- nullabilité sont conservés. `ALTER TABLE … RENAME COLUMN` ne réécrit pas la
-- table.
--
-- ⚠ ET IL PASSE SUR TOUTES LES ÉCOLES, plus le gabarit `public`. Sans la
-- boucle, la colonne ne serait renommée que là où Prisma l'applique, et les
-- écoles existantes divergeraient en silence — c'est ce que
-- `derive-des-schemas-en-base.spec.ts` existe pour attraper.
--
-- ⚠ IDEMPOTENT : la garde `information_schema` permet de rejouer le fichier
-- sans erreur. Un `ALTER … RENAME` nu échouerait au second passage et ferait
-- échouer le démarrage du conteneur `api`, qui applique les migrations en
-- attente à chaque boot.

DO $$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace
     WHERE nspname LIKE 'tenant\_%' OR nspname = 'public'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = s AND table_name = 'holds' AND column_name = 'notified_at'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = s AND table_name = 'holds' AND column_name = 'notification_tentee_a'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.holds RENAME COLUMN notified_at TO notification_tentee_a',
        s
      );
    END IF;
  END LOOP;
END $$;
