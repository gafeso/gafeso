# Architecture de sécurité — lecture hors-ligne

Ce document décrit le modèle de sécurité qui protège les documents numériques consultés
**hors connexion** dans l'application mobile Gafeso. Il s'adresse aux contributeurs, aux
auditeurs et aux établissements qui déploient la solution.

## 1. Principe : proportionnalité, pas inviolabilité

Gafeso permet à un lecteur de télécharger les documents auxquels son établissement lui donne
accès et de les consulter sans réseau. Cela crée une tension connue : mettre du contenu sous
droits sur un appareil, hors de portée du serveur.

Notre position est explicite et honnête : **aucune protection côté client n'est inviolable sur
un appareil dont le propriétaire a le contrôle total (root).** Si une application peut
déchiffrer et afficher un document, le contenu en clair existe nécessairement en mémoire au
moment du rendu. L'objectif n'est donc pas l'impossibilité, mais la **proportionnalité** :

- empêcher le **partage courant** (copier un fichier à un camarade) — la fuite la plus
  fréquente ;
- **lier** le contenu à un utilisateur, un appareil et un établissement précis ;
- **borner dans le temps** la validité hors-ligne ;
- rendre toute extraction **individuelle, laborieuse et traçable**, jamais un canal de partage
  à grande échelle.

## 2. Modèle de menace

| Menace | Traitement |
|---|---|
| Partage d'un fichier copié | Contenu chiffré au repos, clé liée à l'appareil (§3–4) |
| Lecture après perte de droit | Licence bornée dans le temps + révocation (§6–7) |
| Perte / vol de l'appareil | Clé non-exportable dans le keystore matériel (§4) |
| Fuite entre établissements | Isolation par établissement, liaison dans la licence (§8) |
| Capture d'écran / photo | Blocage logiciel + filigrane (§9) — la photo reste l'« analog hole » assumé |
| Extraction sur appareil rooté | Non empêchable ; coût élevé, non scalable, traçable (§10) |

## 3. Contenu chiffré au repos

Un document numérique n'est jamais stocké en clair sur l'appareil. Il est chiffré en un **blob
segmenté** : le fichier est découpé en segments de taille fixe, chacun chiffré indépendamment
en **AES-256-GCM** (chiffrement authentifié). Cette segmentation permet de :

- déchiffrer **à la demande** uniquement les segments nécessaires au rendu d'une page, sans
  charger l'intégralité du document en mémoire ;
- **authentifier** chaque segment localement (l'altération d'un segment est détectée).

Copier le blob vers un autre appareil ne donne rien : sans la clé de contenu, liée à l'appareil
d'origine (§4), il reste illisible.

## 4. Liaison à l'appareil (KEM)

Chaque appareil génère, au premier lancement, une paire de clés **EC P-256** dans le magasin de
clés de la plateforme (Android Keystore). La clé privée est **non-exportable** et
hardware-backed lorsque le matériel le permet — elle ne quitte jamais l'élément sécurisé.

La **clé de contenu** (CEK) qui déchiffre le blob est transmise à l'appareil sous forme
**enveloppée**, via un mécanisme d'encapsulation de clé (KEM) :

1. le serveur génère une paire EC éphémère et calcule un secret partagé par **ECDH** avec la
   clé publique de l'appareil ;
2. ce secret est dérivé en clé d'enveloppe par **HKDF-SHA256** ;
3. la CEK est enveloppée en **AES-256-GCM** sous cette clé, l'identité de l'appareil servant de
   données authentifiées associées (AAD).

Seul l'appareil destinataire, via la clé privée de son keystore, peut recalculer le secret et
déballer la CEK. L'AAD garantit qu'une enveloppe destinée à un appareil est rejetée par tout
autre. **Aucune primitive SHA-1 n'intervient dans la chaîne.**

## 5. Rendu sans clair sur disque

Le déchiffrement a lieu **en mémoire**, à la volée, au moment du rendu. Le contenu en clair
n'est **jamais écrit sur le disque** — ni fichier temporaire, ni cache. Le moteur de rendu lit
le document par plages via un fournisseur qui déchiffre les segments demandés et ne conserve
qu'un petit cache borné de segments déchiffrés. Le contenu ne quitte pas le processus de
l'application (pas de partage vers d'autres applications, pas d'aperçu système).

## 6. Licence

L'autorisation de lire un document hors-ligne est portée par une **licence signée
(Ed25519)**, vérifiable **sans réseau** avec la clé publique du serveur embarquée dans
l'application. La licence contient notamment :

- l'identifiant du document, de l'établissement, de l'utilisateur et de l'appareil ;
- une **date d'expiration** (durée du bail hors-ligne) ;
- les droits associés (filigrane, etc.) ;
- la clé de contenu enveloppée (§4) ;
- un numéro de version de format.

Avant tout rendu, l'application vérifie la signature, l'expiration et la concordance des
liaisons (utilisateur / appareil / établissement). Un échec sur l'un quelconque de ces points
refuse l'ouverture.

## 7. Bornage temporel hors-ligne

Un appareil déconnecté ne peut pas être joint par le serveur. Le bornage repose donc sur la
**date d'expiration** de la licence, vérifiée localement, complétée par une **garde
anti-recul d'horloge** : l'application mémorise une référence temporelle et refuse de
fonctionner si l'horloge locale est ramenée en arrière. Un lecteur qui ne se reconnecte jamais
conserve l'accès jusqu'à l'expiration du bail — pas au-delà — sans pouvoir tricher sur la date.

## 8. Révocation

À chaque reconnexion, l'application interroge le statut de ses licences. Le calcul de
révocation **rejoue la même vérification de droit** que le serveur applique en ligne : une
révocation n'est pas un état maintenu séparément, c'est la disparition du droit sous-jacent
(changement de classe, fin d'abonnement). Sur une réponse affirmative `revoked` ou `expired`,
l'application **purge** le blob et la licence.

La révocation est donc **cohérente à terme, bornée par la durée du bail** : hors-ligne, on ne
peut pas révoquer instantanément. Un choix de conception important en découle : **un simple
échec réseau ne purge jamais** la bibliothèque locale. Seule une réponse serveur affirmative
révoque. Ceci protège les lecteurs en connectivité intermittente — le cas d'usage central —
d'une perte accidentelle de leurs documents.

## 9. Protections d'écran

- **Blocage de capture** (`FLAG_SECURE`) : les captures et enregistrements d'écran de la vue de
  lecture sont refusés par le système, et la vignette de l'application dans le sélecteur de
  tâches récentes est masquée.
- **Filigrane** : chaque page rendue porte un filigrane (identité du lecteur, établissement,
  horodatage), qui rend toute photographie d'écran traçable et dissuade le partage.

La photographie de l'écran par un second appareil (« analog hole ») n'est empêchée par aucune
technologie ; le filigrane la rend traçable et non scalable.

## 10. Limites assumées

Sur un appareil **rooté** ou modifié, un utilisateur déterminé peut, en principe, extraire le
contenu en clair depuis la mémoire au moment du rendu. C'est une propriété fondamentale de tout
DRM côté client, non un défaut spécifique. Les mesures ci-dessus élèvent le coût d'une telle
extraction, la maintiennent **individuelle et non automatisable à grande échelle**, et la
rendent **traçable** par le filigrane. Le modèle vise le partage courant et l'application des
droits pour l'immense majorité honnête des lecteurs, pas l'attaquant disposant d'un contrôle
total sur son matériel.

## 11. Choix de conception : lecteur exclusif

Contrairement aux formats de DRM conçus pour l'**interopérabilité** (lecture du même contenu
dans divers lecteurs tiers), Gafeso fait le choix inverse et assumé d'un **lecteur exclusif** :
l'application est le seul déchiffreur du contenu. Ce choix restreint volontairement la surface
d'exposition du contenu en clair à un unique chemin de rendu contrôlé.

## 12. Résumé des primitives

- Chiffrement du contenu : **AES-256-GCM** segmenté.
- Encapsulation de clé : **ECDH (P-256) + HKDF-SHA256 + AES-256-GCM**.
- Clé d'appareil : **EC P-256** non-exportable en keystore matériel.
- Signature de licence : **Ed25519**, vérifiée hors-ligne.
- Aucune primitive obsolète (pas de SHA-1). Le format de licence est versionné pour permettre
  une évolution des primitives.
