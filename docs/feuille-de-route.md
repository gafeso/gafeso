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

