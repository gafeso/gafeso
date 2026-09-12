# Moteurs de recherche — Meilisearch (défaut) & Elasticsearch (option)

Gafeso abstrait son moteur de recherche derrière une interface unique
(`SearchEngine`, `apps/api/src/search/search-engine.ts`). Deux implémentations,
choisies par **configuration** — aucun changement de code :

```
SEARCH_ENGINE=meilisearch   # défaut (recommandé)
SEARCH_ENGINE=elasticsearch # option « infrastructure existante »
```

Valeur absente ou non reconnue → **Meilisearch** (repli sûr, zéro impact sur
les déploiements existants).

## Lequel choisir ?

| Critère | Meilisearch ✅ recommandé | Elasticsearch |
|---|---|---|
| **RAM** | **~100 Mo** | **2–4 Go** (JVM) |
| Mise en route | zéro réglage | heap à dimensionner, cluster à surveiller |
| Pertinence « prête à l'emploi » | excellente (typo-tolérance native) | très bonne (à régler) |
| Quand le préférer | **cas par défaut**, écoles, serveurs modestes | vous avez **déjà** un ES en production à réutiliser |

> ⚠ **Avertissement RAM.** Elasticsearch réclame 2–4 Go là où Meilisearch vit
> dans ~100 Mo. Sur un serveur d'école typique (2–4 Go pour TOUTE la pile),
> activer ES prive le reste de l'application de mémoire. **N'activez ES que si
> vous réutilisez une infrastructure ES déjà en place.** Sinon, gardez
> Meilisearch.

## Ce que les deux moteurs garantissent (parité)

Réglages partagés (source unique : `search-engine.ts`) — mêmes attributs, même
ordre de poids :

- **Recherche par champ** : le mode « Titre » ne cherche que dans `title` /
  `titleComplement` — l'ISBN et le résumé en sont exclus.
- **Poids de pertinence** : `title` > `author`/`contributors` > … > `summary`.
  Un livre dont X est l'auteur remonte devant un livre qui ne fait que citer X
  dans son résumé.
- **Insensibilité aux accents** : « ouedraogo » trouve « Ouédraogo », « aicha »
  trouve « Aïcha » (Meili nativement ; ES via `asciifolding`).
- **Tolérance aux fautes** : « constitutionel » trouve « constitutionnel »
  (typo-tolérance Meili ; `fuzziness: AUTO` ES).
- **Facettes** : mêmes compteurs par catégorie / langue / année / type.

Ces garanties sont vérifiées par la **suite de parité**
(`search-parity.spec.ts`), exécutée contre les DEUX moteurs vivants :

```bash
docker compose --profile elasticsearch up -d elasticsearch
SEARCH_PARITY=1 MEILI_MASTER_KEY='<la clé de votre .env>' \
  npx vitest run src/search/search-parity.spec.ts   # depuis apps/api
```

Cette suite est **gatée par `SEARCH_PARITY=1`** : le `npm test` ordinaire ne la
lance pas (il n'exige aucun moteur vivant et reste à 423 tests).

## Différences de comportement — honnêtement

L'abstraction garantit le même *ensemble* de résultats sur les scénarios
ci-dessus, mais **deux moteurs ne peuvent pas classer identiquement** dans tous
les cas. Différences connues, assumées :

- **Classement des corrections de fautes.** La typo-tolérance de Meilisearch et
  la `fuzziness` d'Elasticsearch n'attribuent pas les mêmes scores. Une notice
  trouvée par correction de faute peut apparaître à un **rang différent** selon
  le moteur (la suite de parité vérifie la *présence*, pas l'ordre exact).
- **Racinisation (stemming).** ES applique un stemmer français `light_french` ;
  Meilisearch a sa propre normalisation. Sur des requêtes morphologiquement
  éloignées, l'un peut rapprocher deux formes que l'autre distingue.
- **Seuils de faute.** `fuzziness: AUTO` d'ES tolère 1 faute pour les mots de
  3–5 lettres, 2 au-delà ; Meilisearch a ses propres seuils. Aux marges, un mot
  très court avec une faute peut matcher chez l'un et pas l'autre.
- **Total exact.** ES est configuré `track_total_hits: true` (comptage exact) ;
  aux très grands volumes (>10 000 notices par école, hors cible actuelle) les
  deux moteurs pourraient différer sur la pagination profonde.

Aucune de ces différences n'affecte les parcours utilisateurs courants
(recherche par titre/auteur, facettes, accents). Elles sont documentées pour
qu'un exploitant qui bascule de moteur sache à quoi s'attendre.

## Robustesse (identique aux deux moteurs)

Un moteur **injoignable** ou un index **absent** (école tout juste
provisionnée) ne fait JAMAIS planter l'application : la recherche renvoie un
résultat vide (facettes à 0), l'OPAC reste consultable, et l'indexation des
écritures est protégée (`safeIndex`/`safeRemove`). Après remise en service :
réindexer (voir DEPLOY.md, `scripts/reindex.mjs`).
