-- P6-4 · L'embargo — une DATE de levée, jamais un drapeau.
--
-- ⚠ Un booléen « sous embargo » exigerait que quelqu'un pense à le baisser, et
-- un embargo qu'il faut penser à lever ne se lève jamais. Une date se lève
-- toute seule : la décision COMPARE, elle ne consulte pas un état. Aucune tâche
-- planifiée, donc rien qui puisse ne pas tourner.
--
-- ⚠ TABLE TENANT : la boucle rattrape les écoles déjà provisionnées, `LIKE ...
-- INCLUDING ALL` ne s'exécutant qu'à la création.

ALTER TABLE "biblio_records" ADD COLUMN IF NOT EXISTS "embargo_until" TIMESTAMP(3);


DO $migration$
DECLARE
  schema_courant text;
  faites integer := 0;
BEGIN
  FOR schema_courant IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' ORDER BY nspname
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.biblio_records ADD COLUMN IF NOT EXISTS embargo_until TIMESTAMP(3)',
      schema_courant);
    faites := faites + 1;
  END LOOP;
  RAISE NOTICE 'embargo_until : % schéma(s) tenant rattrapé(s)', faites;
END
$migration$;
