-- CreateIndex : séries temporelles du tableau de bord (prêts par date de prêt,
-- retours par date de retour). Créés sur le gabarit public ; propagés aux écoles
-- existantes par sync-schema (TENANT_INDEXES), copiés par LIKE pour les nouvelles.
CREATE INDEX "checkouts_checkout_date_idx" ON "checkouts"("checkout_date");
CREATE INDEX "checkouts_return_date_idx" ON "checkouts"("return_date");
