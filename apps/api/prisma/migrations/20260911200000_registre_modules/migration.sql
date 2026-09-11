-- P4-1 : le registre de modules, et l'absorption de `reminders_enabled`.
--
-- L'état d'activation est une LISTE DE DÉSACTIVATIONS par établissement
-- (`tenant_settings.modules_desactives`). Absent = actif : la décision 8 du
-- brief — « tout module est actif par défaut, une migration ne retire rien à
-- personne » — devient vraie PAR CONSTRUCTION, et un module ajouté demain est
-- actif partout sans migration.
--
-- 🔴 SAUF POUR `rappels`, ET C'EST LE POINT DÉLICAT DE LA PHASE.
--
-- Les rappels sont aujourd'hui ÉTEINTS PAR DÉFAUT : le code lit
-- `remindersEnabled ?? false`. Appliquer « tout module actif par défaut » à la
-- lettre ALLUMERAIT donc les rappels chez toute école qui ne les avait pas
-- activés — et un module de rappels allumé ENVOIE DES COURRIELS à des adhérents
-- réels, dès le prochain passage du planificateur.
--
-- La décision 8 dit « une migration ne retire rien à personne ». Son esprit est
-- qu'une migration ne change pas ce qu'une école vit. Ici, la lettre et
-- l'esprit divergent : appliquer la lettre n'enlèverait rien, elle AJOUTERAIT
-- un effet sortant que personne n'a demandé. On applique donc l'esprit — l'état
-- effectif de chaque école est préservé, exactement.
--
-- ⚠ AUCUNE DONNÉE N'EST SUPPRIMÉE (décision 5). La colonne
-- `reminders_enabled` est CONSERVÉE, et elle n'est plus lue par personne : le
-- planificateur interroge le registre, le DTO refuse le champ en nommant la
-- nouvelle route. La garder coûte une colonne et permet de rejouer cette
-- migration ; la supprimer serait une perte d'information sans gain.
--
-- ⚠ TABLE `public`, PAS TENANT. `tenant_settings` est clé par `tenant_id` dans
-- le schéma public : il n'y a donc NI balayage de schémas, NI rattrapage
-- `sync-schema` à prévoir. C'est ce qui a décidé de la forme — le brief
-- prévoyait une table tenant, et l'état par établissement se loge ici sans le
-- piège du `LIKE ... INCLUDING ALL`.
--
-- IDEMPOTENTE : n'écrit que là où `modules_desactives` ne dit encore rien de
-- `rappels`. Rejouée, elle ne change rien — et ne rallume donc jamais ce qu'un
-- administrateur aurait éteint depuis.

ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "modules_desactives" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Report de l'état effectif des rappels : éteint chez qui ne l'avait pas activé.
UPDATE "tenant_settings"
SET "modules_desactives" = "modules_desactives" || '["rappels"]'::jsonb
WHERE COALESCE("reminders_enabled", false) = false
  AND NOT ("modules_desactives" @> '["rappels"]'::jsonb);
