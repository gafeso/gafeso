# Sauvegardes Gafeso

Deux sources de vérité à sauvegarder ensemble :

1. **PostgreSQL** (catalogue, comptes, prêts, réglages) → `db_<date>.sql.gz`
2. **MinIO** (couvertures, fichiers numériques) → `minio_<date>.tar.gz`
   (ces fichiers ne sont **pas** dans le dump PostgreSQL)

## Sauvegarder

```bash
./scripts/backup/backup.sh                 # → ./backups/
./scripts/backup/backup.sh /mnt/sauvegardes # destination personnalisée
```

Automatiser (cron quotidien à 2 h) :

```cron
0 2 * * *  cd /chemin/gafeso && ./scripts/backup/backup.sh >> /var/log/gafeso-backup.log 2>&1
```

Rétention : les archives de plus de `BACKUP_RETENTION_DAYS` jours (défaut 14)
sont supprimées automatiquement. **Copiez ces archives hors du serveur**
(objet distant, autre machine) — une sauvegarde sur le même disque ne protège
pas d'une panne matérielle.

## Restaurer

> ⚠ Restauration = écrasement. Arrêter l'application (`api`, `web`) d'abord.

⚠ **`psql` SORT EN 0 MÊME QUAND LA RESTAURATION ÉCHOUE.** Mesuré le 06/10/2026
par `./scripts/recette-sauvegarde-restauree.sh` : quatre erreurs SQL, code de
sortie zéro — et sur une archive VIDE, zéro erreur et zéro restauré. **Le code
de sortie ne dit rien ; seule la comparaison des données le dit.** La dernière
étape ci-dessous n'est donc pas une précaution, c'est la mesure.

Les archives produites depuis le 06/10/2026 portent `--clean --if-exists` : elles
suppriment les objets avant de les recréer, donc la restauration est propre sur
une base peuplée. ⚠ **Une archive ANTÉRIEURE à cette date n'a pas cette
propriété** : restaurez-la dans une base VIDE (`DROP DATABASE` puis
`CREATE DATABASE`), jamais par-dessus l'existant.

```bash
COMPOSE="docker compose --env-file .env.prod -f docker/docker-compose.prod.yml"

# 1. PostgreSQL
gunzip -c backups/db_<date>.sql.gz | \
  $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"   # valeurs lues dans .env.prod

# 2. MinIO (remplace le contenu du volume)
docker run --rm \
  -v "${COMPOSE_PROJECT_NAME:-gafeso-prod}_minio_data":/data \
  -v "$PWD/backups:/backup:ro" \
  busybox sh -c "rm -rf /data/* && tar xzf /backup/minio_<date>.tar.gz -C /data"

# 3. Redémarrer + réindexer la recherche
$COMPOSE up -d
$COMPOSE exec api node scripts/reindex.mjs <slug>

# 4. ⚠ VÉRIFIER — le code de sortie de psql ne dit RIEN
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT 'comptes: '||count(*) FROM public.super_admins"
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT 'écoles: '||count(*) FROM public.tenants"
curl -s https://<API_DOMAIN>/health    # version et commit qui tournent
```

⚠ **Comparez ces nombres à ce que vous attendiez.** Une restauration qui rend
zéro école a « réussi » du point de vue de `psql`.

---

## ⚠ Une sauvegarde faite À LA MAIN par `pg_dumpall` ne se restaure pas comme celle-ci

*Mesuré le 6 octobre 2026 sur un cluster jetable, PostgreSQL 16, à la demande de
Jean — dont les sauvegardes de la démonstration sont des `pg_dumpall ~/avant-*.sql`
pris à la main.*

### Ce que la commande naïve fait vraiment

```bash
psql -U postgres -f avant.sql        # ⚠ sur un cluster où la base existe déjà
```

| Ce qu'on observe | Ce qui se passe |
|---|---|
| **code de sortie 0** | `psql` ne rend 1 qu'avec `ON_ERROR_STOP` |
| **8 erreurs invisibles** | elles sont préfixées `psql:fichier:ligne:` — un `grep '^ERROR'` en compte **zéro** |
| les tables à clé primaire semblent intactes | c'est la **clé** qui les a sauvées, pas la restauration |
| 🔴 **les tables SANS contrainte d'unicité DOUBLENT** | mesuré : une table de 2 lignes repassée à **4** |

Dans Gafeso, les tables sans contrainte d'unicité sont celles qui portent
l'historique : `audit_logs`, `reminders`, `record_contributors`. Un réimport
naïf les double **en annonçant un succès**.

### ⚠ Et `pg_dumpall` n'a AUCUN mode de restauration sûr

Ce n'est pas une option manquante, c'est une propriété du format : la sortie
contient toujours `CREATE ROLE postgres`, qui existe toujours.

```bash
psql -v ON_ERROR_STOP=1 -f avant.sql   # s'arrête ligne 15, la base n'est jamais créée
psql -1 -f avant.sql                   # CREATE DATABASE ne peut pas être dans une transaction
```

### ✅ La commande qui marche — et c'est un script, parce qu'elle REFUSE

```bash
scripts/backup/restaurer-pg-dumpall.sh --verifier ~/avant-2026-10-06.sql
scripts/backup/restaurer-pg-dumpall.sh --restaurer ~/avant-2026-10-06.sql gafeso \
  --conteneur gafeso-prod-db-1
```

Il **extrait la section de la base visée** (de son `\connect` au `\connect`
suivant), prend un **filet** avec `--clean` avant de détruire, recrée la base
vide, puis rejoue la section avec `ON_ERROR_STOP=1` — qui refuse alors pour de
bon. Mesuré : **0 erreur, code 0**, et les lignes parasites ont disparu.

Éprouvé dans ses **deux moitiés** : il restaure (une ligne supprimée revient, deux
parasites partent), et il refuse (base absente du fichier → 3 ; section sans
`COPY` → 4, sans rien avoir détruit ; filet vide → 5).

### Si vous voulez le faire à la main quand même

```bash
# la section d'UNE base, de son \connect au suivant
awk '/^\\connect gafeso$/{f=1;next} /^\\connect /{f=0} f' avant.sql > section.sql
grep -c '^COPY ' section.sql        # ⚠ si c'est 0, le fichier est tronqué : ARRÊTEZ
psql -U postgres -c 'DROP DATABASE gafeso' -c 'CREATE DATABASE gafeso OWNER gafeso'
psql -U postgres -d gafeso -v ON_ERROR_STOP=1 -f section.sql
```

⚠ **Les RÔLES et leurs mots de passe ne sont pas dans la section** — ils vivent
en tête du fichier et restent ceux du cluster. Si c'est un cluster NEUF, rejouez
d'abord `pg_dumpall --globals-only` du même jour.

### Et pour les prochaines fois

```bash
pg_dumpall -U postgres --clean --if-exists > avant.sql
```

Avec `--clean`, le fichier sait détruire avant de recréer, et
`psql -v ON_ERROR_STOP=1 -f` devient la bonne commande. C'est la correction
qu'a reçue `backup.sh` le 5 octobre, pour exactement la même raison.
