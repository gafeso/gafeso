# Architecture de la notice — noyau, profils, formats

*Décisions du 7 septembre 2026. Ce document fait autorité sur le modèle de
description de Gafeso. Il précède le registre de modules : un registre se
réécrit en une journée, une table de notices migrée deux fois se paie en
incidents.*

---

## 1. La notice Gafeso

Gafeso ne décrit pas ses documents en MARC.

C'est le constat qui a déclenché ce document, et il contredisait ce que tout le
monde croyait — le brief d'architecture compris. Le modèle réel est **plat** :
des colonnes SQL (`title`, `author`, `publish_year`, `defense_university`…) plus
trois tables satellites (`record_contributors`, `record_keywords`, `authors`).
MARC n'est pas ce modèle : c'est un **format d'entrée-sortie**, utilisé à
l'import (`marc-mapper.ts`), à l'export (`marc-export.ts`) et à l'exposition
(OAI, SRU). Entre les deux, il n'y a que du plat.

Ce modèle plat existait sans nom. C'est le problème que ce document règle en
premier : **tant qu'il s'appelle « MARC », on croit disposer d'une couche native
qu'on n'a pas** — et l'on prend des décisions d'architecture sur une capacité
imaginaire.

> ### Il s'appelle la **notice Gafeso**.
>
> Modèle de description **propriétaire et plat**, interne au produit. Ce n'est
> ni une norme, ni un profil MARC, ni du Dublin Core. C'est le **seul** modèle
> que l'application lise : recherche, OPAC, circulation, application mobile,
> exports — tout part de la notice Gafeso, jamais du MARC.

Son identifiant technique, dans la base et dans le code, est `GAFESO`
(`biblio_records.marc_format`).

**Corollaire opératoire.** Toute phrase de la forme « on lit le MARC pour… » est
fausse et doit être corrigée en « on lit la notice Gafeso, éventuellement
reconstruite depuis un MARC importé ». Voir §6, dette n° 1 : cette confusion est
déjà sortie du dépôt, dans ce que le serveur OAI annonce à des tiers.

---

## 2. Règle absolue — `BiblioRecord.id` ne change JAMAIS

> **L'uuid d'une notice est immuable. Aucune phase d'architecture ne le
> régénère, ne le renumérote, ni ne le remplace par un identifiant « métier ».**

Ce n'est pas une préférence de conception. Cet uuid est le `docId` inscrit dans
les **licences hors-ligne signées** (Ed25519) déployées sur des téléphones :
une licence lie `{user, device, tenant, record, expires}` et le lecteur natif
refuse d'ouvrir un document dont le `docId` ne correspond pas. Changer un id,
c'est invalider des licences déjà émises, sur des appareils **hors de portée du
serveur**, parfois hors ligne pendant des semaines. Il n'existe aucune
procédure de rattrapage.

Ce que la règle interdit, concrètement :
- renuméroter les notices lors d'une migration de profil ;
- « fusionner » deux notices en supprimant l'une et recréant l'autre ;
- adopter un identifiant pérenne externe **en remplacement** de l'uuid.

Ce qu'elle n'interdit pas : ajouter d'autres identifiants **à côté**
(identifiant local lisible, URL pérenne — module `identifiants` du brief). Ils
s'ajoutent, l'uuid reste la clé.

La règle est rappelée en commentaire à la ligne même du champ
(`apps/api/prisma/schema.prisma`, modèle `BiblioRecord`) — c'est là qu'on la
lira au moment de la transgresser.

---

## 3. Les quatre couches

| Couche | Contenu | Où elle vit |
|---|---|---|
| **1 · Noyau** | Titre, auteurs, date, type, langue, identifiant | Colonnes de `biblio_records` |
| **2 · Profil de description** | `bibliographique` · `academique` | `biblio_records.profile` |
| **3 · Métadonnées natives** | Le format d'origine, conservé brut | `biblio_records.marc_data` (NULL si aucune) |
| **4 · Expositions** | OPAC, OAI-PMH, SRU, export MARC | `oai/`, `sru/`, `cataloging/marc-export.ts` |

### Le noyau ne grossit jamais

Test à appliquer à chaque champ candidat : *est-il nécessaire pour chercher,
prêter ou afficher en liste ?* Si non, c'est un champ de profil.

### ⚠ Sortir un champ du noyau ne le sort PAS de la recherche

Le noyau définit ce qui est **obligatoire et universel**, pas ce qui est
**indexable**. Ce sont deux questions distinctes, et les confondre coûterait
cher pour rien.

Cas d'école, `defenseUniversity` : il devient un champ du profil `academique`
(il n'a rien à faire dans ce que la circulation et l'application mobile lisent),
et il **reste cherchable, au même poids qu'aujourd'hui**. Le contrat de
recherche est inchangé — vérifié dans le code, pas supposé :

- `RecordSearchDoc` (`search/search-engine.ts`) est la forme du document
  indexé ; `SEARCHABLE_ATTRIBUTES` en fixe l'ordre de poids. Ni l'un ni l'autre
  ne change quand la donnée change de colonne.
- `defenseUniversity` n'est ni dans `FILTERABLE_ATTRIBUTES` ni dans
  `SORTABLE_ATTRIBUTES` : aucune facette, aucun tri, aucune grammaire de filtre
  n'en dépend. Rien à réindexer côté réglages.
- `buildRecordSearchDoc` accepte une **forme structurelle**, pas une entité
  Prisma. Seule sa source d'alimentation change.
- Elle n'a que **deux** appelants : `cataloging.service.ts` et
  `digital-copy.service.ts`.

Le coût réel du déplacement, côté recherche, est donc : une ligne dans le
constructeur de document, et le `select` de deux appelants. Pas un changement de
contrat.

**Règle générale** : un champ déplacé du noyau vers un profil reste indexé au
même poids. La question « où vit la donnée » et la question « est-elle
cherchable » se décident séparément.

---

## 4. Ce que disent `marc_format` et `marc_data`

`marc_format` répond à **d'où viennent les métadonnées**, jamais à *comment on
les réexpose*.

| Valeur | Sens |
|---|---|
| `GAFESO` | Notice Gafeso native — saisie dans l'application, elle n'a jamais eu de MARC |
| `UNIMARC` / `MARC21` | Notice importée ; `marc_data` conserve l'original |

`marc_data` est **facultatif** depuis la migration
`20260907120000_notice_gafeso_marc_facultatif`. Avant elle, la colonne était
`NOT NULL` : toute notice saisie à la main recevait `{"fields": []}` et se
déclarait UNIMARC. C'était une **affirmation fausse inscrite dans le schéma** —
une notice MARC vide, alors qu'il n'y avait pas de MARC du tout.

> Le nom de la colonne, lui, ment encore : un format natif qui n'est pas du MARC
> ne devrait pas s'appeler `marc_format`. Renommage en `source_format` au
> backlog (§6, dette n° 2) — la valeur dit déjà la vérité, le nom suivra.

**Règle de conservation** — ce qui arrive dans un format y reste. MARC → Dublin
Core pour exposer : perte acceptable, l'original est conservé. Dublin Core →
MARC : **interdit**. On ne fabrique pas du MARC qu'un bibliothécaire prendrait
ensuite pour du catalogage authentique.

---

## 5. État du lot 1 (7 septembre 2026)

Livré : la **migration seule**, avec sa recette et son contrôle négatif.

| Changement | Effet |
|---|---|
| `marc_data` nullable | Une notice sans source MARC est représentable |
| `MarcFormat.GAFESO` | Le modèle plat propriétaire a une valeur qui le désigne |
| `biblio_records.profile` | Colonne posée, défaut `bibliographique` |

**Ce qui n'est PAS fait, volontairement** : rien ne lit ni n'écrit encore ces
trois choses. `CatalogingService` continue d'écrire `{"fields": []}` et
`UNIMARC` sur une notice saisie ; `profile` ne pilote aucun comportement ; aucun
DTO, aucun écran, aucune exposition ne change. Le lot pose le **schéma**, parce
qu'une table de notices déjà en service ne se migre pas deux fois.

Basculer les écritures (`marc_data` à NULL et `marc_format` à `GAFESO` pour les
notices saisies) suppose d'avoir vérifié que l'export, l'OAI, le SRU et le front
traitent un `marc_data` absent. C'est le lot suivant, pas celui-ci.

Le classement des thèses existantes en `academique` est une décision de la
**phase C**, quand le profil pilotera quelque chose. Un backfill aujourd'hui
serait invisible et donc invérifiable.

### ⚠ Déploiement — les écoles existantes ne suivent pas toutes seules

`biblio_records` existe dans **chaque** schéma `tenant_<slug>`, copié par
`CREATE TABLE ... (LIKE public... INCLUDING ALL)` au provisioning. `LIKE` copie
`NOT NULL`, `DEFAULT` et index **une seule fois, à la création**. Une migration
Prisma ne touche que le gabarit `public`.

Constaté en base de développement avant le lot :

```
public|marc_data|NO          ← le gabarit
tenant_zinda|marc_data|NO    ← l'école, indépendamment
```

Sans rattrapage, la première notice sans MARC échouerait **en production** alors
que la migration serait « appliquée ». `AdminService.syncTenantSchema` savait
ajouter une colonne absente et une valeur d'enum manquante ; il ne savait pas
**relâcher une contrainte** sur une colonne existante — ce lot est le premier à
en avoir besoin. `buildColumnConstraintStatements` (`tenancy/tenant-schema.ts`)
comble ce manque, dans les deux seules directions sûres sur une table pleine :
`DROP NOT NULL` et `SET DEFAULT`. Le durcissement (`SET NOT NULL`) reste
manuel : il échouerait sur une seule ligne nulle et ferait tomber une resynchro
entière.

**Au déploiement** : `prisma migrate deploy` (automatique au démarrage du
conteneur `api`) **puis** `POST /admin/tenants/:slug/sync-schema` pour chaque
école déjà provisionnée.

### Recette

```bash
./scripts/recette-notice-gafeso.sh
```

Elle déploie l'historique complet sur une base neuve, vérifie les trois
affirmations, **puis redéploie l'historique sans la migration** et vérifie que
chacune des trois y échoue. Le contrôle négatif est exécuté, pas documenté.
Côté code, les tests jumeaux de `tenant-schema.spec.ts` et
`admin.service.spec.ts` tombent si l'on retire le rattrapage de contraintes.

---

## 6. Dettes reconnues (backlog)

### n° 1 — Le MARCXML exposé n'était pas du MARC21 — ✅ corrigé

*Réglé le 7 septembre 2026 (P0, lot 2).* `ListMetadataFormats` annonçait
`MARC21slim.xsd` et les notices sortaient dans l'espace de noms
`http://www.loc.gov/MARC21/slim`, alors que le contenu est produit par
`buildUnimarcFields` : des zones **UNIMARC** (200, 210, 328, 610, 700/701/702)
plus les zones locales 900/995. Un moissonneur qui décodait en MARC21 recevait
l'auteur principal (700 en UNIMARC) comme entrée secondaire.

La même affirmation vivait à **trois** endroits indépendants : l'entrepôt OAI,
l'export du bibliothécaire (`GET /cataloging/export`) et l'écran
d'interopérabilité. C'était la cause racine — aucun test ne les reliait.

**Le format retenu est MarcXchange 2.0 (ISO 25577)**, espace de noms
`info:lc/xmlns/marcxchange-v2`, chaque notice portant `format="UNIMARC"`.
Une première correction avait inventé un espace de noms maison : c'était la
version douce de la même faute — se mettre hors des standards qu'on revendique
alors qu'une norme internationale couvre exactement ce cas (MARCXML généralisé
à toute notice ISO 2709, avec déclaration explicite du dialecte).

La sortie réelle **valide** contre le schéma officiel, vérifié par un
validateur XSD et non à vue : `./scripts/recette-marcxchange.sh`.

Deux effets de bord notables :
- **Le `<leader>` n'est plus émis en XML.** Gafeso ne calcule aucun label
  ISO 2709 : il écrivait une constante de forme MARC21
  (`00000nam a2200000 a 4500`). Sous `format="UNIMARC"`, la conserver aurait
  été une affirmation fausse de plus. MarcXchange **2.0** le rend facultatif
  (la 1.1 l'exigeait) — c'est ce qui a décidé du choix de version. Le label
  reste produit pour l'export ISO 2709 (`.mrc`), où la norme l'exige. La dette
  « leader MARC21 » signalée plus tôt est donc close, pas reportée en P5.
- **L'ancien préfixe `marcxml` est refusé** en nommant son remplaçant
  (`cannotDisseminateFormat` en OAI, 400 sur l'export).

⚠ Le client SRU vers la Library of Congress (`recordSchema: 'marcxml'`) est
resté intact : c'est du vrai MARC21 **entrant**.

⚠ Note d'exploitation : `www.loc.gov` est derrière un défi Cloudflare et refuse
les clients non navigateurs. L'URL de schéma que nous annonçons est la bonne
(c'est l'emplacement canonique de la norme), mais un moissonneur qui tenterait
de la télécharger peut recevoir une page de défi. C'est le cas de tous les
fournisseurs qui référencent loc.gov ; une copie du schéma est gardée en
fixture de test pour que notre recette n'en dépende pas.

### n° 2 — `marc_format` porte un nom qui ment

Un format natif qui n'est pas du MARC ne devrait pas vivre dans une colonne
`marc_format`. Renommage visé : `source_format`, avec le même traitement pour
`marc_data` → `native_metadata`. À faire en un seul lot, avec le rattrapage
tenant correspondant.

### n° 3 — `DEPLOY.md` proposait la base de dev comme shadow database — ✅ corrigé

*Réglé le 7 septembre 2026 (P0).* La procédure « Migrations Prisma »
recommandait `--shadow-database-url "$DATABASE_URL"` en affirmant qu'aucune
donnée n'y était modifiée. Prisma **réinitialise** la base indiquée comme
shadow : suivre cette ligne effaçait la base de développement. DEPLOY.md
impose désormais une base jetable dédiée, créée et supprimée autour de
l'appel. Recette : `./scripts/recette-shadow-jetable.sh`.

### n° 4 — Dérive entre l'historique de migrations et le schéma Prisma — ✅ corrigé

*Réglé le 7 septembre 2026 (P0).* `prisma migrate diff` entre l'historique et le
modèle produisait du SQL : chaque futur `migrate diff` embarquait donc ces écarts
en prime. C'est ce qui a failli faire passer deux changements de comportement
dans la migration du lot « notice Gafeso ».

**Deux écarts, aucune migration nécessaire — c'est le modèle qui avait tort.**

1. **`record_contributors.author_id`.** Sans `onDelete` explicite, Prisma déduit
   `SetNull` pour une relation optionnelle. Or l'historique de migrations, le
   rattrapage tenant (`TENANT_FOREIGN_KEYS`) et le commentaire du modèle disaient
   tous **RESTRICT** — « un auteur rattaché à des œuvres ne peut pas être
   supprimé ». Trois sources sur quatre étaient d'accord ; celle que lit un
   développeur était la quatrième.

   ⚠ La divergence était **vivante**, pas seulement historique : mesurée dans la
   base de développement, `public` était en `SET NULL` (issu de `db push`) et
   `tenant_zinda` en `RESTRICT`. Les notices vivant dans les schémas tenant, la
   garantie tenait en pratique — mais un `db push` sur une base de production
   l'aurait silencieusement transformée en orphelinage des contributions.
   `onDelete: Restrict` explicite ; `db push` a réaligné `public`.

2. **Nom de l'index unique des licences hors-ligne.** Déployé en `..._idx`
   (migration `offline_license_unique_triplet` et `buildUniqueIndexStatements`),
   attendu en `..._key` par Prisma pour un `@@unique`. Résolu par `map:` — on
   aligne le modèle sur ce qui est déployé, **jamais l'inverse** : renommer un
   index vivant dans chaque schéma serait un changement cosmétique qui
   désynchroniserait le rattrapage tenant.

Recette : `./scripts/recette-schema-sans-derive.sh` — vérifie que `migrate diff`
ne produit aucun SQL, puis retire chaque correction tour à tour et vérifie que la
dérive réapparaît. C'est le garde-fou de toutes les migrations de P3 : une dérive
qui revient sera vue avant d'être embarquée.

### n° 5 — L'entrepôt OAI n'est pas journalisé

*Versé au backlog le 7 septembre 2026 — invariant I6 en situation.*

`GET /oai` est public, non authentifié, sans inscription, et **aucun appel à
l'audit** n'existe dans `apps/api/src/oai/`. Conséquence mesurée pendant le
lot 2 : à la question « un moissonneur dépend-il du format qu'on s'apprête à
renommer ? », le logiciel ne sait pas répondre. La seule trace est le journal
d'accès de Caddy, hors de l'application, sans rotation configurée.

Savoir qui moissonne dépasse cette correction : c'est la condition pour
prévenir un consommateur avant de changer un format, pour mesurer l'usage réel
de l'interopérabilité, et pour distinguer « personne ne moissonne » de « on ne
sait pas ». À traiter avec P5 (refonte des expositions), pas avant — mais à ne
pas oublier au moment où l'on croira pouvoir retirer un format sans risque.
