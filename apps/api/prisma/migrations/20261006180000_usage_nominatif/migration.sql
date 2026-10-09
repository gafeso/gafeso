-- LA TRACE D'USAGE NUMÉRIQUE devient NOMINATIVE pour 12 mois, et porte la filière.
--
-- ⚠ IDEMPOTENTE ET PAR ÉCOLE. `usage_events` vit dans CHAQUE schéma `tenant_*`
-- ET dans le gabarit `public` (dont les écoles neuves sont copiées). Une
-- migration qui ne toucherait que `public` laisserait les écoles existantes
-- derrière — c'est la dérive que `derive-des-schemas-en-base.spec.ts` attrape.
DO $$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace
    WHERE nspname = 'public' OR nspname LIKE 'tenant\_%'
  LOOP
    -- La table n'existe pas dans un schéma à demi provisionné : on passe.
    IF to_regclass(format('%I.usage_events', s)) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE %I.usage_events ADD COLUMN IF NOT EXISTS user_id text', s);
    EXECUTE format('ALTER TABLE %I.usage_events ADD COLUMN IF NOT EXISTS class_name text', s);
    EXECUTE format('ALTER TABLE %I.usage_events ADD COLUMN IF NOT EXISTS anonymise_le timestamp(3) without time zone', s);

    EXECUTE format('CREATE INDEX IF NOT EXISTS usage_events_user_id_occurred_at_idx ON %I.usage_events (user_id, occurred_at)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS usage_events_class_name_occurred_at_idx ON %I.usage_events (class_name, occurred_at)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS usage_events_anonymise_le_occurred_at_idx ON %I.usage_events (anonymise_le, occurred_at)', s);

    -- ⚠ LE VOCABULAIRE : « LECTURE » devient « CONSULTATION », DANS LA DONNÉE.
    --
    -- Jean, 6 octobre 2026 : « Libellés : consultations en ligne,
    -- téléchargements. Jamais lectures. La lecture hors connexion n'est pas
    -- tracée. » La consigne porte sur les LIBELLÉS — mais laisser la valeur
    -- stockée dire « LECTURE » créerait deux vocabulaires pour une seule chose,
    -- et le premier qui affiche la valeur brute réintroduit le mot interdit.
    --
    -- Et le mot est faux au fond, pas seulement en surface : ce qu'on observe
    -- est la délivrance d'une URL de lecture, pas une lecture. On ne sait pas
    -- si quelqu'un a lu. « Consultation » dit ce qui est mesuré.
    EXECUTE format('UPDATE %I.usage_events SET kind = ''CONSULTATION'' WHERE kind = ''LECTURE''', s);
  END LOOP;
END $$;
