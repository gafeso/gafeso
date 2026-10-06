-- MENTIONS LÉGALES et POLITIQUE DE CONFIDENTIALITÉ, rédigées par l'école.
--
-- ⚠ Additive et IDEMPOTENTE : `prisma migrate deploy` tourne à chaque démarrage
-- du conteneur api, et aucune école ne doit perdre quoi que ce soit.
--
-- ⚠ PAS DE DÉFAUT, délibérément. `NULL` veut dire « cette école n'a rien
-- rédigé », et c'est ce que l'API doit pouvoir DIRE : un défaut `'{}'::jsonb`
-- rendrait « rédigé mais vide » indiscernable de « jamais rédigé », et le front
-- publierait un modèle non complété. C'est la règle que le front a tranchée de
-- son côté : un modèle NON COMPLÉTÉ ne se publie PAS.
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS pages_legales jsonb;
