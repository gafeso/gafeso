-- P6-2 (suite) · Le fichier déposé, chiffré DÈS LE DÉPÔT.
--
-- ⚠ POURQUOI DÈS LE DÉPÔT ET NON AU CATALOGAGE. Un dépôt REFUSÉ que personne ne
-- cataloguera jamais laisserait son fichier en clair indéfiniment : les
-- documents les moins protégés seraient exactement ceux que personne ne
-- surveille. Et une thèse sous embargo attend parfois des semaines une décision
-- qui ne vient pas.
--
-- ⚠ LE RATTACHEMENT À LA NOTICE NE RE-CHIFFRE NI NE RECOPIE RIEN. Vérifié avant
-- d'écrire : `object_key` et `enc_object_key` ne sont JAMAIS découpés dans
-- `apps/api`. Le préfixe d'une clé est un groupement lisible dans le seau, pas
-- une donnée. Le catalogage ne fait que COPIER ces valeurs de colonnes dans
-- `digital_copies` ; le blob et la CEK enveloppée ne sont pas touchés — la CEK
-- est enveloppée par la KEK SERVEUR, qui ne dépend d'aucune notice.
--
-- ⚠ `file_format` EST EN TEXTE et non en enum `DigitalFormat` : un type enum
-- doit être recréé dans chaque schéma tenant, et le rattrapage de colonnes de
-- `sync-schema` EXCLUT les colonnes enum (voir buildAddMissingColumnsStatements).
-- Une école existante ne le recevrait donc pas par le chemin normal.

-- AlterTable
ALTER TABLE "deposits" ADD COLUMN     "enc_algo" TEXT,
ADD COLUMN     "enc_error" TEXT,
ADD COLUMN     "enc_object_key" TEXT,
ADD COLUMN     "enc_seg_size" INTEGER,
ADD COLUMN     "enc_status" TEXT,
ADD COLUMN     "enc_wrapped_cek" TEXT,
ADD COLUMN     "encrypted_at" TIMESTAMP(3),
ADD COLUMN     "file_format" TEXT,
ADD COLUMN     "xref_validated_at" TIMESTAMP(3);


-- ── Les écoles DÉJÀ provisionnées
DO $migration$
DECLARE
  schema_courant text;
  colonne text;
  faites integer := 0;
BEGIN
  FOR schema_courant IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' ORDER BY nspname
  LOOP
    FOREACH colonne IN ARRAY ARRAY[
      'file_format TEXT',
      'enc_object_key TEXT',
      'enc_wrapped_cek TEXT',
      'enc_seg_size INTEGER',
      'enc_algo TEXT',
      'enc_status TEXT',
      'enc_error TEXT',
      'xref_validated_at TIMESTAMP(3)',
      'encrypted_at TIMESTAMP(3)'
    ]
    LOOP
      EXECUTE format('ALTER TABLE %I.deposits ADD COLUMN IF NOT EXISTS %s', schema_courant, colonne);
    END LOOP;
    faites := faites + 1;
  END LOOP;
  RAISE NOTICE 'deposits (fichier) : % schéma(s) tenant rattrapé(s)', faites;
END
$migration$;
