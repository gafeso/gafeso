-- Index de circulation manquants (audit performance 2026-07-14).
-- Ces tables vivent aussi dans chaque schéma tenant_<slug> : cette migration
-- ne crée les index que dans le gabarit `public`. Les écoles DÉJÀ provisionnées
-- doivent être synchronisées via POST /admin/tenants/:slug/sync-schema
-- (voir DEPLOY.md). Les nouvelles écoles héritent des index par CREATE TABLE
-- ... LIKE ... INCLUDING ALL au provisioning.

-- CreateIndex
CREATE INDEX "checkouts_patron_id_return_date_idx" ON "checkouts"("patron_id", "return_date");

-- CreateIndex
CREATE INDEX "holds_record_id_status_idx" ON "holds"("record_id", "status");

-- CreateIndex
CREATE INDEX "holds_patron_id_idx" ON "holds"("patron_id");

-- CreateIndex
CREATE INDEX "items_record_id_idx" ON "items"("record_id");
