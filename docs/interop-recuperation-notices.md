# Récupération de notices externes (SRU / Z39.50)

Gafeso sait **récupérer une notice** depuis des catalogues externes pour
accélérer le catalogage : l'utilisateur saisit un ISBN (ou un titre/auteur), la
notice est rapatriée, et le formulaire de saisie se pré-remplit. Il ne reste
qu'à ajuster la catégorie et les mots-clés propres à l'établissement.

## Transport : SRU (et pas Z39.50 natif)

Le transport retenu est **SRU** (*Search/Retrieve via URL*), le pendant HTTP
moderne de Z39.50 : une simple requête `GET`, une réponse XML contenant des
notices MARCXML. Avantages décisifs pour notre contexte (souveraineté,
déploiement conteneurisé simple, liaison ouest-africaine parfois capricieuse) :

- **Aucune dépendance native.** SRU se consomme avec le `fetch` natif de Node.
  Pas de binaire système, pas de compilation.
- **Robuste aux coupures.** Chaque cible est bornée par un timeout court
  (`AbortSignal.timeout`, 6 s) ; un serveur lent ou injoignable est signalé
  sans jamais bloquer la saisie.
- **Couverture large.** La BnF (édition française, UNIMARC) et la Library of
  Congress (édition anglophone, MARC21) sont interrogées par défaut. La quasi-
  totalité des bibliothèques nationales exposent un point d'accès SRU.

### Serveurs configurés

Voir `apps/api/src/sru/sru-servers.ts` (constante commentée `DEFAULT_SRU_SERVERS`).
Chaque serveur déclare son URL, sa version SRU, le schéma de notice demandé, le
dialecte MARC de la réponse (→ choisit l'extracteur UNIMARC/MARC21 existant), la
relation CQL acceptée et ses index de recherche.

| Serveur | Schéma           | Dialecte | Relation CQL | Index ISBN / titre |
|---------|------------------|----------|--------------|--------------------|
| BnF     | `unimarcxchange` | UNIMARC  | `all "…"`    | `bib.isbn` / `bib.title` |
| LoC     | `marcxml`        | MARC21   | `= "…"`      | `bath.isbn` / `bath.title` |

> Piège BnF : le schéma est **`unimarcxchange`** — `unimarcxml` est refusé
> (diagnostic SRU `1/66`). Piège LoC : elle refuse la relation `all` sur l'ISBN
> (diagnostic `1/19`) et veut `index="valeur"`.

**Extensibilité sans code** : la variable d'environnement `SRU_EXTRA_SERVERS`
(JSON d'objets `SruServer`) ajoute des cibles au déploiement — par exemple un
catalogue collectif régional ou de l'AUF — sans recompiler.

## Réutilisation du mapping existant

Les réponses MARCXML sont converties en `MarcFields` (`sru-marcxml.ts`) puis
passées au **mapper UNIMARC/MARC21 déjà utilisé par l'import de fichiers**
(`extractBiblio`). Une seule table de correspondance à maintenir, et le garde-fou
« éditeur = logiciel de numérisation » (PaperPort, CamScanner…) s'applique
automatiquement aussi aux notices récupérées.

## Pourquoi pas Z39.50 natif (pour l'instant)

Évaluation honnête de l'écosystème Node (juillet 2026) :

| Paquet        | Dernière version | État |
|---------------|------------------|------|
| `node-zoom2`  | 0.9.2 (2023)     | Binding natif vers **YAZ** (lib C), requiert `node-gyp` + `libyaz-dev` système ; sous-1.0, non maintenu. |
| `node-zoom`   | 0.1.1 (2022)     | Idem, plus ancien encore. |
| `yaz`         | 0.0.3 (2022)     | Wrapper YAZ expérimental, abandonné. |
| `zoomjs`      | 3.x              | **Sans rapport** (bibliothèque d'animation front). |
| `z3950`       | —                | N'existe pas sur npm. |

Toutes les options réelles enveloppent la bibliothèque C **YAZ** via des
bindings natifs non maintenus : compilation fragile (`node-gyp`), dépendance
système à installer dans l'image Docker, aucun mainteneur actif. Le rapport
bénéfice/risque est mauvais alors que **SRU couvre déjà la BnF, la LoC et la
plupart des cibles modernes**.

**Décision : Z39.50 natif attend.** L'architecture est prête si le besoin
survient (une cible héritée n'exposant que Z39.50) : il suffirait d'ajouter un
transport Z39.50 **derrière la même interface** que SRU (`SruService` produit
des `SruCandidate` à partir de `MarcFields` — un transport Z39.50 n'aurait qu'à
fournir ces mêmes `MarcFields`), sans toucher au mapping ni à l'intégration de
saisie.
