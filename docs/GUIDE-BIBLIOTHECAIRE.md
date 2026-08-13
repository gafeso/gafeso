# Guide du bibliothécaire

Ce guide suit le travail réel d'une bibliothèque : mettre un ouvrage au
catalogue, le prêter, gérer les lecteurs. Il ne décrit pas les menus un par un —
il répond à « comment je fais pour… ».

Aucune connaissance informatique n'est supposée. Les exemples reprennent une
bibliothèque fictive, **l'Université d'Exemple**, avec ses classes (Licence 1
Droit, Master 2 Médecine) et ses lecteurs (Awa Traoré, Boubacar Diallo).

> Pour installer ou exploiter le serveur, voir
> [INSTALLATION.md](INSTALLATION.md). Ce guide-ci suppose une installation qui
> fonctionne.

---

## Sommaire

1. [Se connecter, et ce que votre rôle vous autorise](#1-se-connecter-et-ce-que-votre-rôle-vous-autorise)
2. [Le premier jour : ce qui est déjà en place](#2-le-premier-jour--ce-qui-est-déjà-en-place)
3. [Mettre un ouvrage au catalogue](#3-mettre-un-ouvrage-au-catalogue)
4. [Mettre un document numérique à disposition](#4-mettre-un-document-numérique-à-disposition)
5. [Les lecteurs](#5-les-lecteurs)
6. [Le guichet : la journée type](#6-le-guichet--la-journée-type)
7. [Le QR de votre établissement](#7-le-qr-de-votre-établissement)
8. [Les rendez-vous périodiques](#8-les-rendez-vous-périodiques)
9. [Quand ça coince](#9-quand-ça-coince)

---

## 1. Se connecter, et ce que votre rôle vous autorise

Rendez-vous sur l'adresse de votre bibliothèque et cliquez sur **Se connecter**.
Vos identifiants vous ont été remis par la personne qui administre
l'installation.

**Ce que vous voyez dépend de votre rôle**, et c'est la première chose à
comprendre : si un collègue vous décrit un menu que vous ne trouvez pas, c'est
probablement qu'il n'a pas le même rôle que vous.

| Rôle | Ce qu'il voit dans la barre du haut | Ce qu'il peut faire |
|---|---|---|
| **Lecteur** (étudiant) | Accueil, Catalogue, Mes prêts | consulter, réserver, lire ses documents |
| **Bibliothécaire** | Accueil, Catalogue, **Guichet** | tout le travail de circulation : prêter, rendre, réserver |
| **Gestionnaire** | + **Administration** | le catalogue, les comptes, les classes, les statistiques |
| **Administrateur** | + les réglages de l'établissement | tout, y compris les rôles et le journal d'audit |

Un bibliothécaire n'a donc **pas** accès au menu Administration. Ce n'est pas
une limitation arbitraire : cataloguer et gérer les comptes sont des gestes qui
engagent tout l'établissement, et l'application sépare les deux
responsabilités.

**Activez la double authentification** dès votre première connexion :
*Mon compte → Sécurité*. Votre compte donne accès aux données personnelles de
vos lecteurs.

---

## 2. Le premier jour : ce qui est déjà en place

Une installation neuve n'est pas vide. Sans rien faire, vous disposez déjà de :

- **28 catégories** couvrant les grands domaines (droit, médecine, sciences,
  langues, histoire…). Vous pouvez les renommer, en ajouter, en retirer :
  *Administration → Catégories*.
- **Des règles de circulation** par défaut : durée de prêt, nombre de
  renouvellements, nombre d'emprunts simultanés, pénalité de retard. Elles se
  modifient dans les paramètres de l'établissement.
- **Des classes** d'exemple, à remplacer par les vôtres.

Prenez dix minutes pour parcourir ces trois écrans avant de cataloguer quoi que
ce soit : ils déterminent le comportement de tout le reste.

---

## 3. Mettre un ouvrage au catalogue

Un document se décrit en deux temps, et la distinction est **la notion centrale
d'un catalogue** :

- **la notice** décrit l'œuvre — titre, auteur, année, catégorie. Il y en a
  **une seule**, même si vous possédez dix exemplaires ;
- **l'exemplaire** est l'objet physique posé sur l'étagère, avec **son propre
  code-barres**. C'est lui qu'on prête.

Un lecteur cherche une notice ; le guichet prête un exemplaire.

### 3.1 Récupérer une notice existante plutôt que la saisir

*Administration → Catalogue → Nouvelle notice.*

Avant de tout retaper, essayez la **récupération par ISBN**. Gafeso interroge
les catalogues de la Bibliothèque nationale de France et de la Library of
Congress et remplit le formulaire pour vous : titre, auteur, éditeur, année.

C'est le geste qui fait gagner le plus de temps sur un fonds courant. Vérifiez
toujours ce qui revient — une notice récupérée reste à relire — mais partir
d'une fiche pré-remplie économise plusieurs minutes par ouvrage.

Pour un mémoire ou une thèse produits chez vous, il n'y a évidemment rien à
récupérer : la saisie est manuelle.

### 3.2 Saisir une notice à la main

Les champs qui comptent vraiment :

| Champ | Conseil |
|---|---|
| **Titre** | tel qu'il figure sur la page de titre, pas sur la couverture |
| **Auteur** | « Nom, Prénom » — c'est cette forme qui permet le classement alphabétique |
| **Type** | ouvrage, mémoire, thèse, publication : il pilote les filtres du catalogue |
| **Catégorie** | une seule, la principale ; les mots-clés servent au reste |
| **Mots-clés** | ce que le lecteur taperait dans la recherche, pas le vocabulaire savant |

### 3.3 Ajouter les exemplaires

Depuis la fiche de la notice, ajoutez autant d'exemplaires que vous possédez de
copies. Chacun reçoit un **code-barres** et une **localisation** (salle de
lecture, magasin, réserve).

Si vous n'avez pas encore d'étiquettes, Gafeso les imprime :
*Administration → Catalogue → étiquettes*. Elles sortent en PDF au format
Code 128, lisible par toutes les douchettes du commerce.

### 3.4 Importer un lot existant

Si vous venez d'un autre logiciel, *Administration → Interopérabilité* importe
un fichier **MARC** (UNIMARC ou MARC21) et crée les notices en série. Faites un
essai sur dix notices avant de lancer votre fonds entier.

---

## 4. Mettre un document numérique à disposition

C'est ici que Gafeso se distingue d'un catalogue classique : un lecteur peut
**télécharger un document et le lire hors connexion** depuis l'application
mobile.

### 4.1 Téléverser le fichier

Depuis la fiche de la notice, ajoutez le fichier (PDF ou EPUB). Il est stocké
chiffré ; il n'est jamais accessible par une simple URL publique.

### 4.2 La chaîne qui rend un document accessible — et pourquoi il ne l'est pas

**Téléverser un fichier ne suffit pas à le rendre lisible.** C'est la source de
confusion la plus fréquente. Il faut **trois maillons** :

```
   Le document          La collection            La règle d'accès
  (fichier chargé)  →  (qui le contient)   →   (qui a le droit de lire)
                                                        ↓
                                              une CLASSE ou un ABONNEMENT
```

1. Le document est **téléversé** sur la notice.
2. La notice appartient à une **collection** — *Administration → Collections*.
   Une collection regroupe des documents qui partagent le même public :
   « Thèses de droit », « Manuels de première année ».
3. La collection porte une **règle d'accès** qui désigne **qui peut lire** :
   une classe (tous les Licence 1 Droit) ou un abonnement.

Si l'un des trois manque, le lecteur voit la notice dans le catalogue mais ne
peut pas ouvrir le document. Ce n'est pas une panne : c'est la règle d'accès qui
fait son travail.

### 4.3 Le badge « Hors ligne »

Sur la fiche d'un document numérique, un badge indique s'il est utilisable dans
l'application mobile :

| Badge | Ce que cela signifie |
|---|---|
| **Hors ligne : prêt** (vert) | le document est préparé ; un lecteur autorisé peut le télécharger et le lire sans réseau |
| **Hors ligne : indisponible** (ocre) | le document n'est pas encore utilisable hors connexion |

Un document fraîchement téléversé passe par une phase de préparation avant
d'afficher « prêt ». Si le badge reste « indisponible » longtemps après le
téléversement, signalez-le à la personne qui administre le serveur : c'est un
symptôme technique, pas une manipulation à refaire.

---

## 5. Les lecteurs

*Administration → Comptes.*

### 5.1 Créer un lecteur, et l'activer

Créez le compte avec le nom, l'adresse email et le matricule. Le lecteur reçoit
un **email d'activation** contenant un lien à usage unique, par lequel il
choisit son mot de passe. Vous ne connaissez jamais son mot de passe — personne
ne le connaît, c'est voulu.

### 5.2 Quand l'email d'activation n'arrive jamais

C'est fréquent : adresse saisie de travers, boîte pleine, message classé en
indésirable, ou serveur d'envoi mal configuré.

**Vous n'êtes pas bloqué.** Sur la fiche du compte, le bouton
**« Lien d'activation »** affiche le lien directement à l'écran. Vous pouvez
alors le dicter, l'imprimer, ou le transmettre par le moyen de votre choix.

C'est la manœuvre à connaître avant la rentrée, quand deux cents comptes
s'activent en même temps.

### 5.3 Les classes — et pourquoi ça ne se règle pas depuis le compte

Voici un point qui surprend systématiquement.

**La classe d'un étudiant ne se modifie pas depuis sa fiche de compte.** Elle se
règle depuis *Administration → Classes*, ou par l'import d'étudiants.

La raison est solide : la classe **n'est pas une propriété de la personne, c'est
une inscription**. Elle change chaque année, elle conditionne l'accès aux
collections, et elle doit rester cohérente pour toute une promotion. La piloter
depuis la liste des classes évite qu'un étudiant se retrouve isolé dans une
classe que personne d'autre n'a — et perde du même coup l'accès aux documents de
sa promotion.

### 5.4 Inscrire une promotion entière

*Administration → Import étudiants* charge un fichier et crée les comptes en
série, chacun rattaché à sa classe. C'est la voie normale pour une rentrée.

---

## 6. Le guichet : la journée type

*Guichet.* C'est l'écran où vous passerez le plus de temps. Quatre onglets :
**Prêt**, **Retour**, **Adhérent**, **Réservations**.

### 6.1 Prêter

Deux champs : **Carte d'adhérent** puis **Exemplaire**.

Scannez les deux codes-barres à la douchette, ou **tapez-les au clavier** — les
champs sont de simples zones de saisie, il n'y a pas de mode particulier à
activer. Une douchette n'est qu'un clavier qui tape vite : tout ce qu'elle fait,
vos doigts le font aussi. Validez par **Enregistrer le prêt**.

La confirmation affiche la date de retour calculée et les conditions :

> Prêt enregistré : Droit constitutionnel burkinabè
> À rendre le 20 août 2026 (7 jours · retard : 50 FCFA/jour).

Lisez cette ligne à voix haute au lecteur : c'est le moment où l'échéance est
comprise, et cela vous épargne des discussions au retour.

Si le prêt est refusé, le message dit pourquoi — quota d'emprunts atteint,
exemplaire déjà sorti, compte non activé. Ce n'est pas une panne.

### 6.2 Rendre

Onglet **Retour** : un seul champ, le code-barres de l'exemplaire. Nul besoin
d'identifier le lecteur, l'exemplaire suffit à retrouver le prêt.

### 6.3 Renouveler et réserver

Le renouvellement se fait depuis la fiche de l'adhérent (onglet **Adhérent**),
dans la limite fixée par vos règles de circulation. Un document **réservé par
quelqu'un d'autre** n'est pas renouvelable — c'est ce qui rend la réservation
utile.

L'onglet **Réservations** liste les documents attendus. Quand un exemplaire
réservé revient, mettez-le de côté : le lecteur suivant est prévenu.

---

## 7. Le QR de votre établissement

*Administration → Établissement.*

Vos lecteurs installent l'application mobile puis **scannent ce QR** pour
connecter l'application à votre bibliothèque. Sans lui, ils ne savent pas où se
connecter.

Le bouton d'impression produit une **affiche A4** avec le code en grand,
l'adresse écrite en toutes lettres dessous et le logo en pied de page.
L'adresse figure en clair **volontairement** : un lecteur dont l'appareil photo
ne lit pas les codes — vieux téléphone, écran fêlé, mauvaise lumière — doit
pouvoir la recopier. Une affiche qui n'offre que le code exclut ceux qui ne
peuvent pas le scanner.

Affichez-la à l'entrée, sur les tables de travail, en amphi. Elle est conçue pour
être lisible à plusieurs mètres.

---

## 8. Les rendez-vous périodiques

### 8.1 Le récolement

*Administration → Récolement.* Le récolement consiste à passer les rayons à la
douchette pour confronter ce que dit le catalogue à ce qui est réellement sur
les étagères.

Vous ouvrez une **session**, vous scannez, et le rapport final classe les
exemplaires en quatre catégories : **vus**, **manquants**, **en prêt** (donc
normalement absents), et **inattendus** (présents mais non attendus à cet
endroit). Les manquants peuvent être marqués comme tels, et l'opération est
tracée dans le journal.

Une fois par an suffit pour un fonds stable.

### 8.2 Les rappels d'échéance

Les rappels partent automatiquement avant la date de retour. *Administration →
Rappels envoyés* montre ce qui est réellement parti — utile quand un lecteur
affirme n'avoir rien reçu.

### 8.3 Les statistiques

*Administration → Statistiques* : emprunts sur la période, documents les plus
sortis, activité par classe. Exportable en CSV pour un rapport annuel.

### 8.4 Le journal d'audit

*Administration → Journal d'audit* enregistre les actions sensibles : création
et suppression de comptes, changements de rôle, marquage d'exemplaires
manquants. On y va rarement — mais le jour où une donnée a disparu, c'est là
qu'on trouve qui, quoi, quand.

---

## 9. Quand ça coince

| Ce que vous constatez | Ce qui se passe | Ce que vous pouvez faire |
|---|---|---|
| Un lecteur n'a jamais reçu son email d'activation | Adresse erronée, indésirables, ou envoi mal configuré côté serveur | *Comptes → le compte → **Lien d'activation*** : le lien s'affiche, transmettez-le autrement (§5.2) |
| Un lecteur voit la notice mais ne peut pas ouvrir le document | Un maillon manque : collection ou règle d'accès | Vérifiez les trois maillons du §4.2 |
| Le badge reste « Hors ligne : indisponible » | Le document n'a pas fini d'être préparé, ou la préparation a échoué | Patientez ; si cela dure, signalez-le à l'administrateur — ce n'est pas une manipulation à refaire |
| Un prêt est refusé | Quota atteint, exemplaire déjà sorti, ou compte non activé | Le message indique la cause ; les quotas se règlent dans les règles de circulation |
| Un document n'est pas renouvelable | Il est réservé par un autre lecteur | Normal — c'est ce qui donne son sens à la réservation |
| Vous ne trouvez pas le menu Administration | Votre rôle est « bibliothécaire » | Demandez à un gestionnaire ou un administrateur (§1) |
| Le changement de classe n'a pas d'effet depuis la fiche du compte | La classe se règle depuis *Classes*, pas depuis le compte | §5.3 |
| Un exemplaire est introuvable en rayon | À confirmer par un récolement | §8.1 — le rapport distingue « manquant » de « en prêt » |

Pour tout ce qui relève du serveur — site inaccessible, aucun email ne part,
lenteurs — voyez le [tableau de diagnostic](INSTALLATION.md#5-diagnostic--symptôme-cause-vérification)
avec la personne qui administre l'installation.

---

**Documents liés** — [installer et exploiter](INSTALLATION.md) ·
[toutes les fonctionnalités](fonctionnalites.md) ·
[sécurité de la lecture hors-ligne](architecture-securite-offline.md)
