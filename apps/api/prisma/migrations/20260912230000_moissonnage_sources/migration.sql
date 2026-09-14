-- MOISSONNAGE OAI-PMH (P7-1) — les trois tables qui gouvernent l'ENTRÉE.
--
-- L'entrepôt OAI de P4-3 EXPOSE ; celles-ci RECOIVENT. Tenant-scopées : une
-- école déclare SES sources.
--
-- ⚠ `set_spec` EST NON NULLE, ET C'EST LA CORRECTION LA PLUS IMPORTANTE DE CE
-- FICHIER. `""` veut dire « tout l'entrepôt ». En PostgreSQL, un index unique
-- composite NE DÉDUPLIQUE PAS les lignes où l'une des colonnes est NULL : deux
-- sources visant le même entrepôt sans ensemble auraient passé la contrainte
-- sans qu'elle dise rien. Une contrainte qui ne contraint pas est un faux
-- silencieux, et celui-ci ne se serait vu qu'au premier doublon moissonné.
--
-- ⚠ VOCABULAIRES EN TEXTE, jamais en enum : `sync-schema` EXCLUT les colonnes
-- enum de son rattrapage (buildAddMissingColumnsStatements), une école
-- existante ne les recevrait jamais. Même raison que `deposits.status`.
--
-- ⚠ AUCUNE DONNÉE À REMPLIR : ces tables naissent VIDES. Rien n'est allumé
-- pour personne par cette migration — c'est ce qui rend `active = true` par
-- défaut sans danger, alors que la règle interdit d'allumer par migration un
-- comportement qui ÉMET vers l'extérieur.
--
-- Idempotente : `IF NOT EXISTS` partout, sur chaque schéma.

DO $$
DECLARE
  s text;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace
     WHERE nspname = 'public' OR nspname LIKE 'tenant_%'
  LOOP
    -- ── La source déclarée
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.harvest_sources (
        id              text PRIMARY KEY,
        name            text NOT NULL,
        base_url        text NOT NULL,
        metadata_prefix text NOT NULL,
        set_spec        text NOT NULL DEFAULT '',
        periodicity     text NOT NULL DEFAULT 'manuelle',
        active          boolean NOT NULL DEFAULT true,
        last_datestamp  text,
        created_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      timestamp(3) NOT NULL
      )$f$, s);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS harvest_sources_cible_key
         ON %I.harvest_sources (base_url, metadata_prefix, set_spec)', s);

    -- ── L'exécution, et son compte rendu
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.harvest_runs (
        id                 text PRIMARY KEY,
        source_id          text NOT NULL
                             REFERENCES %I.harvest_sources(id) ON DELETE CASCADE,
        started_at         timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at        timestamp(3),
        outcome            text NOT NULL DEFAULT 'en_cours',
        reason             text,
        received           integer NOT NULL DEFAULT 0,
        created            integer NOT NULL DEFAULT 0,
        ignored            integer NOT NULL DEFAULT 0,
        collided           integer NOT NULL DEFAULT 0,
        deletions          integer NOT NULL DEFAULT 0,
        pages              integer NOT NULL DEFAULT 0,
        resumption_token   text,
        resumption_expires timestamp(3),
        last_datestamp     text
      )$f$, s, s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS harvest_runs_source_debut_idx
         ON %I.harvest_runs (source_id, started_at)', s);

    -- ── L'identité d'une notice moissonnée
    --
    -- ⚠ PAS DE CLÉ ÉTRANGÈRE VERS `biblio_records` : elle ferait dépendre la
    -- mémoire du moissonnage de la survie de la notice, et `record_id` est là
    -- précisément pour survivre — c'est `BiblioRecord.id`, qui ne change
    -- jamais (I1).
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.harvested_records (
        id             text PRIMARY KEY,
        source_id      text NOT NULL
                         REFERENCES %I.harvest_sources(id) ON DELETE CASCADE,
        oai_identifier text NOT NULL,
        datestamp      text NOT NULL,
        record_id      text,
        status         text NOT NULL,
        first_seen_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at   timestamp(3) NOT NULL
      )$f$, s, s);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS harvested_records_source_oai_key
         ON %I.harvested_records (source_id, oai_identifier)', s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS harvested_records_status_idx
         ON %I.harvested_records (status)', s);
  END LOOP;
END $$;
