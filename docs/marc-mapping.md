# Mapping MARC (UNIMARC) — export / import Gafeso

Gafeso exporte et réimporte ses notices en **UNIMARC** (dialecte de
référence en contexte francophone / AUF). L'export est le **miroir exact** de
l'import : tout ce que l'application possède est écrit dans des zones stables,
réimportables sans perte (test d'aller-retour dans `marc-export.spec.ts`).

- **Export** : `apps/api/src/cataloging/marc-export.ts` (construit les zones,
  sérialise via marcjs `.as('iso2709' | 'marcxml')` — le nom marcjs de la
  structure « MARC slim » ; les ZONES écrites sont de l'UNIMARC et l'espace de
  noms est celui de Gafeso, voir `cataloging/unimarc-xml.ts`).
- **Import** : `apps/api/src/cataloging/marc-mapper.ts` (`extractBiblio`), utilisé
  par `CatalogingService.importMarc`.
- **Formats de sortie** : ISO 2709 (`.mrc`) et **MarcXchange 2.0** (ISO 25577,
  espace de noms `info:lc/xmlns/marcxchange-v2`, notices portant
  `format="UNIMARC"` — voir `cataloging/unimarc-xml.ts`). ⚠ Ce n'est **pas** du
  MARC21 : l'espace de noms de la Library of Congress a été employé à tort
  jusqu'au 7 septembre 2026, ce qui faisait lire la zone 700 (auteur principal
  en UNIMARC) comme une entrée secondaire. ⚠ Le `<leader>` n'est **pas** émis en
  XML (MarcXchange 2.0 le rend facultatif) : Gafeso ne calcule aucun label
  ISO 2709. Il reste produit pour l'export `.mrc`, où la norme l'exige.

## Zones bibliographiques

| Donnée Gafeso            | Zone UNIMARC | Sous-champs |
|-------------------------------|--------------|-------------|
| ISBN                          | `010`        | `$a`        |
| Langue                        | `101`        | `$a`        |
| Titre                         | `200`        | `$a`        |
| Complément de titre           | `200`        | `$e`        |
| Ville d'édition               | `210`        | `$a`        |
| Éditeur                       | `210`        | `$c`        |
| Année de publication          | `210`        | `$d`        |
| Université de soutenance      | `328`        | `$c`        |
| Lieu de soutenance            | `328`        | `$e`        |
| Mot-clé (répétable)           | `610`        | `$a`        |
| Auteur principal              | `700`        | `$a`        |
| Auteur secondaire (répétable) | `701`        | `$a`        |
| Directeur de mémoire/thèse    | `702`        | `$a` + `$4 727` |

- **Contributeurs** : le rôle est porté par la zone (700 principal, 701
  secondaire, 702 directeur) ; le directeur est en outre marqué par le relator
  UNIMARC **`$4 727`** (« Directeur de thèse »), ce qui le distingue d'un
  co-auteur même hors de Gafeso.
- **Nom** : écrit entier dans `$a` (ex. « Ki-Zerbo, Joseph »). À l'import, un
  fichier externe qui sépare `$a` (nom) et `$b` (prénom) est recombiné
  « nom, prénom ».

## Zones locales (usage Gafeso)

Hors du bloc bibliographique standard, en zones `9XX` réservées à l'usage local :

| Donnée                | Zone | Sous-champs |
|-----------------------|------|-------------|
| Type de document      | `900`| `$a`        |
| Catégorie             | `900`| `$b`        |
| Exemplaire (répétable)| `995`| `$f` code-barres, `$k` cote, `$e` localisation, `$o` statut |

Les exemplaires (`995`) sont **exportés** (holdings) mais **ne sont pas recréés à
l'import** : les codes-barres sont propres à chaque établissement et uniques —
réimporter les mêmes provoquerait une collision. L'aller-retour porte donc sur la
notice bibliographique ; les exemplaires restent gérés localement.

## Import de fichiers externes

`importMarc` accepte **UNIMARC et MARC21**. Pour MARC21, le mapping de lecture
est : `245` titre (`$a`/`$b`), `100`/`110`/`700` auteurs (`$4 ths` = directeur),
`020` ISBN, `264`/`260` édition, `041`/`008` langue, `650` sujets, `502` note de
thèse. Les zones locales `900`/`995` sont propres à Gafeso (non attendues
d'une source MARC21 tierce).

## Déploiement

Rien de spécifique : fonctionnalité applicative, aucune migration ni sync-schema.
