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
