# Phase 0 — Audit existant → cible (`offline-licensing`)

**Point de rendez-vous : à valider AVANT de coder le backend.** Diff basé sur le code réel
(`apps/api/src`), pas des hypothèses.

---

## 0. Alertes à traiter avant tout code (bloquantes)

1. **⚠ Backup préalable en défaut.** `pre-migration-2026-07-11.dump` fait **0 octet** (backup
   échoué). Le brief exige un backup vérifié. Outil correct : `scripts/backup/backup.sh` (PG
   `pg_dump` + volume MinIO). À exécuter et **vérifier non-vide** avant la moindre migration/batch.
2. **Clé de signature des licences = secret hors dépôt.** À générer, jamais commitée ; **refus de
   démarrage si absente** (même exigence que `JWT_SECRET < 32c` au boot, `main.ts:18`).
3. **⚠ Écart vs brief §0 « Tenant = claim JWT / `X-Tenant`, déjà fait ».** FAUX dans le code : le
   `TenantMiddleware` (`tenancy/tenant.middleware.ts:19`) résout le tenant **par domaine**
   (`x-forwarded-host`/`Host`), jamais par `X-Tenant` ni par claim JWT. Le claim `tenant` du JWT
   sert seulement à *vérifier* (JwtAuthGuard) que le jeton correspond au domaine. **Une app mobile
   qui tape l'API directement (sans domaine école) ne sera pas résolue.** → décision requise (§7 bis).
4. **Tension CLAUDE.md.** Il déclare « DRM = phase 3, Readium LCP, ne pas coder avant » et liste des
   modules `drm`/`licensing` phase 3. Le brief tranche **home-grown maintenant**. Le brief fait
   autorité (spikes A+B validés) → **mettre à jour CLAUDE.md** pour acter `offline-licensing` phase 2.5.

---

## 1. Diff existant → cible (les 6 zones du §1)

| Zone | Existant (chemin:ligne) | Cible |
|---|---|---|
| **Service de droit** | `AccessControlService.getRecordAccessStatus(ctx, recordId)` **pur métier**, aucun couplage HTTP (`access-control.service.ts:281`) ; repli personnel `authz.hasFunction(db, sub, 'document.lire')` (`authz.service.ts:34`) ; `buildStudentContext` assemble `ctx` (`:305`) | **Réutilisé tel quel** par `offline-licensing` pour décider l'émission. Aucun refactor. |
| **Presigned MinIO** | `StorageService.putObject` écrit le **buffer clair** (`storage.service.ts:150`) ; `getSignedDownloadUrl` sert le clair, TTL 5 min lecture / 15 min DL (`:177`) ; check de droit AVANT dans `OpacService.getReadUrl` (`opac.service.ts:158`) | Ingestion produit **en plus** un **blob chiffré AEAD 16 Ko + xref-validé** (2e objet MinIO). Le lecteur en ligne (pdf.js) garde le clair via URL signée ; **l'offline télécharge le blob chiffré**. |
| **TenantMiddleware** | Résolution **par domaine** (`tenant.middleware.ts:19`), `@CurrentTenant()` → `req.tenant`, puis `prisma.forTenant(slug)` (schema-per-tenant via `?schema=`, `prisma.service.ts:53`) | **Généraliser** pour clients API-directs (mobile) : accepter `X-Tenant` (ou le claim JWT `tenant`) en repli quand le domaine ne résout pas — validé contre le claim. *Petit changement, chemin sensible.* |
| **Refresh token** | **INEXISTANT** (JWT HS256 autoporteur, TTL `JWT_EXPIRES_IN=1d`, aucune rotation/révocation). Révocation « temps réel » = fonctions re-résolues en base à chaque requête | **Hors périmètre → brief #2.** Le cœur offline ne s'appuie pas dessus : révocation via `GET /offline/licenses/:id/status` (re-check en ligne) + `expires` du bail. |
| **Endpoint « mes docs numériques autorisés »** | **ABSENT.** Existe `/collections/me` (collections, pas les notices à PDF) (`access-control.controller.ts:68`) | **À créer** : `GET /offline/my-documents` = `getVisibleCollections(ctx)` ∩ `BiblioRecord` ayant une `digitalCopy`. |
| **Modèle Prisma fichiers/droits** | `DigitalCopy` (tenant, 1:1 notice, `objectKey`, bucket `digital-copies`, **clair**) (`schema.prisma:604`) ; **aucun `Device`/`License`** | Ajouter `Device` + `OfflineLicense` (**PAR-TENANT**), étendre `DigitalCopy` (pointeur blob chiffré + marqueur xref). |

---

## 2. Contraintes multi-tenant dures (découvertes — non négociables)

- **Schema-per-tenant HORS Prisma.** Le `schema.prisma` est plat (aucun `@@schema`/multiSchema) ;
  `public` = gabarit ; chaque `tenant_<slug>` est provisionné par DDL runtime
  (`tenancy/tenant-schema.ts`). **Une migration Prisma seule ne suffit pas** pour une table tenant :
  elle crée le gabarit dans `public` ; c'est le **sync-schema** qui la réplique dans chaque tenant.
- **Tout nouveau modèle tenant doit être câblé** dans `tenant-schema.ts` : `TENANT_TABLES` (l.16),
  ses FK internes dans `TENANT_FOREIGN_KEYS`, et **surtout PAS d'enum** (utiliser des colonnes
  **TEXTE + nullable** — le projet évite déjà les enums tenant ; un `NOT NULL`/enum casse le
  sync-schema des tenants existants).
- **Aucune FK Prisma public↔tenant** : `Device`/`OfflineLicense` ciblent `User`/`DigitalCopy`
  (tenant) → ils vivent **PAR-TENANT**. La clé de signature serveur, elle, est globale (env).
- **Patterns à réutiliser** : `@CurrentTenant()` + `forTenant(slug)` ; `@UseGuards(JwtAuthGuard,
  FunctionsGuard)` + `@RequiresFunctions(...)` ; audit `void this.audit.log({...})` (`@Global`,
  écrit sur `public.audit_log`, ajouter des codes dans `AUDIT_ACTIONS`).

---

## 3. Forme cible du backend (description, pas encore de code — à valider)

**Nouveau module `offline-licensing`** (`apps/api/src/offline-licensing/`), importe `AuthModule`
(guards/AuthzService) + `AccessControlModule` (droit) + `StorageModule` + `PrismaModule`.

**Modèles (PAR-TENANT, colonnes TEXTE/nullable, câblés dans `tenant-schema.ts`) :**
- `Device` : `id`, `userId` (FK User), `label`, `publicKey` (TEXT, clé publique appareil),
  `createdAt`, `revokedAt?`.
- `OfflineLicense` : `id`, `recordId`/`digitalCopyId`, `userId`, `deviceId` (FK Device),
  `status` (TEXT: `active`/`revoked`/`expired`), `issuedAt`, `expiresAt`, `wrappedCek` (TEXT),
  `rights` (JSON: watermark/noPrint), `signature` (TEXT).
- **`DigitalCopy` étendu** : `encObjectKey?` (TEXT, blob chiffré), `cekWrapped?`/`cekId?`,
  `xrefValidatedAt?` — sans casser l'existant (nullable).

**Endpoints :**
- `POST /offline/devices` `{label, publicKey}` — `JwtAuthGuard` — enregistre la clé appareil.
- `POST /offline/licenses` `{docId, deviceId}` — `JwtAuthGuard` — **réutilise le droit**
  (`getRecordAccessStatus`/`hasFunction`) → refuse si absent ; sinon émet la licence signée +
  `wrappedCek` (CEK enveloppée pour la clé publique du device).
- `GET /offline/licenses/:id/status` + `POST /offline/entitlements` (lot) → `active/revoked/expired`.
- `GET /offline/my-documents` — la liste autorisée manquante.
- Émission = action **self-service étudiant** (il est ayant droit) → `JwtAuthGuard`, pas
  `ApiKeyGuard`. Batch d'ingestion/chiffrement = `@RequiresFunctions('catalogue.gerer')`
  (ou nouvelle fonction `licences.gerer` à ajouter dans `FONCTIONS`).

**Crypto (recommandations à confirmer) :**
- **Signature licence = Ed25519** (asymétrique : le mobile vérifie avec la clé publique embarquée ;
  le JWT HS256 symétrique existant ne convient pas pour une vérif offline). Clé privée **hors dépôt**.
- **CEK par doc**, enveloppée pour la clé publique du device. Device = keypair non-exportable Android
  Keystore. **Wrap = RSA-2048-OAEP** (simple et fiable avec Keystore hardware-backed) — à confirmer.
- **AEAD segmenté 16 Ko** (réutilise `crypto_util` du spike, porté en TS/Nest).

**Ingestion / batch :**
- Hook dans `DigitalCopyService.upload` (`digital-copy.service.ts:54`) après `putObject(clair)` :
  produire blob chiffré (AEAD 16 Ko) + **`qpdf/pikepdf --linearize` (xref valide, levier n°1)** →
  `putObject(encObjectKey)`. Le clair reste pour le lecteur en ligne (phase 2).
- **Batch de migration** du fonds : itère `digital_copies` par tenant.

---

## 4. Réponses §7 (dépendaient de la Phase 0)

1. **Service de droit réutilisable tel quel ?** ✅ **Oui.** `getRecordAccessStatus(ctx, recordId)` est
   pur métier (aucun HTTP/presigned) ; `buildStudentContext` assemble le `ctx` hors requête ; repli
   personnel `hasFunction('document.lire')`. Zéro refactor, juste un appel depuis le nouveau module.
2. **Endpoint « mes docs numériques autorisés » ?** ❌ **N'existe pas.** À créer
   (`GET /offline/my-documents`), source = `getVisibleCollections(ctx)` ∩ notices avec `digitalCopy`.
3. **Refresh token ?** ❌ **Absent** (aucune rotation/révocation ; session JWT 1 j autoporteur).
   **Recommandation : ne pas bloquer le brief #1** — le déport en **brief #2**. La révocation offline
   passe par `status` en ligne + `expires`, pas par l'invalidation JWT.
4. **TTL bail 14 j ?** OK comme défaut, **configurable par tenant** — bon emplacement : modèle global
   `TenantSettings` (public). **À confirmer** (14 j convient ?).
5. **Batch de chiffrement de l'existant : volume / fenêtre ?** **Mesuré :** aujourd'hui **5
   `digital_copies`** (dev, `tenant_zinda`) — trivial. Le vrai fonds biblio-bibliotheque = **3907 PDF / 12 Go**
   sur disque **pas encore ingérés** ; le batch scalera avec l'ingestion. Chiffrement rapide
   (~1,5 s + linéarisation/doc mesurés au spike) → 3907 docs ≈ minutes-à-heures, **one-time,
   backgroundable** — pas un bloqueur.

---

## 5. Décisions attendues avant d'attaquer le backend

1. **Résolution tenant mobile** (alerte §0.3) : je généralise `TenantMiddleware` pour accepter
   `X-Tenant` (repli, validé contre le claim JWT) ? — **recommandé**.
2. **Crypto** : Ed25519 (signature) + RSA-2048-OAEP Keystore (wrap CEK) + AEAD 16 Ko ? — recommandé.
3. **Refresh token** : déporté en brief #2 (recommandé) ?
4. **TTL 14 j** confirmé (ou autre) ?
5. **Clair + blob chiffré coexistent** (online garde le clair, offline le chiffré) — OK ? (alternative :
   chiffré-seul, mais casserait le lecteur pdf.js en ligne).
6. **Backup** : je lance `scripts/backup/backup.sh` (dev) et je le vérifie avant tout changement de schéma — OK ?

**Rien n'est codé. J'attends ton go (ou tes ajustements) sur ces 6 points.**
