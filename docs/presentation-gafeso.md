# Gafeso — présentation générale

> **Gafeso — « la maison des livres »** (dioula : *gafe* = livre, *so* = maison).

Gafeso est un **SIGB** — Système Intégré de Gestion de Bibliothèque — open-source,
**multi-établissements**, pensé pour les universités, écoles et centres de
documentation d'**Afrique de l'Ouest**. Il réunit dans une seule application la
bibliothèque **physique** (catalogue, exemplaires, prêts, récolement) et la
bibliothèque **numérique** (documents en ligne, contrôle d'accès), avec un
portail public (OPAC) et un back-office complet.

---

## 1. À qui s'adresse Gafeso

- **Universités et grandes écoles** : catalogage savant (thèses, mémoires avec
  directeur et université de soutenance), gestion des étudiants par classe,
  lecture en ligne réservée.
- **Bibliothèques scolaires et centres de documentation** : catalogue, prêts,
  inventaire, étiquettes code-barres.
- **Réseaux multi-établissements** : une seule installation héberge plusieurs
  bibliothèques **étanches** (chacune ses données, son domaine, sa charte
  graphique).

## 2. Ce qui distingue Gafeso

### Souveraineté et simplicité
- **Hébergement local, offline-first, en français.** Aucune dépendance à un
  service en ligne tiers pour fonctionner : la carte, les polices, la recherche,
  le stockage vivent sur votre serveur.
- **Installation en une commande, ~15 minutes.** Là où l'installation d'un Koha
  se compte en heures et en dépendances système, `./install.sh` transforme un
  VPS nu en Gafeso en ligne : secrets générés, base migrée, HTTPS automatique,
  premier établissement provisionné. Voir **[INSTALLATION.md](INSTALLATION.md)**.

### Adapté au terrain
- **Frugal en ressources.** Le moteur de recherche par défaut (Meilisearch) vit
  dans ~100 Mo ; toute la pile tourne confortablement sur un petit VPS (2–4 Go).
- **Robuste aux coupures.** Un service de recherche ou un catalogue externe
  injoignable ne fait jamais planter l'application : elle se dégrade proprement
  (résultats vides plutôt qu'erreur), comportement pensé pour les liaisons
  réseau capricieuses.

### Interopérable et ouvert
- **Formats standard** : import/export **MARC** (UNIMARC/MARC21, ISO 2709 et
  MARCXML), serveur **OAI-PMH** pour être moissonné par les catalogues
  collectifs (BASE, AUF…), **récupération de notices** depuis la BnF et la
  Library of Congress (SRU).
- **Licence libre AGPL-3.0.**

## 3. Panorama fonctionnel (survol)

| Domaine | En bref |
|---|---|
| **Catalogue** | Notices savantes (contributeurs + rôles, mots-clés, fiches d'autorité auteurs), exemplaires, import/export MARC, récupération SRU |
| **Circulation** | Prêts, retours, réservations, renouvellement en ligne, règles, rappels email |
| **OPAC public** | Recherche plein-texte + facettes, recherche par champ, fiches, lecture en ligne contrôlée |
| **Numérique** | Fichiers PDF/EPUB, lecture en ligne (accès par classe/abonnement), URLs signées temporaires |
| **Comptes & accès** | 5 rôles système + rôles personnalisés (13 permissions fines), 2FA, journal d'audit |
| **Inventaire** | Récolement à la douchette, rapport (vus/manquants/en prêt/inattendus), étiquettes code-barres PDF |
| **Statistiques** | Tableau de bord (KPIs, séries temporelles, palmarès), exports CSV |
| **Interopérabilité** | Export MARC, serveur OAI-PMH, récupération SRU |
| **Vitrine** | Page d'accueil publique personnalisable par établissement |
| **Multi-tenant** | Plusieurs écoles étanches, chacune son domaine et sa charte |

Le détail exhaustif est dans **[fonctionnalites.md](fonctionnalites.md)**.

## 4. Architecture en une image

```
                    Internet (HTTPS, Let's Encrypt)
                              │
                          ┌───▼────┐
                          │ Caddy  │  reverse proxy + certificats auto
                          └─┬────┬─┘
                 ┌──────────┘    └───────────┐
             ┌───▼────┐                  ┌───▼─────┐
             │  web   │  Next.js 15      │  minio  │  fichiers/couvertures
             │ (SSR)  │  (vitrine, OPAC, └─────────┘
             └───┬────┘   back-office)
                 │ /api/* (interne)
             ┌───▼────┐   NestJS 10 (monolithe modulaire)
             │  api   │───┬─────────┬──────────┬─────────┐
             └────────┘   │         │          │         │
                      ┌───▼──┐ ┌────▼───┐ ┌────▼───┐ ┌───▼───┐
                      │  db  │ │ meili  │ │ minio │
                      │ PG16 │ │ /elastic│ │        │ │       │
                      └──────┘ └────────┘ └────────┘ └───────┘
```

- **Monolithe modulaire** (pas de microservices) : une seule API NestJS, découpée
  en ~30 modules. Décision d'architecture assumée pour la simplicité de
  déploiement et de maintenance.
- **Multi-tenant par schéma PostgreSQL** : un schéma `tenant_<slug>` par
  établissement, isolé ; le schéma `public` porte les données de plateforme.
- Détails techniques : **[fonctionnement.md](fonctionnement.md)**.

## 5. Pile technique

| Couche | Technologie |
|---|---|
| Frontend | **Next.js 15** (App Router, SSR) + React 18 + Tailwind CSS |
| Backend | **NestJS 10** (TypeScript), monolithe modulaire |
| Base de données | **PostgreSQL 16**, multi-schéma (un schéma par école) |
| ORM | **Prisma 5** |
| Recherche | **Meilisearch** (défaut) ou **Elasticsearch** (option), derrière une interface commune |
| Stockage objet | **MinIO** (S3-compatible) — couvertures, fichiers numériques |
| Cache | **En mémoire du processus** |
| Emails | SMTP (mode dégradé propre si non configuré) |
| Reverse proxy / TLS | **Caddy 2** (HTTPS Let's Encrypt automatique) |
| Conteneurisation | **Docker Compose** |
| Licence | **AGPL-3.0** |

## 6. Documentation

| Document | Contenu |
|---|---|
| [presentation-gafeso.md](presentation-gafeso.md) | Ce document — vision, panorama, architecture |
| [fonctionnalites.md](fonctionnalites.md) | Toutes les fonctionnalités, écran par écran |
| [fonctionnement.md](fonctionnement.md) | Fonctionnement technique détaillé |
| [INSTALLATION.md](INSTALLATION.md) | Installer et exploiter : prérequis, installation, sauvegardes, diagnostic |
| [../DEPLOY.md](../DEPLOY.md) | Exploitation : mises à jour, sauvegardes, moteur de recherche |
| [search-engines.md](search-engines.md) | Meilisearch vs Elasticsearch |
| [marc-mapping.md](marc-mapping.md) | Correspondances MARC (UNIMARC) |
| [interop-recuperation-notices.md](interop-recuperation-notices.md) | Récupération SRU / Z39.50 |
