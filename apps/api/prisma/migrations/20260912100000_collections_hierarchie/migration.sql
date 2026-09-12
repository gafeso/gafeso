-- P6-1 · Collections hiérarchiques et lien fiche d'autorité ↔ compte.
--
-- DEUX CHANGEMENTS, DEUX PORTÉES DIFFÉRENTES, et c'est ce qui structure ce
-- fichier :
--
--  · `collections` vit dans le schéma PUBLIC seulement (clé par `tenant_id`).
--    Une seule table, un seul trigger, AUCUN sync-schema à propager.
--  · `authors` vit dans CHAQUE schéma `tenant_<slug>`. Le `ALTER TABLE`
--    généré par Prisma ne touche que le gabarit `public` : la boucle ci-dessous
--    rattrape les écoles DÉJÀ provisionnées. `LIKE ... INCLUDING ALL` ne
--    s'exécute qu'à la création et ne rattrape jamais l'existant.
--
-- ⚠ POURQUOI UN TRIGGER ET NON UN `CHECK` — ne le « simplifiez » pas.
--
-- Les deux propriétés à garantir portent sur un CHEMIN, pas sur une ligne :
-- « aucun cycle » et « profondeur ≤ 3 » demandent de remonter les ancêtres.
-- Un `CHECK` de PostgreSQL ne peut contenir ni sous-requête ni CTE récursive :
-- il ne voit que la ligne courante. Il n'existe donc aucune façon d'exprimer
-- ces règles en contrainte déclarative, et un trigger `BEFORE` est la seule
-- forme qui les garantisse EN BASE.
--
-- Les garantir en base et non dans l'application est délibéré : la table est
-- écrite par l'API, mais aussi par le seed, par une reprise de données, et
-- demain par un import. Une validation applicative ne couvre que le premier.
--
-- ⚠ PROFONDEUR 3, et le chiffre se défend : c'est l'arborescence réelle d'une
-- université (Faculté → Département → Type de document), c'est la parité DSpace
-- (communauté → sous-communauté → collection), et au-delà de trois niveaux la
-- profondeur devient un classement que seul son auteur comprend. Le chiffre est
-- répété dans `src/collections/hierarchie.ts`, et un test vérifie qu'ils
-- s'accordent — deux endroits, une seule valeur.

-- ── 1 · Le gabarit `public` (et la table publique `collections`)
ALTER TABLE "authors" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "parent_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "authors_user_id_key" ON "authors"("user_id");
CREATE INDEX IF NOT EXISTS "collections_parent_id_idx" ON "collections"("parent_id");

DO $fk$
BEGIN
  -- ⚠ `ON DELETE SET NULL` : supprimer une collection parente ne supprime PAS
  -- ses enfants, elle les remonte en racines. Aucune donnée n'est perdue, et
  -- c'est la seule issue compatible avec « aucune donnée n'est supprimée ».
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collections_parent_id_fkey') THEN
    ALTER TABLE "collections" ADD CONSTRAINT "collections_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "collections"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'authors_user_id_fkey') THEN
    ALTER TABLE "authors" ADD CONSTRAINT "authors_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$fk$;

-- ── 2 · Les écoles DÉJÀ provisionnées : `authors.user_id`
--
-- ⚠ PAS DE CLÉ ÉTRANGÈRE DANS LES SCHÉMAS TENANT, et ce n'est pas un oubli :
-- `CREATE TABLE ... (LIKE ... INCLUDING ALL)` ne copie JAMAIS les contraintes
-- de clé étrangère, donc aucune table tenant n'en porte aujourd'hui —
-- `record_contributors.record_id` pas davantage. On reste cohérent avec
-- l'existant plutôt que d'introduire une asymétrie sur cette seule colonne.
-- L'index UNIQUE, lui, est bien copié par `INCLUDING ALL` et se rattrape ici.
DO $migration$
DECLARE
  schema_courant text;
  faites integer := 0;
BEGIN
  FOR schema_courant IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' ORDER BY nspname
  LOOP
    EXECUTE format('ALTER TABLE %I.authors ADD COLUMN IF NOT EXISTS user_id TEXT', schema_courant);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS authors_user_id_key ON %I.authors(user_id)',
      schema_courant);
    faites := faites + 1;
  END LOOP;
  RAISE NOTICE 'authors.user_id : % schéma(s) tenant rattrapé(s)', faites;
END
$migration$;

-- ── 3 · Le trigger : profondeur bornée et absence de cycle
--
-- Une seule fonction pour les deux propriétés : toutes deux se lisent sur la
-- même remontée d'ancêtres, et les séparer ferait parcourir le chemin deux fois.
CREATE OR REPLACE FUNCTION public.collections_hierarchie_valide()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  profondeur integer := 1;   -- la ligne écrite compte pour un niveau
  courant text := NEW.parent_id;
  vus text[] := ARRAY[NEW.id];
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;              -- une racine : rien à vérifier
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Une collection ne peut pas être sa propre parente (%).', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Remontée des ancêtres. La borne de boucle est la profondeur MAXIMALE + 1 :
  -- au-delà, soit la profondeur est dépassée, soit un cycle existe, et les deux
  -- lèvent. Aucune remontée infinie n'est donc possible, même sur une table
  -- déjà cyclique — cas qui ne peut plus arriver, mais que ce garde ne suppose
  -- pas absent.
  WHILE courant IS NOT NULL LOOP
    IF courant = ANY(vus) THEN
      RAISE EXCEPTION 'Cycle dans la hiérarchie des collections (% est son propre ancêtre).', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    vus := vus || courant;
    profondeur := profondeur + 1;
    IF profondeur > 3 THEN
      RAISE EXCEPTION 'Profondeur maximale de 3 niveaux dépassée pour la collection %.', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_id INTO courant FROM public.collections WHERE id = courant;
  END LOOP;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS collections_hierarchie_valide_trigger ON "collections";
CREATE TRIGGER collections_hierarchie_valide_trigger
  BEFORE INSERT OR UPDATE OF parent_id ON "collections"
  FOR EACH ROW
  EXECUTE FUNCTION public.collections_hierarchie_valide();

-- ⚠ CE QUE LE TRIGGER NE COUVRE PAS, et il faut le savoir : il valide la ligne
-- ÉCRITE. Déplacer une collection qui a déjà des enfants peut donc porter un
-- sous-arbre au-delà de trois niveaux sans qu'aucune ligne ne viole la règle à
-- son propre niveau. Le service vérifie cette hauteur de sous-arbre avant
-- d'écrire (`src/collections/hierarchie.ts`) — c'est la seule des deux
-- propriétés qui ne soit pas garantie EN BASE, et elle est écrite là plutôt
-- que taire.
