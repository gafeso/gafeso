# Gafeso — fonctionnalités détaillées

Ce document recense **toutes les fonctionnalités** de Gafeso, organisées par
domaine. Pour la vision d'ensemble, voir [presentation-gafeso.md](presentation-gafeso.md) ;
pour le fonctionnement technique, [fonctionnement.md](fonctionnement.md).

---

## 1. Catalogue et catalogage

### 1.1 Notices bibliographiques
- Registre **filtrable et paginé** (par catégorie), recherche.
- **Fiche de saisie savante** (cahier des charges EXEMPLE) :
  - Titre + **complément de titre** (affiché « Titre : complément »).
  - **Contributeurs avec rôles** : auteur principal, auteur(s) secondaire(s),
    **directeur de mémoire / de thèse**. Ordonnés, chacun rattaché à une **fiche
    d'autorité auteur**.
  - **Type de document** : ouvrage, thèse, mémoire, licence, master, thèse
    unique, publication. Le formulaire **s'adapte au type** (une thèse demande
    l'université et le lieu de soutenance ; un ouvrage demande l'éditeur et la
    ville).
  - **Catégorie** (domaine), **mots-clés** (minimum 3, avec autocomplétion),
    ISBN, langue, année, éditeur, ville, résumé.
- **Référence automatique** et **couverture** (upload) par notice.
- Suppression tracée au journal d'audit.

### 1.2 Récupérer une notice (SRU)
- Bouton **« Récupérer une notice »** dans le formulaire de saisie.
- Recherche par **ISBN** ou **titre/auteur** sur des serveurs externes :
  **BnF** (catalogue général) et **Library of Congress** par défaut, liste
  extensible en configuration.
- La notice choisie **pré-remplit** le formulaire (titre, complément, auteurs et
  rôles, éditeur, ville, année, ISBN, langue). L'utilisateur relit, complète la
  catégorie et les mots-clés, enregistre.
- Non bloquant : un serveur injoignable est signalé sans figer la saisie.

### 1.3 Import / export MARC
- **Import** d'un fichier MARC (ISO 2709), dialectes **UNIMARC** et **MARC21**.
- **Garde-fou** : si l'éditeur correspond à un logiciel de numérisation connu
  (PaperPort, NAPS2, ScanSnap, Adobe Scan, CamScanner…), il est ignoré.
- **Export** d'une notice, d'une sélection ou de tout le catalogue en **ISO 2709**
  (`.mrc`) **et MARCXML**.
- Aller-retour sans perte prouvé (voir [marc-mapping.md](marc-mapping.md)).

### 1.4 Fiches d'autorité — auteurs
- **Référentiel d'autorités** par établissement : chaque auteur a une fiche
  (nom, biographie, dates), dédupliquée à la source (normalisation
  sans accents/casse/espaces).
- Fiche auteur publique (OPAC) : ses œuvres groupées par rôle.
- Administration : **renommer** (propagé + réindexé), **fusionner** des doublons
  (tracé), **supprimer** si zéro œuvre.

### 1.5 Catégories, collections, mots-clés
- **Catégories** (domaines) gérées par l'admin ; référentiel seedé (28 catégories
  EXEMPLE possibles).
- **Collections** (regroupements de notices), avec **règles d'accès** par
  classe / abonnement pour la lecture numérique.
- **Mots-clés** : référentiel avec autocomplétion.

## 2. Exemplaires et inventaire

### 2.1 Exemplaires (items)
- Par notice : code-barres (unique, alphanumérique), **cote** (call number),
  **localisation** (Salle de lecture, Documentation, Réserve), **type**.
- **Statuts** : disponible, en prêt, réservé, en transit, endommagé, perdu,
  retiré, **introuvable** (posé par le récolement).

### 2.2 Étiquettes code-barres
- Génération serveur d'un **PDF de planche A4** autocollante.
- Code-barres **Code 128** (scannable) + code en clair + cote + titre tronqué +
  sigle de l'établissement.
- **Grille paramétrable** (colonnes × lignes, 3×8 par défaut), pagination auto,
  option **« démarrer à l'étiquette N »** pour finir une planche entamée.
- Sélection depuis le catalogue : une notice (tous ses exemplaires), une
  sélection cochée, ou par filtre (localisation, nouveautés).

### 2.3 Récolement (inventaire)
- **Sessions d'inventaire persistées** (un récolement dure des jours →
  **interruptible et reprenable**).
- Périmètre : **tout le fonds** ou **une localisation**.
- **Écran de scan à la douchette** : le champ reçoit le code + Entrée ; feedback
  immédiat classé : **vu ✓ / déjà scanné / code inconnu / hors périmètre /
  actuellement en prêt**. Barre de progression.
- **Rapport** : **vus**, **manquants** (attendus non scannés), **inattendus**
  (inconnus ou hors périmètre), **en prêt** (absents légitimes, jamais comptés
  manquants). **Export CSV**.
- Action **« marquer les manquants »** (statut MISSING, tracé au journal
  d'audit).

## 3. Circulation

- **Prêts / retours** au guichet (lecture des code-barres exemplaire + adhérent).
- **Réservations** (file d'attente, position, annulation).
- **Renouvellement en ligne** par le lecteur (politique paramétrable :
  plafond, durée, refus si déjà en retard, refus si réservé par un autre).
- **Règles de circulation** par établissement.
- **Rappels par email** automatiques : échéance à venir (J-N) et retard (J+1
  puis tous les M jours), modèles éditables, journal des rappels envoyés.
- **Email « réservation disponible »** au retour de l'exemplaire réservé.

## 4. OPAC (portail public)

- **Recherche plein-texte** avec **facettes** (catégorie, langue, année, type)
  et compteurs.
- **Recherche par champ** : Tout / **Titre** (ISBN et résumé exclus) / Auteur
  (redirige vers les fiches d'autorité) / Catégorie.
- **Tolérance aux fautes** et **insensibilité aux accents** (« ouedraogo » trouve
  « Ouédraogo »).
- **Fiche notice** : exemplaires + synthèse de disponibilité (réservés aux
  membres ; cadenas pour les visiteurs anonymes), contributeurs liés à leurs
  fiches, mots-clés.
- **Page constellation** : répartition du catalogue par domaine.
- **Compte lecteur en ligne** (« Mes prêts ») : prêts en cours, retards,
  historique, renouvellement, réservations.

## 5. Bibliothèque numérique

- **Fichiers PDF et EPUB** attachés aux notices, stockés en objet (MinIO).
- **Lecture en ligne** : PDF rendu en canvas (pdf.js), EPUB.
- **Contrôle d'accès serveur** : un étudiant n'accède qu'aux documents autorisés
  par sa **classe** / son **abonnement** — vérifié côté serveur avant toute URL.
- **URLs signées temporaires** (TTL court) ; le **téléchargement** du fichier est
  une permission distincte de la lecture (réservé à l'admin par défaut).

## 6. Comptes, rôles et sécurité

### 6.1 Comptes
- **Inscription publique** en 2 profils (étudiant / personnel), mise en file
  d'**activation** (le rôle est posé à l'activation, anti-escalade).
- **Import CSV** des étudiants attendus (erreurs remontées par ligne).
- **Classes / niveaux** et inscriptions.
- Création du **personnel** via l'admin (lien de définition de mot de passe à
  usage unique, 24 h).

### 6.2 Rôles et permissions
- **5 rôles système** : Étudiant, Bibliothécaire, Gestionnaire, Acquisitions,
  Administrateur.
- **Rôles personnalisés** par établissement (cases à cocher sur 13 permissions).
- **13 fonctions (permissions) fines** :

| Fonction | Rôle par défaut |
|---|---|
| `document.lire` — lire les documents en ligne | selon classe/abonnement |
| `document.telecharger` — télécharger le fichier | Administrateur |
| `catalogue.gerer` — notices, exemplaires, réindexation | Bibliothécaire+ |
| `circulation.gerer` — prêts, retours, réservations | Bibliothécaire+ |
| `adherents.gerer` — fiches lecteurs | Bibliothécaire+ |
| `classes.gerer` — classes, niveaux, inscriptions | Gestionnaire+ |
| `etudiants.importer` — import CSV | Gestionnaire+ |
| `comptes.voir` — liste des comptes | Gestionnaire+ |
| `comptes.activer` — file d'activation | Gestionnaire+ |
| `comptes.gerer` — création personnel, suspension, rôles | Administrateur |
| `collections.gerer` — collections + règles d'accès | Administrateur |
| `roles.gerer` — rôles et permissions | Administrateur |
| `etablissement.gerer` — identité, vitrine, stats, interop | Administrateur |

L'**API reste seule autorité** : chaque endpoint revérifie la permission (la
navigation filtrée n'est qu'un confort d'affichage).

### 6.3 Sécurité
- **Double authentification (2FA)** optionnelle : TOTP (Google Authenticator…)
  + codes de secours + repli OTP email ; **imposable** par rôle sensible.
- **Journal d'audit** : connexions (réussies/échouées), échecs 2FA,
  changements de rôles/permissions, suppressions, marquage manquants, etc.
  Consultable et filtrable (par utilisateur, action, période).
- **Page « Mon compte »** : changement de mot de passe, gestion 2FA, activité
  récente.
- En-têtes de sécurité (helmet + Caddy), HTTPS forcé, secrets forts imposés au
  démarrage en production.

## 7. Statistiques

- **Tableau de bord** `/admin/statistiques` : indicateurs instantanés (KPIs),
  activité sur période + variation vs période précédente, **séries temporelles**
  (prêts/retours par jour/semaine/mois), **palmarès** (plus/jamais empruntés,
  catégories, classes, auteurs), fonds par catégorie.
- **Graphiques légers dessinés maison** (SVG, sans bibliothèque externe),
  couleurs dérivées du thème.
- **Exports CSV** (par tableau et rapport d'activité complet, UTF-8 + BOM).

## 8. Interopérabilité

- **Export MARC** (voir §1.3).
- **Serveur OAI-PMH 2.0** : entrepôt **public** tenant-scopé, 6 verbes
  (Identify, ListMetadataFormats, ListSets, ListIdentifiers, ListRecords,
  GetRecord), formats **oai_dc** et **marcxchange** (ISO 25577 ; notices déclarées `format="UNIMARC"`, pas du MARC21), moissonnage incrémental,
  sets par catégorie. **Uniquement des métadonnées — jamais les fichiers.**
- **Récupération SRU** (voir §1.2).
- **Page d'administration Interopérabilité** : l'URL OAI de l'établissement,
  un lien de test, l'explication (visibilité dans BASE/AUF/catalogues
  collectifs).

## 9. Vitrine et personnalisation

- **Page d'accueil publique** par établissement (SSR), éditable dans l'admin
  (identité, statistiques, espaces, services, horaires, ressources, contact).
- **Charte graphique** par école : couleur principale, logo, palette.
- **Multi-établissements** : plusieurs bibliothèques étanches sur une même
  installation, chacune résolue par son **domaine**.

## 10. Administration — écrans

Le back-office (`/admin`) regroupe : **Comptes**, **Import étudiants**,
**Classes**, **Catalogue**, **Récolement**, **Auteurs**, **Catégories**,
**Collections**, **Rôles**, **Statistiques**, **Interopérabilité**,
**Établissement**, **Page d'accueil**, **Rappels envoyés**, **Journal d'audit**.
Chaque entrée n'apparaît qu'aux rôles qui en ont la permission.

## 11. Exploitation

- **Installation une-commande** (`install.sh`) — voir [INSTALLATION.md](INSTALLATION.md).
- **Sauvegardes** (PostgreSQL + objets MinIO) — voir `scripts/backup/`.
- **Réindexation** de la recherche, **synchronisation de schéma** multi-tenant,
  **choix du moteur de recherche** — voir [../DEPLOY.md](../DEPLOY.md).
