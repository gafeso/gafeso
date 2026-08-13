# Installer et exploiter Gafeso

Ce document mène d'un serveur nu à une bibliothèque en ligne, puis vous
accompagne dans l'exploitation courante : sauvegardes, mises à jour, journaux,
diagnostic des pannes.

Il s'adresse à **la personne qui administre le serveur**. Aucune connaissance
préalable de Gafeso n'est supposée. Les notions techniques sont expliquées à
mesure ; les commandes sont données en entier, à copier telles quelles.

> **Ce que ce document ne couvre pas.** L'usage quotidien de la bibliothèque
> (cataloguer, prêter, gérer les lecteurs) est dans le
> [guide du bibliothécaire](GUIDE-BIBLIOTHECAIRE.md). L'architecture interne et
> les tâches de développement (écrire une migration, changer de moteur de
> recherche, API d'administration) sont dans [DEPLOY.md](../DEPLOY.md).

---

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Installation](#2-installation)
3. [Après l'installation](#3-après-linstallation)
4. [Exploitation courante](#4-exploitation-courante)
5. [Diagnostic — symptôme, cause, vérification](#5-diagnostic--symptôme-cause-vérification)
6. [Limites de ce document](#6-limites-de-ce-document)

---

## 1. Prérequis

### 1.1 Le serveur

| | Minimum | Confortable |
|---|---|---|
| RAM | 2 Go (avec Meilisearch) | 4 Go |
| Disque libre | 5 Go | 20 Go et plus selon vos documents numériques |
| Système | Linux avec accès `sudo` | Debian 12 / Ubuntu 22.04 ou 24.04 |

Si vous envisagez Elasticsearch au lieu de Meilisearch, comptez **4 Go de RAM
au minimum** : Elasticsearch en réclame 2 à 4 pour lui seul. En cas de doute,
gardez Meilisearch — c'est le choix par défaut, il consomme environ 100 Mo, et
il couvre les besoins d'une bibliothèque universitaire.

### 1.2 Docker

Gafeso s'exécute entièrement en conteneurs. Il vous faut **Docker Engine 24 ou
plus** et le **plugin Docker Compose v2** :

```bash
docker compose version
# → Docker Compose version v2.x.x
```

Si la commande échoue, l'installateur vous proposera d'installer Docker via le
script officiel. **N'installez pas le paquet `docker.io` de Debian ou Ubuntu** :
il fournit un moteur sans le plugin Compose v2, et l'installation échouera plus
loin sans que la cause soit évidente.

### 1.3 Un domaine, et les trois enregistrements DNS

C'est le prérequis le plus souvent négligé, et **la première cause d'échec
d'installation**.

Gafeso a besoin de **trois sous-domaines**, tous pointant vers l'adresse IP de
votre serveur :

| Sous-domaine | À quoi il sert |
|---|---|
| `biblio.mon-ecole.org` | l'application : vitrine, catalogue, back-office |
| `api.biblio.mon-ecole.org` | l'API, appelée directement par l'application mobile |
| `storage.biblio.mon-ecole.org` | les couvertures et les fichiers numériques |

Créez trois enregistrements **A** (ou **AAAA** en IPv6) chez votre hébergeur
DNS, **avant de lancer l'installation**. La raison est concrète : Caddy, le
serveur web intégré, demande les certificats HTTPS à Let's Encrypt au premier
démarrage. Let's Encrypt vérifie que les domaines pointent bien vers votre
serveur. S'ils ne pointent nulle part, il refuse, et vous obtenez une
installation complète mais **inaccessible en HTTPS**.

Vérifiez avant de commencer :

```bash
dig +short biblio.mon-ecole.org api.biblio.mon-ecole.org storage.biblio.mon-ecole.org
```

Les trois lignes doivent afficher l'IP de votre serveur. Si l'une est vide,
attendez : la propagation DNS prend de quelques minutes à 24 heures selon
l'hébergeur.

Les ports **80** et **443** doivent être libres et ouverts dans le pare-feu.

### 1.4 Une boîte mail d'envoi

Gafeso envoie des courriels : liens d'activation de compte, réinitialisation de
mot de passe, rappels d'échéance. Sans SMTP configuré, **ces messages ne partent
pas** — l'application fonctionne, mais un lecteur qui oublie son mot de passe
reste bloqué.

Il vous faut un compte chez un fournisseur de messagerie : votre hébergeur
habituel, ou un service d'envoi (Brevo, Mailjet, Infomaniak, Gmail…). Munissez-
vous de **quatre informations** : l'hôte, le port, l'utilisateur et le mot de
passe.

> **⚠ L'hôte SMTP est celui de votre FOURNISSEUR, pas votre domaine.**
> C'est la confusion la plus coûteuse de cette installation, et elle est
> détaillée au [§2.3](#23-la-question-smtp--lisez-ceci-avant-de-répondre).

Vous pouvez répondre « plus tard » à l'installateur et configurer le SMTP
ensuite. Ce n'est pas un raccourci honteux : mieux vaut une installation qui
marche et des mails désactivés proprement qu'un SMTP à moitié configuré.

---

## 2. Installation

### 2.1 La commande

```bash
git clone <url-du-dépôt> gafeso
cd gafeso
./install.sh
```

Comptez environ un quart d'heure, dont l'essentiel en construction des images
Docker à la première exécution.

Pour un **essai sans domaine ni certificat**, répondez `localhost` à la première
question : l'application est alors servie en HTTP simple sur ce serveur.

### 2.2 Les questions, et ce que chacune attend

L'installateur pose six questions. Voici ce que chacune signifie.

**Domaine principal.** Le sous-domaine de l'application, sans `https://` ni
barre oblique finale — par exemple `biblio.mon-ecole.org`. Les deux autres
sous-domaines (`api.` et `storage.`) en sont déduits automatiquement ; vous
n'avez pas à les saisir, mais ils doivent exister en DNS (voir §1.3).

**Email de l'administrateur.** Une **vraie adresse que vous relevez**. Elle
sert à deux choses : Let's Encrypt y enverra les alertes d'expiration de
certificat, et c'est l'identifiant du compte super-administrateur de la
plateforme. Une adresse fantaisiste vous coupera de votre propre installation
le jour d'un mot de passe oublié.

**Moteur de recherche.** Laissez `meilisearch` sauf raison précise.

**SMTP.** Voir §2.3 juste après — ne répondez pas avant de l'avoir lu.

**Nom du premier établissement.** Le nom affiché aux lecteurs, en toutes
lettres : « Bibliothèque Universitaire Centrale ».

**Identifiant court (slug).** Un identifiant technique en minuscules sans
accents ni espaces, proposé automatiquement à partir du nom. Il apparaît dans
certaines URL et **ne se change pas facilement ensuite** : préférez court et
stable (`buc`) à long et descriptif.

**Couleur principale.** Au format `#RRGGBB`. Elle habille la vitrine et le
catalogue aux couleurs de l'établissement, et se modifie plus tard dans les
paramètres.

Aucun secret ne vous est demandé : mots de passe PostgreSQL et MinIO, clé JWT,
clé d'API d'administration et mot de passe super-admin sont **tirés au hasard**
par l'installateur, écrits dans `.env.prod` (permissions `600`) et **affichés
une seule fois** à la fin. Notez-les à ce moment-là.

### 2.3 La question SMTP — lisez ceci avant de répondre

Trois pannes réelles se sont produites ici, chacune avec un symptôme qui accuse
la mauvaise pièce. Les connaître fait gagner des heures.

#### Piège 1 — l'hôte : celui du fournisseur, jamais votre domaine

Il est tentant de répondre `mon-ecole.org` à la question « hôte SMTP ». Et le
plus cruel est que **ça répond** : le port 587 de votre domaine est souvent
ouvert, parce que c'est votre hébergement web. Mais son certificat TLS ne
couvre pas ce service : la poignée de main échoue, et **aucun message ne part,
alors que toute la configuration semble correcte**.

La bonne valeur se lit dans l'enregistrement MX de votre domaine :

```bash
dig +short MX mon-ecole.org
```

Exemples de valeurs correctes : `smtp.gmail.com`, `smtp-relay.brevo.com`,
`mail.infomaniak.com`.

#### Piège 2 — le port et le mode TLS vont ensemble

| Port | Mode | À répondre |
|---|---|---|
| 587 | STARTTLS | le plus courant |
| 465 | TLS implicite | si votre fournisseur l'impose |

Une installation avait retenu le mode TLS implicite sur le port 587. Le serveur
répondait `535 Incorrect authentication data`. Les identifiants étaient
pourtant justes — **le message d'erreur accusait le mot de passe quand la cause
était le mode TLS**. L'installateur déduit désormais le mode du port et l'écrit
explicitement dans `.env.prod`, mais si vous éditez ce fichier à la main,
gardez la paire cohérente.

#### Piège 3 — l'adresse d'expédition appartient au compte SMTP

L'adresse qui apparaît dans le champ « De : » doit appartenir au **domaine du
compte SMTP**, pas au domaine de votre installation.

Cas vécu : compte SMTP `no-reply@gafeso.org`, installation sur
`demo.gafeso.org`, expéditeur écrit `no-reply@demo.gafeso.org`. Le serveur
authentifie la connexion, **l'accepte**, puis jette le message parce que
l'expéditeur ne lui appartient pas. Le journal de l'application affiche
« Email envoyé ». **Rien n'arrive, et rien ne le dit.**

L'installateur propose une valeur déduite de votre utilisateur SMTP quand
celui-ci est une adresse email. Beaucoup de fournisseurs donnent à la place un
identifiant technique : dans ce cas, saisissez l'adresse vous-même.

À la fin, l'installateur **tente un envoi réel** et vous dit ce qu'il obtient.
Ce test avertit mais ne bloque jamais : une installation ne doit pas échouer
parce qu'un fournisseur de mail est momentanément indisponible.

### 2.4 Mode non-interactif

Pour automatiser (Ansible, cloud-init) :

```bash
cp install.conf.example install.conf
$EDITOR install.conf
./install.sh --config install.conf
```

Les secrets restent générés automatiquement — ils ne figurent jamais dans
`install.conf`. Le mode non-interactif applique **les mêmes garde-fous** que le
mode interactif, y compris le test d'envoi SMTP.

Autres options utiles :

| Option | Effet |
|---|---|
| `--force` | réécrase un `.env.prod` existant (**garde les données**) |
| `--skip-dns-check` | poursuit malgré un DNS non conforme |
| `--install-docker` | installe Docker sans poser la question |
| `--http-port` / `--https-port` | ports différents (derrière un répartiteur de charge) |

---

## 3. Après l'installation

### 3.1 Vérifier que tout fonctionne

Trois adresses à ouvrir :

| Adresse | Ce que vous devez voir |
|---|---|
| `https://biblio.mon-ecole.org` | la vitrine, aux couleurs de l'établissement |
| `https://biblio.mon-ecole.org/opac` | le catalogue, avec les quelques notices du socle |
| `https://biblio.mon-ecole.org/login` | la page de connexion |

Et l'état des services :

```bash
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml ps
```

Toutes les lignes doivent afficher `healthy` (ou `running` pour `caddy`, qui
n'a pas de sonde). Exemple d'une installation saine :

```
SERVICE       STATUS
api           Up 21 hours (healthy)
caddy         Up 21 hours
db            Up 21 hours (healthy)
meilisearch   Up 21 hours (healthy)
minio         Up 21 hours (healthy)
redis         Up 21 hours (healthy)
web           Up 21 hours (healthy)
```

### 3.2 Les trois gestes à ne pas remettre à plus tard

**Noter les identifiants.** Ils s'affichent une seule fois. Le mot de passe
super-admin n'est pas récupérable : il faudrait le réinitialiser en base.

**Activer la double authentification** sur le compte administrateur, dès la
première connexion : *Mon compte → Sécurité*.

**Mettre les sauvegardes en place** (§4.1). Une installation sans sauvegarde
est une installation qui attend son incident.

### 3.3 Le premier établissement

L'installateur a déjà provisionné l'établissement que vous avez nommé, avec un
socle utilisable : les catégories standard, des règles de circulation, quelques
classes et notices d'exemple. Le lien d'activation du compte administrateur de
l'établissement est affiché en fin d'installation — **il est valable 24 heures
et à usage unique**.

Si ce lien expire avant que vous l'utilisiez, il se régénère depuis le
back-office : *Administration → Comptes → le compte → Lien d'activation*.

---

## 4. Exploitation courante

Toutes les commandes de cette section se lancent **depuis la racine du dépôt**,
là où se trouve `.env.prod`.

Pour alléger, définissez une fois par session :

```bash
COMPOSE="docker compose --env-file .env.prod -f docker/docker-compose.prod.yml"
```

### 4.1 Sauvegardes

Il y a **deux sources de vérité à sauvegarder ensemble** :

1. **PostgreSQL** — le catalogue, les comptes, les prêts, les réglages ;
2. **MinIO** — les couvertures et les **documents numérisés**. Ces fichiers ne
   sont **pas** dans le dump PostgreSQL. Sauvegarder la base seule vous
   laisserait un catalogue qui décrit des documents disparus.

```bash
./scripts/backup/backup.sh                  # → ./backups/
./scripts/backup/backup.sh /mnt/sauvegardes # destination personnalisée
```

Automatiser, en tâche `cron` quotidienne à 2 h du matin :

```cron
0 2 * * *  cd /chemin/gafeso && ./scripts/backup/backup.sh >> /var/log/gafeso-backup.log 2>&1
```

**Copiez ces archives hors du serveur.** Une sauvegarde sur le même disque que
les données ne protège pas d'une panne matérielle ni d'un serveur perdu.

#### Vérifier qu'une sauvegarde n'est pas vide

Ce paragraphe existe parce que le problème s'est produit : un fichier de dump
de **zéro octet** est resté un mois dans ce dépôt sans que personne le
remarque. La commande s'était terminée sans erreur, le fichier existait, la
ligne de journal était verte.

**Le script vérifie désormais lui-même ce qu'il produit** et refuse de se
terminer en silence. Trois contrôles, dans cet ordre :

1. **Le volume MinIO doit exister avant d'être archivé.** Ce n'est pas une
   précaution théorique : `docker run -v nom_inexistant:/data:ro … tar czf`
   ne proteste pas — Docker **crée** le volume manquant à la volée et produit
   une archive parfaitement valide de 87 octets, contenant zéro fichier, avec
   un code de sortie 0. C'est ce qui arrive quand le préfixe de projet ne
   correspond pas à l'installation en service.
2. **Chaque archive est relue après écriture**, pas seulement pesée — un dump
   tronqué peut peser plusieurs mégaoctets. Le script cherche l'en-tête
   `PostgreSQL database dump`, compte les ordres SQL, et liste l'archive MinIO.
3. **Une archive invalide est supprimée et la rotation n'a pas lieu.** Laisser
   le fichier douteux créerait un faux positif de plus ; supprimer les
   anciennes sauvegardes reviendrait à échanger un jeu valide contre rien.

Une sauvegarde saine affiche des chiffres réels :

```
→ Sauvegarde PostgreSQL (gafeso)…
  ✔ backups/db_2026-08-12_225125.sql.gz  (44368 o, 415 ordres SQL)
→ Sauvegarde des objets MinIO (volume gafeso-prod_minio_data)…
  ✔ backups/minio_2026-08-12_225125.tar.gz  (44044 o, 159 entrées)
✔ Sauvegarde vérifiée et terminée (rétention 14 j) : backups
```

Si quelque chose cloche, le script **échoue en code 1**, supprime l'archive
douteuse — la laisser créerait un faux positif de plus — et **ne fait pas la
rotation**, pour ne jamais échanger d'anciennes sauvegardes valides contre
rien.

> **Les archives produites avant août 2026 n'ont bénéficié d'aucun contrôle.**
> Le script ne vérifiait alors rien : il pouvait écrire une archive vide et
> sortir en succès. Si votre dossier de sauvegardes contient des fichiers
> antérieurs, **ne les supposez pas valides** — contrôlez-les une fois à la
> main, avec la procédure ci-dessous. C'est aussi vrai de toute archive
> produite par un autre moyen (un `pg_dump` lancé à la main avant une
> migration, par exemple).

Pour contrôler **une archive ancienne**, à la main :

```bash
# 1. Taille : un gzip vide pèse 20 octets, une archive tar.gz vide 87.
ls -l backups/

# 2. Le dump contient-il vraiment du SQL ?
gzip -dc backups/db_2026-08-12_225125.sql.gz | head -5
# → doit commencer par « -- PostgreSQL database dump »

# 3. Combien d'ordres SQL ?
gzip -dc backups/db_2026-08-12_225125.sql.gz | grep -c -E '^(CREATE|COPY|INSERT|ALTER) '
# → un nombre à trois chiffres au moins sur une bibliothèque en service

# 4. L'archive MinIO contient-elle des fichiers ?
tar tzf backups/minio_2026-08-12_225125.tar.gz | head
```

Une archive MinIO vide est **normale sur une installation neuve** où aucun
document n'a été téléversé. Elle est **anormale** si votre bibliothèque a des
documents numériques : dans ce cas, vérifiez que le volume sauvegardé est bien
celui de l'installation en service.

#### Restaurer

> ⚠ Une restauration **écrase** les données en place. Arrêtez l'application
> (`api`, `web`) avant de commencer.

La procédure complète est dans
[`scripts/backup/README.md`](../scripts/backup/README.md). En résumé :
restaurer le dump PostgreSQL avec `psql`, remplacer le contenu du volume MinIO,
redémarrer, puis **réindexer la recherche** — l'index n'est pas dans la
sauvegarde et se reconstruit depuis la base.

### 4.2 Mettre à jour

```bash
git pull
$COMPOSE up -d --build
```

Les migrations de base de données s'appliquent automatiquement au démarrage de
l'`api`.

> **Une exception à connaître : le fichier `docker/Caddyfile`.** Il est monté
> dans le conteneur, pas copié dans l'image. `up -d --build` ne redémarre donc
> **pas** Caddy si seul ce fichier a changé — il n'y a rien à reconstruire, et
> le conteneur continue de servir l'ancienne configuration. Après toute
> modification du Caddyfile :
>
> ```bash
> $COMPOSE restart caddy
> ```

### 4.3 Consulter les journaux

```bash
$COMPOSE logs -f api          # un service en particulier, en continu
$COMPOSE logs --tail=200 web  # les 200 dernières lignes
$COMPOSE logs                 # tout
```

L'`api` et le `web` écrivent des messages de diagnostic explicites quand une
dépendance manque. Ils valent d'être lus avant de chercher plus loin.

### 4.4 Redémarrer, arrêter — et l'erreur à ne pas commettre

```bash
$COMPOSE restart          # redémarre tous les services
$COMPOSE restart api      # un seul service
$COMPOSE down             # arrête et supprime les conteneurs — LES DONNÉES RESTENT
$COMPOSE up -d            # redémarre
```

> ## ⚠ N'utilisez JAMAIS `docker compose down -v`
>
> L'option **`-v`** ne se contente pas d'arrêter les conteneurs : elle
> **supprime les volumes**, c'est-à-dire **toutes vos données, définitivement
> et sans confirmation**.
>
> Ce qui disparaît :
>
> | Volume | Ce qu'il contient |
> |---|---|
> | `<projet>_db_data` | **tout le catalogue**, les comptes, les prêts, l'historique |
> | `<projet>_minio_data` | **les documents numérisés** et les couvertures |
> | `<projet>_meili_data` | l'index de recherche |
> | `<projet>_caddy_data` | les certificats HTTPS |
>
> Il n'y a **pas de corbeille** et **pas d'annulation**. Sans sauvegarde
> externe, la bibliothèque est perdue.
>
> Le danger tient à ce que `-v` est le réflexe naturel : c'est ce qu'on tape
> quand « on veut repartir proprement », et c'est ce que suggèrent beaucoup de
> réponses trouvées en ligne pour des piles de développement — où le volume ne
> contient rien d'important.
>
> **Pour redémarrer proprement, sans rien perdre :**
>
> ```bash
> $COMPOSE down          # sans -v
> $COMPOSE up -d
> ```
>
> **Pour repartir vraiment de zéro**, en connaissance de cause : faites d'abord
> une sauvegarde (§4.1), vérifiez-la, **copiez-la hors du serveur**, et
> seulement ensuite utilisez `-v`.

---

## 5. Diagnostic — symptôme, cause, vérification

Chaque ligne correspond à une panne **réellement rencontrée** sur ce projet.
Les symptômes sont écrits tels qu'on les observe, pas tels qu'on les
comprendrait après coup.

| Symptôme | Cause | Vérification |
|---|---|---|
| L'installation se termine, mais le site est **inaccessible en HTTPS** ; Caddy tourne en boucle sur les certificats | Les trois enregistrements DNS n'existaient pas, ou pas encore propagés, au moment où Let's Encrypt a vérifié | `dig +short <domaine> api.<domaine> storage.<domaine>` — les trois doivent renvoyer l'IP du serveur. Puis `$COMPOSE restart caddy` |
| **Aucun mail ne part**, mais le journal affiche « Email envoyé » | L'adresse d'expédition n'appartient pas au domaine du compte SMTP : le serveur accepte puis jette le message | `grep MAIL_FROM .env.prod` — le domaine doit être celui du compte SMTP, pas celui de l'installation |
| `535 Incorrect authentication data` alors que les identifiants sont bons | Mode TLS incohérent avec le port (implicite sur 587) | `grep -E 'SMTP_(PORT|SECURE)' .env.prod` — 587 va avec `false`, 465 avec `true` |
| Le SMTP « répond » mais rien n'arrive jamais | L'hôte saisi est le domaine du client, pas celui du fournisseur : le port répond (hébergement web) mais le certificat ne couvre pas le service | `dig +short MX <domaine>` donne l'hôte attendu |
| **Page blanche** sur le domaine, message « Tenant non résolu » | L'établissement n'est pas résolu : le `Host` reçu ne correspond à aucun domaine enregistré | `$COMPOSE logs api \| grep "Aucune école"` — le journal affiche le `Host` exact reçu, à comparer au domaine enregistré (attention aux espaces, à la casse, au sous-domaine) |
| La vitrine s'affiche **réduite au minimum**, sans le nom ni les statistiques de l'établissement, alors que le reste fonctionne | Le conteneur `web` n'a pas d'`API_URL` au démarrage : le rendu serveur de l'accueil ne peut pas joindre l'API | `$COMPOSE exec web printenv API_URL` → doit afficher `http://api:4000`. Sinon : `$COMPOSE logs web \| grep server-api` |
| La **lecture en ligne** échoue avec `SignatureDoesNotMatch` | Le `Caddyfile` a été modifié mais Caddy n'a pas redémarré (fichier monté, pas reconstruit) | `$COMPOSE exec caddy cat /etc/caddy/Caddyfile \| grep "header_up Host"` puis `$COMPOSE restart caddy` |
| Le conteneur **`web` reste `unhealthy`** alors que ses journaux affichent « Ready » | En Alpine, `localhost` résout en IPv6 d'abord, alors que le serveur n'écoute qu'en IPv4 : la sonde est refusée | `$COMPOSE exec web wget -qO- http://127.0.0.1:3000/` fonctionne, `http://localhost:3000/` échoue. La sonde doit viser `127.0.0.1` |
| L'**application mobile** dit qu'elle ne trouve aucun serveur à cette adresse | Le descripteur de connexion est absent ou mal formé sur le domaine scanné | `curl https://<domaine>/.well-known/gafeso.json` — doit renvoyer un JSON contenant l'adresse de l'API |
| Le **téléversement d'un PDF** échoue en erreur 500 | Un octet nul dans les métadonnées du fichier, rejeté par PostgreSQL | `$COMPOSE logs api \| grep "Pré-remplissage"` — le fichier est conservé, seules les métadonnées sont ignorées |
| `port is already allocated` sur 80 ou 443 | Un autre serveur web (Apache, nginx) occupe déjà le port | `sudo ss -ltnp \| grep -E ':(80\|443)'`. Libérez-le, ou installez avec `--http-port` / `--https-port` |
| `.env.prod existe déjà` | Une installation est déjà présente ; l'installateur refuse d'écraser vos secrets | Relancez avec `--force` (**conserve les données**). Voir l'avertissement du §4.4 avant d'envisager `-v` |
| Un service reste `unhealthy` au démarrage | Le plus souvent : la base n'est pas encore prête (patientez), ou un secret manque dans `.env.prod` | `$COMPOSE logs <service>` |

---

## 6. Limites de ce document

Ce que ce document **ne garantit pas**, et qu'il vaut mieux savoir :

- **Il décrit une installation mono-serveur.** La répartition sur plusieurs
  machines, la réplication PostgreSQL et la haute disponibilité ne sont ni
  documentées ni testées.
- **La procédure de restauration est documentée mais n'a pas été éprouvée sur
  un incident réel.** Faites un essai de restauration sur un serveur de test
  avant d'en avoir besoin — c'est le seul moyen de savoir qu'elle fonctionne
  chez vous. Une sauvegarde jamais restaurée est une hypothèse.
- **Le tableau de diagnostic recense les pannes rencontrées**, pas toutes les
  pannes possibles. Un symptôme absent de ce tableau n'est pas un symptôme
  impossible.
- **La montée de version de PostgreSQL** (par exemple 16 → 17) n'est pas
  couverte : elle demande un dump et un rechargement, pas un simple
  `docker compose up`.

---

**Documents liés** — [guide du bibliothécaire](GUIDE-BIBLIOTHECAIRE.md) ·
[fonctionnement technique](fonctionnement.md) ·
[sécurité de la lecture hors-ligne](architecture-securite-offline.md) ·
[sauvegardes et restauration](../scripts/backup/README.md)
