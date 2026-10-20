# Gafeso v1.0.0 — notes de version (BROUILLON, à valider)

*Première version stable. Sort ENSEMBLE : API, web, et application mobile
v1.0.0. Public visé : l'exploitant qui installe ou met à jour une instance.*

## Nouveautés

**Installation et exploitation**
- Assistant d'installation au premier démarrage (jeton d'amorçage, écran
  dédié) : plus besoin de créer le premier compte administrateur à la main.
- La version qui tourne s'affiche partout (pied de page public, coque
  d'administration) — lue depuis l'étiquette git, jamais depuis un fichier
  qui peut mentir.
- Refus mécanique au démarrage si la base porte des documents numériques et
  que le stockage est vide ou injoignable — une instance mal configurée ne
  démarre plus en silence en mode dégradé (échappement nommé pour la
  maintenance, voir « Ruptures »).
- Stockage : MinIO est remplacé par **Garage** (AGPL, compatible S3) pour les
  nouvelles installations et les instances existantes qui migrent — l'image
  officielle de MinIO n'était plus téléchargeable.
- Rotation documentée de six secrets de production, par ordre de coût
  croissant, avec marche à suivre et contrôle avant/après chacun.
- Caddy refuse désormais explicitement toute requête dont le domaine ne
  correspond à aucun établissement de l'installation — y compris en HTTPS
  avec un certificat par ailleurs valide (une connexion établie sous le
  certificat de l'application ne donne plus accès à ce qui est derrière un
  autre nom). Aucune donnée n'était exposée par l'ancien comportement ; il
  rendait un 200 vide sans le dire, ce qui compliquait le diagnostic d'une
  mauvaise configuration DNS autant qu'il aurait pu masquer un essai.

**Conformité et établissement**
- Pages légales par établissement (mentions légales, confidentialité),
  rédigées par l'école elle-même, jamais publiées incomplètes, et désormais
  réellement PUBLIQUES (accessibles sans connexion).
- `circulation` devient un **module activable** : une bibliothèque purement
  numérique peut l'éteindre — ferme avec elle les amendes et les rappels, qui
  en dépendent. (« une bibliothèque sans rayon ».)
- Trace d'usage numérique conservée douze mois, nominative, et l'étudiant
  peut la consulter lui-même.

**Catalogue, lecture et étiquettes**
- Scanner `/opac/scan` à trois niveaux (visiteur, étudiant, bibliothécaire),
  qui réutilisent les routes d'accès existantes — aucun champ réservé
  n'apparaît à un niveau qui n'y a pas droit.
- Bloc inventaire (récolement) exposé au scanner.
- Couvertures composées v3 : vignette dérivée côté serveur à partir d'un
  gabarit et d'un domaine, identique entre le web et le mobile.
- Étiquettes imprimables : QR subordonné au code-barres (jamais une seconde
  source de vérité), adresse courte pour l'étiquette, identifiant pérenne
  pour la résolution publique (`/opac/resoudre/<identifiant>`).
- Contrat API : `hasDigital` et `offlineReady` remplacent l'ancien booléen
  ambigu `hasDigitalCopy` — le web et le mobile lisent chacun ce qui leur
  correspond (existence d'une version en ligne / préparation hors-ligne).

**Application mobile**
- Capture et enregistrement d'écran bloqués sur l'écran de lecture.
- Fichiers hors ligne chiffrés à l'appareil, liés à un appareil et un bail
  expirable (DRM maison, voir `CLAUDE.md`).
- Filigrane nominatif sur la session, affiché pendant la lecture.
- Couvertures v3 identiques au web (même gabarit, même dérivation).
- Scanner à trois niveaux et récolement, cohérents avec le backend.
- **Décodeur QR entièrement libre** : ML Kit (et les services Google Play
  qu'il embarquait) est retiré, remplacé par `flutter_zxing` (MIT) sur
  `zxing-cpp` (Apache-2.0) — APK allégé de 6,85 Mo. La porte F-Droid, fermée
  tant que ML Kit était présent, est désormais ouverte.

## Migrations obligatoires

1. Les migrations Prisma du cycle (installation, pages légales, usage
   nominatif, marqueur d'instance de démonstration) s'appliquent
   automatiquement au démarrage du conteneur `api` — aucune étape manuelle.
2. **Stockage — pour toute instance EXISTANTE uniquement** : migration de
   MinIO vers Garage avant de monter en v1.0.0. Procédure complète, avec
   sauvegarde préalable, vérification objet par objet (clé, taille,
   SHA-256) et retour en arrière documenté : `DEPLOY.md`, section
   « LA BASCULE DE LA DÉMONSTRATION — procédure complète, rc14 » (le nom
   reste celui du premier cas traité ; la procédure est générale).
   Une installation NEUVE n'a rien à faire : le compose de production ne
   connaît que Garage.
3. Avant le premier démarrage de `garage-init`, générer **quatre**
   identifiants dans `.env.prod` — pas deux :
   - `MINIO_ROOT_USER` : la clé d'accès Garage, format `GK` + 24
     hexadécimaux. Le nom de variable est HÉRITÉ de MinIO ; elle ne désigne
     plus MinIO, elle désigne Garage.
   - `MINIO_ROOT_PASSWORD` : le secret associé, 64 hexadécimaux EXACTEMENT.
     Même héritage de nom.
   - `GARAGE_RPC_SECRET` : secret interne de communication entre les nœuds
     Garage.
   - `GARAGE_ADMIN_TOKEN` : jeton de l'API d'administration Garage, utilisé
     par `garage-init` pour créer les clés et les buckets.
   Les deux premiers formats sont vérifiés avant tout appel réseau ; une
   valeur mal formée refuse de démarrer plutôt que d'échouer plus loin.

## Ruptures et points d'attention

- **Révocation d'un compte et lecture hors ligne** : après révocation,
  une copie hors ligne déjà posée sur un appareil cesse d'être lisible dès
  que l'appareil revient en ligne, et au plus tard au terme du bail local
  (14 jours par défaut, réglable par établissement). Ce n'est ni immédiat
  dans tous les cas, ni indéfini dans aucun — c'est une propriété du produit,
  pas une limite oubliée.
- **Pas d'attribution sur le document extrait** : la consultation est tracée
  nominativement côté serveur ; en revanche un document extrait ne porte
  aucune marque identifiant son lecteur. Le marquage par lecteur est prévu
  en V1.1.
- `minio/minio` n'est plus dans le compose de production. Un redémarrage
  depuis l'ancien compose échouera au téléchargement de l'image (dépôt
  retiré de Docker Hub — fait externe, pas un choix de notre part).
- Le démarrage refuse désormais si le stockage est vide ou injoignable alors
  que la base porte des documents numériques. Échappement de maintenance
  explicite : `STORAGE_SKIP_COHERENCE_CHECK=oui-je-sais-ce-que-je-fais` —
  jamais par défaut.
- Le contrat de lecture change : `hasDigitalCopy` disparaît au profit de
  `hasDigital`/`offlineReady`. **Les versions de l'application mobile
  antérieures à rc13 ne sont plus prises en charge** — installez
  l'application mobile v1.0.0 en même temps que cette mise à jour.
- `/auth/login` et les routes voisines (2FA, ré-authentification) sont
  désormais limitées en fréquence : un script d'exploitation qui boucle sur
  la connexion doit en tenir compte.
- Les pages légales sont publiques par construction : vérifier qu'aucun
  reverse-proxy personnalisé ne les remet derrière une authentification.

## Ce qui n'est PAS dans cette version, par décision écrite

- La caisse (encaissement des amendes) — c'est une phase à cadrer, pas une
  fonctionnalité manquante.
- La rotation de la clé de chiffrement du contenu offline
  (`OFFLINE_CONTENT_KEK`) — dette assumée de la V1.1, sans impact sur une
  instance qui n'a pas encore ingéré de document numérique.
- Prêter et retourner un document depuis l'application mobile — V1.1.
- L'affinage du vocabulaire de `recordType` — V1.1.
- Le contenu d'un 404 lisible sans JavaScript — V1.1, limite assumée et
  datée.
- Le guide illustré de l'interface — V1.1.

*(Brouillon — chiffres et libellés à relire avant publication. Liste des
dettes encore ouvertes, classées par gravité et effort, dans le rapport
séparé.)*
