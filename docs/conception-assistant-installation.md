# L'assistant d'installation — CONCEPTION

> **Ce document est une conception, pas une implémentation.** Il dit ce que
> l'assistant doit faire, ce qu'il ne peut PAS faire, et le contrat d'API que le
> front consommera. Rien n'est codé.
>
> Écrit le 6 octobre 2026, pour la V1.

## 1. Le problème, et la forme fautive qu'il appelle

### ⭐ LE MOTIF, confirmé par le front le 6 octobre 2026

> **Le premier administrateur d'une installation neuve passe par un compte
> qu'AUCUNE ROUTE NE CRÉE.**

C'est tout le problème, et il se mesure : `POST /admin/tenants` crée l'école et
son schéma ; **il ne crée aucun compte**. Créer un compte exige
`POST /accounts/staff`, gardé par `comptes.gerer` — une fonction qui exige un
compte, qui n'existe pas encore. Le seul chemin aujourd'hui est
`scripts/provision-production.mjs`, c'est-à-dire un accès au shell du serveur.

⚠ **Et ce n'est pas seulement une gêne d'auto-hébergeur.** C'est pourquoi la
démonstration tourne avec un administrateur portant l'adresse de l'éditeur —
le défaut que j'avais rapporté le 6 octobre. L'assistant est la réponse à cette
question-là, pas un confort d'installation.

### Ce que l'assistant fait

Après `docker compose up`, le navigateur ouvre un assistant : établissement,
domaine, administrateur, courriel, modules.

> 🔴 **LA FORME FAUTIVE, et c'est la plus dangereuse de la V1 : un assistant
> ouvert à quiconque atteint l'adresse. Celui qui y arrive avant l'installateur
> PREND L'INSTANCE.**

Elle est dangereuse pour trois raisons qui se cumulent :

1. **Elle ne ressemble pas à une faille.** L'assistant fait exactement ce qu'on
   lui demande ; c'est le demandeur qui n'est pas le bon.
2. **Le vol est SILENCIEUX et DÉFINITIF.** Celui qui termine l'assistant devient
   administrateur. L'installateur légitime arrive ensuite sur un écran de
   connexion et croit avoir mal installé.
3. **La fenêtre est la plus exposée de la vie de l'instance** : le DNS vient
   d'être posé, le certificat vient d'être émis — et rien n'est encore protégé.

⚠ **La correction fautive que ce problème appelle, et il faut la nommer : une
FENÊTRE DE TEMPS.** « L'assistant se ferme après quinze minutes » est le remède
qui vient à l'esprit, et c'est celui que d'autres produits ont adopté avant
d'être pris. Il ne supprime pas la course, il la RACCOURCIT — et il en ajoute
une seconde : un installateur interrompu par un appel téléphonique doit
redémarrer le conteneur, donc il apprend à relancer l'assistant, donc il apprend
à le rouvrir.

## 2. Le remède : un JETON D'AMORÇAGE, et pas une fenêtre

À son premier démarrage sur une base non initialisée, l'API **engendre un jeton
d'amorçage** (32 octets, aléatoire fort) et l'écrit à deux endroits :

- **dans le journal du conteneur**, en clair, encadré pour être repérable ;
- **dans un fichier** du volume de données (`/var/lib/gafeso/amorcage`), en
  permissions `0600`.

L'assistant **refuse tout** sans ce jeton. Toujours — pas pendant quinze minutes.

> ⭐ **Posséder le jeton PROUVE l'accès au serveur, et c'est exactement
> l'autorisation que « j'installe cette instance » demande.** Celui qui peut lire
> `docker compose logs` ou le volume est celui qui a installé. Il n'y a plus de
> course, parce qu'il n'y a plus rien à gagner en arrivant premier.

⚠ **Pourquoi DEUX endroits, et pas un.** Le journal se perd (rotation, `docker
compose up -d` sans `logs`, une console fermée) ; le fichier survit mais demande
un accès au volume. Un seul des deux rendrait l'assistant inatteignable dans un
cas courant — et un installateur bloqué cherchera une porte, ce qui est
précisément ce qu'on veut éviter.

⚠ **Ce que le jeton NE protège pas, et qu'il faut écrire** : quiconque peut lire
le journal du conteneur peut installer. C'est une élévation de « accès au
serveur » vers « administrateur de l'établissement ». Sur une instance
auto-hébergée, c'est la même personne. Sur une instance hébergée par un tiers,
l'hébergeur peut donc installer — et c'est vrai de toute façon, puisqu'il a la
base.

### ⚠ LE JETON NE DOIT JAMAIS APPARAÎTRE DANS UNE SORTIE QU'ON COLLE

*Question de Jean, 6 octobre 2026 : « un journal partagé sur un forum le
publierait ». Elle est juste, et elle ne se règle pas par une consigne —
l'installateur qui demande de l'aide colle ce qu'il a sous la main.*

**Cinq mécanismes, et le troisième est le seul qui résiste vraiment.** Chacun est
éprouvé par la recette, par son EFFET.

| | Le mécanisme | Ce qu'il ferme |
|---|---|---|
| ① | il ne sort **jamais** sur la sortie standard ni dans le journal — seul le **CHEMIN** s'imprime | un `docker compose logs` collé sur un forum |
| ② | il n'est **jamais dans une URL** : corps de requête uniquement | l'historique du navigateur, l'en-tête `Referer`, le journal d'accès de Caddy |
| ③ | ⭐ il est à **USAGE UNIQUE**, consommé par l'installation | **tout le reste** — voir ci-dessous |
| ④ | le **fichier est effacé** par l'API quand l'installation se termine | un secret périmé qui traîne (le défaut mesuré du 9 septembre) |
| ⑤ | le fichier **dit en tête de ne pas coller son contenu** | la part humaine, placée là où le risque vit |

> ⭐ **Le troisième est le seul mécanisme qui résiste à une divulgation : une
> fois l'installation terminée, le jeton ne vaut plus rien. La fenêtre de fuite
> est donc exactement la fenêtre d'installation** — et un installateur qui
> demande de l'aide sur un forum a, par construction, déjà fini ou pas commencé.

⚠ **Le risque RÉSIDUEL est nommé, et il est réel** : un jeton divulgué *pendant*
l'installation, avant son premier usage, est une course perdue. C'est pourquoi ⑤
existe — une promesse, assumée comme telle, adressée à la seule personne en
position d'éviter ce cas.

⚠ **Et ⑤ est placé dans le FICHIER, pas dans la documentation.** Une consigne
dans `DEPLOY.md` est lue avant l'installation ; l'avertissement doit être lu au
moment où quelqu'un ouvre le fichier pour en copier le contenu, c'est-à-dire
plus tard et dans un autre état d'esprit.

**Ce que la recette mesure, et dans les deux sens** (contrôle négatif exécuté le
6 octobre : rendre le clair à l'appelant et le journaliser fait tomber le garde
de forme ET la recette) :

```bash
grep -qF "$JETON" api.log      # doit ne RIEN trouver
grep -q  "$JETON_FICHIER" api.log   # doit trouver le CHEMIN
stat -c '%a' "$JETON_FICHIER"       # 600
```

### L'état d'installation vit en BASE, pas dans un fichier

Une table de plateforme (`public.installation`) porte une ligne unique :
`terminee_le`, `jeton_hache`, `jeton_consomme_le`.

⚠ **En base et pas dans un fichier, pour une raison mesurable** : une
restauration de sauvegarde rend la base d'une instance DÉJÀ installée. Si l'état
vivait dans un fichier du volume applicatif, une restauration partielle — base
restaurée, volume neuf — rouvrirait l'assistant sur une instance peuplée. Et
celui qui le terminerait créerait un second administrateur sur les données d'un
client.

⚠ **Le jeton est stocké HACHÉ** (bcrypt, mêmes tours que le reste), jamais en
clair. Un dump de base ne doit pas livrer le jeton d'amorçage — même si
l'installation est terminée, puisqu'un dump peut être restauré ailleurs.

## 3. ⚠ CE QUE L'ASSISTANT NE PEUT PAS FAIRE — mesuré, pas supposé

> ⭐ **L'assistant ne peut configurer que ce qui vit en BASE.** Mesuré le
> 06/10/2026 :

| Ce qu'on veut régler | Où ça vit | L'assistant peut-il ? |
|---|---|---|
| nom et slug de l'établissement | base (`tenants`) | **oui** |
| domaine de l'établissement | base (`domains`) | **oui**, pour la résolution multi-tenant |
| compte administrateur | base (`users`) | **oui** |
| modules actifs | base (`tenant_settings.modules_desactives`) | **oui** |
| 🔴 `APP_URL` | **environnement** (`config.get('APP_URL')`) | **NON** |
| 🔴 Caddy : `PUBLIC_DOMAIN`, `API_DOMAIN`, `STORAGE_DOMAIN` | **environnement**, lus à la configuration | **NON** |
| 🔴 SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`…) | **environnement** | **NON** |

⚠ **La conséquence est structurante, et elle doit être dite à l'installateur
AVANT qu'il lance `docker compose up`** : le domaine, les secrets et le SMTP se
posent dans `.env.prod`, pas dans l'assistant. L'assistant ne les invente pas —
il les **CONSTATE**, et il dit ce qui manque.

⚠ **Un assistant qui demanderait le domaine puis ne pourrait pas obtenir le
certificat TLS serait un faux dispositif** : il poserait la bonne valeur en base,
Caddy continuerait de servir l'ancienne, et l'instance serait inatteignable sous
le nom qu'on vient de saisir. Il demande donc le domaine pour la **résolution**,
en AFFICHANT celui que Caddy sert déjà, et il refuse s'ils diffèrent.

## 4. ⚠ Le test de courriel DOIT DIRE LA VÉRITÉ

C'est la famille que ce dépôt connaît : *une fonction qui ne peut pas accomplir
son office ne doit pas sortir comme si elle l'avait accompli.*

Le produit porte déjà `MailOutcome`, et `MailService` rapporte son issue au lieu
de la taire. L'assistant doit en faire autant, avec **trois** précautions :

**① Le résultat est une union discriminée, jamais un booléen.** Un `envoye:
false` ne dit pas POURQUOI, et les motifs n'appellent pas le même geste :

| Motif | Ce que l'installateur doit faire |
|---|---|
| `smtp_absent` | poser `SMTP_HOST` dans `.env.prod` et redémarrer `api` — **rien n'est parti, et rien ne partira** |
| `smtp_error` | lire le **message du serveur**, qui seul distingue une authentification refusée (`SMTP_USER` / `SMTP_PASS`) d'un hôte injoignable (`SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE`) |
| `aucun_destinataire` | aucune adresse fournie — ce n'est pas un défaut de configuration |

#### ⚠ CORRIGÉ LE 6 OCTOBRE 2026 : CINQ motifs annoncés, TROIS mesurables

Ce tableau annonçait `hote_injoignable`, `authentification`,
`refus_du_destinataire` et `delai_depasse`. **`MailOutcome` n'en distingue
aucun** : il porte `smtp_absent`, `smtp_error` et `aucun_destinataire`, plus un
`detail` qui est le message brut du serveur.

> ⭐ **Annoncer plus de précision que le mécanisme n'en a est exactement la forme
> fautive que ce dépôt traque.** Quatre motifs auraient dû être *inventés* — donc
> devinés à partir d'une chaîne d'erreur, donc faux le jour où nodemailer change
> son libellé. Et un écran qui affiche « authentification refusée » sur un hôte
> injoignable envoie corriger un mot de passe qui n'a rien.

**La forme juste rend ce que le code sait** — les trois motifs — **et le message
brut du serveur**, qui est la seule chose capable de séparer les cas. Mesuré :
`connect ECONNREFUSED 127.0.0.1:1` pour un hôte fermé.

⚠ **Et on n'élargit PAS `MailOutcome` pour l'occasion.** Il est consommé par huit
fichiers ; ajouter deux motifs que seul l'assistant distinguerait ferait porter à
tout le produit une précision qu'aucun autre appelant ne peut produire.

**② ⚠ « ACCEPTÉ » N'EST PAS « ARRIVÉ ».** Un serveur SMTP qui prend le message
ne garantit pas la livraison : il peut le jeter, le classer en indésirable, ou le
refuser en différé. Le succès se dit donc **« le serveur SMTP a accepté le
message »**, jamais « le courriel est arrivé » — et l'écran demande à
l'installateur de **vérifier sa boîte**, ce qui est la seule mesure.

**③ ⚠ ET L'ASSISTANT DOIT POUVOIR SE TERMINER SANS SMTP.** Une installation sans
courriel est légitime — une école sans serveur de messagerie, un essai hors
ligne. Le refuser bloquerait une installation valide.

> 🔴 **Mais alors il doit DIRE ce qui se casse, et donner la sortie.** Sans SMTP,
> le lien de définition de mot de passe de l'administrateur **ne peut pas être
> envoyé**. L'assistant l'affiche donc **à l'écran, une seule fois**, exactement
> comme `provision-production.mjs` le fait aujourd'hui — et il écrit qu'il ne
> sera pas réaffiché.
>
> ⚠ Sans cela, l'assistant se terminerait sur « un courriel vous a été envoyé »
> et l'administrateur attendrait une boîte muette, sans aucun autre chemin vers
> son compte. C'est le faux qui RETIRE LE SEUL RECOURS, et ce dépôt l'a déjà payé
> une fois sur l'inscription publique.

## 5. Le contrat d'API, pour le front

**Cinq** des six routes n'existent plus une fois l'installation terminée : elles
répondent `410 Gone`.

> 🔴 **`GET /installation/etat` est EXEMPTÉE, et c'est une correction.**
> *Contradiction trouvée par le front le 6 octobre 2026, en lisant ce document
> en consommateur : il disait « toutes » ici et « rend `requise: false` » au
> chapitre 6.*
>
> `etat` est la **seule** route que le front appelle sur une instance installée —
> c'est elle qui décide entre l'assistant et l'écran de connexion. **Une route
> qui existe pour dire « est-ce installé ? » doit pouvoir répondre non.** Et un
> `410` sur un appel de routine se lit comme une panne dans un journal.

⚠ Deux contradictions dans un même document ne se départagent pas en relisant :
elles se tranchent par l'usage, et c'est l'usage qui a parlé — le front ne
pouvait pas écrire son écran sans savoir laquelle était vraie.

⚠ `410` et non `404` : « cette route a existé et n'existe plus » est une
information juste, là où un 404 ferait chercher une faute de frappe.

### `GET /installation/etat` — publique, sans jeton

```json
{ "requise": true }
```

⚠ **Elle ne rend QUE ce booléen.** Le front doit savoir s'il affiche l'assistant
ou l'écran de connexion ; il n'a pas besoin d'autre chose, et tout ce qu'on
ajouterait ici serait lisible sans jeton. En particulier : ni nom
d'établissement, ni domaine, ni version de la configuration.

⚠ Elle révèle qu'une instance n'est pas initialisée. C'est assumé : sans elle le
front ne peut pas choisir quoi afficher, et le jeton reste la protection.
Throttle : 30/minute.

### ⚠ Comment la session VOYAGE — un en-tête, jamais un cookie

*Manquait au contrat ; relevé par le front le 6 octobre 2026 : « zéro mention
d'en-tête, de `Authorization`, de `Bearer` ou de cookie. Le front ne peut pas
l'implémenter sans ce choix. »*

```
X-Installation-Session: <la valeur rendue par POST /installation/jeton>
```

⚠ **Et pas un cookie**, pour le motif que ce dépôt a déjà payé : un cookie
SURVIT à la fenêtre d'installation, dans un profil de navigateur que personne ne
nettoie — c'est exactement le mode de panne du jeton fabriqué retrouvé deux
jours plus tard, le 9 septembre 2026. Un en-tête ne vit que dans l'onglet qui
l'envoie.

⚠ Les sessions vivent **en mémoire du processus** (`SessionAssistantService`),
donc un redémarrage de l'API les ferme toutes. Le message de `401` le DIT, pour
que l'installateur n'y voie pas une panne : *« un redémarrage de l'API ferme les
sessions en cours : c'est normal, le jeton reste valable »*.

### `POST /installation/jeton` — ouvre une session d'assistant

```json
→ { "jeton": "<32 octets, base64url>" }
← { "sessionAssistant": "<jeton de session, 30 min>", "expireLe": "…" }
```

⚠ **Throttle SÉVÈRE : 5 tentatives par minute et par IP, et 20 au total.** Le
jeton est le seul secret qui protège l'instance pendant sa fenêtre
d'installation ; un essai illimité le rendrait devinable. Au-delà de 20 essais
ratés, l'API **refuse jusqu'à son redémarrage** et le journalise — un
installateur qui se trompe vingt fois ne se trompe pas, il est attaqué.

⚠ Le front échange le jeton d'amorçage contre une **session courte**, pour que
le jeton long ne voyage pas à chaque appel ni ne se retrouve dans un historique
de navigation.

### `GET /installation/constat` — avec session, LECTURE SEULE

Ce que l'environnement porte déjà, et que l'assistant ne peut pas changer :

```json
{
  "appUrl": "https://biblio.exemple.org",
  "domaineServiParCaddy": "biblio.exemple.org",
  "smtp": { "configure": true, "hote": "smtp.exemple.org" },
  "secrets": { "tousForts": true, "manquants": [] },
  "version": "1.0.0-rc1"
}
```

⚠ **`smtp.hote` et jamais `smtp.motDePasse`** — même derrière une session
d'assistant. Un secret qui n'a pas besoin de sortir ne sort pas.

### `GET /installation/modules` — avec session

La liste **lue dans le registre**, jamais recopiée dans le front :
`{ id, libelle, description, noyau, dependances, ecransPerdus }`.

⚠ Le front n'écrit pas cette liste : un module ajouté au registre doit apparaître
dans l'assistant sans toucher au front. C'est « deux tableaux qui se ressemblent
ne sont pas le même tableau » — ici ils décriraient bien la même chose, donc une
seule source.

### `POST /installation/test-courriel` — avec session

```json
→ { "destinataire": "moi@exemple.org" }
← { "envoye": true,  "message": "Le serveur SMTP a ACCEPTÉ le message. Vérifiez votre boîte : accepté n’est pas arrivé." }
← { "envoye": false, "motif": "authentification", "message": "…", "geste": "Corrigez SMTP_USER / SMTP_PASS dans .env.prod, puis redémarrez le conteneur api." }
```

⚠ **200 et non 201** : cette route ne crée rien. Et un échec d'envoi est un
**200 avec `envoye: false`**, jamais un 500 : l'information « ça n'a pas marché,
voici pourquoi » est une réponse réussie à la question posée.

⚠ Throttle : 3/minute. Un test de courriel est un geste rare, et une route
d'envoi ouverte est un relais de pourriel.

### `POST /installation/terminer` — avec session, UNE SEULE FOIS

```json
→ {
    "etablissement": { "nom": "Université d’Exemple", "slug": "uex" },
    "domaine": "biblio.exemple.org",
    "administrateur": { "email": "…", "prenom": "…", "nom": "…" },
    "modulesDesactives": ["rappels"],
    "confirme": true
  }
← {
    "termine": true,
    "lienMotDePasse": "https://…/definir-mot-de-passe?token=…",
    "courrielEnvoye": false,
    "avertissement": "Ce lien n’est affiché qu’une fois…"
  }
```

⚠ **TOUT EN UNE FOIS, côté FRONT.** Un assistant par étapes qui écrit au fil de
l'eau laisse, sur une fenêtre fermée au milieu, une instance à moitié installée.
Le front collecte tout, l'API applique une fois.

#### ⚠ CORRIGÉ LE 6 OCTOBRE 2026 : « dans UNE transaction » était IMPOSSIBLE

Cette ligne disait « et dans UNE transaction ». **Mesuré en codant :** le schéma
`tenant_<slug>` n'est adressable qu'après le **COMMIT** de son DDL — c'est
pourquoi `AdminService.provisionTenant` seede déjà hors transaction, et son
commentaire le dit depuis des mois. Le compte administrateur vit dans ce schéma :
il exige donc une seconde connexion, après le commit.

> ⭐ **La conception annonçait une propriété que le mécanisme ne peut pas tenir.**
> C'est la même faute que les cinq motifs de courriel du chapitre 4 — annoncer
> plus de garantie que le code n'en a — et elle est plus grave ici, parce qu'une
> recette l'aurait « éprouvée » en écrivant un test qui ne peut pas échouer.

**Ce qui est garanti à la place, et c'est un ORDRE, pas une transaction :**

| | Ce qui se fait | Pourquoi dans cet ordre |
|---|---|---|
| **T1** | école + schéma + collection socle *(transactionnel, `public`)* | |
| **T2** | administrateur + jeton de mot de passe *(transactionnel, école)* | |
| **T3** | installation marquée terminée + jeton d'amorçage consommé | ⭐ **en DERNIER** |

> ⭐ **L'ordre EST le dispositif.** Marquer l'installation terminée en T1
> laisserait, sur un échec de T2, une instance **installée sans administrateur et
> un assistant FERMÉ** — c'est-à-dire exactement le défaut que l'assistant existe
> pour résoudre, rendu définitif.

**Et d'où la REPRENABILITÉ** : si l'école existe déjà et n'a pas de compte, un
second appel reprend à T2. Un échec laisse l'assistant ouvert et le jeton valide.

⚠ **LA FORME FAUTIVE, et c'est celle qu'on prendra** : envelopper le tout dans un
`catch` qui **déprovisionne** l'école en cas d'échec. Elle paraît propre — « on
nettoie derrière soi » — et elle **détruit une école sur une erreur passagère**
(un SMTP qui tousse, une connexion coupée). On ne supprime jamais pour réparer un
demi-succès : on reprend.

⚠ **`confirme: true` obligatoire** — second geste explicite, comme pour la
reprise du super-admin. Ce qui suit n'est pas défaisable.

⚠ **`lienMotDePasse` est rendu DANS TOUS LES CAS**, que le courriel soit parti
ou non, et `courrielEnvoye` dit la vérité. C'est le point ③ du chapitre 4 : sans
lui, un échec d'envoi laisse l'administrateur sans aucun chemin vers son compte.

⚠ **Et le jeton d'amorçage est consommé dans la MÊME transaction.** S'il était
invalidé après, un échec entre les deux laisserait un jeton valide sur une
instance installée.

## 6. ✅ Ce qui est ÉPROUVÉ — `scripts/recette-assistant-installation.sh`

**Codé et vert le 6 octobre 2026.** La recette monte un cluster PostgreSQL
jetable, y applique les 44 migrations, **démarre réellement l'API** — donc elle
exerce le graphe d'injection, ce qu'aucun test unitaire ne fait — et mesure
chaque point par son EFFET.

⚠ **Elle portait elle-même un défaut, trouvé par son propre contrôle** : `env -i`
nettoie l'environnement du PROCESSUS, mais l'application lit `../../.env` depuis
le DISQUE. La première version mesurait donc une instance avec le SMTP de
développement, et son contrôle du motif `smtp_absent` **accusait le produit**.
Un témoin d'isolation est désormais posé : la recette vérifie dans le journal
que l'API tourne bien sans SMTP avant de conclure quoi que ce soit.

Chacun de ces points est une recette, pas une relecture :

| À éprouver | Comment |
|---|---|
| sans jeton, **rien** ne passe | appeler les six routes sans session → 401 ; `etat` seule → 200 |
| le jeton est à usage unique | terminer, puis rejouer le même jeton → refus |
| installation terminée → `410` | les routes disparaissent, et le disent |
| le throttle mord | 21 essais ratés → refus jusqu'au redémarrage, et journalisé |
| ⭐ l'échec est REPRENABLE | faire échouer la création de l'admin → l'école existe, l'assistant reste OUVERT, le jeton reste valide, et un second appel ABOUTIT |
| ⭐ le test de courriel dit la vérité | sans `SMTP_HOST` → `smtp_absent` ; avec un hôte injoignable → `smtp_error` **plus le message du serveur** |
| ⭐ sans SMTP, le lien est affiché | terminer sans `SMTP_HOST` → `lienMotDePasse` présent, `courrielEnvoye: false` |
| le jeton n'est pas dans la base en clair | lire `public.installation` → un haché |
| une sauvegarde restaurée ne rouvre pas l'assistant | restaurer une base installée → `requise: false` |

## 7. ✅ La décision de produit est TRANCHÉE (6 octobre 2026)

> **Jean, 6 octobre 2026 : « ta recommandation — le SMTP reste dans .env.prod
> pour la V1. Ton argument décide : en base, le mot de passe part dans chaque
> sauvegarde, et sans redémarrage il ne s'appliquerait pas. »**

Ce qui suit est donc la décision, et non plus une question ouverte. Le coût
assumé est écrit à la fin : l'installateur édite `.env.prod` et redémarre `api`
pour le courriel — l'assistant lui dit quoi écrire, et son test lui dit quand
c'est bon.

### L'argument, conservé parce qu'il sera rouvert un jour

**Les réglages SMTP doivent-ils passer en BASE ?** Aujourd'hui ils sont dans
l'environnement, donc l'assistant ne peut que les CONSTATER.

**Ma recommandation : les laisser dans `.env.prod` pour la V1.** Deux raisons :

1. un mot de passe SMTP en base part dans **chaque sauvegarde**, et il est
   lisible par quiconque atteint la base — un fichier à permissions restreintes
   est un meilleur endroit pour un secret ;
2. l'assistant ne peut pas redémarrer l'API, donc un réglage écrit en base ne
   serait pas appliqué sans un geste de l'installateur — c'est-à-dire sans
   l'étape qu'on cherchait à lui épargner.

⚠ Le coût assumé : l'installateur doit éditer `.env.prod` et redémarrer `api`
pour le courriel. L'assistant lui dit exactement quoi écrire, et son test lui dit
quand c'est bon.
