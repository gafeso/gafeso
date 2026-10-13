# Spécification — la couverture composée Gafeso

Entrée de passation du **mobile** vers le **backend** (intégration rc8) et vers
le **web**, qui doit la reprendre **à l'identique** : un même document ne peut
pas avoir deux couvertures selon l'écran où on le regarde.

Implémentation de référence :
`lib/widgets/couverture_generee.dart` et `lib/theme/gafeso_theme.dart` du dépôt
mobile (`gafeso/gafeso-mobile`, étiquette `v1.0.0-rc5` et suivantes).

---

## 1. Pourquoi elle existe — la mesure, pas le goût

Relevé du 09/10/2026 sur le fonds de démonstration (`tenant_zinda`, 480 notices) :

| Mesure | Résultat |
|---|---|
| Notices portant une `coverUrl` | **480 / 480 — 100 %** |
| Format servi | **SVG**, que Flutter ne rend pas sans dépendance |
| Fichiers **distincts** | **6** |
| Notices par image | **80** |

Le fonds ne manque donc pas de couvertures : il en sert une par notice, et elles
ne distinguent rien. Même en ajoutant un moteur SVG, quatre-vingts thèses
s'afficheraient identiques.

Une couverture **composée du texte de la notice** distingue, coûte **zéro octet
de réseau**, s'affiche **hors ligne** et ne peut pas échouer.

⚠ **Elle ne remplace pas une vraie couverture.** Quand une image existe ET qu'on
sait la rendre, elle passe devant. La composée est le cas courant sur ce fonds,
pas une règle absolue.

---

## 2. Champs affichés

Dans cet ordre, de haut en bas :

| Zone | Champ | Règle |
|---|---|---|
| Corps | `title` | 4 lignes max (5 si hauteur > 160), ellipse ensuite |
| Sous le titre | `author` | 2 lignes max — **omis** si la couverture jouxte déjà un bloc titre-auteur |
| Bas gauche | `recordType` (libellé lisible) | en CAPITALES, dans un filet |
| Bas droite | `publishYear` | tel quel |

⚠ **AUCUN CHAMP N'EST INVENTÉ.** Un champ absent **disparaît** : il ne devient
ni `—`, ni `s.d.`, ni « Auteur inconnu ». Et il n'y a **ni note, ni étoile, ni
durée de lecture estimée** : ces données n'existent pas dans le produit.

---

## 3. Teinte — table des domaines, puis hachage de repli

### 3.1 La palette (douze teintes)

| # | Nom | Hex | Blanc dessus |
|---|---|---|---|
| 0 | vert profond (vert de marque) | `#1B5E3F` | 7,72:1 |
| 1 | vert forêt | `#14492F` | 10,38:1 |
| 2 | vert-de-gris | `#2F6B55` | 6,26:1 |
| 3 | terre brûlée | `#8A4A14` | 6,84:1 |
| 4 | brique | `#7A3A0C` | 8,61:1 |
| 5 | ocre sombre | `#6B4A10` | 8,04:1 |
| 6 | ardoise verte | `#28433A` | 10,75:1 |
| 7 | prune sourde | `#4A2D3A` | 12,16:1 |
| 8 | bleu encre | `#1E3A5F` | 11,50:1 |
| 9 | vert olive | `#3E5222` | 8,62:1 |
| 10 | rouille | `#6E2F1B` | 10,07:1 |
| 11 | indigo sourd | `#33305E` | 12,17:1 |

Texte **toujours blanc** `#FFFFFF`. Le pire couple vaut **6,26:1**, au-dessus du
seuil AA (4,5:1).

### 3.2 Les dix domaines nommés

Le domaine est `category`, **mis en minuscules et détouré** avant lecture.

| `category` | teinte |
|---|---|
| `arts` | 7 |
| `droit` | 8 |
| `economie` | 3 |
| `histoire` | 6 |
| `informatique` | 2 |
| `langues` | 11 |
| `litterature` | 10 |
| `medecine` | 0 |
| `philosophie` | 4 |
| `sciences` | 9 |

### 3.3 Le repli, et pourquoi il ne suffit pas seul

⚠ **UN HACHAGE NE PEUT PAS ÉVITER LES COLLISIONS SUR UN ENSEMBLE CONNU.** C'est
arithmétique, pas un défaut d'implémentation. Mesuré sur les dix domaines réels :

| Méthode | Teintes distinctes |
|---|---|
| somme des unités de code, 8 teintes | **4** |
| FNV-1a, 8 teintes | 7 |
| FNV-1a, 12 teintes | 6 (effet anniversaire) |
| **table nommée** | **10** |

D'où la table. Tout domaine **absent de la table** passe par **FNV-1a 32 bits**
sur les unités de code de la chaîne minuscule détourée :

```
h = 0x811c9dc5
pour chaque unité de code u :  h = ((h XOR u) * 0x01000193) mod 2^32
teinte = palette[h mod 12]
```

Domaine **vide ou nul** → teinte **0**.

⚠ **Surtout pas le `hashCode` du langage** : ni Dart ni JavaScript ne le
garantissent stable entre exécutions ou versions. Une couverture qui change de
couleur au rechargement détruirait le seul service qu'elle rend : se
reconnaître.

---

## 4. Proportions et typographie

Tout est **relatif à la hauteur `H`** de la vignette : une seule couverture sert
la liste (62 dp) et la fiche (164 dp), sans deux jeux de constantes à tenir
d'accord.

| Élément | Valeur |
|---|---|
| Dos (filet vertical, bord gauche) | largeur `L × 0,055`, bornée à `[2, 6]` px, couleur **`#E07A2B`** |
| Marges | gauche `L × 0,14` · droite `L × 0,09` · haut `H × 0,08` · bas `H × 0,07` |
| Titre | `H × 0,082`, graisse 700, interligne 1,22 |
| Auteur | `H × 0,055`, graisse 400, interligne 1,2 |
| Type (dans son filet) | `H × 0,040`, graisse 600, interlettre 0,5, filet 1 px, rayon 3 |
| Année | `H × 0,046`, graisse 500 |
| Rayon des angles de la couverture | 4 à 5 px selon le contexte |

### ⚠ Le seuil des 80 dp

**En dessous de `H = 80`, on n'affiche que l'INITIALE** du titre (`H × 0,40`,
graisse 700), centrée. Au-dessus, le texte complet.

Mesuré : à 72×100 — la taille qu'avait la fiche avant le lot — la couverture
composée ne tenait déjà que son initiale. C'est à partir de **120 dp de haut**
que le titre et l'auteur s'y lisent vraiment, et c'est là qu'elle cesse d'être un
ornement pour devenir ce qui identifie le document.

### ⚠ L'auteur se distingue par la GRAISSE, jamais par le contraste

Pas d'encre atténuée : sur ces douze fonds, un blanc affaibli retombe sous le
seuil AA. On distingue par la taille et la graisse.

---

## 5. Ce que la reprise doit tenir

1. **Mêmes teintes, même table, même hachage** : un document a une couleur, pas
   une couleur par écran.
2. **Contraste calculé, pas estimé**, avec un **contrôle négatif** — côté
   mobile, `test/couleurs_test.dart` refuse de passer si blanc sur l'orange de
   marque (3,01:1) était accepté. Une formule fausse ne fait pas échouer les
   tests : elle les fait tous passer.
3. **Aucun champ inventé.**
4. **Zéro requête** : la couverture composée ne télécharge rien.

---

## 6. Ce qui reste au backend (rc8)

- `GET /offline/my-documents` ne rend aujourd'hui que `{docId, title,
  fileFormat}` — relevé dans `offline-licenses.service.ts`. Le mobile **recopie
  donc `author`, `category` et `publishYear` sur l'appareil** au téléchargement,
  faute de quoi l'étagère ne peut composer que des couvertures au titre seul.
  **Dès que la route les porte, cette recopie sera retirée** (c'est la dette que
  rc8 solde).
- `category` doit rester la **même chaîne** que celle servie par
  `/opac/search` et `/opac/records/:id` : la teinte en dépend, et une casse ou
  un accent différent changerait la couleur du même domaine.

---

## 7. Le GABARIT v3 FINALE — huit fonds, et la grille vient d'un fichier

*Livré le 11 octobre 2026. Il ne remplace pas la couverture composée des
sections 2 à 4 : il s'y ajoute, et les deux ne servent pas la même taille.*

Le fournisseur livre **huit gabarits** `<id>_sans_texte.svg` qui portent
seulement le fond de domaine, le motif, le logo Gafeso officiel en blanc et le
filet orange. **Aucun texte.** Le type, le titre, l'auteur, l'année et
l'établissement sont rendus par le site et par l'application.

| `id` | Type affiché | Motif |
|---|---|---|
| `these` | THÈSE DE DOCTORAT | arcs |
| `memoire` | MÉMOIRE DE MASTER | plis |
| `rapport_stage` | RAPPORT DE STAGE | architecture |
| `rapport` | RAPPORT | barres |
| `actes` | ACTES DE COLLOQUE | semis de points |
| `manuel` | MANUEL / COURS | pages |
| `article` | ARTICLE SCIENTIFIQUE | réseau |
| `guide` | GUIDE | feuilles |

### 7.1 ⭐ LA GRILLE NE SE RECOPIE PAS ICI — elle est dans `positions-textes.json`

La toile de référence est **500 × 700 px** (5:7). Les coordonnées de chaque zone
— logo, type, titre, filet, auteur, année, établissement — vivent dans
**`docs/couvertures/source/positions-textes.json`**, avec son jumeau
`positions-textes.csv` pour relecture humaine.

> ⚠ **Elles ne sont PAS reproduites dans ce document, et c'est délibéré.** Une
> table de coordonnées recopiée dans une prose dérive de sa source à la première
> retouche, et rien ne le signale — « deux tableaux qui se ressemblent ». Le
> fichier est la source ; ce document dit **comment le lire**.

Ce qui ne se lit PAS dans le fichier, et qui est donc écrit ici :

**① Le titre se place selon son NOMBRE DE LIGNES.** `title.y_by_line_count`
porte une ordonnée par compte de 1 à 4 : le bloc de titre descend quand il est
court, remonte quand il est long, de sorte que son BAS reste à la même hauteur
au-dessus du filet orange. On compose donc le titre d'abord, on compte ses
lignes, et on lit l'ordonnée ensuite — jamais l'inverse.

**② Au-delà de la largeur utile, on RÉDUIT puis on COUPE, dans cet ordre.**
`font_size_px` est la taille nominale, `minimum_font_size_px` le plancher : on
réduit progressivement jusqu'à ce plancher pour faire tenir le titre en
`max_lines` lignes, et **seulement si ça ne suffit pas** on coupe avec des points
de suspension. Réduire d'abord garde le titre entier ; couper d'abord perd du
texte qu'on aurait pu garder.

**③ Les miniatures sont des fichiers à part.** `<id>_56x78.svg` n'est pas une
réduction du gabarit : elle porte l'**initiale** du titre et le type en très
petites capitales, ce qui est exactement la règle du **seuil des 80 dp** de la
section 4 — à 78 px de haut, le titre de la grande grille mesurerait moins de
quatre pixels.

⚠ **Et 56 × 78 n'est pas tout à fait 5:7** : 56/78 = 0,7179 contre 0,7143 pour
500/700. Un calcul depuis la maquette rendrait 55,7 px de large. L'écart est de
un demi pour cent, et il est dans les fichiers livrés — on prend les fichiers,
on ne recalcule pas.

### 7.2 ⚠ CE DOSSIER N'EST PAS ENCORE PUBLIÉ

`docs/couvertures/source/` est **retenu jusqu'à la cession de droits** : le logo
officiel et la planche d'exemples viennent du fournisseur. Il est déclaré
`a-publier` dans `apps/api/src/common/publication-declaree.spec.ts`, avec son
motif — et cette déclaration devient fausse, donc refusée, le jour où le dossier
sort.

> ⚠ **Ce document, lui, EST publié.** Il nomme donc des fichiers qu'un lecteur
> extérieur n'a pas dans son clone, et il vaut mieux le dire que de l'envoyer
> chercher un dossier absent : une référence morte dans un document public est
> un faux, au même titre qu'un chiffre périmé.

### 7.3 Les variations, et la palette du gabarit

`gafeso-cover-spec-final.json` fixe la variation d'un fond à l'autre :
position **±10 px**, échelle **92–108 %**, rotation **−4° à +4°**, **5 à 8**
éléments, opacité **10–19 %**.

⚠ **Sa palette de dix domaines n'est PAS celle de la section 3.1**, et les deux
listes ne décrivent pas la même chose — voir la section 9.

### 7.4 Aucun exemple fictif associé à une vraie université

La planche d'exemples n'emploie que **`Nom Prénom`** et **`Bibliothèque de
démonstration`**. Un document fictif portant le nom d'un établissement réel
circulerait comme une publication de cet établissement — et une capture ne porte
pas de date.

---

## 8. LA GRAINE — FNV-1a 32 bits, et la mention SHA-256 est REMPLACÉE

`gafeso-cover-spec-final.json` porte `"seed": "SHA-256 du titre normalisé"`.

> 🔴 **Cette ligne est REMPLACÉE par la présente section. La graine est
> `FNV-1a 32 bits` du titre normalisé** — la fonction déjà spécifiée en 3.3,
> bit pour bit.

Quatre raisons, et la dernière est celle qui décide :

1. **Elle existe déjà ici.** 3.3 spécifie FNV-1a pour le repli de teinte. Un
   second hachage pour le même produit, c'est « deux vocabulaires pour une même
   chose » — la faute qu'on répare partout ailleurs.
2. **SHA-256 n'est pas synchrone dans un navigateur.** `crypto.subtle.digest`
   rend une promesse. Or la couverture composée se rend **sans aucune requête et
   sans attente** : une graine asynchrone rendrait le composant asynchrone, pour
   fabriquer un nombre.
3. **32 bits suffisent largement** pour tirer cinq choix discrets (deux
   décalages, une échelle, une rotation, un nombre d'éléments, une opacité).
4. ⭐ **« SHA-256 du titre normalisé » est SOUS-SPÉCIFIÉ, et c'est le vrai
   problème** : la phrase ne dit ni l'encodage des octets, ni quels bits
   deviennent quel choix, ni dans quel ordre. Trois implémentations — web,
   mobile, PDF — en déduiraient trois couvertures différentes pour le même
   document, et la seule chose que cette couverture doit faire est de **se
   reconnaître**.

### 8.1 ⚠ CE QUE « NORMALISÉ » DOIT VOULOIR DIRE — mesuré, pas supposé

```
titre normalisé = titre.normalize('NFC').toLowerCase().trim()
                       .replace(/\s+/g, ' ')
```

**L'étape NFC n'est pas une élégance.** Mesuré sur « L'économie du Sahel »,
écrit une fois avec un `é` composé et une fois décomposé — **deux chaînes qui
s'affichent au pixel près** :

| | Graine |
|---|---|
| `é` décomposé (`e` + U+0301) | `3800537676` |
| `é` composé (U+00E9) | `2038383201` |
| **après NFC, les deux** | **`3430148385`** |

> 🔴 **Sans NFC, le même titre saisi deux fois donne DEUX couvertures.** Et il
> touche exactement les titres qui comptent ici : ceux qui portent des accents.
> C'est le même défaut que la déduplication des fiches d'autorité, descendu au
> niveau du caractère.

### 8.2 De la graine aux variations — l'ORDRE fait partie du contrat

La graine alimente un générateur à **xorshift32**, et les tirages se font dans
un ordre FIXE :

```
e = graine ou 1            (0 est un état absorbant pour xorshift)
suivant() :  e ^= e << 13 ;  e ^= e >>> 17 ;  e ^= e << 5 ;  rendre e >>> 0
tirer(n)  :  suivant() mod n

1. nombre d'éléments   5 + tirer(4)                  → 5 à 8
2. pour chaque élément, dans l'ordre :
   a. décalage x       -10 + tirer(21)                → −10 à +10 px
   b. décalage y       -10 + tirer(21)
   c. échelle          92 + tirer(17)                 → 92 à 108 %
   d. rotation         -4 + tirer(9)                  → −4° à +4°
   e. opacité          10 + tirer(10)                 → 10 à 19 %
```

⚠ **Changer cet ordre change TOUTES les couvertures du fonds.** Ce n'est donc
pas un détail d'implémentation : c'est la partie du contrat qu'une relecture ne
peut pas deviner, et la seule raison pour laquelle trois clients peuvent
s'accorder.

⚠ **Surtout pas le `hashCode` du langage**, ni `Math.random()` : la section 3.3
l'écrit déjà, et le motif est le même — une couverture qui change au
rechargement détruit le seul service qu'elle rend.

---

## 9. LES DEUX TABLES — catégorie → teinte, type → gabarit

*Tranchées par Jean le 12 octobre 2026.*

### ⚠ CE QUE CETTE SECTION DISAIT HIER, et pourquoi c'était faux

Elle disait que rattacher `philosophie` à un libellé éditorial du fournisseur
était **une décision de métier sur le classement d'un fonds universitaire**, et
elle refusait de la trancher. Le cadrage était faux, et la correction tient en
une phrase :

> ⭐ **Une couleur est un REPÈRE VISUEL, pas un classement.** On n'attribue pas
> une discipline à un document : on lui donne une teinte pour qu'il se retrouve
> d'un coup d'œil dans une étagère. La question ne se posait donc pas.

⚠ C'est la même faute que « avant de remonter un arbitrage de métier, demander
au produit ce qu'il fait du cas » — à ceci près que je n'ai pas demandé au
produit, j'ai demandé au **vocabulaire du fournisseur**, qui décrit un
classement parce que c'est son métier. L'objet qu'on mappe décidait, et je
l'avais mal lu.

### 9.1 `category` → teinte

Onze domaines, vocabulaire FERMÉ. `coverDomain` est **résolu par le serveur** —
voir 9.3.

| `coverDomain` | Teinte | Blanc dessus |
|---|---|---|
| `sciences` | `#1E5A3C` | 8,13:1 |
| `medecine` | `#A3202E` | 7,49:1 |
| `droit` | `#8A4A00` | 6,86:1 |
| `informatique` | `#00616B` | 7,19:1 |
| `economie` | `#3D4A54` | 9,11:1 |
| `litterature` | `#8A1F55` | 8,72:1 |
| `langues` | `#6A3D86` | 8,00:1 |
| `philosophie` | `#154D87` | 8,59:1 |
| `histoire` | `#3A6B16` | 6,37:1 |
| `arts` | `#2E3A8C` | 10,00:1 |
| `autre` | `#3D4A54` | 9,11:1 |

Texte **toujours blanc** `#FFFFFF`. Le pire couple vaut **6,37:1**, bien au-delà
du seuil AA (4,5:1) — mesuré, et un garde le remesure à chaque commit avec son
témoin de discrimination (l'orange de marque, 3,01:1, doit ÉCHOUER).

⚠ **`arts #2E3A8C` est hors de la palette du fournisseur**, et marqué
provisoire. Son contraste est le meilleur des onze.

#### 🔴 `litterature`, `langues` et `arts` sont TROIS clés distinctes — la fusion « Lettres » ne vient PAS d'ici

*Mesuré le 12 octobre 2026, après un signalement du mobile.*

| `category` | `coverDomain` | Teinte |
|---|---|---|
| `litterature` | `litterature` | `#8A1F55` |
| `langues` | `langues` | `#6A3D86` |
| `arts` | `arts` | `#2E3A8C` |

**Trois clés distinctes, trois teintes distinctes.** La table en porte onze
(dix + `autre`), et `grep Lettres apps/api` rend **zéro**.

> ⭐ **« Lettres » est un libellé du FOURNISSEUR, et il n'existe que là.** Sa
> palette décrit dix DOMAINES ÉDITORIAUX, où nos trois catégories n'ont aucun
> équivalent un-pour-un — c'est la mesure qui avait fait refuser cette table
> avant que Jean ne tranche « une couleur est un repère, pas un classement ».

⚠ **Un client qui lit la palette du fournisseur verra donc une fusion que l'API
ne produit pas.** C'est le signe à connaître : la table de référence est celle
de **§9.1 ci-dessus**, pas `gafeso-cover-spec-final.json`, dont les dix libellés
sont une intention de design et non un vocabulaire de produit.

#### ⭐ `autre` partage la teinte d'`economie`, et sa CLÉ est distincte

C'est voulu dans les deux sens, et l'écart entre les deux décide :

| | Partagé ? | Pourquoi |
|---|---|---|
| la **teinte** `#3D4A54` | **oui** | une couleur est un repère ; deux domaines voisins dans une étagère ne trompent personne |
| la **clé** | **non** — `autre`, jamais `economie` | une notice hors vocabulaire rendue `economie` AFFIRMERAIT un classement que personne n'a posé |

> ⚠ **« Un fond de domaine faux est pire qu'un fond neutre : il affirme. »**
> C'est la seule raison pour laquelle le repli porte un nom à lui.

### 9.2 `recordType` → gabarit

| `recordType` | `coverTemplate` | |
|---|---|---|
| `these` | `these` | tranché |
| `memoire` | `memoire` | tranché |
| `publication` | `article` | tranché |
| `ouvrage` | `manuel` | tranché |
| `these_unique` | `these` | ⚠ voir ci-dessous |
| `licence` | `memoire` | ⚠ |
| `master` | `memoire` | ⚠ |
| *hors vocabulaire* | `manuel` | repli |

#### ⚠ TROIS TYPES QUE LA DÉCISION NE NOMMAIT PAS, et le repli ne les couvre pas

`RECORD_TYPES` porte **sept** valeurs ; la décision en nommait quatre, plus un
repli pour « inconnu ». Or `licence`, `master` et `these_unique` ne sont pas
inconnues : elles sont **DÉCLARÉES**. Le repli ne leur est donc pas destiné, et
les y verser mettrait **« MANUEL / COURS » sur un mémoire de master**.

> ⭐ **Le produit les classe déjà** : les trois figurent dans
> `DEFENSE_RECORD_TYPES`, le sous-ensemble des soutenances. On lit cette
> classification plutôt que d'en inventer une — `these_unique` est une thèse,
> `licence` et `master` sont des mémoires. Un garde le vérifie plutôt que de le
> supposer, et il tombe si l'un des trois cessait d'être une soutenance.

#### 🔴 QUATRE GABARITS N'ONT AUCUN TYPE — et ce ne sont pas quatre gabarits morts

*Mesuré le 12 octobre 2026, à la demande de Jean.*

**Aucun des sept `recordType` ne mène à `rapport`, `rapport_stage`, `actes` ni
`guide`.** Les sept se répartissent sur quatre gabarits, et c'est tout :

```
ouvrage → manuel      these        → these
publication → article memoire      → memoire
                      licence      → memoire
                      master       → memoire
                      these_unique → these
```

⚠ **MAIS « inatteignable » ne veut PAS dire « inutile », et c'est le produit qui
le dit.** `RECORD_TYPES` porte son propre commentaire sur `publication` :

> « Articles, **rapports**, **actes**. Bibliographique : ni jury, ni soutenance. »

> ⭐ **Deux des quatre gabarits nomment donc des documents que le produit
> CATALOGUE DÉJÀ — sous un seul type.** Un rapport et des actes de colloque
> entrent comme `publication`, et reçoivent le gabarit `article`. Ce n'est pas
> un trou : c'est que le vocabulaire du PRODUIT est plus GROSSIER que celui du
> fournisseur.

| Le gabarit | Le document existe-t-il dans le produit ? | Aujourd'hui |
|---|---|---|
| `rapport` | **oui** — `publication` le couvre explicitement | gabarit `article` |
| `actes` | **oui** — idem | gabarit `article` |
| `rapport_stage` | aucun type, et aucun commentaire ne le recouvre | — |
| `guide` | un guide entrerait comme `ouvrage` | gabarit `manuel` |

**L'arbitrage n'est donc pas « ces gabarits sont morts, on les jette »**, c'est :
*faut-il affiner `recordType` ?* Et c'est une décision sur le VOCABULAIRE d'un
catalogue — elle touche l'import MARC, les facettes de recherche, le circuit de
dépôt. Ce document ne la tranche pas.

⚠ **La forme FAUTIVE que ce constat appelle** : mapper `publication → rapport`
ou `publication → actes` « pour que les gabarits servent ». Un seul type ne peut
pas choisir entre trois gabarits, et le faire au hasard mettrait « ACTES DE
COLLOQUE » sur un article. Tant que le type ne distingue pas, `article` est la
réponse la moins fausse — c'est le gabarit du type le plus général des trois.

#### ⚠ Quatre gabarits sont INATTEIGNABLES — un fait, pas un défaut

Le fournisseur en livre huit ; le vocabulaire du produit n'en atteint que
quatre. `rapport_stage`, `rapport`, `actes` et `guide` attendent un vocabulaire
qui ne les demande pas encore. Un **compte exact** le dit : le jour où
`recordType` gagne « rapport de stage », il convoque quelqu'un plutôt que de
laisser le gabarit dormir.

### 9.3 ⭐ LES DEUX CHAMPS SONT RÉSOLUS PAR LE SERVEUR

`GET /opac/records/:id` sert `coverTemplate` et `coverDomain` — **jamais `null`,
jamais hors liste**.

> ⚠ **Ce ne sont pas `recordType` et `category` déguisés.** Ceux-là sont des
> valeurs de CATALOGUE : libres, parfois vides, parfois hors vocabulaire après
> un import MARC. `coverTemplate` et `coverDomain` sont RÉSOLUES — NFC,
> minuscules, détourage, table et repli déjà appliqués.

**Pourquoi le serveur et pas les clients** : trois clients composent cette
couverture — le web, le mobile, le générateur de PDF. Leur laisser la
normalisation et le repli, c'est **trois couvertures possibles pour un même
document**, et se reconnaître est la seule chose qu'une couverture doit faire.
C'est la leçon de `hasDigital` / `offlineReady`, au même endroit du même produit.

⚠ **ET L'API SERT UNE CLÉ, JAMAIS UN HEXADÉCIMAL.** Servir la couleur ferait du
serveur le propriétaire de la palette : un changement de design demanderait
alors une version d'API, et le mobile garde ses réponses en cache. La table
ci-dessus vit donc ici et dans le module engendré du front.

⚠ **NFC à la frontière, et c'est mesuré** : une `category` arrive d'un import
MARC, d'un CSV ou d'un copier-coller. Sans normalisation, « Médecine » composé
et décomposé donneraient deux domaines pour une même catégorie — le défaut des
fiches d'autorité dédoublées, descendu au niveau du caractère, et il touche
exactement les catégories accentuées.

