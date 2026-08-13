<p align="center">
  <img src="assets/marque/gafeso_horizontal.png" alt="Gafeso" width="320">
</p>

# Gafeso

**Gafeso** est un SIGB (système intégré de gestion de bibliothèque) **open-source,
multi-établissements**, conçu pour les universités et bibliothèques d'Afrique de l'Ouest —
souverain, frugal, auto-hébergeable, et pensé français d'abord.

> Le nom vient du dioula : *gafe* (livre) + *so* (maison) — la maison du livre.

## Ce que Gafeso fait

- **Catalogage savant** : contributeurs et rôles, directeur de mémoire, mots-clés, fiches
  d'autorité auteurs, formats **MARC** (UNIMARC / MARC21).
- **OPAC** et **lecture numérique contrôlée** (accès par classe / abonnement).
- **Circulation** : prêts, rappels, réservations, renouvellements.
- **Interopérabilité** : **OAI-PMH 2.0**, **SRU** (BnF / LoC).
- **Administration** : rôles système et personnalisés, permissions fines,
  authentification à deux facteurs, journal d'audit.
- **Outillage bibliothèque** : récolement, étiquettes code-barres, statistiques, vitrine
  personnalisable.
- **Multi-établissements** natif : isolation par établissement (un schéma par tenant).

## Architecture

- **Front** : Next.js (SSR) · **API** : NestJS (monolithe modulaire).
- **Données** : PostgreSQL (multi-schéma, un schéma par établissement), Prisma.
- **Recherche** : Meilisearch (par défaut) ou Elasticsearch (option).
- **Fichiers** : MinIO (compatible S3). **Cache** : Redis. **Reverse-proxy** : Caddy.
- Orchestration **Docker Compose**.

Un modèle de **lecture hors-ligne** sécurisé alimente l'application mobile compagnon
(chiffrement au repos, clé liée à l'appareil, licence bornée dans le temps). Le modèle,
son périmètre de menaces et ses **limites assumées** sont décrits dans
[docs/architecture-securite-offline.md](docs/architecture-securite-offline.md).

## Installation

Gafeso vise une mise en route rapide — de l'ordre de **15 minutes** sur un serveur, via un
script d'installation qui provisionne la stack et **génère les secrets** :

```bash
git clone <url-du-depot> gafeso && cd gafeso
./install.sh
```

Le fichier `.env.example` documente la configuration ; le template de production impose la
génération de secrets forts (`openssl rand`). Voir `docs/` pour le déploiement détaillé.

## Licence

Distribué sous **GNU Affero General Public License v3.0** (AGPL-3.0). Voir [`LICENSE`](LICENSE).
Le choix de l'AGPL protège le commun : quiconque héberge une version modifiée doit en publier
les modifications.

## Contribuer & sécurité

Les contributions sont bienvenues — voir [`CONTRIBUTING.md`](CONTRIBUTING.md). Pour signaler
une faille, suivez [`SECURITY.md`](SECURITY.md).

---

Édité par **ResurgiTech**, dans le cadre du projet open-source **Gafeso**.
