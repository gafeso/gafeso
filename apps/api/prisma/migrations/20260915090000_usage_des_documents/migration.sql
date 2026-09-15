-- USAGE DES DOCUMENTS (P8-1) — ce qui alimentera le rapport annuel.
--
-- Une ligne par LECTURE en ligne et par TÉLÉCHARGEMENT. Tenant-scopée : les
-- chiffres d'une école ne sortent pas de son schéma.
--
-- ⚠ AUCUN IDENTIFIANT D'UTILISATEUR, et c'est la décision qui gouverne toute
-- cette table. Le rapport annuel n'a besoin que d'agrégats ; une donnée qu'on
-- ne collecte pas ne fuit pas, ne survit pas à une déprovision ratée et ne
-- demande aucune base légale. Conséquence assumée : deux ouvertures par la
-- même personne font DEUX. Le rapport dit « consultations », jamais « lecteurs
-- ayant consulté » — un test le refuse.
--
-- ⚠ LA CONSULTATION D'UNE NOTICE N'EST PAS COLLECTÉE. Elle exigerait une
-- écriture à chaque affichage de fiche, robots d'indexation compris : le
-- chiffre serait gonflé par des machines et coûterait le plus cher pour dire
-- le moins. Lire et télécharger sont rares et signifiants.
--
-- ⚠ PAS DE CLÉ ÉTRANGÈRE VERS `biblio_records`, ET C'EST LE POINT LE PLUS
-- IMPORTANT DE CE FICHIER. Une cascade ferait disparaître les événements d'un
-- document supprimé — donc le chiffre de 2026 changerait en 2027, APRÈS que le
-- rapport a été remis à l'université. Un rapport annuel doit être
-- REPRODUCTIBLE. On garde l'identifiant ; un document retiré du catalogue
-- s'affiche comme tel dans les classements.
--
-- ⚠ VOCABULAIRE EN TEXTE, jamais en enum : `sync-schema` EXCLUT les colonnes
-- enum de son rattrapage, une école existante ne les recevrait jamais. Même
-- raison que `deposits.status`.
--
-- ⚠ AUCUNE DONNÉE À REMPLIR : la table naît VIDE, dans `public` comme dans
-- chaque école. Rien n'est allumé pour personne, et rien n'ÉMET vers
-- l'extérieur — la règle sur les défauts d'activation ne s'applique pas ici.

-- ── Le gabarit, dans `public` : c'est lui que le provisioning COPIE
--    (`CREATE TABLE … LIKE public.usage_events INCLUDING ALL`).
CREATE TABLE IF NOT EXISTS public.usage_events (
  id          text PRIMARY KEY,
  record_id   text NOT NULL,
  kind        text NOT NULL,
  occurred_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS usage_events_occurred_at_idx
  ON public.usage_events (occurred_at);
CREATE INDEX IF NOT EXISTS usage_events_kind_occurred_at_idx
  ON public.usage_events (kind, occurred_at);
CREATE INDEX IF NOT EXISTS usage_events_record_id_idx
  ON public.usage_events (record_id);

-- ── Et dans CHAQUE école déjà provisionnée.
--
-- ⚠ Sans cette boucle, la table n'existerait que pour les écoles créées APRÈS
-- ce déploiement, et le rapport tomberait sur les autres — la divergence
-- silencieuse que `derive-des-schemas-en-base.spec.ts` existe pour attraper.
DO $$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%'
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.usage_events (
        id          text PRIMARY KEY,
        record_id   text NOT NULL,
        kind        text NOT NULL,
        occurred_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )$f$, s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS usage_events_occurred_at_idx
         ON %I.usage_events (occurred_at)', s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS usage_events_kind_occurred_at_idx
         ON %I.usage_events (kind, occurred_at)', s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS usage_events_record_id_idx
         ON %I.usage_events (record_id)', s);
  END LOOP;
END $$;
