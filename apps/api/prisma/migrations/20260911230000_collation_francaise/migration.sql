-- La collation française des colonnes texte — backlog n° 14.
--
-- ⚠ LE DÉFAUT EST ACTIF, PAS EN PROJET. `postgres:16-alpine` ne contient aucune
-- locale : le `en_US.utf8` déclaré retombe sur l'ordre des OCTETS, où les
-- majuscules accentuées passent après `Z`. « École » se range donc après
-- « Zoologie » dans TOUTES les listes triées du produit. Mesuré : 20 des 352
-- titres du fonds de démonstration commencent par une lettre accentuée, et la
-- liste des auteurs trie déjà sur `display_name`.
--
-- ⚠ AUCUN CHANGEMENT D'IMAGE : ICU est déjà compilé, `fr-x-icu` existe.
--
-- ⚠ ET `fr-x-icu` EST DÉTERMINISTE — vérifié (`collisdeterministic = t`) avant
-- d'écrire une ligne. `LIKE` et `ILIKE` continuent donc de fonctionner, ce dont
-- dépend la recherche `q` de `/cataloging/records`, et l'égalité distingue
-- toujours les accents. Une collation NON déterministe aurait interdit `LIKE`
-- sur ces colonnes et cassé la recherche EN SILENCE.
--
-- ⚠ TABLES TENANT : `biblio_records`, `authors`, `patrons`, `users`,
-- `expected_students`, `school_classes`, `keywords`, `categories`, `roles`
-- existent dans CHAQUE schéma `tenant_<slug>`. Le script balaie donc tous les
-- schémas, gabarit `public` inclus. `collections` est la seule table PUBLIC de
-- la liste.
--
-- ⚠ CE QUI N'EST PAS COLLATIONNÉ, ET POURQUOI : `authors.normalized_name`
-- (clé de déduplication), `users.class_name` et `expected_students.class_name`
-- (clés comparées à `school_classes.name` par access-control),
-- `items.barcode` / `call_number` / `location` (des codes, pas du texte lu).
-- Voir `tenancy/collation-francaise.ts`, qui porte la liste et les motifs.
--
-- IDEMPOTENTE : chaque colonne est sautée si elle porte DÉJÀ la collation.
-- Postgres reconstruit les index dépendants tout seul (vérifié).
--
-- 🔴 CE QUE CETTE MIGRATION NE PROTÈGE PAS. Prisma ne modélise pas la
-- collation : un `ALTER COLUMN … SET DATA TYPE` futur, écrit pour une autre
-- raison, la PERDRAIT en silence — mesuré sur une base jetable. D'où le garde
-- de `sync-schema`, qui interroge LA BASE et non le schéma.

DO $migration$
DECLARE
  schema_courant text;
  cible record;
  collation_actuelle text;
  faites integer := 0;
BEGIN
  FOR schema_courant IN
    SELECT nspname FROM pg_namespace
    WHERE nspname = 'public' OR nspname LIKE 'tenant\_%'
    ORDER BY nspname
  LOOP
    FOR cible IN
      SELECT * FROM (VALUES
        ('biblio_records', 'title'),
        ('biblio_records', 'title_complement'),
        ('biblio_records', 'author'),
        ('biblio_records', 'publisher'),
        ('authors', 'display_name'),
        ('patrons', 'first_name'),
        ('patrons', 'last_name'),
        ('users', 'first_name'),
        ('users', 'last_name'),
        ('expected_students', 'first_name'),
        ('expected_students', 'last_name'),
        ('school_classes', 'name'),
        ('school_classes', 'label'),
        ('keywords', 'name'),
        ('categories', 'name'),
        ('roles', 'name'),
        ('collections', 'name')
      ) AS t(tbl, col)
    LOOP
      -- La table n'existe pas dans ce schéma (ex. `collections`, publique
      -- seulement) : on passe, on ne suppose pas.
      IF to_regclass(format('%I.%I', schema_courant, cible.tbl)) IS NULL THEN
        CONTINUE;
      END IF;

      SELECT c.collname INTO collation_actuelle
        FROM pg_attribute a
        JOIN pg_class cl ON cl.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        LEFT JOIN pg_collation c ON c.oid = a.attcollation
       WHERE n.nspname = schema_courant
         AND cl.relname = cible.tbl
         AND a.attname = cible.col
         AND a.attnum > 0
         AND NOT a.attisdropped;

      -- Colonne absente de ce schéma, ou déjà collationnée : rien à faire.
      IF collation_actuelle IS NULL OR collation_actuelle = 'fr-x-icu' THEN
        CONTINUE;
      END IF;

      EXECUTE format(
        'ALTER TABLE %I.%I ALTER COLUMN %I TYPE text COLLATE "fr-x-icu"',
        schema_courant, cible.tbl, cible.col);
      faites := faites + 1;
    END LOOP;
  END LOOP;

  IF faites > 0 THEN
    RAISE NOTICE 'Collation fr-x-icu posée sur % colonne(s).', faites;
  END IF;
END
$migration$;
