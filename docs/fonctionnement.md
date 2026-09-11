# Gafeso — fonctionnement technique

Comment Gafeso est construit et comment il fonctionne, en détail. Prérequis de
lecture : [presentation-gafeso.md](presentation-gafeso.md).

---

## 1. Vue d'ensemble des composants

| Service | Rôle | Image / techno |
|---|---|---|
| **web** | Frontend Next.js (vitrine, OPAC, back-office). SSR. | Next.js 15 |
| **api** | Backend NestJS (monolithe modulaire). Toute la logique métier. | NestJS 10 |
| **db** | Base de données principale. | PostgreSQL 16 |
| **meilisearch** | Moteur de recherche (défaut). | Meilisearch |
| *(elasticsearch)* | Moteur de recherche alternatif (option). | Elasticsearch 8 |
| **redis** | Cache et files d'attente. | Redis 7 |
| **minio** | Stockage objet S3-compatible (couvertures, fichiers). | MinIO |
| **caddy** | Reverse proxy + HTTPS automatique. | Caddy 2 |

Le **web** n'appelle jamais l'API par Internet : ses requêtes `/api/*` sont
**proxifiées en interne** vers l'`api` (réseau Docker) par Next.js
(`apps/web/next.config.mjs`). Le seul service exposé sur Internet est **Caddy**.

## 2. Le monolithe modulaire (API)

Décision d'architecture assumée : **une seule API NestJS**,
pas de microservices, découpée en ~30 **modules** cohérents :

- **Socle** : `PrismaModule`, `TenancyModule`, `AuthModule`, `AccessControlModule`,
  `AuditModule`, `MailModule`, `HealthModule`.
- **Comptes & organisation** : `AccountsModule`, `RolesModule`, `EnrollmentModule`
  (classes), `PatronsModule`.
- **Catalogue** : `CatalogingModule`, `AuthorsModule`, `CategoriesModule`,
  `SearchModule`, `LabelsModule` (étiquettes), `InventoryModule` (récolement).
- **Circulation** : `CirculationModule`, `RemindersModule`, `ReaderModule`
  (compte lecteur).
- **Public / interop** : `OpacModule`, `OaiModule`, `SruModule`.
- **Pilotage** : `AdminModule` (provisioning, plateforme), `StatsModule`.
- **Transverses** : `ConfigModule`, `ScheduleModule` (tâches planifiées),
  `ThrottlerModule` (limitation de débit).

## 3. Multi-tenant : un schéma PostgreSQL par établissement

C'est le cœur de l'isolation. Deux niveaux de données :

- **Schéma `public`** : données de **plateforme** partagées — la liste des écoles
  (`tenants`), leurs domaines, leurs réglages (`tenant_settings`), le super-admin,
  les collections, le **journal d'audit**, les **rappels envoyés**. Ces tables de
  log sont dénormalisées et sans clé étrangère inter-schéma.
- **Schéma `tenant_<slug>`** : les données **propres à une école** — comptes,
  notices, exemplaires, prêts, réservations, mots-clés, auteurs, sessions de
  récolement, etc. **Étanche** d'une école à l'autre.

### Résolution de l'établissement
À chaque requête, un **middleware** (`TenantMiddleware` →
`TenancyService.resolveByHost`) lit l'en-tête **Host** (priorité à
`x-forwarded-host`, sans le port) et retrouve l'école correspondante. Le client
Prisma est alors ciblé sur le bon schéma (`prisma.forTenant(slug)`). Les routes
`/admin/*`, `/health`, `/docs` sont **exclues** de la résolution tenant.

### Provisionnement et évolution de schéma
- **Créer une école** : `POST /admin/tenants` crée le schéma tenant à partir d'un
  gabarit (`CREATE TABLE … LIKE public.… INCLUDING ALL`) + les types enum locaux
  + les clés étrangères internes (`buildProvisionStatements`).
- **Faire évoluer une école existante** : `POST /admin/tenants/:slug/sync-schema`
  est **idempotent** — il ajoute les tables manquantes, les **colonnes**
  manquantes, les **index** manquants, et les **valeurs d'enum** manquantes
  (`ALTER TYPE … ADD VALUE IF NOT EXISTS`). C'est la manœuvre à lancer après tout
  déploiement qui touche le modèle tenant (voir DEPLOY.md).
- Recensement du schéma tenant : `apps/api/src/tenancy/tenant-schema.ts`
  (`TENANT_TABLES`, `TENANT_ENUMS`, `TENANT_FOREIGN_KEYS`, `TENANT_INDEXES`).

### Géométrie / données spéciales
Les géométries (le cas échéant) et certains types s'écrivent en **SQL brut**
quand Prisma ne gère pas le type — décision volontaire, à ne pas « refactorer ».

## 4. Modèle de données (extrait)

- **Notice** (`biblio_records`) : titre, complément, type, catégorie, langue,
  année, ISBN, éditeur, ville, université/lieu de soutenance, résumé, `marcData`.
- **Contributeur** (`record_contributors`) : nom, **rôle** (auteur principal /
  secondaire / directeur de mémoire), position, lien vers une **fiche d'autorité**
  (`authors`).
- **Exemplaire** (`items`) : code-barres unique, cote, localisation, **statut**
  (`ItemStatus` : AVAILABLE, CHECKED_OUT, ON_HOLD, IN_TRANSIT, DAMAGED, LOST,
  WITHDRAWN, MISSING).
- **Circulation** : `checkouts` (prêts), `holds` (réservations),
  `circulation_rules`.
- **Récolement** : `inventory_sessions` (périmètre, statut) + `inventory_scans`
  (un scan par code, classé).
- **Comptes** : `users` (rôle, statut, 2FA), `roles` (dont système),
  `school_classes`, `enrollments`, `patrons`.
- **Numérique** : `digital_copies` (clé objet MinIO, format).

## 5. Cycle d'une requête (exemple : recherche OPAC)

1. Le navigateur appelle `https://ecole.exemple/opac?q=droit`.
2. **Caddy** transmet à **web** (Next.js).
3. Le composant serveur (ou le client) appelle `/api/opac/search?q=droit` ;
   Next **proxifie** vers `api:4000/opac/search` en interne, en propageant
   `x-forwarded-host: ecole.exemple`.
4. Le **middleware tenant** résout l'école « ecole » → schéma `tenant_ecole`.
5. `OpacService` construit les filtres et interroge la **façade de recherche**
   (`SearchService`), qui délègue au moteur choisi (Meili/ES).
6. Résultat paginé + facettes renvoyé au web, rendu à l'utilisateur.

## 6. Authentification, autorisation, accès

- **Auth** : JWT (cookie httpOnly `bc_token` côté navigateur ; Bearer possible).
  Login à 2 étapes si 2FA activée.
- **Autorisation** : `@RequiresFunctions(...)` + `FunctionsGuard` résolvent les
  **permissions** de l'utilisateur **en base à chaque requête** (les rôles
  personnalisés vivent dans la table tenant `roles`). L'API est **seule
  autorité** ; la nav filtrée du front n'est qu'un confort.
- **Contrôle d'accès à la lecture numérique** (`AccessControlService`) : un
  étudiant n'obtient une **URL signée** que si sa **classe/abonnement** autorise
  le document — vérifié **côté serveur** avant de signer.
- **Anti-usurpation multi-tenant** : sur le domaine API direct, Caddy force
  `X-Forwarded-Host` au host réel pour empêcher de cibler le schéma d'une autre
  école.

## 7. Moteur de recherche (abstraction)

- Interface commune `SearchEngine` (`apps/api/src/search/search-engine.ts`) :
  `ensureIndex`, `indexRecords`, `removeRecord`, `clearIndex`, `search`, `health`.
- Deux implémentations : **Meilisearch** (défaut) et **Elasticsearch** (option),
  choisies par `SEARCH_ENGINE` au démarrage. La **façade** `SearchService`
  délègue et assure la **dégradation gracieuse** (moteur injoignable → résultat
  vide, jamais de 500).
- Un **index par école** (`records_<slug>`). Document centralisé
  (`buildRecordSearchDoc`) : tout indexeur passe par lui.
- **Parité** garantie (recherche par champ, poids de pertinence, accents,
  tolérance aux fautes, facettes) — voir [search-engines.md](search-engines.md).
- L'**autocomplétion** mots-clés/auteurs est servie par **PostgreSQL**, pas par
  le moteur (indépendante du choix).

## 8. Stockage objet (MinIO)

- Deux buckets : **`covers`** (couvertures, lecture **publique**, servi par Caddy
  sur le sous-domaine `storage.*`) et **`digital-copies`** (fichiers, **privé**,
  accessible uniquement par **URL signée temporaire** délivrée par l'API).
- La signature AWS SigV4 porte sur le Host de signature (endpoint interne) :
  Caddy **force** ce Host pour éviter `SignatureDoesNotMatch`.
- `MINIO_PUBLIC_URL` doit pointer sur le sous-domaine de stockage, sinon les
  couvertures pointeraient vers un nom interne injoignable.

## 9. Emails

- Envoi SMTP (rappels de circulation, lien de mot de passe, OTP email…).
- **Mode dégradé propre** : si `SMTP_HOST` est vide, les emails sont
  **journalisés** au lieu d'être envoyés — l'application démarre et fonctionne
  (aucun crash), le temps de configurer le SMTP réel.

## 10. Tâches planifiées

- `@nestjs/schedule` (dans le process API — pas de worker séparé).
- **Rappels de circulation** : balayage quotidien (échéances à venir, retards),
  avec **idempotence** (une ligne `reminder_logs` réservée avant l'envoi → zéro
  doublon même en cas de redémarrage/concurrence).
- **Expiration / promotion des réservations** ; email « réservation disponible ».

## 11. Robustesse (principes)

- **La recherche ne plante jamais l'app** : index absent ou moteur injoignable →
  résultat vide (facettes à 0), l'OPAC reste consultable.
- **L'indexation n'empêche jamais une écriture** : `safeIndex`/`safeRemove`
  avalent les erreurs d'indexation (à rattraper par une réindexation).
- **Les serveurs externes (SRU) sont bornés** par un timeout court ; un échec est
  signalé sans figer la saisie.
- **Secrets forts imposés en production** : l'API **refuse de démarrer** avec un
  `JWT_SECRET`/`ADMIN_API_KEY` faible ou par défaut.

## 12. Sécurité applicative

- HTTPS forcé (Caddy) + en-têtes de sécurité (HSTS, nosniff, frame, referrer).
- **CSP à nonce** côté web (vérifiée sur build de production).
- **2FA** TOTP + codes de secours + OTP email, imposable par rôle.
- **Journal d'audit** exhaustif (schéma public).
- Limitation de débit globale + renforcée sur les endpoints sensibles.

## 13. Organisation du dépôt

```
gafeso/
├── apps/
│   ├── api/                 # NestJS (monolithe modulaire)
│   │   ├── src/             # modules (cataloging, circulation, opac, oai, sru…)
│   │   └── prisma/          # schema.prisma + migrations
│   └── web/                 # Next.js 15 (App Router)
├── docker/
│   ├── docker-compose.yml       # DÉVELOPPEMENT (infra seule)
│   ├── docker-compose.prod.yml  # PRODUCTION (tout conteneurisé)
│   └── Caddyfile
├── scripts/
│   ├── provision-production.mjs # 1re école en prod
│   ├── reindex.mjs              # réindexation recherche
│   └── backup/                  # sauvegardes (pg_dump + MinIO)
├── docs/                    # cette documentation
├── install.sh               # installateur une-commande
└── DEPLOY.md                # exploitation
```

## 14. Tests et qualité

- **423 tests** côté API (`npm test`, exécutés sur base PostgreSQL dédiée), plus
  une **suite de parité** de recherche (12 tests) gatée par `SEARCH_PARITY=1`
  (exécutée à la demande contre Meili **et** ES vivants).
- Code commenté en **français**, conventions NestLaravel/Nest standard.

## 15. Deux mondes Docker

- `docker/docker-compose.yml` = **développement** : lance seulement l'infra
  (db, redis, meili, minio, mailpit) ; l'app tourne en `npm run dev` sur l'hôte.
- `docker/docker-compose.prod.yml` = **production** : lance **tout** (infra +
  api + web + Caddy), images construites depuis le dépôt. C'est celui qu'utilise
  l'installateur — voir [INSTALLATION.md](INSTALLATION.md).
