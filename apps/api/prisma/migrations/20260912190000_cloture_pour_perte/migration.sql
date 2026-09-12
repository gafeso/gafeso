-- Clôture d'un prêt pour PERTE du document.
--
-- ⚠ POURQUOI. Le seul chemin qui clôturait un prêt était le RETOUR. Pour un
-- document perdu, la bibliothécaire devait déclarer un retour qui n'avait pas
-- eu lieu — et ce chemin remet l'exemplaire en AVAILABLE, ou le met ON_HOLD et
-- prévient le lecteur suivant que son document l'attend au guichet. Pour un
-- livre que personne n'a. Tant que le prêt restait ouvert, il comptait dans le
-- plafond de prêts simultanés : un adhérent avec assez de pertes était bloqué
-- définitivement, et l'amende courait sans fin.
--
-- ⚠ TEXTE ET NON ENUM : `sync-schema` EXCLUT les colonnes enum du rattrapage
-- (buildAddMissingColumnsStatements), une école existante ne la recevrait
-- jamais. Même raison que `deposits.status`.
--
-- ⚠ ET LE REMPLISSAGE N'EST PAS UNE COQUETTERIE. Sans lui, NULL voudrait dire
-- deux choses — « prêt ouvert » et « clos avant ce lot » — et rien ne les
-- distinguerait. Après remplissage, NULL veut dire OUVERT, et rien d'autre.
-- Le retour ayant été le seul chemin de clôture, `rendu` est exact pour tout
-- l'historique.
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
       WHERE table_schema = s AND table_name = 'checkouts'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.checkouts ADD COLUMN IF NOT EXISTS closed_as text', s
      );
      EXECUTE format(
        'UPDATE %I.checkouts SET closed_as = ''rendu''
          WHERE return_date IS NOT NULL AND closed_as IS NULL', s
      );
    END IF;
  END LOOP;
END $$;
