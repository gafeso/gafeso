# La carte des écrans

> ⚠ **Document ENGENDRÉ — ne le corrigez pas à la main.**
> Depuis `apps/web` : `MAJ_CARTE=1 npx vitest run tests/carte-des-ecrans.spec.ts`
>
> ⚠ *Sans `-w` : dans vitest, `-w` veut dire `--watch` — la commande
> ne rendrait jamais la main au lieu de régénérer et de sortir.*
>
> Il est déduit du système de fichiers et de `lib/navigation.ts`. Un écran
> ajouté sans être classé fait échouer la suite : c’est une obligation, pas
> un balayage.

## 1 · Les écrans du MÉTIER — la barre du personnel

Chaque entrée n’apparaît que pour qui détient la fonction, **et** si son
module est actif. Éteindre le module retire l’entrée du menu **et** fait
refuser la route par l’API.

### Onglet « Catalogue »

| Écran | Adresse | Fonction exigée | Module | Ce qu’on y fait |
|---|---|---|---|---|
| Notices | `/admin/catalogue` | `catalogue.gerer` | noyau | Chercher, créer et corriger les notices du fonds. |
| Auteurs | `/admin/auteurs` | `catalogue.gerer` | noyau | Le fichier d’autorité : fusionner les doublons, relier un compte à sa fiche. |
| Domaines | `/admin/categories` | `catalogue.gerer` | noyau | Les domaines qui classent le fonds et alimentent les facettes publiques. |
| Collections | `/admin/collections` | `collections.gerer` | noyau | Regrouper des documents et décider QUI y accède, par classe ou par abonnement. |
| Dépôts à valider *(Dépôts)* | `/depots-a-valider` | `depot.valider` | `depot` — **disparaît si éteint** | La file d’un directeur : accepter ou refuser les dépôts qu’il dirige. |
| Dépôts en attente *(Dépôts)* | `/admin/depots-soumis` | `catalogue.gerer` | `depot` — **disparaît si éteint** | Les dépôts validés par un directeur, en attente de catalogage. |
| Dépôts à cataloguer *(Dépôts)* | `/admin/depots-a-cataloguer` | `catalogue.gerer` | `depot` — **disparaît si éteint** | Transformer un dépôt validé en notice du catalogue. |

### Onglet « Lecteurs »

| Écran | Adresse | Fonction exigée | Module | Ce qu’on y fait |
|---|---|---|---|---|
| Adhérents | `/admin/adherents` | `adherents.gerer` | noyau | Les cartes de lecteur : créer, prolonger, consulter prêts et amendes. |
| Comptes | `/admin/comptes` | `lecteurs.voir` | noyau | Les comptes de l’école : activer une inscription, poser un rôle. |
| Classes | `/admin/classes` | `lecteurs.gerer` | noyau | Les classes et leurs inscrits — le nom technique sert aux règles d’accès. |

### Onglet « Guichet »

| Écran | Adresse | Fonction exigée | Module | Ce qu’on y fait |
|---|---|---|---|---|
| Prêt et retour | `/guichet` | `circulation.faire` | noyau | Prêter, rendre, encaisser une amende — au code-barres. |
| Rappels envoyés | `/admin/rappels` | `circulation.retards` | `rappels` — **disparaît si éteint** | Les courriels de retard déjà partis, et leur réglage. |

### Onglet « Outils »

| Écran | Adresse | Fonction exigée | Module | Ce qu’on y fait |
|---|---|---|---|---|
| Import de notices *(Catalogue)* | `/admin/outils/import-notices` | `outils.catalogue` | noyau | Importer un lot de notices MARC ou CSV, avec compte rendu ligne à ligne. |
| Moissonnage *(Catalogue)* | `/admin/moissonnage` | `outils.catalogue` | `moissonnage` — **disparaît si éteint** | Récolter automatiquement des notices depuis des entrepôts OAI-PMH extérieurs. |
| Récolement *(Catalogue)* | `/admin/recolement` | `outils.catalogue` | noyau | L’inventaire au code-barres : ce qui manque, ce qui est mal rangé. |
| Import des étudiants *(Lecteurs)* | `/admin/import-etudiants` | `outils.lecteurs` | noyau | Charger la liste des étudiants attendus — matricule, courriel, classe. |

### Onglet « Statistiques »

| Écran | Adresse | Fonction exigée | Module | Ce qu’on y fait |
|---|---|---|---|---|
| Statistiques | `/admin/statistiques` | `statistiques.voir` | `statistiques` — **disparaît si éteint** | Le tableau de bord d’activité : prêts, lectures, retards. |
| Rapport annuel | `/admin/rapport-annuel` | `statistiques.voir` | `statistiques` — **disparaît si éteint** | Le bilan d’année remis à l’université, imprimable. |

### Onglet « Administration » — index à rubriques : `/admin/administration`

| Écran | Adresse | Fonction exigée | Module | Ce qu’on y fait |
|---|---|---|---|---|
| Modules *(Établissement)* | `/admin/modules` | `modules.gerer` | noyau | Allumer ou éteindre les fonctions de l’école. |
| Identité *(Établissement)* | `/admin/etablissement` | `etablissement.apparence` | noyau | Nom, logo, couleurs et coordonnées de l’établissement. |
| Règles de prêt *(Établissement)* | `/admin/regles-de-pret` | `etablissement.regles` | noyau | Renouvellement en ligne et mise de côté des réservations. |
| Page d’accueil *(Établissement)* | `/admin/accueil` | `etablissement.apparence` | noyau | Textes et images de la page publique. |
| Interopérabilité *(Diffusion)* | `/admin/interoperabilite` | `diffusion.gerer` | `interoperabilite` — **disparaît si éteint** | Ce que l’extérieur peut moissonner de votre catalogue. |
| Rôles *(Sécurité)* | `/admin/roles` | `securite.roles` | noyau | Qui a le droit de faire quoi. |
| Journal d’audit *(Sécurité)* | `/admin/journal` | `securite.audit` | noyau | Qui a fait quoi, et quand. |

## 2 · Les écrans HORS de la barre

| Adresse | Pour qui | Ce qu’on y fait |
|---|---|---|
| `/` | tout le monde | la vitrine de l’établissement |
| `/admin` | personnel | porte d’entrée : redirige vers la première section accessible |
| `/admin/adherents/[id]` | adherents.gerer | fiche d’un adhérent : prêts, amendes, réservations |
| `/admin/catalogue/[id]` | catalogue.gerer | fiche d’une notice : exemplaires, copie numérique, métadonnées |
| `/admin/collections/[id]` | collections.gerer | une collection : son contenu et ses règles d’accès |
| `/admin/moissonnage/[id]` | outils.catalogue | un entrepôt moissonné et ses comptes rendus de récolte |
| `/admin/parametres` | quiconque avait l’ancienne adresse | redirige vers « Identité » — l’écran a été scindé en Identité et Règles de prêt, et l’ancienne adresse reste vivante exprès |
| `/admin/recolement/[id]` | outils.catalogue | une session de récolement en cours |
| `/definir-mot-de-passe` | porteur du lien reçu | choix du mot de passe, lien à usage unique |
| `/e/[slug]` | tout le monde | la page d’inscription par QR d’un établissement |
| `/inscription` | tout le monde | création d’un compte lecteur |
| `/login` | tout le monde | connexion, avec double authentification si l’école l’exige |
| `/mes-encadrements` | encadrements.voir | les mémoires et thèses qu’on a dirigés, déjà catalogués |
| `/mes-prets` | tout compte | mes prêts, mes réservations, mon historique |
| `/mon-depot` | depot.deposer · module `depot` | déposer son mémoire ou sa thèse et suivre son avancement |
| `/opac` | tout le monde | le catalogue public, facettes et recherche |
| `/opac/[id]` | tout le monde | la fiche d’une notice ; la lecture et la réservation exigent un compte |
| `/opac/[id]/lire` | membre AYANT DROIT | le lecteur en ligne (PDF ou EPUB), sans téléchargement |
| `/opac/auteurs` | tout le monde | l’index des auteurs |
| `/opac/auteurs/[id]` | tout le monde | la fiche d’un auteur et ses documents |
| `/profil` | tout compte | mon compte : informations, mot de passe, double authentification |
