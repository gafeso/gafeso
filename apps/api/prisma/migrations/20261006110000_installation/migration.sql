-- L'ÉTAT D'INSTALLATION DE L'INSTANCE — une ligne, dans `public`.
--
-- ⚠ Idempotente : `prisma migrate deploy` s'exécute à CHAQUE démarrage du
-- conteneur api (voir DEPLOY.md), et cette migration doit pouvoir rencontrer
-- une base déjà installée sans rien défaire.
CREATE TABLE IF NOT EXISTS public.installation (
  id           text        PRIMARY KEY DEFAULT 'unique',
  jeton_hash   text,
  terminee_le  timestamp(3) without time zone,
  essais_rates integer     NOT NULL DEFAULT 0,
  creee_le     timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ⚠ ET LA LIGNE QUI DÉCIDE DE TOUT : une instance qui porte DÉJÀ une école ne
-- doit JAMAIS rouvrir l'assistant. On marque donc l'installation comme TERMINÉE
-- pour toute base existante — c'est-à-dire pour la démo, pour le dev, et pour
-- l'UO si elle est provisionnée avant la livraison de l'assistant.
--
-- La forme fautive ici serait d'insérer une ligne « non terminée » et de laisser
-- l'API décider au démarrage : une instance en service rouvrirait son assistant
-- le temps d'un redémarrage, et le premier venu prendrait l'instance. On décide
-- dans la MIGRATION, où l'on peut encore compter les écoles.
INSERT INTO public.installation (id, jeton_hash, terminee_le)
SELECT 'unique', NULL,
       CASE WHEN EXISTS (SELECT 1 FROM public.tenants) THEN CURRENT_TIMESTAMP ELSE NULL END
WHERE NOT EXISTS (SELECT 1 FROM public.installation);
