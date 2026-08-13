# Mapping MARC (UNIMARC) — export / import Gafeso

Gafeso exporte et réimporte ses notices en **UNIMARC** (dialecte de
référence en contexte francophone / AUF). L'export est le **miroir exact** de
l'import : tout ce que l'application possède est écrit dans des zones stables,
réimportables sans perte (test d'aller-retour dans `marc-export.spec.ts`).

- **Export** : `apps/api/src/cataloging/marc-export.ts` (construit les zones,
  sérialise via marcjs `.as('iso2709' | 'marcxml')`).
- **Import** : `apps/api/src/cataloging/marc-mapper.ts` (`extractBiblio`), utilisé
  par `CatalogingService.importMarc`.
- **Formats de sortie** : ISO 2709 (`.mrc`) et MARCXML (collection dans l'espace
  de noms `http://www.loc.gov/MARC21/slim`).

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
