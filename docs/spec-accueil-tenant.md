# Spec — Page d'accueil institutionnelle personnalisable par tenant

**Origine :** demande de la directrice de la BUC (EXEMPLE) — intégrer la page vitrine
(maquette la maquette de vitrine) comme page d'accueil publique,
en la rendant paramétrable par chaque établissement (couleurs, contenus, photos).

## Principe d'architecture

Trois couches strictement séparées :

1. **Gabarit** (code, commun à tous les tenants) : structure de la page —
   header, hero + recherche, bandeau statistiques, espaces, services,
   constellation des savoirs, horaires + accès aux ressources, footer.
2. **Design tokens** (par tenant, en base) : palette de couleurs injectée en
   variables CSS au rendu SSR. Étend le mécanisme de thème existant
   (le vert EXEMPLE actuel devient un token parmi d'autres).
3. **Contenu** (par tenant, en base) : textes, chiffres, listes, images
   (MinIO), coordonnées. Saisis dans Administration → Établissement.

## 1. Design tokens

Renommer les variables de la maquette en noms **sémantiques neutres**
(aucune référence EXEMPLE dans le code) :

| Maquette | Token tenant | Rôle | Défaut EXEMPLE |
|---|---|---|---|
| --forest | --primary | couleur principale (boutons, liens, bandeau stats) | #0B5D34 |
| --forest-dark | --primary-dark | footer, hover | #083F24 |
| --clay | --accent | accent chaud (em du titre, bouton secondaire) | #C1592C |
| --clay-soft | --accent-soft | dégradés | #E8B98C |
| --gold | --highlight | petites touches (numéros, titres footer) | #D9A441 |
| --sand | --bg | fond de page | #F1E7D2 |
| --sand-deep | --bg-deep | sections alternées | #E7D9BB |
| --cream | --surface | cartes, header | #FBF6EA |
| --ink / --ink-soft | --text / --text-soft | textes | #221C13 / #4A4030 |
| --ember | --danger | statuts négatifs | #9E2B2B |

- Stockage : JSON themeTokens dans les paramètres du tenant, valeurs par
  défaut = palette ci-dessus. Cohérence avec le thème existant : le vert
  #1B5E3A du tenant EXEMPLE actuel doit rester la source du --primary
  applicatif — décider si la vitrine partage --primary avec l'app (recommandé,
  un seul choix de couleur pour l'école) ou a sa palette propre.
- Admin : color pickers avec aperçu live, bouton « réinitialiser aux défauts ».
- Le **motif décoratif** (croisillons inspirés de la façade BUC : .lattice-bg,
  .lattice-strip) devient une option par tenant : activé/désactivé
  (défaut : désactivé pour un nouveau tenant, activé pour EXEMPLE).

## 2. Contenu par tenant

Blocs de contenu (JSON en base ou table dédiée), **chaque section optionnelle** —
une section sans contenu ne s'affiche pas :

- **Identité** : nom complet, sigle (ex. « BUC »), sous-titre (nom de
  l'université), devise/citation (ex. « La connaissance est la clé de la
  liberté. »), accroche du hero (ex. « Un lieu, mille savoirs. » — avec la
  partie mise en valeur par --accent), paragraphe de présentation, logo,
  photo du hero (upload MinIO ; remplace le dégradé placeholder de la maquette,
  avec légende).
- **Statistiques** : liste ordonnée de 0–4 paires {valeur, libellé}
  (ex. « 400 / Places · grande salle de lecture »).
- **Espaces** : liste de cartes {icône (emoji ou pictogramme), titre,
  sous-titre mono (capacité/tag), description} — EXEMPLE en a 7.
- **Services** : liste simple de titres numérotés automatiquement.
- **Horaires** : lignes {libellé, valeur} + note optionnelle.
- **Accès aux ressources** : lignes {nom, description, statut live/maint/off,
  URL} (ex. Gafeso / Catalogue PMB / ancien portail).
- **Contact & footer** : adresse postale, téléphone(s), email, réseaux
  sociaux, mention partenaire (ex. « Bibliothèque rénovée avec l'appui de la
  Banque mondiale »).

Seed initial du tenant EXEMPLE avec le contenu exact de la maquette (issu du
poster officiel de la BUC).

## 3. Sections dynamiques (jamais saisies à la main)

- **Constellation des savoirs** : les pilules de domaines sont générées depuis
  le catalogue réel du tenant — catégories ayant au moins 1 ressource, avec
  compteur, chaque pilule menant à l'OPAC filtré sur cette catégorie. Même
  source de données que la page constellation actuelle.
- **Recherche du hero** : branchée sur la recherche OPAC réelle (submit →
  page de résultats du catalogue). Pas de recherche factice.
- **Liens Se connecter / Ouvrir le catalogue / Créer un compte** : générés
  depuis le domaine du tenant (jamais d'URL en dur du type bibliotheque.exemple.bf).

## 4. Routage et rendu

- La page devient l'**accueil public** du tenant (/), rendue SSR avec
  résolution par Host header (mécanisme existant). La constellation actuelle
  devient la section « Constellation des savoirs » de cette page (conserver
  une ancre/URL pour ne pas casser les liens existants).
- Retirer la mention « Maquette de démonstration » du footer.
- Performance : page publique très visitée → cache SSR raisonnable,
  invalidé quand l'admin modifie le contenu.
- Responsive : conserver les breakpoints de la maquette (900px / 560px),
  vérifier sur mobile réel — c'est la page que les étudiants ouvriront
  sur téléphone.

## 5. Admin — Administration → Établissement

Nouvel onglet « Page d'accueil » :

- Sous-sections correspondant aux blocs du §2, avec ajout/suppression/
  réordonnancement des éléments de listes (stats, espaces, services,
  horaires, ressources).
- Upload d'images (logo, photo hero) vers MinIO — réutiliser la chaîne
  d'upload existante ; formats acceptés jpg/png/webp, taille max raisonnable.
- Color pickers des tokens (§1) + toggle du motif décoratif.
- Bouton « Prévisualiser » (ouvre l'accueil dans un nouvel onglet).
- Permissions : réservé au rôle disposant de la gestion de l'établissement.

## 6. Recette

- [ ] EXEMPLE : la page reproduit fidèlement la maquette (couleurs, contenus,
      motif croisillons), recherche branchée sur l'OPAC, constellation
      dynamique avec les vraies catégories/compteurs.
- [ ] Modifier une couleur dans l'admin → visible sur l'accueil après refresh.
- [ ] Vider la section « Statistiques » → le bandeau disparaît proprement.
- [ ] Créer un tenant de test avec palette différente et motif désactivé →
      aucune trace visuelle ou textuelle d'EXEMPLE.
- [ ] Mobile : hero, grilles espaces/services, footer corrects à 375px.
- [ ] Aucune régression : OPAC, admin, lecture protégée intacts.
