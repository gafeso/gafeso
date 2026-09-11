# DEPLOY.md — administration avancée de la plateforme

> **Vous cherchez à installer Gafeso, à le sauvegarder ou à diagnostiquer une
> panne ?** Tout cela vit désormais dans
> **[docs/INSTALLATION.md](docs/INSTALLATION.md)** : prérequis et DNS,
> installation pas à pas, exploitation courante, sauvegardes et tableau de
> diagnostic. Ce document ne les répète pas.
>
> Il traite ce qui reste : provisionner des établissements **supplémentaires**,
> l'API d'administration de la plateforme, les commandes de seed, le changement
> de moteur de recherche et la rédaction d'une migration Prisma. Son lecteur
> n'est pas l'exploitant du serveur mais la personne qui fait évoluer
> l'installation ou le code.

> Déploiement Docker Compose mono-serveur. Le serveur exécute exactement le
> code du dépôt Git : `git pull` + rebuild, rien d'autre. Pas de Kubernetes,
> pas de build manuel — conforme au principe « monolithe modulaire, pas de
> microservices » du projet (voir [docs/fonctionnement.md](docs/fonctionnement.md)).

## Vue d'ensemble

```
Internet ──443/80──▶ Caddy ──┬──▶ web (Next.js, standalone)
                              │        │
                              │        └─ /api/* proxifié en interne ─▶ api
                              ├──▶ api (NestJS)  ──▶ db / redis / meilisearch / minio
                              └──▶ minio (bucket "covers" public uniquement)
```

- **Caddy** est le seul service exposé sur Internet (ports 80/443). Il obtient
  et renouvelle automatiquement les certificats TLS (Let's Encrypt).
- **web** n'est jamais appelé directement par le navigateur pour l'API : ses
  appels `/api/*` sont proxifiés en interne vers `api` par Next.js
  (`apps/web/next.config.mjs`), sur le réseau Docker — jamais via Internet.
- **api** applique ses migrations Prisma en attente à chaque démarrage
  (`docker-entrypoint.sh` → `prisma migrate deploy`), avant de servir le
  trafic. Idempotent : ne rien avoir à appliquer ne fait rien.
- **db / redis / meilisearch / minio** ne publient AUCUN port sur l'hôte —
  joignables uniquement depuis le réseau Docker interne du projet.

Deux fichiers Compose distincts, à ne pas confondre :

| Fichier | Usage | Lance |
|---|---|---|
| `docker/docker-compose.yml` | **Développement local** | Infra seule ; l'app tourne en `npm run dev` sur l'hôte |
| `docker/docker-compose.prod.yml` | **Production** | Infra + api + web + Caddy, tout conteneurisé |

## Renommage produit (Gafeso) — nouvelles installations vs existantes

Le produit s'appelait **BiblioCloud** ; il a été renommé **Gafeso** (« la maison
des livres » en dioula) le 2026-07-18.

Depuis, les identifiants d'infrastructure suivent le même nom. La bascule est
faite **par variables d'environnement, jamais par rupture** :

| | Nouvelle installation | Installation existante |
|---|---|---|
| Projet Compose (préfixe des volumes/réseau/images) | `gafeso-prod` | `bibliocloud-prod` **conservé** |
| `POSTGRES_USER` / `POSTGRES_DB` | `gafeso` | `bibliocloud` **conservé** |
| `MINIO_ROOT_USER` | `gafeso` | `bibliocloud` **conservé** |

**Comment cela tient :** les fichiers `docker/docker-compose*.yml` gardent les
**anciennes** valeurs par défaut (`${COMPOSE_PROJECT_NAME:-bibliocloud-prod}`,
`${POSTGRES_DB:-bibliocloud}`…). Une installation antérieure — dont le
`.env.prod` ne contient pas `COMPOSE_PROJECT_NAME` — retombe donc sur son nom
historique et **démarre sans aucune intervention**. C'est `install.sh` qui écrit
les valeurs `gafeso` dans le `.env.prod` des installations **neuves**.

Autrement dit : **le `.env.prod` fait foi**. Les fichiers versionnés ne
contiennent aucune valeur codée en dur qui pourrait déplacer une base, un rôle
ou un volume dans le dos de l'exploitant.

`install.sh --force` sur une installation existante **relit** ces valeurs depuis
le `.env.prod` en place et les conserve — en le signalant à l'écran, pour que
l'exploitant sache que son infra reste nommée `bibliocloud` (c'est voulu et sans
danger).

### Renommer réellement une installation existante (optionnel)

```bash
./scripts/rename-to-gafeso.sh --dry-run   # montre le plan, n'écrit rien
./scripts/rename-to-gafeso.sh             # exécute (confirmation explicite)
```

⚠ **Arrêt de service** pendant l'opération. Le script prend un dump complet
d'abord, renomme la base et le rôle **en place** (`ALTER … RENAME`, instantané),
recopie les volumes vers le nouveau préfixe **pile arrêtée**, met à jour le
`.env.prod` (copie de sauvegarde à côté) et redémarre. Les anciens volumes et le
dump ne sont jamais supprimés : c'est le retour arrière.

Ce qui ne change **jamais**, quel que soit le cas :

| Identifiant | Pourquoi |
|---|---|
| Schémas PostgreSQL `tenant_<slug>` | Cloisonnement multi-tenant, indépendant du nom du produit. |
| Migrations Prisma déjà appliquées | On ne réécrit pas un historique déjà joué en production. |
| Buckets MinIO (`covers`, `digital-copies`) | Les objets y sont stockés ; les renommer les rendrait introuvables. |

> Le domaine de service (`bibliotheque.exemple.bf` dans les exemples de ce
> document) n'est PAS un identifiant produit : c'est le domaine de
> l'**établissement**. Il ne change pas non plus.

## Application mobile — le domaine de stockage doit être public

L'application Android télécharge les documents hors-ligne par une **URL signée
temporaire** qui pointe vers `STORAGE_DOMAIN`, pas vers l'API. Deux exigences
en découlent, faciles à manquer :

1. `STORAGE_DOMAIN` doit être **joignable depuis Internet**, au même titre que
   le domaine public — pas seulement depuis le réseau de l'établissement.
2. Il doit être servi en **HTTPS avec un certificat reconnu**. L'APK de release
   interdit le trafic en clair et n'accepte que les autorités du magasin
   système (`network_security_config`) : un certificat auto-signé est rejeté.
   Caddy s'en charge automatiquement dès que le DNS pointe correctement.

**Symptôme si ce n'est pas le cas** : l'application se connecte, l'étagère
s'affiche avec les bons titres… et le téléchargement échoue seul, sur une
erreur réseau visant le domaine de stockage. Tout le reste paraît fonctionner —
constaté en re-validation mobile le 2026-08-03.

Les trois enregistrements DNS vérifiés par `install.sh` couvrent déjà ce cas :
`storage.<domaine>` en fait partie. Ne le retirez pas en pensant qu'il ne sert
qu'aux couvertures d'ouvrages.

## Provisionnement et administration

> Le **premier** établissement est créé par `install.sh` (voir
> [docs/INSTALLATION.md](docs/INSTALLATION.md)). Cette section sert à en
> provisionner d'**autres**, ou à rejouer un provisionnement à la main.

### Provisionner un établissement

`scripts/provision-production.mjs` fait le provisioning complet en une
commande : le tenant (domaine = `APP_URL`), le super-admin plateforme, le
compte administrateur de l'école, et quelques données de démonstration
présentables (classes, une collection, notices) — pour ne pas démarrer sur
un catalogue vide. Contrairement à `scripts/seed-demo.mjs` (démo de
développement, mot de passe partagé tiré au hasard et affiché en fin
d'exécution), les
comptes créés ici suivent la politique de mot de passe habituelle de
l'application (voir `AccountsService.createStaff`) : **aucun mot de passe en
clair n'est stocké**.

```bash
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
  exec api node scripts/provision-production.mjs
```

Le script lit `APP_URL` / `ADMIN_API_KEY` / `DATABASE_URL` déjà présents
dans l'environnement du conteneur `api` (remplis dans `.env.prod`) — rien à
ajouter pour une école par défaut (nom « Université d’Exemple », slug
`bibliotheque`, comptes `superadmin@<domaine de APP_URL>` et
`admin@<domaine de APP_URL>`). Personnaliser au besoin avec des variables
d'environnement optionnelles avant de lancer (`PROVISION_SLUG`,
`PROVISION_SCHOOL_NAME`, `PROVISION_SUPERADMIN_EMAIL`,
`PROVISION_ADMIN_EMAIL`, `PROVISION_ADMIN_FIRSTNAME`,
`PROVISION_ADMIN_LASTNAME`), par exemple :

```bash
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml exec \
  -e PROVISION_SCHOOL_NAME="Une autre école" \
  -e PROVISION_SLUG=autre \
  -e PROVISION_ADMIN_EMAIL=directeur@une-autre-ecole.exemple \
  api node scripts/provision-production.mjs
```

**À la fin de l'exécution, le terminal affiche UNE SEULE FOIS** (jamais
journalisé, jamais stocké en clair — à noter immédiatement) :
- le mot de passe du super-admin plateforme (`POST /admin/login`) ;
- le lien de définition de mot de passe (usage unique, 24h) pour
  l'administrateur de l'école, à transmettre par un canal sécurisé.

Le script est idempotent : le relancer (ex. après un ajout de données de
démo dans une future version) ne régénère jamais un mot de passe/lien pour
un compte déjà existant.

Le domaine dérivé de `APP_URL` doit correspondre au `Host` que le navigateur
envoie réellement (donc `PUBLIC_DOMAIN`, pas `API_DOMAIN`) : c'est lui qui
résout l'école courante (voir `TenancyService.resolveByHost`). Pour une
plateforme multi-écoles avec un sous-domaine par établissement, répéter
l'opération (variables `PROVISION_*` différentes) et ajouter chaque
sous-domaine au `Caddyfile` (bloc `PUBLIC_DOMAIN` dupliqué avec le nouveau
domaine, ou wildcard DNS + bloc `*.gafeso.exemple`).

Pour ajouter une école supplémentaire SANS comptes ni données de démo (juste
le tenant), la route brute reste disponible :

```bash
curl -X POST https://<API_DOMAIN>/admin/tenants \
  -H "x-admin-api-key: <ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Une autre école","slug":"autre","domain":"<son-domaine>"}'
```

### Administration de la plateforme

> **Le super-admin plateforme n'a PAS d'interface web.** C'est une API.
> L'espace `/admin` du site est l'administration **de l'école** (catalogue,
> comptes, classes, statistiques) : les identifiants du super-admin
> plateforme n'y fonctionnent pas, et réciproquement. Les deux niveaux sont
> volontairement distincts — gérer les établissements n'est pas gérer une
> bibliothèque.

Les routes `/admin/*` (créer, lister, inspecter, resynchroniser ou supprimer
un établissement) acceptent **deux** moyens d'authentification, au choix :

**1. JWT super-admin** — avec l'email et le mot de passe affichés une seule
fois à la fin de l'installation :

```bash
# Récupérer un jeton
TOKEN=$(curl -s -X POST https://<API_DOMAIN>/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<email-super-admin>","password":"<mot-de-passe>"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

# L'utiliser
curl https://<API_DOMAIN>/admin/tenants -H "Authorization: Bearer $TOKEN"
```

**2. Clé API** — la valeur `ADMIN_API_KEY` de `.env.prod`, pratique pour un
script ou une tâche planifiée (pas de session à renouveler) :

```bash
curl https://<API_DOMAIN>/admin/tenants -H "x-admin-api-key: <ADMIN_API_KEY>"
```

Les deux voies sont vérifiées par le même garde (`ApiKeyGuard`) : le JWT est
essayé d'abord, la clé API sert de repli. Toutes les routes `/admin/*` en
sont protégées **sauf** `POST /admin/login`, qui est le point d'entrée et
est limité à 5 tentatives par minute.

La liste complète des routes est visible dans Swagger si vous démarrez l'API
avec `SWAGGER_ENABLED=true` (désactivé par défaut en production) :
`https://<API_DOMAIN>/docs`.

### Rejouer les données de démo (`seed:demo`)

`scripts/seed-demo.mjs` (école fictive EXEMPLE/slug `zinda`, domaine
`localhost`, mot de passe partagé tiré au hasard — refuse toute cible non
locale sans `SEED_FORCE=1`) reste utile pour
retester une démo après un rollback, y compris en production/staging
conteneurisé — il n'a plus besoin d'un fichier `.env` (les variables du
conteneur suffisent) :

```bash
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
  exec api node scripts/seed-demo.mjs
```

Ne pas le lancer sur le tenant réel d'une école en production (domaine
`localhost` non résolvable publiquement, mots de passe publics dans ce
fichier) — c'est `provision-production.mjs` ci-dessus qu'il faut utiliser
pour une vraie école.

### Seed de la page d'accueil EXEMPLE (`seed-homepage`)

Écrit le contenu de la page d'accueil vitrine EXEMPLE (repris de la maquette
officielle de la BUC), les tokens de couleur de la vitrine (accent clay +
palette maquette) et active le motif décoratif. **Ne touche pas** à la
couleur principale (`--primary` reste le vert déjà choisi par l'école via
Administration → Établissement). Destiné au tenant EXEMPLE.

```bash
curl -X POST https://<API_DOMAIN>/admin/tenants/<slug>/seed-homepage \
  -H "x-admin-api-key: <ADMIN_API_KEY>"
# → {"slug":"bibliotheque","seeded":true}
```

Ensuite, la page d'accueil (`https://<PUBLIC_DOMAIN>/`) est éditable dans
Administration → Page d'accueil (permission `etablissement.gerer`). Un autre
établissement part d'une page vide (aucune trace EXEMPLE) et saisit son propre
contenu. Les modifications admin sont visibles après un rafraîchissement (le
cache SSR de l'accueil est purgé à chaque sauvegarde).

### Migration auteurs → contributeurs (`migrate-authors`)

Après le déploiement des contributeurs avec rôles (fiche de saisie §2.2) et
le `sync-schema` de chaque école : copie l'auteur texte des notices
existantes vers un contributeur AUTEUR_PRINCIPAL (notices sans contributeur
uniquement). Idempotent, ne supprime rien — l'ancien champ `author` reste
alimenté (dénormalisation transitoire) jusqu'à une migration ultérieure.

```bash
curl -X POST https://<API_DOMAIN>/admin/tenants/<slug>/migrate-authors \
  -H "x-admin-api-key: <ADMIN_API_KEY>"
# → {"slug":"bibliotheque","migrated":<n>}
```

### Seed des catégories standard (`seed-categories`)

Ajoute à UNE école les 28 catégories standard manquantes (liste de la
responsable EXEMPLE — `apps/api/src/categories/default-categories.ts`). La
comparaison avec l'existant ignore la casse et les accents : jamais de
doublon, jamais de suppression ni de renommage. Idempotent — relancer ne
crée rien si tout existe. Tenant-scopé : n'affecte pas les autres écoles.

```bash
curl -X POST https://<API_DOMAIN>/admin/tenants/<slug>/seed-categories \
  -H "x-admin-api-key: <ADMIN_API_KEY>"
# → {"slug":"bibliotheque","created":28,"skipped":0,"total":28}
```

### Choisir le moteur de recherche (Meilisearch / Elasticsearch)

L'OPAC est servi par un moteur de recherche choisi par **configuration**, sans
changement de code (variable `SEARCH_ENGINE`) :

| `SEARCH_ENGINE` | Moteur | RAM | Quand |
|---|---|---|---|
| `meilisearch` (défaut) | Meilisearch | ~100 Mo | **cas par défaut, recommandé** |
| `elasticsearch` | Elasticsearch | **2–4 Go** | vous réutilisez un ES déjà en place |

Absent ou inconnu → repli sûr sur **Meilisearch** (aucun impact sur les
déploiements existants qui ne fixent pas la variable).

> **Note pour l'installateur — « quel moteur ? »** : dans le doute, **gardez
> Meilisearch**. Il ne demande aucun réglage et tient dans ~100 Mo. Ne passez à
> Elasticsearch QUE si votre établissement exploite déjà un cluster ES que vous
> voulez réutiliser — sinon ES privera le reste de la pile (api, web, db, minio)
> de mémoire sur un serveur d'école typique. Détails et différences de
> comportement : `docs/search-engines.md`.

**Basculer de moteur** (ex. Meilisearch → Elasticsearch) :

```bash
# 1. Activer le service Elasticsearch (profil dédié, sinon jamais démarré)
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
  --profile elasticsearch up -d elasticsearch

# 2. Pointer l'application vers ES puis redémarrer l'api
#    .env.prod : SEARCH_ENGINE=elasticsearch  (+ ELASTIC_NODE si non défaut)
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d api

# 3. RÉINDEXER chaque école (l'index du nouveau moteur est vide au départ)
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
  exec api node scripts/reindex.mjs bibliotheque
```

Le log de démarrage de l'api indique le moteur retenu (`Moteur de recherche :
…`). Revenir en arrière = même procédure avec `SEARCH_ENGINE=meilisearch` puis
réindexation (les index restent indépendants par moteur).

### Réindexer Meilisearch (`reindex`)

L'OPAC et la page constellation lisent Meilisearch (index `records_<slug>`),
PAS directement PostgreSQL — un catalogue peut donc exister en base sans être
cherchable/comptable si l'index n'a jamais été construit ou a été perdu.
`provision-production.mjs` indexe déjà les notices qu'il crée ; ce script sert
pour toute REindexation ultérieure :
- après une perte de l'index (rollback Docker : le volume `meili_data` n'est
  PAS dans le dump PostgreSQL, voir « Sauvegardes » ci-dessous) ;
- après un import massif de notices (MARC) qui aurait échoué à s'indexer au
  fil de l'eau (voir le log `Indexation Meilisearch échouée` de l'API).

```bash
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
  exec api node scripts/reindex.mjs bibliotheque
```

À lancer aussi après un déploiement qui change les attributs indexés (ex.
refonte de la fiche de saisie : complément de titre, contributeurs — tous
rôles, directeur de mémoire compris —, mots-clés, université de soutenance
sont cherchables) : les réglages sont réappliqués et les notices réindexées
avec les nouveaux champs.

Protégé par `ADMIN_API_KEY` (route `POST /admin/tenants/:slug/reindex`) — pas
besoin d'un compte bibliothécaire. Idempotent (reconstruit l'index en
entier depuis PostgreSQL — source de vérité — à chaque appel).

**Robustesse** : un index Meilisearch absent ou injoignable ne fait JAMAIS
planter l'OPAC/la constellation (`SearchService.search`, voir
`apps/api/src/search/search.service.ts`) — elles renvoient un résultat vide
(catégories à 0 document) au lieu d'une erreur 500, le temps de relancer une
réindexation.

## Migrations Prisma — ajouter un changement de schéma

Le développement local utilise `prisma db push` (pas de fichiers de
migration, rechargement direct du schéma — voir `apps/api/package.json`,
script `db:push`). La **production**, elle, utilise `prisma migrate deploy`
sur un historique de migrations versionné (`apps/api/prisma/migrations/`),
plus sûr et traçable. Une migration de référence (`00000000000000_init`)
capture déjà tout le schéma actuel.

Pour un **futur changement de schéma** (nouvelle colonne, nouvelle table…),
générer le fichier de migration AVANT de déployer :

> ⚠ **Ne JAMAIS passer `$DATABASE_URL` en `--shadow-database-url`.** Prisma
> **réinitialise** la base indiquée comme shadow : il y rejoue tout
> l'historique de migrations après avoir fait table rase. La pointer sur la
> base de développement l'efface. Toujours une base **jetable et dédiée**,
> créée juste avant et supprimée juste après.

```bash
cd apps/api
# Base shadow JETABLE (Prisma va l'effacer et la reconstruire) :
docker compose -f ../../docker/docker-compose.yml exec -T db \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS gafeso_shadow;" \
                                        -c "CREATE DATABASE gafeso_shadow;"
SHADOW_URL=$(printf '%s' "$DATABASE_URL" | sed -E "s#/[^/?]+\?#/gafeso_shadow?#")

# Modifier prisma/schema.prisma, puis générer le SQL de la migration
# (la base de développement n'est pas touchée ; la base shadow, si) :
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_URL" \
  --script > /tmp/migration.sql

# Créer le dossier horodaté et y placer le SQL généré
mkdir -p "prisma/migrations/$(date +%Y%m%d%H%M%S)_description_du_changement"
mv /tmp/migration.sql "prisma/migrations/<le_dossier_créé>/migration.sql"

# Vérifier qu'elle s'applique proprement sur une base vierge avant de committer
createdb migration_test   # ou : docker compose exec db createdb -U "$POSTGRES_USER" migration_test
DATABASE_URL="postgresql://.../migration_test" npx prisma migrate deploy
```

Committer le nouveau dossier `prisma/migrations/<horodatage>_.../migration.sql`
avec le reste du changement. Il s'appliquera automatiquement au prochain
déploiement (`docker-entrypoint.sh` → `prisma migrate deploy`).

`--shadow-database-url` demande une base Postgres joignable **et jetable**.
Prisma s'en sert pour rejouer l'historique de migrations et comparer le
résultat au schéma : il la **vide d'abord**. Vérifié — une table contenant une
ligne, placée dans cette base avant l'appel, n'existe plus après ; il ne reste
que les 36 tables du schéma reconstruit. La documentation affirmait
auparavant qu'« aucune donnée n'y est modifiée » et donnait `$DATABASE_URL`
en exemple : suivre cette ligne effaçait la base de développement.

Une fois la migration générée, supprimer la base jetable :

```bash
docker compose -f ../../docker/docker-compose.yml exec -T db \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS gafeso_shadow;"
```

**Table PARTAGÉE (schéma `public`)** — ex. `audit_logs` (journal d'audit),
`tenant_settings`, `collections` : la migration Prisma la crée directement dans
`public` et c'est TOUT. **AUCUN sync-schema à propager** — contrairement à une
table tenant, elle n'existe pas par école. Le journal d'audit est
volontairement public (voir le commentaire du modèle `AuditLog` dans
`schema.prisma`) : il accueille aussi les actions PLATEFORME (endpoints
super-admin par clé API) qui n'ont aucun schéma tenant, et sa consultation est
bornée au tenant courant côté requête (`GET /audit`, permission
`etablissement.gerer`). Migration seule → rien d'autre à faire au déploiement.

**Cas concret — rappels de circulation, migration `add_reminders`** : même parti
pris que le journal d'audit, tout est **public**.
- `reminder_logs` (journal des envois) est **dénormalisé** (destinataire, titre,
  code-barres, échéance figés à l'envoi) et vit dans `public` : l'écran admin se
  lit sans jointure inter-schéma, et `checkout_id`/`tenant_id` sont des UUID
  globalement uniques → pas de FK (comme `audit_logs`). L'unicité
  `(checkout_id, type, stage_key)` porte l'**idempotence** (un rappel = une ligne
  = un envoi). Consultation bornée au tenant (`GET /reminders/log`).
- Les paramètres (`reminders_enabled`, `reminder_days_before`,
  `overdue_repeat_days`, `reminder_templates`) sont ajoutés à `tenant_settings`
  (public), avec défauts non-null sûrs.
- **AUCUN sync-schema** : rien ne vit dans les schémas tenant. Migration
  `prisma migrate deploy` seule au déploiement. Le planificateur (`@nestjs/schedule`,
  cron quotidien) tourne dans le process API ; en cas de scale horizontal, la
  contrainte unique empêche tout double-envoi entre instances (réservation
  « PENDING » avant l'envoi).

**Nouvelle table propre à une école** (ex. `categories`) : la migration ne
crée la table QUE dans le schéma `public` (le gabarit). Il faut en plus
l'ajouter à `TENANT_TABLES` (`apps/api/src/tenancy/tenant-schema.ts`), puis,
après le déploiement, synchroniser chaque école déjà provisionnée :

```bash
curl -X POST https://<API_DOMAIN>/admin/tenants/<slug>/sync-schema \
  -H "x-admin-api-key: <ADMIN_API_KEY>"
```

Sans cette étape, l'école existante reçoit une erreur Postgres (« relation
does not exist ») sur les routes qui touchent la nouvelle table — voir le
commentaire en tête de `tenant-schema.ts`.

**Cas concret — fiches d'autorité auteurs, migration `add_authors`** : combine
nouvelle table tenant + nouvelle colonne + FK, tout géré par un seul
`sync-schema`.
- Table **tenant** `authors` : ajoutée à `TENANT_TABLES` → `sync-schema` la crée
  via `CREATE TABLE ... LIKE public.authors` (étape 1 du provisioning rejoué,
  déjà en place pour les colonnes/index et qui sait donc créer une TABLE
  manquante — vérifié).
- Colonne **tenant** `record_contributors.author_id` (NULLable) + sa FK vers
  `authors` : ajoutées à `TENANT_FOREIGN_KEYS`. La colonne est posée par
  `addMissingColumns`, la FK rejouée à l'étape « contraintes ». Le même
  `sync-schema` fait donc tout :
  ```bash
  curl -X POST https://<API_DOMAIN>/admin/tenants/<slug>/sync-schema \
    -H "x-admin-api-key: <ADMIN_API_KEY>"
  ```
- **Puis, une fois par école**, dédupliquer les contributions existantes en
  fiches d'autorité (idempotent — relance = 0) :
  ```bash
  curl -X POST https://<API_DOMAIN>/admin/tenants/<slug>/dedupe-authors \
    -H "x-admin-api-key: <ADMIN_API_KEY>"
  # → {"slug":"<slug>","authorsCreated":<n>,"contributionsLinked":<m>}
  ```
- **Réindexation Meilisearch requise** (l'`authorId` entre dans le document de
  recherche — voir bloc 4) : `POST /admin/tenants/<slug>/reindex` après la dédup.

**Nouvel index (ou colonne) sur une table tenant existante** (ex. les index de
circulation ajoutés le 2026-07-14 sur `holds`, `items`, `checkouts`) : la
migration Prisma ne crée l'objet que dans le gabarit `public`. Le
`CREATE TABLE ... LIKE ... INCLUDING ALL` du provisioning copie index et
colonnes **à la création** — les nouvelles écoles en héritent donc
automatiquement — mais il ne rattrape jamais une table déjà existante. Après le
déploiement, synchroniser chaque école déjà provisionnée :

```bash
curl -X POST https://<API_DOMAIN>/admin/tenants/<slug>/sync-schema \
  -H "x-admin-api-key: <ADMIN_API_KEY>"
# → {"slug":"<slug>","applied":<n>,"skipped":<m>}
```

`sync-schema` est **idempotent** : il ajoute les colonnes manquantes
(`ALTER TABLE ... ADD COLUMN`) puis les index manquants
(`CREATE INDEX IF NOT EXISTS`, comparaison par signature de colonnes pour ne
jamais créer de doublon) sur chaque table tenant, sans toucher aux données. Le
recensement des index attendus vit dans `TENANT_INDEXES`
(`apps/api/src/tenancy/tenant-schema.ts`) : y ajouter toute nouvelle entrée
`@@index` posée sur une table tenant, en plus du `@@index` dans
`schema.prisma`.

**Cas concret — tableau de bord statistiques, migration `add_checkout_date_indexes`** :
deux index sur la table **tenant** `checkouts` (`checkout_date`, `return_date`)
pour les séries temporelles (prêts/retours par jour/semaine/mois). Ajoutés à
`TENANT_INDEXES` → `sync-schema` les crée sur les écoles existantes
(`CREATE INDEX IF NOT EXISTS`, idempotent) ; les nouvelles écoles les héritent par
`LIKE`. Après déploiement, lancer le `sync-schema` ci-dessus pour chaque école.
Aucune donnée touchée, aucune colonne.

**Cas concret — récolement / inventaire, migration `add_inventory_recolement`** :
elle apporte deux nouveautés propagées par `sync-schema` :
- Deux **tables tenant** `inventory_sessions` + `inventory_scans` (ajoutées à
  `TENANT_TABLES`, avec la FK `inventory_scans.session_id` → `inventory_sessions`
  dans `TENANT_FOREIGN_KEYS`). Le `sync-schema` les crée par `CREATE TABLE ... LIKE`
  (avec index et unicité), puis pose la FK.
- Une **valeur d'enum** `ItemStatus.MISSING` (statut « introuvable au récolement »).
  `sync-schema` sait désormais **ajouter les valeurs d'enum manquantes**
  (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`) : `CREATE TYPE` (déjà existant) ne les
  rattrapait pas. Le recensement vit dans `TENANT_ENUMS`
  (`apps/api/src/tenancy/tenant-schema.ts`) — y ajouter toute nouvelle valeur.

Après déploiement, lancer le `sync-schema` ci-dessus pour chaque école déjà
provisionnée. Idempotent, aucune donnée touchée.

**Cas concret — notice Gafeso, migration `notice_gafeso_marc_facultatif`** :
premier cas où une migration **RELÂCHE une contrainte** sur une table tenant
(`biblio_records.marc_data` devient nullable), en plus d'ajouter une colonne
(`profile`, défaut `bibliographique`) et une valeur d'enum (`MarcFormat.GAFESO`).
- `LIKE ... INCLUDING ALL` copie `NOT NULL` et `DEFAULT` **à la création
  seulement** : une école provisionnée avant cette migration garde son
  `marc_data NOT NULL` alors que le gabarit `public` est déjà assoupli. La
  migration seule ne suffit donc PAS — sans `sync-schema`, la première notice
  sans MARC échoue en production alors que tout paraît déployé.
- `sync-schema` sait désormais **rattraper les contraintes relâchées**
  (`buildColumnConstraintStatements`) : `DROP NOT NULL` et `SET DEFAULT`, les
  deux seules directions sûres sur une table qui contient déjà des lignes. Le
  durcissement (`SET NOT NULL`) reste **manuel** : il échouerait sur une seule
  ligne nulle et ferait tomber la resynchro entière.
- Après déploiement, lancer le `sync-schema` ci-dessus **pour chaque école déjà
  provisionnée**. Idempotent, aucune donnée touchée.

Le modèle de description lui-même — ce que sont la « notice Gafeso », le profil
et les métadonnées natives — est décrit dans
[docs/architecture-notice.md](docs/architecture-notice.md).

**Cas concret — double authentification (2FA), migration `add_two_factor`** : elle
touche les deux mondes à la fois.
- `tenant_settings.require_2fa` (booléen, défaut `false`) est une table **publique** :
  la migration seule suffit, rien à propager.
- La table **tenant** `users` reçoit 7 colonnes **toutes `NULL`ables** (`totp_secret`,
  `totp_enabled_at`, `totp_last_step`, `backup_codes`, `email_otp_hash`,
  `email_otp_expires_at`, `email_otp_attempts`). Les nouvelles écoles en héritent à la
  création ; **pour chaque école déjà provisionnée**, lancer le `sync-schema`
  ci-dessus après déploiement. La nullabilité est OBLIGATOIRE : `sync-schema` ne sait
  ajouter que des colonnes `ADD COLUMN` sans valeur par défaut sur des tables déjà
  peuplées. Aucune entrée à ajouter dans `TENANT_INDEXES` (pas d'index 2FA).

Le repli OTP par email réutilise le SMTP existant (voir ci-dessous) ; sans SMTP
configuré, seuls TOTP et codes de secours sont proposés (le bouton « code par
email » n'apparaît pas).

**Cas concret — réservations en ligne, migration `add_hold_notified_at`** :
contrairement aux deux cas précédents, celui-ci touche une table **tenant**.
- `holds.notified_at` (TIMESTAMP NULLable) porte l'idempotence de l'email
  « réservation disponible » (posé à l'envoi → jamais deux fois). La colonne est
  **NULLable sans défaut** : le `sync-schema` (buildAddMissingColumnsStatements)
  peut donc l'ajouter aux écoles déjà provisionnées sans réécrire les lignes.
- Après le déploiement (`prisma migrate deploy` applique la colonne au gabarit
  `public`), lancer le `sync-schema` **pour chaque école existante** :
  ```bash
  curl -X POST https://<API_DOMAIN>/admin/tenants/<slug>/sync-schema \
    -H "x-admin-api-key: <ADMIN_API_KEY>"
  ```
  Les nouvelles écoles héritent de la colonne par `CREATE TABLE ... LIKE` à la
  création. Aucun index à ajouter (pas d'entrée `TENANT_INDEXES`).
- Les autres réglages de réservation (`hold_pickup_days`, durée de mise de côté)
  vivent dans `tenant_settings` (public) → pas de sync-schema pour eux.

## Sécurité — rappels

- `db`, `redis`, `meilisearch`, `minio` ne publient aucun port sur l'hôte :
  seul Caddy (80/443) et, via lui, `web`/`api` sont exposés. Ne pas ajouter
  de mappage de port à ces services sans raison précise.
- Tous les secrets (`.env.prod`) sont générés (pas de valeur par défaut) et
  exclus de Git (voir `.gitignore`). Ne jamais les committer, ne jamais les
  faire transiter par un canal non chiffré.
- `api` refuse de démarrer en production avec des secrets faibles ou
  d'exemple — voir `assertProductionSecrets` dans `apps/api/src/main.ts`.
- Swagger (`/docs`) est désactivé par défaut en production. Pour le
  réactiver temporairement (recette, débogage) : `SWAGGER_ENABLED=true` dans
  `.env.prod` puis redémarrer `api` — à retirer ensuite.
- Rotation d'un secret compromis : le changer dans `.env.prod` puis
  `docker compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d <service>`.
  Changer `JWT_SECRET` déconnecte immédiatement toutes les sessions actives
  (signatures existantes invalidées) — c'est le but en cas de compromission.
