---

## 5. Les invariants — ce qu'on s'interdit, et pourquoi

⚠ **Ils n'existaient dans AUCUNE liste avant ce document.** Ils sont référencés
dans le code et les tests par leur numéro — `I1`, `I3`, `I7`… — et énoncés
nulle part en entier. Cette section est la première à les rassembler ; elle est
donc la plus susceptible d'être incomplète, et la seule où la mesure a consisté
à relever des MENTIONS plutôt qu'une déclaration.

⚠ **Il n'y a pas d'`I8`.** Le relevé sur tout le dépôt rend `I1` à `I7`, et
rien au-delà. Si un huitième a été énoncé quelque part, il n'a laissé aucune
trace dans le code, les tests ou `docs/`.

| | Occurrences | Ce qu'il interdit |
|---|---|---|
| **I1** | 20 | **`BiblioRecord.id` ne change JAMAIS.** C'est le `docId` inscrit dans les licences hors-ligne signées, déjà déployées sur des téléphones. Aucune migration ne le régénère, ne le renumérote, ni ne le remplace. |
| **I2** | 6 | **Le noyau ne grossit pas.** Un champ n'entre au noyau que s'il est *nécessaire pour identifier, prêter, ou afficher en liste*. Le reste est de profil. ⚠ Le noyau dit l'obligatoire, pas le cherchable : un champ de profil peut être indexé. |
| **I3** | 26 | **Rien n'écrase la description d'origine.** Ce qui arrive dans un format natif y reste (`marc_data`). L'interdit porte sur l'ÉCRASEMENT après coup, pas sur la pose à la création. |
| **I4** | 10 | **Le dialecte déclaré est celui de la source.** On n'annonce pas du MARC21 pour de l'UNIMARC, et un format de profil (`etdms`) n'est proposé que pour les notices qui en relèvent. |
| **I5** | 3 | **Toute opération de schéma est multi-établissements.** Une migration, une collation, une extension valent pour TOUS les schémas d'école, jamais pour un seul. |
| **I6** | 3 | **Deux cas distincts ne se fondent jamais en un.** « La source n'en portait pas » et « elle en portait un qu'on n'a pas reconnu » sont deux situations différentes pour la bibliothécaire ; les confondre est un faux silencieux. |
| **I7** | 26 | **Une réponse d'API ne RETIRE pas de champ.** Des APK sont déployés sur des téléphones et lisent ce qu'on leur a promis ; un champ qui disparaît casse une application qu'on ne peut pas mettre à jour. |

⚠ **Ce que ce tableau ne dit pas** : quels tests tiennent chacun. Le comptage
des occurrences mélange les mentions en commentaire et les assertions. Un
inventaire des GARDES par invariant serait un travail à part, et il n'a pas été
fait.

---

## 6. Les formats

### En entrée

| Format | Où | Mesuré dans |
|---|---|---|
| **MARC21** et **UNIMARC** (ISO 2709) | import de notices | `cataloging` — `marcFormat` au DTO |
| **MARCXML / marcxchange** | import, et réponses SRU | `cataloging/unimarc-xml.ts` |
| **CSV** | étudiants attendus, adhérents | `accounts`, `patrons` |
| **PDF** | documents numériques — *seul format chiffré à l'ingestion* | `offline-licensing` (`encStatus`, `fileFormat: 'PDF'`) |
| **EPUB** | documents numériques, lecture en ligne seulement | `cataloging/content-magic.ts` |

⚠ **Le chiffrement hors-ligne ne couvre que le PDF.** `myDocuments` filtre
`fileFormat: 'PDF'` : un EPUB déposé est lisible en ligne et **invisible** à
l'étagère mobile. Ce n'est écrit nulle part ailleurs que dans cette requête.

### En sortie

| Format | Route | Note |
|---|---|---|
| `oai_dc` | `GET /oai` | Dublin Core, universel |
| `marcxchange` | `GET /oai`, SRU | |
| `etdms` | `GET /oai` | ⚠ **Travaux universitaires SEULEMENT** (I4). `ListMetadataFormats?identifier=…` dit, pour une notice donnée, si elle peut le recevoir. |
| CSV | `stats`, `encadrements`, `inventory` | |
| PDF | étiquettes, rapport annuel (impression) | `application/pdf` |
| PNG | codes-barres | `image/png` |

⚠ **Un ancien préfixe MARCXML est REFUSÉ EN NOMMANT son remplaçant**, plutôt que
retiré en silence : un moissonneur en échec doit savoir quoi demander.

### Ce qui ENTRE par des serveurs tiers

Le client SRU interroge des catalogues extérieurs déclarés dans
`sru/sru-servers.ts`, avec deux schémas : `unimarcxchange` et `marcxml`.

⚠ **Tout texte d'un tiers est normalisé en NFC à la frontière.** La Library of
Congress émet ses diacritiques en forme décomposée : sans cette normalisation,
« Ouédraogo » saisi à la main et « Ouédraogo » pré-rempli depuis la LoC sont
deux personnes différentes dans le fichier d'autorités.

---

## 7. Les limites connues

### Ce que le produit NE FAIT PAS

| | Constat mesuré |
|---|---|
| **La caisse** | Aucune colonne, aucune route ne consigne un PAIEMENT d'amende. Les amendes se calculent et s'affichent ; leur encaissement n'existe pas. *(backlog n°31)* |
| **Les paiements en ligne** | Le modèle `Payment` existe et **aucun code ne l'écrit** — le module n'est pas construit. Orange Money, Wave, MTN MoMo sont une intention, pas une fonction. |
| **Les abonnements** | Même état : modèle présent, module non construit. |
| **Le tri du catalogue** | L'API sert un paramètre `sort` à cinq valeurs. **Aucun écran ne l'emploie** — ni `sort=`, ni `tri=`, nulle part dans `apps/web`. |
| **Rouvrir un inventaire clos** | `POST /inventory/sessions/:id/reopen` existe, gardée et testée. **Aucun écran ne l'appelle** : une clôture prématurée est aujourd'hui définitive. |
| **Retirer un scan erroné** | `DELETE /inventory/sessions/:id/scans/:barcode` existe. **Aucun écran ne l'appelle.** |
| **L'aperçu avant import** | `POST /accounts/expected-students/import/apercu` existe. Le front appelle `/import` directement : on importe sans voir. |
| **La date d'acquisition** | `Item` ne porte AUCUNE date : l'acquisition et le catalogage sont confondus. *(backlog n°34)* |
| **L'intégrité des fichiers déposés** | Aucun contrôle. *(backlog n°29)* |
| **La diffusion mesurée** | Le serveur OAI ne journalise pas ses requêtes : on ne peut pas dire qui moissonne. *(backlog n°35)* |

### Ce qui n'a JAMAIS été traversé en vrai

Mesuré en comptant les lignes réelles des deux écoles de développement :

| | |
|---|---|
| **L'inventaire** | 0 session, 0 scan |
| **Le moissonnage** | 0 source, 0 exécution, 0 notice moissonnée |
| **Les mots-clés** | 0 `keywords`, 0 `record_keywords` |

⚠ Ces trois-là sont écrits, gardés et testés unitairement. Ils n'ont simplement
jamais tourné contre des données.

### Les dettes DÉCLARÉES, qui se rappellent d'elles-mêmes

Quatre comptes exacts sont inscrits dans le tamis
(`apps/api/src/cataloging/fonds-conforme-en-base.spec.ts`). Chacun **refuse dans
les deux sens** : le garde échoue si le nombre monte ET s'il descend — une dette
qui ne se rappelle qu'en s'aggravant laisserait passer sa propre résolution.

| Dette | École | Cause mesurée |
|---|---|---|
| 820 prêts ouverts sur exemplaire `AVAILABLE` | `horizon` | `seed-echelle.mjs:292` écrit les prêts sans toucher `item.status` |
| 412 comptes actifs sans date d'activation | `horizon` | `seed-echelle.mjs:351` pose `ACTIVE` sans `activatedAt` |
| 43 mises de côté disponibles sans échéance | `horizon` | ⚠ le balayage horaire ne peut PAS les reprendre : sa clé exige une échéance |
| 257 réservations en attente sur notice à exemplaire libre | `horizon` | `placeHold` les aurait mises de côté immédiatement |
| 3 549 travaux académiques sans directeur | `horizon` | dette d'origine du fonds d'échelle |

⚠ **Les cinq viennent du même écrivain : `seed-echelle.mjs`.** C'est le fonds de
mesure à l'échelle, montré à personne. Aucune ne touche l'école de
démonstration.

### Le backlog

`docs/backlog-backend.md` porte **21 entrées ouvertes** au jour de cette mesure.
Elles ne sont pas recopiées ici : un inventaire qui duplique le backlog
diverge de lui, et deux listes qui se ressemblent ne sont pas la même liste.

---

## 8. Ce que ce document ne mesure PAS

Écrit pour que personne ne prenne son silence pour une absence.

- **L'application mobile.** Son dépôt (`~/gafeso-mobile`) est figé au
  11 août 2026 ; sa confrontation au contrat actuel était en cours quand cet
  inventaire a été demandé. Elle n'est pas dans ces tables.
- **Quel test tient quel invariant.** Le comptage des occurrences mélange
  commentaires et assertions.
- **Ce qu'une route DÉCIDE.** Les colonnes disent ce que le décorateur porte.
  Une route sans fonction déclarée peut être publique par destination, protégée
  par la seule authentification, ou gardée par une clé d'API.
- **Si l'API rattrape une adresse tapée à la main.** La table des écrans donne
  le droit exigé par la navigation et par la page ; le troisième contrôle, côté
  API, n'est pas croisé écran par écran.
- **Les libellés morts.** L'extraction bute sur le destructuring
  (`const T = LIBELLES.importNotices`) : seul le dernier segment est comparable,
  et des segments comme `titre` apparaissent partout.

---

## Comment ce document se régénère

```bash
node scripts/inventaire-produit.mjs
```

Il réécrit **les sections 1 à 4** et le compte en tête, puis concatène ce
fichier-ci — `docs/inventaire-produit.partie-redigee.md` — sans y toucher.
**C'est donc ce fichier-là qu'on édite** pour les invariants, les formats et
les limites ; éditer `inventaire-produit.md` directement se perd à la première
régénération.

⚠ **Il refuse de rendre quoi que ce soit si ses témoins tombent** : 11 modules,
25 fonctions, 5 rôles système (dont Bibliothécaire à 7 et Administrateur à 25),
208 routes, `/opac/search` présente, `/guichet` présent, aucune route ni écran
inventé, et autant d'objets de navigation que de `href:` dans le fichier. Un
compte qui change n'est pas un échec du script : c'est une convocation à relire
ce document.
