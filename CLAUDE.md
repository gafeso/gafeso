# Gafeso — règles permanentes des sessions

Plateforme documentaire multi-établissements, AGPL, éditée par RESURGITECH.
Monorepo : `apps/api` (NestJS), `apps/web` (Next.js), `apps/mobile` (Flutter),
`docker/`, `scripts/`, `install.sh`.

Ce fichier porte ce qui ne change pas d'un lot à l'autre. Les consignes reçues
en session portent la décision du jour, pas ces règles-ci : elles s'appliquent
sans être rappelées.

---

## 1. Mesurer, pas lire

Une conclusion tirée de la lecture du code est une **hypothèse**, pas un fait.
Elle se dit comme telle : « lu, pas mesuré ».

**Mesurer par le vrai chemin**, celui qu'emprunte l'utilisateur :

| Ce qu'on croit mesurer | Ce qu'il faut |
|---|---|
| un service répond | depuis l'**hôte**, pas depuis le conteneur |
| une page est accessible | `curl` **sans cookie** |
| un document se lit | dans un **navigateur**, en croisant l'origine |
| un QR encode la bonne chaîne | **décoder le tracé dessiné**, pas relire le code |

Une mesure prise depuis l'intérieur du système ne dit rien du dehors. Trois
pannes graves l'ont prouvé : une lecture depuis le conteneur voyait `200` quand
le navigateur recevait un refus ; une suite de tests verte cachait une étiquette
qui menait à l'écran de connexion ; un `status 200` en base masquait douze jours
sans un seul document servi.

## 2. Tout garde a un contrôle négatif qui mord

Un garde qui n'est jamais tombé ne garde rien. Avant de déclarer un garde
valide : **casser délibérément ce qu'il surveille et vérifier qu'il tombe**, en
nommant le cas.

Pièges mesurés, à ne pas refaire :

- un garde qui **recalcule** au lieu de **lire** se compare à lui-même ;
- une constante figée s'accorde **par coïncidence** avec sa propre valeur :
  `expect(COTE).toBe(14)` passe sur un 14 écrit à la main. Seul un instrument
  qui **lit la source** ou **observe l'effet** les sépare ;
- un relevé textuel satisfait par un **commentaire** ne mesure rien :
  dépouiller les commentaires, ou préférer un garde d'effet. **Et la règle vaut
  dans les deux sens** : un relevé peut aussi *accuser* par un commentaire, et
  punir celui qui documente pourquoi il fait bien. Mesuré : un garde refusait la
  forme `if (!joignable) return` et accusait l'épreuve dont le commentaire
  citait cette forme pour expliquer qu'elle ne l'emploie pas ;
- une doublure qui porte elle-même la borne qu'elle teste rend l'épreuve verte
  avec comme sans le défaut.
- **la position dans le fichier n'est pas l'ordre d'exécution.** Un garde qui
  compare deux `indexOf` dans une source mesure l'ordre des OCTETS. Extraire
  une fonction la déplace sans rien changer à ce qui s'exécute : le garde tombe
  alors sur du code correct. L'ordre se lit là où il existe — la suite des
  appels, le journal, l'effet.

## 3. Populations dérivées, jamais déclarées

Une liste écrite à la main dérive du réel sans que personne ne le voie. La
population d'un garde se **dérive** de la source (fichiers du dépôt, services du
compose, régions d'un document).

Mesuré : `services="db meilisearch minio api web caddy"` dans `install.sh` a
survécu à la disparition de MinIO et à l'arrivée de Garage. L'installation
attendait 900 s un service absent, et n'attendait jamais le vrai.

## 4. Un attendu nomme sa source, jamais une valeur

Dans une procédure, le résultat attendu se dérive de ce qui le produit :

```bash
echo "$GAFESO_VERSION"
curl -sS https://$API_DOMAIN/health | grep -o "\"version\":\"$GAFESO_VERSION\""
```

Un document qui publie une **valeur** meurt à la première mutation. Une
`DEPLOY.md` attendant `v1.0.0-rc14` en dur aurait déclenché un arrêt au moment
le moins réversible d'une bascule de stockage.

## 5. Une seule dérivation, jamais deux copies qui s'accordent

Deux implémentations qui rendent la même valeur s'accordent **jusqu'au jour où
l'une bouge**. Quand une valeur est partagée, une seule la produit, les autres
la consomment. Pas de repli « au cas où » : un repli silencieux est une
divergence qui attend son heure.

Si la suppression est impossible aujourd'hui, la divergence est **déclarée et
gardée**, jamais tue. Une divergence déclarée est une dette suivie ; une
divergence tue est un piège.

## 6. Un contrôle qui n'a pas pu mesurer ne dit jamais « bon »

Trois issues distinctes, trois codes de sortie : **conforme**, **non conforme**,
**indécidable**. Un `|| echo "tout va bien"` qui se déclenche sur une connexion
refusée est un faux silencieux.

De même pour un message d'erreur : distinguer « le serveur a refusé » de « on
n'a pas pu joindre le serveur ». Quand on ne sait pas, on le dit.

## 7. Un garde qui dérange se réécrit, il ne se fait pas taire

- `--no-verify` est **interdit**, sans exception.
- Un garde qui bloque à raison se corrige **en amont**, pas en l'assouplissant.
- Un garde qui accuse du code correct se **resserre**, il ne se supprime pas.

## 8. Dire ce qu'on n'a pas fait

Chaque rapport nomme explicitement ce qui n'a **pas** été mesuré, ce qui reste
dû, et ce qui a été supposé. Un texte qui décrit une protection est un test qui
n'a jamais été écrit.

Signaler ses propres erreurs avant qu'on les trouve vaut mieux que de les avoir
évitées : c'est ce qui rend le reste du rapport croyable.

---

## 9. Décisions réservées

**À Jean, et à lui seul :**

| | |
|---|---|
| Toute publication | Release GitHub, Play Store, et l'étiquette v1.0.0 |
| Toute suppression | fichiers, volumes, données, conteneurs |
| Toute dépense | serveurs, services, matériel |
| `demo.gafeso.org` | **aucune session n'y touche jamais** — Jean seul y agit, sous dictée du responsable |

Un instantané public de travail et son étiquette `rc` relèvent du responsable,
pas de Jean. Une release annonce une version au monde ; un instantané fait
avancer le dépôt.

**Au responsable :** arbitrages de périmètre, formats d'échange entre sessions,
choix de conception irréversibles, contenu d'un instantané.

Une consigne du responsable est une **décision**, jamais une interdiction de
mesurer. Si la mesure la contredit, mesurer et le dire — c'est la conduite
attendue, pas une désobéissance.

## 10. Sécurité et dépôt public

Le dépôt est **public et AGPL**. N'y entrent jamais :

- un secret, une clé, un mot de passe, même d'essai ;
- le contenu de `.env.prod`, ni dans un fichier ni dans un rapport ;
- le nom d'un client ou d'un établissement réel, sous quelque forme que ce
  soit — le publieur le refuse mécaniquement ;
- une archive, ou un fichier de plus de 5 Mo ;
- un contenu sous droit d'auteur dans les démonstrations ;
- le nom d'une université réelle associé à des documents fictifs.

Les mots de passe se saisissent par `read -s` et se passent par variable
d'environnement. Jamais dans une ligne de commande, jamais dans un rapport.

## 11. Passation entre sessions

Les sessions ne communiquent plus par Jean. Elles écrivent dans le dépôt.

```
docs/passation/<destinataire>/AAAA-MM-JJ-<sujet>.md
docs/passation/archive/
```

`<destinataire>` ∈ `api`, `web`, `mobile`, `responsable`.

Chaque note porte quatre sections, dans cet ordre :

```
CONSTAT MESURÉ   — le fait, avec la commande ou l'épreuve qui l'établit
NON MESURÉ       — ce qui est lu, supposé, ou pas vérifié
CE QUE ÇA IMPLIQUE
CE QUE JE DEMANDE — précis, et à qui
```

Règles :

- **ne jamais écrire une conclusion sur le code d'une autre session sans la
  mesure qui la soutient.** Une conclusion tirée d'une lecture a déjà déclenché
  du travail inutile chez une autre session, deux fois ;
- au début d'un lot, lire son propre dossier ; à la fin, déplacer dans
  `archive/` ce qui est traité, en disant ce qu'on en a fait ;
- ne remonter au responsable que les **décisions réservées** et les faits qui
  changent le périmètre. Le reste se règle entre sessions.

## 12. Périmètres

| Session | Modifie | Lit |
|---|---|---|
| `api` | `apps/api`, `docker/`, `scripts/`, `install.sh`, `DEPLOY.md` | tout |
| `web` | `apps/web` | tout |
| `mobile` | `apps/mobile` | tout |

Toute session peut **lire** le dépôt entier, et le doit avant d'accuser une
autre. Un lot transversal s'annonce en passation avant de commencer.

## 13. Rapport au responsable

Court, mesuré, dans cet ordre : ce qui est **fait et prouvé**, ce qui a été
**trouvé** (y compris ses propres défauts), ce qui reste **dû**, la **décision
attendue** s'il y en a une. Les chiffres viennent d'une mesure ou ne viennent
pas. Ne jamais conclure « vert de bout en bout » sur un parcours qu'on n'a pas
joué.
