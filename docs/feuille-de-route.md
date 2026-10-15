# Feuille de route — ce qui est REPORTÉ, et à quelle condition

> Ce fichier ne liste pas des idées : il liste des décisions **prises de ne pas
> faire maintenant**, avec ce qu'elles coûteront quand on les fera. Une entrée
> sans impact chiffré ou nommé n'a rien à faire ici — ce serait une intention,
> et les intentions se perdent sans qu'on s'en aperçoive.

---

## V1.1 — affiner le vocabulaire de `recordType`

*Tranché par Jean le 12 octobre 2026 : **PAS d'affinage en V1**. Mesuré le même
jour, à sa demande.*

### Ce qui est mesuré, et la commande qui l'a produit

```bash
npx tsx -e "
import { RECORD_TYPES } from './apps/api/src/cataloging/description-profiles';
import { gabaritDeCouverture, COVER_TEMPLATES } from './apps/api/src/opac/couverture';
for (const t of RECORD_TYPES) console.log(t, '→', gabaritDeCouverture(t));
"
```

**Les sept types du produit se répartissent sur QUATRE gabarits sur huit :**

| `recordType` | `coverTemplate` |
|---|---|
| `ouvrage` | `manuel` |
| `publication` | `article` |
| `these`, `these_unique` | `these` |
| `memoire`, `licence`, `master` | `memoire` |

**Quatre gabarits du fournisseur n'ont donc AUCUN type** : `rapport`,
`rapport_stage`, `actes`, `guide`.

### 🔴 CE QUI REND CE REPORT NON TRIVIAL — « inatteignable » ≠ « inutile »

`RECORD_TYPES` porte son propre commentaire sur `publication` :

> « Articles, **rapports**, **actes**. Bibliographique : ni jury, ni soutenance. »

> ⭐ **Deux des quatre gabarits nomment des documents que le produit catalogue
> DÉJÀ, sous un seul type.** Un rapport et des actes de colloque entrent comme
> `publication` et reçoivent le gabarit `article`. Ce n'est pas un trou dans la
> correspondance : c'est que le vocabulaire du PRODUIT est plus GROSSIER que
> celui du fournisseur.

| Le gabarit | Le document existe-t-il dans le produit ? | Aujourd'hui |
|---|---|---|
| `rapport` | **oui** — `publication` le couvre explicitement | `article` |
| `actes` | **oui** — idem | `article` |
| `rapport_stage` | aucun type, et aucun commentaire ne le recouvre | — |
| `guide` | entrerait comme `ouvrage` | `manuel` |

### L'ORDRE, tranché par Jean

1. **`rapport_stage`** — le seul des quatre que RIEN ne recouvre aujourd'hui.
   Un rapport de stage entre forcément comme `ouvrage` ou `publication`, et les
   deux sont faux : il a un encadrant et une période, sans jury.
2. **`actes`** — recouvert par `publication`, mais c'est un ouvrage COLLECTIF :
   ses contributeurs ne sont pas des co-auteurs d'un même texte.
3. **`rapport`** — recouvert par `publication`, et la distinction est la plus
   faible des quatre.
4. **`guide`** — recouvert par `ouvrage`, et c'en est un.

### LES IMPACTS, et c'est pour eux que ce n'est pas une V1

| Ce qui bouge | Pourquoi, et ce qu'il faut mesurer avant |
|---|---|
| **Import MARC** | `marc-mapping.md` fait correspondre la zone de type bibliographique (leader/008) à `recordType`. Quatre valeurs de plus = quatre décisions de correspondance, et une notice importée qui tombe dans le mauvais type ne se corrige qu'à la main. ⚠ Mesurer d'abord combien de notices du fonds d'échelle changeraient de type. |
| **Facettes de recherche** | `recordType` est un attribut FILTRABLE de l'index. Ajouter des valeurs demande une **réindexation** (contrairement aux clés de couverture, qui se dérivent — voir DEPLOY.md). Et les URL de recherche partagées portant `recordType=publication` continueraient de fonctionner, mais ne montreraient plus les rapports. |
| **Circuit de dépôt** | `DEFENSE_RECORD_TYPES` décide qui exige un jury, un directeur, une université de soutenance. `rapport_stage` a un encadrant mais pas de jury : il n'entre dans NI l'un NI l'autre des deux ensembles actuels. C'est un troisième cas, pas une valeur de plus. |
| **Correspondance des gabarits** | `GABARIT_PAR_TYPE` est typée dans les deux sens : une valeur ajoutée à `RECORD_TYPES` ne compile plus tant qu'elle n'a pas son gabarit. ⚠ C'est voulu, et c'est le seul impact qui se signale TOUT SEUL. |
| **Le vocabulaire en base** | `vocabulaire-des-types-en-base.spec.ts` (garde vivant) demande au SERVEUR ce que la base porte. Les notices existantes gardent leur ancien type : il n'y a pas de migration de données, et c'est voulu — **`BiblioRecord.id` ne change jamais**, mais son type non plus sans décision explicite. |

### ⚠ LA FORME FAUTIVE QUE CE REPORT APPELLE

**Mapper `publication → rapport` ou `publication → actes` « pour que les
gabarits servent ».** Un seul type ne peut pas choisir entre trois gabarits, et
le faire au hasard mettrait « ACTES DE COLLOQUE » sur un article. Tant que le
type ne distingue pas, `article` est la réponse la moins fausse — c'est le
gabarit du plus général des trois.

⚠ Et la seconde forme fautive : **affiner le vocabulaire sans toucher à l'import
MARC**. Les quatre valeurs neuves seraient alors inatteignables par import, donc
réservées à la saisie manuelle — et on aurait déplacé le problème d'un cran sans
le résoudre.

### Ce qui refermera cette entrée

Les quatre types au vocabulaire, leur correspondance MARC écrite, le troisième
cas du circuit de dépôt tranché, et une réindexation au déploiement. Alors
`COVER_TEMPLATES` est entièrement atteint, et le compte exact de
`couverture.spec.ts` (« quatre gabarits servis ») convoque quelqu'un ici pour
l'actualiser.

---

## V1.1 — Le contenu d'un 404 n'est pas lisible sans JavaScript

**Décidé le 15 octobre 2026.** Pas en V1 : un statut 404 correct et un titre
visible suffisent pour la première version.

### Ce qui est mesuré, et la commande qui l'a produit

Trois cas, sur un **BUILD DE PRODUCTION** — c'est la règle pour cette classe de
vérification, et le dev ne l'exerce pas de la même façon :

```bash
npx next build && npx next start -p 3100
curl -s "http://zinda.localhost:3100/<chemin>" -o /tmp/nf.html -w '%{http_code}'
# puis : retirer les <script>, retirer les <div hidden>, mesurer ce qui reste
```

| éprouvé | `<div hidden>` | texte visible sans JS |
|---|---|---|
| `/mentions-legales` non publiée | 2 | **49 o** — le titre seul |
| `/opac/resoudre/<identifiant inconnu>` | 2 | **61 o** — le titre seul |
| une page qui appelle `notFound()` **sans aucun `await`** | 2 | **61 o** |

### 🔴 CE QUE LE TROISIÈME CAS ÉTABLIT

Il n'y a **rien à streamer** dans cette page — aucune attente, aucune donnée —
et le contenu part quand même dans des `<div hidden>` échangés par script. Ce
n'est donc pas une conséquence de notre découpage, de nos `await`, ni d'une
frontière de `Suspense` que nous aurions posée : c'est le comportement de
`notFound()` dans l'App Router.

⚠ Et `app/not-found.tsx` — ajouté le 15 octobre — **n'y change rien**. Il rend
la page utile dès que JavaScript s'exécute (en-tête, message, sortie, pied), et
il ne déplace pas une ligne hors du `<div hidden>`.

### ⚠ CE QUI N'EST PAS ÉTABLI, et il ne faut pas le reprendre comme acquis

La cause soupçonnée est le **rendu dynamique forcé pour le nonce CSP**
(`await headers()` dans `app/layout.tsx`). **Elle n'a PAS été vérifiée.** La
mesure qui devait la trancher a échoué — build en 1, serveur non démarré,
`curl` en statut 000 — et le relevé a relu l'ANCIEN fichier, rendant 61 octets
qui dataient d'avant la mutation. C'est « un contrôle dont la référence est ce
qu'on vient de casser » : seul le statut 000 a empêché de publier un chiffre
faux.

Qui reprendra ce sujet commence donc par **mesurer la cause**, sans hériter de
cette hypothèse.

### ⚠ LES DEUX FORMES FAUTIVES QUE CE PROBLÈME APPELLE

Toutes deux ont été proposées le 15 octobre et **écartées par le responsable**.
Elles sont écrites ici pour que personne ne les refasse avec de bonnes raisons :

| | pourquoi c'est faux |
|---|---|
| rendre le contenu en **200** | un 404 part dans l'index d'un moteur et dans un vérificateur de liens. Ce dépôt a déjà tranché : « quand le faux silencieux SORT de l'application », un 404 rendu sur une panne se désindexe et ne se répare pas tout seul. L'inverse — un 200 sur une page absente — fait indexer du vide |
| servir le corps du 404 **depuis le middleware** | il faudrait y connaître l'état de publication de chaque page, donc un appel d'API à chaque requête, et une seconde implémentation de la décision. Deux mécanismes pour une même propriété finissent par diverger |

### Ce qui refermera cette entrée

Un 404 dont le TEXTE est dans le HTML initial, sans `<div hidden>`, avec le
statut 404 conservé — mesuré par la même commande, sur un build de production.

---

## V1.1 — Guide illustré de l'interface

**Décidé le 14 octobre 2026**, en tranchant le relevé de rétention de la
publication.

`docs/captures/` reste RETENU : ce sont des captures de notre base de
développement, prises pour des recettes, et elles portent les noms et les états
de notre fonds de démonstration. Les publier serait publier des données qui ne
sont pas destinées au dehors.

**Ce qui est prévu à la place** : un guide illustré, écrit POUR le dehors, dont
les images sont prises exprès — sur un fonds dont chaque nom est manifestement
d'exemple, et sans aucun compte réel à l'écran.

⚠ **Et la contrainte qui décide de sa forme** : une capture d'écran AFFIRME, au
présent, l'état qu'elle montre. Un guide qui montre « 480 notices » ou « trois
prêts en retard » périme au premier geste sur cet état — et personne ne date une
image dans une documentation. Les captures du guide montreront donc des
STRUCTURES (un écran, une barre, un refus), jamais des contenus datés.

| | |
|---|---|
| ce qui est mesuré | 27 captures internes aujourd'hui, toutes liées à une recette datée |
| la forme attendue | un fonds d'illustration dédié, des captures de structure, une commande qui les reprend |
| ⚠ la forme FAUTIVE | republier les captures internes « en les triant ». Le tri porterait sur ce qu'on y voit, alors que le défaut est ce qu'elles AFFIRMENT — et une image triée reste une image datée |

---

## Prochain renouvellement du fonds de démonstration — remplir les universités

**Noté le 14 octobre 2026, après un comptage de Jean sur l'instance de
démonstration. Pas maintenant : au prochain renouvellement du fonds.**

Mesuré en lecture seule sur la démo : **352 notices**, `defense_university`
**VIDE sur les 352**, `publisher` vide (264) ou « Gafeso » (88). Aucune
institution réelle — il n'y avait donc rien à corriger, et le correctif écrit
pour ce cas n'a pas été lancé.

⚠ *Le correctif est un script INTERNE, et il n'est pas nommé ici : un document
publié qui désigne un fichier retenu est une impasse pour qui n'a que le dépôt
public. C'est le garde des renvois qui me l'a fait remarquer sur ce
paragraphe-ci, quelques heures après que je l'ai écrit.*

**Ce qu'il faudra faire quand le fonds sera refait** : donner aux thèses et aux
mémoires un `defense_university` selon la convention que la base porte déjà —
**« Université d'Exemple — <ville> »**.

| | |
|---|---|
| ce qui est mesuré | 352 notices, 0 université renseignée, sur la démo |
| la forme attendue | les thèses et mémoires portent « Université d'Exemple — <ville> » ; les villes réelles sont permises, les INSTITUTIONS non |
| ⚠ la forme FAUTIVE | reprendre les noms réels « puisque ce sont de vraies villes ». Une ville est un lieu ; « Université de Ouagadougou » est un ÉTABLISSEMENT, et lui attribuer une thèse inventée lui prête une publication qu'il n'a jamais faite |

⚠ **Et pourquoi un champ VIDE n'est pas satisfaisant non plus.** Une fiche de
thèse sans université de soutenance ne montre pas ce que le produit sait faire :
le champ existe, il est servi, il est affiché — et il est vide sur l'écran qu'on
présente. C'est « une colonne SERVIE que personne ne remplit », du côté des
données plutôt que du code.

⚠ **La portée est la DÉMONSTRATION seule.** Le fonds de développement a été
corrigé le 14 octobre (98 notices sur `zinda`, 3 549 sur `horizon`, 1 118
éditeurs), et les deux seeds suivent désormais la convention : un fonds refait
depuis eux naîtra juste.

