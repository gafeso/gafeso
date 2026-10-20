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

## V1.1 — Lecture attribuée

**Posé le 20 octobre 2026, par Jean, après la mesure suivante : l'attribution
n'existe NULLE PART**, ni web ni mobile. Le filigrane web n'est qu'un
affichage à l'écran — le fichier qui sort est identique pour tous les
lecteurs. Côté hors ligne, la base de développement le confirme sans
ambiguïté : trois licences actives de trois appareils différents
(`offline_licenses`, tenant zinda) pointent vers le **même** `enc_object_key`
— un seul blob chiffré, partagé, qui ne porte la marque d'aucun lecteur.
`rights` n'est appliqué par personne.

Un seul lot plutôt que trois tickets séparés, parce que les trois défauts
ci-dessous partagent UNE CAUSE : **l'API sert le document en clair** (ou
chiffré de façon identique pour tout le monde) et délègue toute la
protection à une URL, jamais à une marque portée par le fichier lui-même.

### 1. Web : filigrane posé À LA VOLÉE, sans stockage

Le filigrane nominatif existe déjà à l'écran (pdf.js, canvas) — ce lot ne le
réinvente pas, il le fait porter par le FICHIER qui sort, pas seulement par
ce qui s'affiche. Composé au moment de la requête, à partir de l'identité du
compte qui lit, jamais stocké : la même notice ne produit pas un fichier par
lecteur à demeure, elle produit un flux dérivé à chaque demande. Coût de
stockage : **nul** — c'est précisément pour ça que « à la volée » est la
forme à retenir plutôt qu'une copie par compte.

### 2. Hors ligne : un blob par APPAREIL ACTIF, détruit à la révocation

Aujourd'hui : un seul blob chiffré par notice, **partagé** entre tous les
appareils qui en détiennent une licence (mesuré ci-dessus). Demain : un blob
par appareil actif, produit à l'émission de la licence et **détruit à sa
révocation** — ce qui donne à la révocation un effet matériel immédiat
(aujourd'hui, revoir le bail est le SEUL mécanisme ; le blob, lui, survit).

### 3. Plus aucune URL signée exposée au navigateur

**Mesuré le 19 octobre 2026, sans changement de code.**
`OpacService.getReadUrl` → `StorageService.getSignedDownloadUrl` produit une
URL S3 présignée ordinaire, valide pour QUICONQUE la détient (ni liée au
compte, ni à usage unique — seule protection : un TTL de 300 s/900 s, déjà
documenté comme « raisonnable, non absolu »). Elle apparaît dans l'onglet
Réseau du navigateur pendant tout son TTL : copiée ou cachée par un proxy,
elle reste utilisable par un tiers pendant la fenêtre restante, sans
vérification de session au second appel.

⚠ **La forme FAUTIVE que ce problème appelle** : raccourcir le TTL en
croyant fermer la fenêtre. Ça réduit la fenêtre, ça ne retire pas le partage
possible PENDANT elle, et un TTL trop court casserait une session de lecture
légitime plus longue que lui.

Avec le filigrane à la volée (point 1), cette fuite se referme par
construction plutôt que par un second mécanisme : le navigateur ne reçoit
plus jamais une URL vers l'objet brut, il reçoit un flux déjà attribué,
servi par l'API elle-même (authentifiée par session, pas par une signature
S3 détachable).

### 4. Plafonds par compte et par jour

Défense contre l'abus une fois le point 3 posé (un compte compromis, un
script qui boucle) : une limite par COMPTE (un lecteur ne consulte pas un
nombre illimité de documents par jour) et par JOUR (la fenêtre de mesure).
Mesuré le 19 octobre 2026 : `/auth/login` et les routes voisines sont
limitées (`@Throttle`), mais c'est une limite PAR IP et générique — rien ne
porte sur la lecture elle-même une fois authentifié.

### Coût de stockage estimé — pour arbitrer sur des chiffres, pas une impression

**Mesuré sur la base de développement, pas deviné** : `tenant_zinda` porte
**9 licences actives pour 4 notices distinctes** — soit 2,25 appareils actifs
par notice offline-activée, en moyenne, sur cet échantillon. Sous le modèle
actuel (1 blob partagé par notice), ces 4 notices tiennent dans **4 blobs** ;
sous « un blob par appareil actif », elles en demanderaient **9** — un
multiplicateur mesuré de **×2,25** sur ces données.

⚠ **Ce multiplicateur ne se généralise pas tel quel à un fonds réel** : notre
corpus de développement pèse en moyenne **54 Ko** par copie chiffrée (156
copies, tenant zinda) — des PDF d'essai, pas des thèses ou des ouvrages. Pour
arbitrer sur un ordre de grandeur RÉALISTE, voici un calcul explicitement
hypothétique (à ne pas confondre avec les chiffres ci-dessus, qui sont
mesurés) :

| | Aujourd'hui (1 blob partagé) | V1.1 (1 blob / appareil actif) |
|---|---|---|
| Document moyen (hypothèse, pas mesuré) | 2 Mo | 2 Mo |
| Appareils actifs par document (hypothèse) | — | 10 |
| Stockage par document offline-activé | 2 Mo | **20 Mo** |
| Pour 500 documents offline-activés sur un fonds | 1 Go | **10 Go** |

Le multiplicateur réel dépend du nombre moyen d'appareils actifs par
document — une grandeur qu'aucune instance n'a encore produite à l'échelle,
et qui devra être mesurée (pas supposée) dès qu'un fonds de taille réelle
aura des licences hors ligne actives, avant de fixer un plafond de stockage
par établissement.

---

## V1.1 — Inscription à validation automatique, pour la lecture seule (Université virtuelle)

**Décidé le 19 octobre 2026.** La lecture anonyme est abandonnée (voir
ci-dessous) ; pour une bibliothèque entièrement numérique dont les visiteurs
n'ont pas de carte d'adhérent papier à présenter d'abord, exiger un
bibliothécaire pour activer chaque compte serait un frein disproportionné à
l'usage que l'établissement veut permettre.

**Ce qui est demandé** : une option PAR ÉTABLISSEMENT — pas un défaut global
— qui active une activation automatique pour un profil d'inscription limité
à la lecture seule. Le visiteur reste **toujours identifié** : il crée un
compte, il le vérifie (email), et ce compte est actif en deux clics plutôt
qu'après un geste d'un bibliothécaire. Ce n'est PAS un accès anonyme déguisé
en inscription facile — c'est un raccourci sur le DÉLAI d'identification,
jamais sur l'identification elle-même.

⚠ **Ce que ça devra trancher**, sans l'avoir fait ce soir : quelles fonctions
porte ce profil (lecture seule exclut *a priori* le prêt physique, qui n'a pas
de sens pour un visiteur sans adresse connue de l'établissement) ; comment il
se distingue d'un étudiant inscrit au sens propre (pas de classe, pas
d'abonnement — donc aucune règle d'accès ne le couvrirait sous le modèle
actuel, voir l'entrée ci-dessous sur l'invariant d'authentification) ; et le
risque d'abus d'une activation sans vérification humaine (comptes jetables en
masse), qui est précisément ce que l'activation manuelle existe pour limiter
aujourd'hui.

---

## Invariant : aucune lecture de document sans compte identifié

**Tranché le 19 octobre 2026 par Jean**, après une mesure dans le code (pas
une hypothèse) : *le modèle d'accès actuel n'a aucune notion de lecteur
anonyme — `AccessRule` ne porte que `className`/`subscriptionTier`, tous deux
nullables, et le plus large des deux ("tout le monde") veut dire "tout
étudiant inscrit de l'école", jamais "n'importe qui".* La possibilité d'un
accès libre anonyme, envisagée pour l'Université virtuelle, est ABANDONNÉE —
remplacée par l'inscription à validation automatique ci-dessus.

**Ce qui doit suivre, en garde-fou plutôt qu'en habitude** : un test à
population DÉRIVÉE qui relève toute route servant un document, une page de
document, un flux de lecture ou une copie hors ligne, et exige qu'elle refuse
une requête non authentifiée — une route ajoutée demain sans ce refus doit
faire échouer la CI. Les couvertures restent l'exception déclarée (lecture
anonyme du bucket, publique par conception) ; toute autre exception demande
l'accord écrit de Jean.

⚠ **Mesuré le 19 octobre 2026, avant d'écrire le garde** : les quatre routes
candidates trouvées ce soir sont déjà authentifiées — `opac/records/:id/read`
(`JwtAuthGuard`), `cataloging/records/:id/digital-copy/download-url`
(`RequiresFunctions`, sous la garde de classe), `offline-licensing/*`
(`JwtAuthGuard` de classe), `depots/:id/document` (idem). **L'invariant est
donc déjà vrai aujourd'hui** — ce garde-fou le FIGE, il ne corrige rien.

**Taille du lot, mesurée avant d'être proposée** : dériver correctement la
population — reconnaître une route qui sert un document sans liste tenue à la
main, et distinguer une authentification de compte (`JwtAuthGuard`) d'une clé
de plateforme (`ApiKeyGuard`) ou d'un jeton d'amorçage
(`SessionAssistantGuard`), qui ne sont pas des lecteurs identifiés au sens de
cette règle — n'est pas un ajustement de dix minutes sur le garde existant
(`gardes-declarees.spec.ts`, qui vérifie une FONCTION, pas une AUTHENTIFICATION).
**Proposé comme lot séparé, juste après la v1.0.0**, plutôt que glissé dans
rc15 sous la pression du calendrier — c'est exactement la pente que ce
fichier déconseille ailleurs : un garde de sécurité écrit vite se fait avoir
par la famille de défauts qu'il est censé traquer.

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

