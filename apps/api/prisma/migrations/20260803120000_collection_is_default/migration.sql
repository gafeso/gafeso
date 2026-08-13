-- Collection SOCLE d'une école : reçoit automatiquement les documents
-- numérisés et porte la règle d'accès par défaut, pour qu'une installation
-- neuve ne démarre pas avec « aucun accès à rien ».
ALTER TABLE "collections" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- Une seule collection par défaut par école. Index PARTIEL : il ne contraint
-- que les lignes marquées, donc les collections ordinaires (et les
-- collections partagées, dont tenant_id est NULL) ne sont pas affectées.
CREATE UNIQUE INDEX "collections_default_per_tenant"
  ON "collections" ("tenant_id")
  WHERE "is_default" AND "tenant_id" IS NOT NULL;
