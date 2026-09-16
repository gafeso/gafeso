# Inventaire du produit Gafeso

> **Ce document est MESURÉ, pas raconté** — et il dit lequel de ses morceaux
> l'est.
>
> **Sections 1 à 4 : ENGENDRÉES** par `scripts/inventaire-produit.mjs`, qui
> lit le code et refuse de rendre quoi que ce soit si ses témoins de compte
> tombent. Personne ne les édite à la main.
>
> **Sections 5 à 8 : RÉDIGÉES**, dans
> `docs/inventaire-produit.partie-redigee.md`. Elles énoncent des invariants
> et des limites qu'aucun extracteur ne sait lire — chaque affirmation y
> nomme donc ce qui l'a mesurée, et la section 8 dit ce qui ne l'est pas.

*Mesuré le 16 septembre 2026 sur le dépôt `gafeso-dev`, commit `5d4cb93`.*

## Ce que la mesure a compté

| | |
|---|---|
| Modules déclarés | **11** — 5 de noyau, 6 activables |
| Fonctions au catalogue | **25** |
| Rôles système | **5** |
| Routes d'API | **208** dans 27 domaines |
| Écrans (`page.tsx`) | **47** |
| Entrées de navigation | **25** |
| Entrées de backlog ouvertes | **27** |

---

## 1. Les modules

Source : `apps/api/src/modules/registre-modules.ts`.

⚠ **Un module de NOYAU ne s'éteint pas.** Il est déclaré pour être VISIBLE
et verrouillé dans l'écran des modules, pas caché : une école doit voir ce
qu'elle ne peut pas retirer.

| Module | Activable | Dépend de | Ce qu'il couvre |
|---|---|---|---|
| **Authentification** (`authentification`) | ❌ noyau | — | Connexion, comptes, rôles et droits. |
| **Usagers** (`usagers`) | ❌ noyau | — | Adhérents, classes, inscriptions. |
| **Catalogue** (`catalogue`) | ❌ noyau | — | Notices, exemplaires, recherche publique. |
| **Circulation** (`circulation`) | ❌ noyau | — | Prêts, retours, réservations. |
| **Administration** (`administration`) | ❌ noyau | — | Identité de l’établissement, journal d’audit, outils. |
| **Amendes** (`amendes`) | ✅ | circulation | Calcul et encaissement des amendes de retard. Éteint, les amendes déjà dues sont conservées : elles cessent seulement de s’accumuler. |
| **Interopérabilité** (`interoperabilite`) | ✅ | catalogue | Exposition du catalogue vers l’extérieur : entrepôt OAI-PMH, SRU. Éteint, l’entrepôt REFUSE explicitement — il ne disparaît pas et ne rend pas un jeu vide. |
| **Dépôt** (`depot`) | ✅ | catalogue |  |
| **Statistiques** (`statistiques`) | ✅ | catalogue, circulation |  |
| **Moissonnage** (`moissonnage`) | ✅ | catalogue |  |
| **Rappels** (`rappels`) | ✅ | circulation | Courriels d’échéance et de retard aux adhérents. Éteint, plus aucun envoi automatique ; l’historique des rappels déjà envoyés est conservé. |

### ⚠ Ce que chaque module activable CESSE de faire quand on l'éteint

Deux effets, et ils sont indépendants : **l'interface** retire des écrans,
**l'API** refuse des routes en nommant le module (403). Les écrans viennent
du registre ; les routes viennent de `ROUTES_PAR_MODULE`.

#### Amendes (`amendes`)

**Écrans retirés :**

- `/guichet` — la section Amendes (le guichet, lui, reste)
- `/admin/adherents/[id]` — la section Amendes de la fiche d’adhérent

**Routes refusées (4)** :

- `circulation/circulation.controller.ts :: Post rules`
- `circulation/circulation.controller.ts :: Get rules`
- `circulation/circulation.controller.ts :: Patch rules/:id`
- `circulation/circulation.controller.ts :: Delete rules/:id`

#### Interopérabilité (`interoperabilite`)

**Écrans retirés :**

- `/admin/interoperabilite` — l’écran Interopérabilité

**Routes refusées (3)** :

- `oai/oai.controller.ts :: Get`
- `oai/oai.controller.ts :: Post`
- `sru/sru.controller.ts :: Get lookup`

#### Dépôt (`depot`)

**Écrans retirés :**

- `/mon-depot` — l’écran Mon dépôt (l’étudiant)
- `/depots-a-valider` — l’écran Dépôts à valider (le directeur)
- `/admin/depots-soumis` — l’écran Dépôts en attente
- `/admin/depots-a-cataloguer` — l’écran Dépôts à cataloguer

**Routes refusées (15)** :

- `depots/depots.controller.ts :: Post`
- `depots/depots.controller.ts :: Get directeurs`
- `depots/depots.controller.ts :: Patch :id/directeur`
- `depots/depots.controller.ts :: Get mes-depots`
- `depots/depots.controller.ts :: Post :id/document`
- `depots/depots.controller.ts :: Post :id/soumettre`
- `depots/depots.controller.ts :: Post :id/retirer`
- `depots/depots.controller.ts :: Get soumis`
- `depots/depots.controller.ts :: Post :id/reattribuer`
- `depots/depots.controller.ts :: Get :id/document`
- `depots/depots.controller.ts :: Get a-valider`
- `depots/depots.controller.ts :: Post :id/valider`
- `depots/depots.controller.ts :: Post :id/refuser`
- `depots/depots.controller.ts :: Get a-cataloguer`
- `depots/depots.controller.ts :: Post :id/notice`

#### Statistiques (`statistiques`)

**Écrans retirés :**

- `/admin/statistiques` — l’écran Statistiques (tableau de bord)

**Routes refusées (4)** :

- `stats/stats.controller.ts :: Get dashboard`
- `stats/stats.controller.ts :: Get rapport-annuel`
- `stats/stats.controller.ts :: Get export`
- `stats/stats.controller.ts :: Get report`

#### Moissonnage (`moissonnage`)

**Écrans retirés :**

- `/admin/moissonnage` — l’écran Moissonnage
- `/admin/moissonnage/[id]` — le détail d’un entrepôt et ses comptes rendus

**Routes refusées (7)** :

- `moissonnage/moissonnage.controller.ts :: Get sources`
- `moissonnage/moissonnage.controller.ts :: Post sources`
- `moissonnage/moissonnage.controller.ts :: Patch sources/:id`
- `moissonnage/moissonnage.controller.ts :: Delete sources/:id`
- `moissonnage/moissonnage.controller.ts :: Post sources/:id/executer`
- `moissonnage/moissonnage.controller.ts :: Get sources/:id/executions`
- `moissonnage/moissonnage.controller.ts :: Get sources/:id/collisions`

#### Rappels (`rappels`)

**Écrans retirés :**

- `/admin/rappels` — l’écran Rappels

**Routes refusées (5)** :

- `reminders/reminders.controller.ts :: Get settings`
- `reminders/reminders.controller.ts :: Patch settings`
- `reminders/reminders.controller.ts :: Get log`
- `reminders/reminders.controller.ts :: Post preview`
- `reminders/reminders.controller.ts :: Post run`

⚠ **`amendes` n'a aucune route exclusive de calcul, et c'est mesuré.** Les
amendes se calculent DANS `POST /circulation/return`, qui est du noyau : la
garder refuserait de rendre un livre dans une école ayant éteint les amendes.
Seuls les TARIFS sont des routes du module ; le calcul se règle par une
branche — l'amende vaut zéro, le retour se fait.

---

## 2. Les fonctions, et ce qu'elles ouvrent

Source : `apps/api/src/auth/functions.ts`. Les droits sont des **fonctions**,
résolues EN BASE à chaque requête (`AuthzService`) — une révocation prend
effet sans attendre l'expiration du JWT.

| Fonction | Ce qu'elle ouvre | Routes | Écrans |
|---|---|---|---|
| `document.lire` | Lire en ligne tous les documents numériques, sans restriction de classe/abonnement. */ | 0 | — |
| `document.telecharger` | Obtenir une URL de téléchargement d'un fichier numérique (distinct de la lecture). */ | 1 | — |
| `depot.deposer` | Déposer un mémoire ou une thèse (P6-2). | 7 | `/mon-depot` |
| `depot.valider` | Valider ou refuser un dépôt dont on est le directeur (P6-2). | 3 | `/admin/roles` `/depots-a-valider` |
| `encadrements.voir` | Consulter SES encadrements — les mémoires et thèses qu'on a dirigés (P6-3). | 0 | `/mes-encadrements` |
| `catalogue.gerer` | Gérer le catalogue : notices, exemplaires, fichiers numériques, domaines, réindexation. */ | 21 | `/admin/auteurs` `/admin/catalogue` `/admin/categories` `/admin/depots-a-cataloguer` `/admin/depots-soumis` `/admin/interoperabilite` |
| `outils.catalogue` | Outils qui opèrent SUR le catalogue : import de notices, récolement, étiquettes. */ | 2 | `/admin/moissonnage/[id]` `/admin/moissonnage` `/admin/outils/import-notices` `/admin/recolement` |
| `adherents.gerer` | Gérer les adhérents (fiches lecteurs). */ | 0 | `/admin/adherents/[id]` `/admin/adherents` |
| `lecteurs.voir` | Consulter les comptes lecteurs de l'école. */ | 1 | `/admin/comptes` |
| `lecteurs.gerer` | Gérer les classes, niveaux et inscriptions. */ | 0 | `/admin/classes` |
| `outils.lecteurs` | Outils qui opèrent SUR les lecteurs : import de la liste des étudiants attendus. */ | 3 | `/admin/comptes` `/admin/import-etudiants` |
| `circulation.faire` | Tenir le guichet : prêts, retours, réservations. */ | 0 | `/guichet` |
| `circulation.retards` | Voir qui est en retard, et les rappels. DÉLIBÉRÉMENT distincte de | 2 | `/admin/rappels` |
| `rappels.envoyer` | `circulation.retards` gardait, sous un seul droit, la LECTURE des retards | 2 | `/admin/rappels` |
| `comptes.activer` | Activer les comptes en attente (file d'attente). */ | 1 | — |
| `comptes.gerer` | Gérer les comptes : création du personnel, suspension, assignation de rôle. */ | 7 | `/admin/comptes` |
| `collections.gerer` | Gérer les collections et leurs règles d'accès (classe/abonnement). */ | 17 | `/admin/collections` |
| `statistiques.voir` | Consulter les statistiques de l'école. */ | 0 | `/admin/rapport-annuel` `/admin/statistiques` |
| `etablissement.apparence` | Modifier l'identité visuelle : couleurs, logo, page d'accueil, QR d'inscription. */ | 4 | `/admin/accueil` `/admin/etablissement` |
| `etablissement.regles` | Modifier les règles de prêt de l'établissement. */ | 0 | `/admin/regles-de-pret` |
| `diffusion.gerer` | Gérer la diffusion vers l'extérieur (interopérabilité, entrepôt OAI). */ | 0 | `/admin/interoperabilite` |
| `securite.roles` | Créer/modifier/supprimer les rôles et leurs fonctions. RÉSERVÉE À L'ADMINISTRATEUR. */ | 0 | `/admin/roles` |
| `securite.audit` | Consulter le journal d'audit. */ | 0 | `/admin/journal` |
| `securite.authentification` | Politique d'AUTHENTIFICATION de l'établissement (2FA obligatoire). | 1 | — |
| `modules.gerer` | Activer et désactiver les MODULES de l'établissement (P4). | 1 | `/admin/modules` |

### Les rôles système

⚠ Cinq rôles **seedés et non modifiables**. Une école peut créer des rôles
personnalisés par-dessus (CRUD `/roles`).

| Rôle | Enum historique | Fonctions |
|---|---|---|
| **Étudiant** | `STUDENT` | `depot.deposer` |
| **Bibliothécaire** | `LIBRARIAN` | `document.lire` `catalogue.gerer` `outils.catalogue` `circulation.faire` `adherents.gerer` `lecteurs.voir` `circulation.retards` |
| **Gestionnaire** | `MANAGER` | `document.lire` `outils.lecteurs` `lecteurs.voir` `comptes.activer` `lecteurs.gerer` |
| **Acquisitions** | `ACQUISITIONS` | `document.lire` |
| **Administrateur** | `ADMIN` | **toutes** (25) |

⚠ **Réservées à l'Administrateur**, interdites à tout rôle personnalisé : `securite.roles`, `modules.gerer`.
C'est le seul verrou contre l'escalade par composition : `securite.roles`
ouvre l'écran qui distribue toutes les autres.

⚠ **Sans rôle dynamique assigné** (`users.role_id` à null), le porteur retombe
sur les fonctions du rôle système de l'enum.

---

## 3. Les écrans

Source : les `page.tsx` d'`apps/web/app`, croisés avec `apps/web/lib/navigation.ts`.

⚠ **Le droit d'un écran se lit à DEUX endroits** : l'entrée de navigation qui
le montre, et la garde que la page porte elle-même. Les deux sont relevés, et
leur union est la colonne « droit exigé ». *Un troisième contrôle existe et
n'est pas dans cette table : l'API refuse l'action même si l'écran s'ouvre.*

### Espace professionnel (35)

| Adresse | Libellé au menu | Droit exigé |
|---|---|---|
| `/admin` | — | *aucun relevé* |
| `/admin/accueil` | Page d’accueil | `etablissement.apparence` |
| `/admin/adherents` | Adhérents | `adherents.gerer` |
| `/admin/adherents/[id]` | — | `adherents.gerer` |
| `/admin/administration` | — | *aucun relevé* |
| `/admin/auteurs` | Auteurs | `catalogue.gerer` |
| `/admin/catalogue` | Notices | `catalogue.gerer` |
| `/admin/catalogue/[id]` | — | *aucun relevé* |
| `/admin/categories` | Domaines | `catalogue.gerer` |
| `/admin/classes` | Classes | `lecteurs.gerer` |
| `/admin/collections` | Collections | `collections.gerer` |
| `/admin/collections/[id]` | — | *aucun relevé* |
| `/admin/comptes` | Comptes | `lecteurs.voir` `comptes.gerer` `outils.lecteurs` |
| `/admin/depots-a-cataloguer` | Dépôts à cataloguer | `catalogue.gerer` |
| `/admin/depots-soumis` | Dépôts en attente | `catalogue.gerer` |
| `/admin/etablissement` | Identité | `etablissement.apparence` |
| `/admin/import-etudiants` | Import des étudiants | `outils.lecteurs` |
| `/admin/interoperabilite` | Interopérabilité | `diffusion.gerer` `catalogue.gerer` |
| `/admin/journal` | Journal d’audit | `securite.audit` |
| `/admin/modules` | Modules | `modules.gerer` |
| `/admin/moissonnage` | Moissonnage | `outils.catalogue` |
| `/admin/moissonnage/[id]` | — | `outils.catalogue` |
| `/admin/outils/import-notices` | Import de notices | `outils.catalogue` |
| `/admin/parametres` | — | *aucun relevé* |
| `/admin/rappels` | Rappels envoyés | `circulation.retards` `rappels.envoyer` |
| `/admin/rapport-annuel` | Rapport annuel | `statistiques.voir` |
| `/admin/recolement` | Récolement | `outils.catalogue` |
| `/admin/recolement/[id]` | — | *aucun relevé* |
| `/admin/regles-de-pret` | Règles de prêt | `etablissement.regles` |
| `/admin/roles` | Rôles | `securite.roles` `depot.valider` |
| `/admin/statistiques` | Statistiques | `statistiques.voir` |
| `/depots-a-valider` | Dépôts à valider | `depot.valider` |
| `/guichet` | Prêt et retour | `circulation.faire` |
| `/mes-encadrements` | — | `encadrements.voir` |
| `/mon-depot` | — | `depot.deposer` |

### Écrans de la personne (3)

⚠ Ils ne portent aucun droit **par construction** : ce sont les écrans de son
propre compte. Depuis la refonte du 16 septembre, ils sortent de la barre de
travail et vivent sous un menu au prénom.

| Adresse | Libellé au menu | Droit exigé |
|---|---|---|
| `/mes-prets` | — | *aucun relevé* |
| `/mon-depot` | — | `depot.deposer` |
| `/profil` | — | *aucun relevé* |

### Public et authentification (10)

Aucun droit : ce sont les écrans accessibles sans session, plus ceux du
parcours de connexion.

| Adresse | Libellé au menu | Droit exigé |
|---|---|---|
| `/` | — | *aucun relevé* |
| `/definir-mot-de-passe` | — | *aucun relevé* |
| `/e/[slug]` | — | *aucun relevé* |
| `/inscription` | — | *aucun relevé* |
| `/login` | — | *aucun relevé* |
| `/opac` | — | *aucun relevé* |
| `/opac/[id]` | — | *aucun relevé* |
| `/opac/[id]/lire` | — | *aucun relevé* |
| `/opac/auteurs` | — | *aucun relevé* |
| `/opac/auteurs/[id]` | — | *aucun relevé* |

⚠ **Ce que cette table ne mesure pas.** Un sous-écran de détail (`[id]`) ne
porte le plus souvent aucune garde propre : il hérite de l'entrée de
navigation de son parent. Cela veut dire qu'une adresse TAPÉE À LA MAIN
contourne la navigation — c'est une classe de défaut déjà rencontrée, et ce
document ne peut pas dire écran par écran si l'API rattrape derrière.

---

## 4. Les routes d'API

**208 routes**, groupées par module NestJS. Les colonnes
« fonction » et « module » sont les gardes RÉELLEMENT posées en décorateur.

⚠ Une route sans fonction déclarée n'est pas une route ouverte : elle peut
être publique par destination (OPAC, OAI, SRU), protégée par la seule
authentification, ou gardée par une clé d'API. La colonne dit ce que le
décorateur porte, pas ce que la route décide.

### `access-control` — 20 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/collections/me` | — | — | Collections accessibles à l’étudiant connecté |
| GET | `/collections/me/titles/:titleId/access` | — | — | Vérifier l’accès de l’étudiant à un titre |
| GET | `/collections/me/records/:recordId/access` | — | — | Vérifier l’accès du membre à un document numérisé local |
| POST | `/collections` | `collections.gerer` | — | Créer une collection (admin) |
| GET | `/collections` | `collections.gerer` | — | Lister les collections de l’école (admin) |
| GET | `/collections/rule-options` | `collections.gerer` | — | Référentiels pour composer une règle d’accès |
| GET | `/collections/:id` | `collections.gerer` | — | Libellé d’un document local (identifiant + titre) (admin) |
| GET | `/collections/documents/:recordId` | `collections.gerer` | — | Libellé d’un document local (identifiant + titre) (admin) |
| GET | `/collections/:id` | `collections.gerer` | — | Détail d’une collection (titres + règles) (admin) |
| PATCH | `/collections/:id` | `collections.gerer` | — | Modifier une collection (nom / description) (admin) |
| DELETE | `/collections/:id` | `collections.gerer` | — | Supprimer une collection — refusé si elle n’est pas VIDE (admin) |
| GET | `/collections/:id/propagation` | `collections.gerer` | — | Ce que la propagation des règles ferait (aucune écriture) |
| POST | `/collections/:id/propagation` | `collections.gerer` | — | Propager les règles d’accès aux sous-collections (admin) |
| POST | `/collections/:id/titles` | `collections.gerer` | — | Ajouter un titre à une collection (admin) |
| DELETE | `/collections/:id/titles/:titleId` | `collections.gerer` | — | Retirer un titre d’une collection (admin) |
| POST | `/collections/:id/records` | `collections.gerer` | — | Rattacher un document numérisé local (BiblioRecord) à une collection (admin) |
| DELETE | `/collections/:id/records/:recordId` | `collections.gerer` | — | Retirer un document numérisé local d’une collection (admin) |
| POST | `/collections/:id/access-rules` | `collections.gerer` | — | Ajouter une règle d’accès (classe / palier) à une collection (admin) |
| GET | `/collections/:id/access-rules` | `collections.gerer` | — | Lister les règles d’accès de l’école pour une collection (admin) |
| DELETE | `/collections/access-rules/:ruleId` | `collections.gerer` | — | Supprimer une règle d’accès (admin) |

### `accounts` — 14 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/accounts/expected-students/import` | `outils.lecteurs` | — | Importer la liste pré-chargée des étudiants (CSV) |
| POST | `/accounts/expected-students/import/apercu` | `outils.lecteurs` | — | Ce que l’import ferait — aucune écriture |
| DELETE | `/accounts/expected-students/:id` | `outils.lecteurs` | — | Retirer une ligne d’étudiant attendu |
| GET | `/accounts` | `lecteurs.voir` | — | Lister les comptes de l’école (filtre statut / recherche) |
| POST | `/accounts/staff` | `comptes.gerer` | — | Créer un compte du personnel (admin) |
| PATCH | `/accounts/:id` | `comptes.gerer` | — | Modifier un compte existant (prénom, nom, email, classe, rôle) |
| PATCH | `/accounts/:id/status` | `comptes.gerer` | — | Suspendre ou réactiver un compte (admin) |
| GET | `/accounts/:id/password-link` | `comptes.gerer` | — | Lien de définition de mot de passe encore valide (repli si l’email ne part pas) |
| DELETE | `/accounts/:id` | `comptes.gerer` | — | Supprimer définitivement un compte (admin) |
| GET | `/accounts/assignable-roles` | `comptes.gerer` | — | Rôles assignables à l’activation (nom, système ou non) |
| PATCH | `/accounts/:id/role` | `comptes.gerer` | — | Assigner un rôle à un compte |
| POST | `/accounts/register` | — | — | Créer un compte (inscription publique — étudiant ou personnel) |
| POST | `/accounts/:id/activate` | `comptes.activer` | — | Activer manuellement un compte en attente (rôle optionnel) |
| POST | `/accounts/set-password` | — | — | Définir son mot de passe via le lien sécurisé |

### `admin` — 13 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/admin/login` | — | — | Connexion super-admin plateforme |
| POST | `/admin/tenants` | — | — | Provisionner une école |
| GET | `/admin/tenants` | — | — | Lister les écoles provisionnées |
| GET | `/admin/tenants/:slug` | — | — | Détail d’une école |
| GET | `/admin/tenants/:slug/socle` | — | — | État du socle d’un établissement (rôles, catégories, règles, classes) |
| POST | `/admin/tenants/:slug/sync-schema` | — | — | Synchroniser le schéma d’une école (après ajout de tables au modèle) |
| POST | `/admin/tenants/:slug/migrate-authors` | — | — | Copier les auteurs existants vers les contributeurs (migration en deux temps) |
| POST | `/admin/tenants/:slug/domaines-orphelins` | — | — | Lister les domaines orphelins d’une école (lecture seule par défaut) |
| POST | `/admin/tenants/:slug/dedupe-authors` | — | — | Dédupliquer les contributeurs en fiches d’autorité auteur |
| POST | `/admin/tenants/:slug/seed-categories` | — | — | Seed des catégories standard chez une école |
| POST | `/admin/tenants/:slug/seed-homepage` | — | — | Seed d’une page d’accueil d’exemple |
| POST | `/admin/tenants/:slug/reindex` | — | — | Réindexer le catalogue d’une école dans Meilisearch |
| DELETE | `/admin/tenants/:slug` | — | — | Déprovisionner une école (destructif) |

### `audit` — 2 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/audit/actions` | — | — | Libellés des actions journalisées (pour le filtre) |
| GET | `/audit` | — | — | Journal d’audit paginé, filtrable (utilisateur, action, période) |

### `auth` — 14 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/auth/login` | — | — | Connexion (email + mot de passe, dans l’école du domaine) |
| POST | `/auth/login/2fa` | — | — | Connexion — étape 2 : vérifie le second facteur |
| POST | `/auth/login/2fa/email` | — | — | Connexion — envoie un code par email (repli) |
| POST | `/auth/logout` | — | — | Déconnexion : efface le cookie de session |
| GET | `/auth/me` | — | — | Identité portée par le JWT courant |
| GET | `/auth/me/functions` | — | — | Fonctions effectives de l’utilisateur courant |
| POST | `/auth/password` | — | — | Changer son mot de passe (exige le mot de passe actuel) |
| GET | `/auth/2fa/status` | — | — | État de la 2FA du compte courant |
| POST | `/auth/2fa/setup` | — | — | Démarrer l’activation 2FA : renvoie le QR code + secret |
| POST | `/auth/2fa/enable` | — | — | Confirmer l’activation 2FA — renvoie les codes de secours (une seule fois) |
| POST | `/auth/2fa/backup-codes` | — | — | Régénérer les codes de secours — protégé par mot de passe (invalide les précédents) |
| GET | `/auth/me/activity` | — | — | Mon activité récente (self-scopé, sans permission admin) |
| POST | `/auth/2fa/disable` | — | — | Désactiver la 2FA — protégé par mot de passe |
| PATCH | `/auth/policy` | `securite.authentification` | — | Politique d’authentification de l’établissement (2FA obligatoire) |

### `authors` — 6 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/authors/suggest` | — | — | Autocomplétion : auteurs existants par nom |
| GET | `/authors` | — | — | Liste des fiches auteur (avec nombre d’œuvres) |
| PATCH | `/authors/:id` | — | — | Modifier une fiche auteur — nom (propagé partout + réindex), notice, dates |
| POST | `/authors/:id/merge` | — | — | Fusionner cette fiche dans une autre (contributions basculées) |
| PATCH | `/authors/:id/compte` | — | — | Rattacher cette fiche à un compte — ou l’en détacher (`userId: null`) |
| DELETE | `/authors/:id` | — | — | Supprimer une fiche auteur (uniquement si zéro œuvre) |

### `cataloging` — 17 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/cataloging/records` | `catalogue.gerer` | — | Créer une notice |
| POST | `/cataloging/records/import-marc` | `outils.catalogue` | — | Importer un fichier MARC (ISO 2709) |
| GET | `/cataloging/export` | `catalogue.gerer` | — | Export MARC (UNIMARC) — notice, sélection ou catalogue complet |
| GET | `/cataloging/keywords` | `catalogue.gerer` | — | Mots-clés du tenant (autocomplétion du champ tags) |
| GET | `/cataloging/records` | `catalogue.gerer` | — | Registre des notices (paginé, filtre par catégorie) |
| GET | `/cataloging/records/:id` | `catalogue.gerer` | — | Détail d’une notice (avec exemplaires) |
| PATCH | `/cataloging/records/:id` | `catalogue.gerer` | — | Modifier une notice (réindexée) |
| DELETE | `/cataloging/records/:id` | `catalogue.gerer` | — | Supprimer une notice (refusé si exemplaires/réservations) |
| GET | `/cataloging/index-sante` | `catalogue.gerer` | — | Écart entre le catalogue en base et l’index de recherche |
| POST | `/cataloging/reindex` | `catalogue.gerer` | — | Réindexer tout le catalogue dans Meilisearch |
| POST | `/cataloging/records/:id/items` | `catalogue.gerer` | — | Ajouter un exemplaire à une notice |
| PATCH | `/cataloging/items/:itemId` | `catalogue.gerer` | — | Modifier un exemplaire |
| DELETE | `/cataloging/items/:itemId` | `catalogue.gerer` | — | Supprimer un exemplaire (refusé si prêts rattachés) |
| POST | `/cataloging/records/:id/digital-copy` | `catalogue.gerer` | — | Téléverser le fichier numérique (PDF/EPUB) d’une notice |
| GET | `/cataloging/records/:id/digital-copy` | `catalogue.gerer` | — | Métadonnées de l’exemplaire numérique d’une notice (personnel) |
| GET | `/cataloging/records/:id/digital-copy/download-url` | `document.telecharger` | — | URL signée temporaire pour télécharger le fichier numérique (admin) |
| DELETE | `/cataloging/records/:id/digital-copy` | `catalogue.gerer` | — | Supprimer l’exemplaire numérique d’une notice |

### `categories` — 4 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/categories` | — | — | Lister les catégories (domaines) de l’école |
| POST | `/categories` | — | — | Créer une catégorie |
| PATCH | `/categories/:id` | — | — | Renommer une catégorie |
| DELETE | `/categories/:id` | — | — | Supprimer une catégorie |

### `circulation` — 13 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/circulation/checkout` | — | — | Enregistrer un prêt (codes-barres exemplaire + adhérent) |
| POST | `/circulation/return` | — | — | Enregistrer un retour |
| POST | `/circulation/checkouts/:id/renew` | — | — | Renouveler un prêt |
| POST | `/circulation/checkouts/:id/perte` | — | — | Clore un prêt pour PERTE du document |
| GET | `/circulation/overdues` | — | — | Registre des retards (amende courue en FCFA) |
| GET | `/circulation/patrons/:id` | — | — | Situation d’un adhérent (prêts, réservations, amendes FCFA) |
| GET | `/circulation/holds` | — | — | File d’attente des réservations (vue guichet) |
| POST | `/circulation/holds` | — | — | Poser une réservation |
| POST | `/circulation/holds/:id/cancel` | — | — | Annuler une réservation |
| POST | `/circulation/rules` | — | `amendes` | Créer une règle de circulation |
| GET | `/circulation/rules` | — | `amendes` | Lister les règles de circulation |
| PATCH | `/circulation/rules/:id` | — | `amendes` | Modifier une règle de circulation |
| DELETE | `/circulation/rules/:id` | — | `amendes` | Supprimer une règle de circulation |

### `depots` — 15 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/depots` | `depot.deposer` | — | Créer un dépôt (brouillon) |
| GET | `/depots/directeurs` | `depot.deposer` | — | Les directeurs que je peux désigner |
| PATCH | `/depots/:id/directeur` | `depot.deposer` | — | Désigner ou changer le directeur d’un brouillon |
| GET | `/depots/mes-depots` | `depot.deposer` | — | Mes dépôts et leur état |
| POST | `/depots/:id/document` | `depot.deposer` | — | Téléverser le document du dépôt (PDF ou EPUB) |
| POST | `/depots/:id/soumettre` | `depot.deposer` | — | Soumettre un dépôt au directeur |
| GET | `/depots/:id/document` | — | — | URL de lecture du document déposé (5 min) |
| POST | `/depots/:id/retirer` | `depot.deposer` | — | Retirer mon dépôt soumis — il repasse en brouillon |
| GET | `/depots/soumis` | `catalogue.gerer` | — | Tous les dépôts en attente de décision, du plus ancien au plus récent |
| POST | `/depots/:id/reattribuer` | `catalogue.gerer` | — | Réattribuer un dépôt soumis à un autre directeur |
| GET | `/depots/a-valider` | `depot.valider` | — | Les dépôts que JE dirige et qui attendent ma décision |
| POST | `/depots/:id/valider` | `depot.valider` | — | Valider le CONTENU d’un dépôt que l’on dirige |
| POST | `/depots/:id/refuser` | `depot.valider` | — | Refuser un dépôt, AVEC son motif |
| GET | `/depots/a-cataloguer` | `catalogue.gerer` | — | Les dépôts validés dont la notice reste à créer |
| POST | `/depots/:id/notice` | `catalogue.gerer` | — | Rattacher au dépôt la notice qu’on vient de cataloguer |

### `encadrements` — 2 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/encadrements/miens` | — | — | Les mémoires et thèses que J’AI dirigés |
| GET | `/encadrements/miens.csv` | — | — | Export CSV de mes encadrements — la pièce du dossier CCI |

### `enrollment` — 9 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/enrollment/classes` | — | — | Créer une classe |
| GET | `/enrollment/classes` | — | — | Lister les classes (avec effectif actif) |
| GET | `/enrollment/classes/:id` | — | — | Détail d’une classe (inscriptions) |
| PATCH | `/enrollment/classes/:id` | — | — | Modifier une classe |
| DELETE | `/enrollment/classes/:id` | — | — | Supprimer une classe |
| GET | `/enrollment/classes/:name/expected-students` | — | — | Étudiants attendus d’une classe (liste pré-chargée, statut réclamé) |
| POST | `/enrollment/enroll` | — | — | Inscrire un étudiant dans une classe (année académique) |
| GET | `/enrollment/enrollments` | — | — | Lister les inscriptions (filtres classe / année) |
| DELETE | `/enrollment/enrollments/:id` | — | — | Désinscrire un étudiant (efface sa classe active) |

### `health` — 1 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/health` | — | — |  |

### `inventory` — 10 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/inventory/sessions` | — | — | Créer une session de récolement |
| GET | `/inventory/sessions` | — | — | Lister les sessions de récolement |
| GET | `/inventory/sessions/:id` | — | — | Détail d’une session (avec progression) |
| POST | `/inventory/sessions/:id/scan` | — | — | Scanner un exemplaire (douchette) |
| GET | `/inventory/sessions/:id/report` | — | — | Rapport de récolement (vus / manquants / inattendus / en prêt) |
| GET | `/inventory/sessions/:id/report.csv` | — | — | Export CSV du rapport de récolement |
| POST | `/inventory/sessions/:id/close` | — | — | Clôturer une session |
| POST | `/inventory/sessions/:id/reopen` | — | — | Rouvrir une session clôturée par erreur |
| DELETE | `/inventory/sessions/:id/scans/:barcode` | — | — | Annuler un scan — un code-barres pointé par erreur |
| POST | `/inventory/sessions/:id/mark-missing` | — | — | Marquer les manquants confirmés (statut MISSING, tracé) |

### `labels` — 1 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/cataloging/labels` | `outils.catalogue` | — | Générer une planche PDF d’étiquettes code-barres |

### `modules` — 2 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/modules` | — | — | État des modules de l’établissement courant |
| PATCH | `/modules/:id` | `modules.gerer` | — | Activer ou désactiver un module pour l’établissement courant |

### `moissonnage` — 7 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/moissonnage/sources` | — | — | Les entrepôts déclarés, avec leur DERNIÈRE exécution |
| POST | `/moissonnage/sources` | — | — | Déclarer un entrepôt à moissonner |
| PATCH | `/moissonnage/sources/:id` | — | — | Modifier un entrepôt déclaré |
| DELETE | `/moissonnage/sources/:id` | — | — | Retirer un entrepôt déclaré — les notices moissonnées RESTENT |
| POST | `/moissonnage/sources/:id/executer` | — | — | Moissonner maintenant |
| GET | `/moissonnage/sources/:id/executions` | — | — | Les comptes rendus d’une source, du plus récent au plus ancien |
| GET | `/moissonnage/sources/:id/collisions` | — | — | Les notices signalées et non tranchées |

### `oai` — 2 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/oai` | — | `interoperabilite` |  |
| POST | `/oai` | — | `interoperabilite` |  |

### `offline-licensing` — 7 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/offline/devices` | — | — | Enregistrer un appareil (clé publique) pour la lecture hors-ligne. |
| POST | `/offline/licenses` | — | — | Émettre une licence hors-ligne (droit vérifié, CEK enveloppée, signée). |
| GET | `/offline/licenses/:id/status` | — | — | Statut d’une licence de l’appelant (rejoue le droit en ligne). |
| GET | `/offline/licenses/:id/blob-url` | — | — | URL signée du blob chiffré (licence active et à soi requise). |
| POST | `/offline/entitlements` | — | — | Statut de plusieurs licences de l’appelant (lot). |
| POST | `/offline/licenses/:id/revoke` | `catalogue.gerer` | — | Révoquer une licence (personnel : catalogue.gerer). |
| GET | `/offline/my-documents` | — | — | Documents lisibles hors-ligne par l’utilisateur. |

### `opac` — 11 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/opac/search` | — | — | Recherche dans le catalogue (public, plein texte + facettes) |
| GET | `/opac/chiffres` | — | — | Chiffres du fonds (public) — documents, lecteurs, numérique, hors ligne |
| GET | `/opac/nouveautes` | — | — | Notices récemment ajoutées au catalogue (public, ordre stable) |
| GET | `/opac/parcourir` | — | — | Parcourir le catalogue (public, paginé) |
| GET | `/opac/constellation` | — | — | Répartition du catalogue par catégorie (public, page constellation) |
| GET | `/opac/authors` | — | — | Index des auteurs (public) — liste alphabétique + nombre d’œuvres |
| GET | `/opac/authors/:id` | — | — | Fiche auteur (public) — infos + œuvres groupées par rôle |
| GET | `/opac/provenances` | — | — | D’où viennent ces notices — celles qui ont été moissonnées |
| GET | `/opac/resoudre/:identifiant` | — | — | Résoudre un identifiant pérenne (`oai:<école>:<uuid>`) vers sa notice |
| GET | `/opac/records/:id` | — | — | Fiche détaillée d’une notice (public) |
| GET | `/opac/records/:id/read` | — | — | URL de lecture en ligne du fichier numérique (membres autorisés uniquement) |

### `patrons` — 8 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| POST | `/patrons` | — | — | Inscrire un adhérent |
| GET | `/patrons` | — | — | Lister les adhérents (filtre catégorie / code-barres) |
| GET | `/patrons/:id` | — | — | Comptes actifs non encore liés à une carte |
| GET | `/patrons/comptes-a-lier` | — | — | Comptes actifs non encore liés à une carte |
| GET | `/patrons/:id` | — | — | Fiche adhérent (prêts en cours et réservations comptés) |
| GET | `/patrons/:id/loans` | — | — | Prêts d’un adhérent (en cours + historique paginé) |
| PATCH | `/patrons/:id` | — | — | Modifier un adhérent |
| DELETE | `/patrons/:id` | — | — | Supprimer un adhérent (refusé si prêts ou réservations actifs) |

### `reader` — 8 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/circulation-policy` | — | — | Politique de circulation en ligne (défauts si non configurée) |
| PATCH | `/circulation-policy` | — | — | Modifier la politique de circulation en ligne |
| GET | `/reader/card` | — | — | Ma carte de lecteur (code-barres d’adhérent) |
| GET | `/reader/loans` | — | — | Mes prêts (en cours + historique paginé) — borné à l’utilisateur connecté |
| POST | `/reader/loans/:id/renew` | — | — | Renouveler MON prêt (self-scopé, politique tenant) |
| GET | `/reader/holds` | — | — | Mes réservations (avec position dans la file) |
| POST | `/reader/holds` | — | — | Réserver un document (au nom du compte connecté) |
| POST | `/reader/holds/:id/cancel` | — | — | Annuler MA réservation (404 si elle ne m’appartient pas) |

### `reminders` — 5 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/reminders/settings` | — | — | Paramètres de rappels + modèles (défauts si non personnalisés) |
| PATCH | `/reminders/settings` | `circulation.retards` `rappels.envoyer` | — | Modifier les paramètres et modèles de rappels |
| GET | `/reminders/log` | — | — | Journal des rappels envoyés (destinataire, prêt, type, statut, date) |
| POST | `/reminders/preview` | — | — | Aperçu d’un modèle (rendu avec des données d’exemple) |
| POST | `/reminders/run` | `circulation.retards` `rappels.envoyer` | — | Déclencher les rappels de circulation maintenant |

### `roles` — 5 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/roles` | — | — | Lister les rôles de l’école (système + personnalisés) |
| GET | `/roles/fonctions` | — | — | Catalogue des fonctions disponibles (codes + libellés français) |
| POST | `/roles` | — | — | Créer un rôle personnalisé |
| PATCH | `/roles/:id` | — | — | Modifier un rôle personnalisé (nom, description, fonctions) |
| DELETE | `/roles/:id` | — | — | Supprimer un rôle personnalisé |

### `sru` — 1 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/cataloging/lookup` | `catalogue.gerer` | `interoperabilite` | Rechercher une notice sur les serveurs SRU (BnF, LoC…) |

### `stats` — 4 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/stats/dashboard` | — | — | Tableau de bord complet (KPIs, séries, palmarès, système) |
| GET | `/stats/export` | — | — | Export CSV d’un tableau (UTF-8 + BOM, séparateur ;) |
| GET | `/stats/rapport-annuel` | — | — | Le rapport annuel de l’établissement — ce qu’une directrice remet à son université |
| GET | `/stats/report` | — | — | Rapport d’activité complet (tous les indicateurs, un CSV) |

### `tenancy` — 7 route(s)

| Verbe | Chemin | Fonction exigée | Module | Résumé |
|---|---|---|---|---|
| GET | `/tenancy/qr.png` | `etablissement.apparence` | — | QR d’inscription de l’établissement (PNG) |
| GET | `/tenancy/qr.pdf` | `etablissement.apparence` | — | Affiche A4 imprimable avec le QR d’inscription |
| GET | `/tenancy/descriptor` | — | — | Descripteur de connexion (API publique, slug, nom) |
| GET | `/tenancy/current` | — | — | Identité publique de l’école du domaine courant |
| GET | `/tenancy/home` | — | — | Contenu complet de la page d’accueil du domaine courant |
| PATCH | `/tenancy/settings` | `etablissement.apparence` | — | Modifier les couleurs de l’école courante |
| POST | `/tenancy/settings/image` | `etablissement.apparence` | — | Téléverser une image de la vitrine (logo / photo hero) |

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
