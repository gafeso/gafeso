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
```
