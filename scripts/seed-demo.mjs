// Seed de démonstration Gafeso — établissement fictif.
//
// Idempotent : rejouable après n'importe quel redémarrage/rollback Docker.
// Reconstruit tout : école provisionnée, comptes (personnel + étudiants),
// classes, liste des attendus, catalogue, exemplaires, adhérents, règles de
// prêt, puis réindexe Meilisearch.
//
// Réservé au développement/démo — REFUSE toute cible non locale (voir le
// garde-fou plus bas). Le mot de passe des comptes est tiré au hasard et
// affiché en fin d'exécution ; SEED_PASSWORD permet de le fixer.
//
// pour un premier provisioning de production, voir scripts/provision-production.mjs.
//
// Prérequis : l'API doit tourner. Lancer depuis la racine :
//   npm run seed:demo
// En dev, les variables viennent de .env (chargé automatiquement s'il est
// présent — voir scripts/lib/load-env.mjs). En production (conteneur Docker,
// pas de fichier .env), les variables sont déjà dans l'environnement :
//   docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
//     exec api node scripts/seed-demo.mjs
//
// Le mot de passe des comptes est tiré au hasard et affiché à la fin.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { loadEnvIfPresent } from './lib/load-env.mjs';
import { assurerLesInscriptions } from './lib/inscriptions.mjs';
import { assurerLesDocumentsNumeriques } from './lib/documents-numeriques.mjs';

loadEnvIfPresent();

const API = process.env.SEED_API_URL ?? 'http://localhost:4000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev_admin_key_local';
const SLUG = 'zinda'; // slug technique (le nom affiché est celui de SCHOOL)
const SCHOOL = 'Université d’Exemple';

// ⚠ GARDE-FOU DE CIBLE. Ce seed CRÉE une école entière avec des comptes dont
// le mot de passe est partagé. Sur une instance en service, il ouvrirait des
// accès et polluerait le catalogue vu par les lecteurs. Seules les cibles
// locales sont admises ; forcer exige un acte délibéré (SEED_FORCE=1).
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API) && process.env.SEED_FORCE !== '1') {
  console.error(`✖ Cible non locale (${API}).`);
  console.error('  Ce seed crée une école de démonstration avec des comptes partagés.');
  console.error('  Sur une installation réelle, relancez avec SEED_FORCE=1 en connaissance de cause.');
  process.exit(2);
}

// Mot de passe des comptes de démonstration. TIRÉ AU HASARD par défaut et
// affiché une fois en fin d'exécution : un mot de passe écrit dans le dépôt
// est un mot de passe publié — donc un compte ouvert sur toute installation
// où ce seed aurait été lancé. Surchargeable (SEED_PASSWORD) pour retrouver
// un jeu de comptes stable entre deux exécutions de développement.
const PASSWORD =
  process.env.SEED_PASSWORD ??
  `Gafeso-${randomBytes(9).toString('base64url')}!1`;

const log = (msg) => console.log(`  • ${msg}`);

// ── 1. Provisioning de l'école (via l'API admin) ──────────────
async function provision() {
  const res = await fetch(`${API}/admin/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-api-key': ADMIN_KEY },
    body: JSON.stringify({ name: SCHOOL, slug: SLUG, domain: 'localhost' }),
  });
  if (res.status === 201) log('école provisionnée');
  else if (res.status === 409) log('école déjà provisionnée');
  else throw new Error(`provisioning: HTTP ${res.status} ${await res.text()}`);

  // Propage d'éventuelles nouvelles tables aux écoles existantes.
  await fetch(`${API}/admin/tenants/${SLUG}/sync-schema`, {
    method: 'POST',
    headers: { 'x-admin-api-key': ADMIN_KEY },
  });
  log('schéma synchronisé');
}

// ── Clients Prisma (public + schéma de l'école) ───────────────
function tenantUrl() {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema', `tenant_${SLUG}`);
  return url.toString();
}

/**
 * Page d'accueil COMPLÈTE de l'école de démonstration.
 *
 * ⚠ POURQUOI C'EST DANS LE SEED et non saisi à la main : une démonstration
 * configurée à la main disparaît à la première réinstallation, et personne ne
 * sait ce qu'il fallait ressaisir. Ici c'est du code — versionné, reproductible,
 * et toute réinstallation repart présentable.
 *
 * ⚠ TOUT CE QUI EST PROPRE À L'ÉTABLISSEMENT EST FICTIF, ET SE VOIT : adresse
 * « 01 BP 0000 », téléphone en 00, courriel en @exemple.bf. Un contact
 * plausible sur une démonstration finit recopié dans une vraie installation,
 * et devient une adresse où personne ne répond.
 *
 * ⚠ LES TROIS IMAGES sont des panneaux SVG de la charte
 * (apps/web/public/demo/), pas des photos. Décidé le 10 septembre 2026 : une
 * image dont on ne peut pas vérifier la licence n'a rien à faire dans un dépôt
 * qui sert de source à un instantané public, et une démonstration qui pointe
 * vers un service externe contredit l'argument de souveraineté du produit —
 * et tombe si le réseau faiblit. À remplacer par de vraies photos le jour où
 * l'établissement en fournit : ce sera trois fichiers et trois chemins.
 */
const PAGE_ACCUEIL = {
  identity: {
    fullName: 'Université d’Exemple — Bibliothèque universitaire',
    acronym: 'UEX',
    brandMark: 'UE',
    subtitle: 'Bibliothèque universitaire',
    tagline: 'Bibliothèque universitaire',
    heroTitle: 'Le savoir universitaire',
    heroTitleAccent: 'à portée de main',
    lead:
      'Cherchez, empruntez et lisez les ressources de votre bibliothèque — sur le campus comme hors connexion.',
    // ⚠ AUCUN CHIFFRE ICI, ET C'EST DÉLIBÉRÉ. Cette ligne annonçait « Plus de
    // 12 000 références » sur une école qui en compte 480 — vingt-cinq fois
    // trop, sur la PREMIÈRE phrase que lit un visiteur du catalogue public.
    //
    // C'est « un libellé qui décrit un ÉTAT DU SYSTÈME n'est pas une constante,
    // c'est une mesure figée dans une chaîne » : le nombre était peut-être vrai
    // le jour où la maquette a été écrite, il ne l'a jamais été en base.
    //
    // ⚠ Et il ne suffit pas de le corriger à 480 : ce texte est saisi par
    // l'établissement, et il vieillira au premier import. Un indice de
    // recherche décrit ce qu'on CHERCHE, pas combien il y en a — les chiffres
    // réels vivent dans la constellation, calculée à chaque visite.
    searchHint: 'Livres, thèses, mémoires et documents numérisés de l’établissement.',
    logoUrl: null,
    // Les trois champs historiques restent VIDES : la liste ci-dessous fait
    // foi, et les remplir ferait apparaître le bloc « ancienne image sans
    // effet » dans /admin/accueil dès la première ouverture.
    heroImageUrl: null,
    heroImageKicker: '',
    heroImageCaption: '',
    heroSlides: [
      {
        imageUrl: '/demo/salle-de-lecture.svg',
        surtitre: 'CAMPUS',
        titre: 'Une salle de lecture ouverte à tous',
      },
      {
        imageUrl: '/demo/fonds-ancien.svg',
        surtitre: 'COLLECTIONS',
        titre: 'Un fonds patrimonial en accès libre',
      },
      {
        imageUrl: '/demo/vie-etudiante.svg',
        surtitre: 'NUMÉRIQUE',
        titre: 'Vos documents, même sans réseau',
      },
    ],
  },
  stats: [],
  espaces: [],
  services: [],
  hours: {
    note: 'Fermeture annuelle en août.',
    lines: [
      { label: 'Lundi — vendredi', value: '08h00 — 19h00' },
      { label: 'Samedi', value: '09h00 — 13h00' },
      { label: 'Dimanche', value: 'Fermé' },
    ],
  },
  resources: [],
  contact: {
    description:
      'La bibliothèque universitaire accompagne étudiants, enseignants et chercheurs dans leurs travaux.',
    partnerNote: '',
    // Fictif ET visiblement fictif — voir l'avertissement en tête.
    address: '01 BP 0000, Ouagadougou, Burkina Faso',
    phones: '+226 00 00 00 00',
    email: 'bibliotheque@exemple.bf',
    socials: [],
    copyright: '© 2026 — Université d’Exemple',
  },
};

// ── 2. Public : super-admin, nom, couleurs, domaines ─────
async function seedPublic(pub) {
  // Super-admin plateforme (login sur /admin/login)
  const saHash = await bcrypt.hash(PASSWORD, 10);
  await pub.superAdmin.upsert({
    where: { email: 'super@gafeso.local' },
    create: { email: 'super@gafeso.local', password: saHash, name: 'Super Admin' },
    update: {},
  });
  log('super-admin plateforme (super@gafeso.local)');

  const tenant = await pub.tenant.findUnique({ where: { slug: SLUG } });
  await pub.tenant.update({ where: { id: tenant.id }, data: { name: SCHOOL } });
  await pub.tenantSettings.update({
    where: { tenantId: tenant.id },
    data: {
      primaryColor: '#0E5D31',
      secondaryColor: '#C8102E',
      homepageContent: PAGE_ACCUEIL,
    },
  });
  for (const domain of ['localhost', 'zinda.localhost']) {
    await pub.domain.upsert({
      where: { domain },
      create: { tenantId: tenant.id, domain, isPrimary: domain === 'localhost' },
      update: {},
    });
  }
  log('branding + page d’accueil complète (3 diapositives, horaires, contact fictif)');
}

// ── 3. École : comptes, classes, catalogue, prêts ─────────────
const STAFF = [
  { email: 'admin@exemple.bf', firstName: 'Rasmata', lastName: 'Nikiema', role: 'ADMIN' },
  { email: 'gestion@exemple.bf', firstName: 'Mariam', lastName: 'Kaboré', role: 'MANAGER' },
  { email: 'bib@exemple.bf', firstName: 'Salif', lastName: 'Ouédraogo', role: 'LIBRARIAN' },
];

// ⚠ UN ÉTUDIANT NOMMÉ PAR FILIÈRE, ET C'EST POUR LA DÉMONSTRATION DU CONTRÔLE
// D'ACCÈS. Elle se montre en ouvrant DEUX comptes côte à côte : chacun voit le
// socle plus sa filière, jamais celle de l'autre. Mesuré par la vraie fonction
// de décision le 15 septembre 2026 — L1_DROIT voit « Travaux de recherche —
// Droit », L1_INFO voit « — Informatique », et aucun ne voit l'autre.
//
// Sans `justine@`, la comparaison opposait `awa@exemple.bf` à
// `etu-2026-0105@exemple.bf` : une personne face à un matricule. Le public
// regarde l'adresse, et l'asymétrie suggère que l'un des deux est un cas
// particulier — alors que c'est exactement l'inverse qu'on démontre.
const STUDENTS = [
  { matricule: 'ETU-2026-0001', email: 'awa@exemple.bf', firstName: 'Awa', lastName: 'Traoré', className: 'L1_DROIT' },
  { matricule: 'ETU-2026-0002', email: 'boubacar@exemple.bf', firstName: 'Boubacar', lastName: 'Diallo', className: 'M2_MEDECINE' },
  { matricule: 'ETU-2026-0004', email: 'justine@exemple.bf', firstName: 'Justine', lastName: 'Ilboudo', className: 'L1_INFO' },
];

const EXPECTED = [
  ...STUDENTS.map((s) => ({ ...s })),
  { matricule: 'ETU-2026-0003', email: 'fatou.sow@exemple.bf', firstName: 'Fatou', lastName: 'Sow', className: 'L1_DROIT' },
];

const CLASSES = [
  { name: 'L1_DROIT', label: 'Licence 1 Droit', level: 'L1' },
  { name: 'M2_MEDECINE', label: 'Master 2 Médecine', level: 'M2' },
  { name: 'L1_INFO', label: 'Licence 1 Informatique', level: 'L1' },
];

/**
 * Catalogue de démonstration — 12 notices écrites à la main, complétées par un
 * générateur.
 *
 * ⚠ POURQUOI BEAUCOUP DE NOTICES. À douze, une démonstration ne démontre rien :
 * la section des chiffres reste sous son seuil, la constellation affiche des
 * domaines à une ressource, et « À découvrir » puise dans un fonds famélique.
 *
 * ⚠ RIEN NE DOIT POUVOIR PASSER POUR UNE VRAIE NOTICE.
 *  - Les ISBN sont préfixés « EXEMPLE- » : aucun ISBN réel ne commence ainsi.
 *  - Les auteurs sont tirés de deux listes de prénoms et de noms TRÈS RÉPANDUS
 *    au Burkina Faso, combinés au hasard. Deux auteurs réels traînaient dans
 *    les douze notices d'origine — Ki-Zerbo et Bidima, des personnes qui ont
 *    existé et publié — et ils ont été remplacés.
 *    ⚠ Une combinaison tirée au sort PEUT coïncider avec une personne réelle :
 *    c'est le prix de noms plausibles. Le risque est borné en n'attachant
 *    aucune donnée biographique, et en ne combinant que des noms si courants
 *    qu'ils ne désignent personne en particulier. Si cela ne suffit pas, la
 *    solution est de nommer les auteurs « Auteur d'exemple 042 » — plus sûr,
 *    et beaucoup moins parlant en démonstration.
 *
 * ⚠ TIRAGE DÉTERMINISTE (générateur congruentiel, graine fixe) : deux
 * réinstallations produisent le MÊME catalogue. Sans cela, deux machines de
 * démonstration montreraient des fonds différents, et aucune capture d'écran
 * ne resterait valable.
 */
const PRENOMS = [
  'Awa', 'Salif', 'Mariam', 'Issa', 'Pauline', 'Rasmata', 'Benjamin', 'Adama',
  'Fatoumata', 'Alain', 'Aminata', 'Boureima', 'Céline', 'Drissa', 'Émilie',
  'Hamidou', 'Justine', 'Karim', 'Léa', 'Moussa', 'Nathalie', 'Ousmane',
  'Rakieta', 'Sayouba', 'Téné', 'Yacouba', 'Zalissa', 'Abdoulaye', 'Bintou',
];
const NOMS = [
  'Ouédraogo', 'Kaboré', 'Sawadogo', 'Traoré', 'Compaoré', 'Zongo', 'Sanou',
  'Nikiema', 'Ouoba', 'Sanogo', 'Bationo', 'Congo', 'Dabiré', 'Ilboudo',
  'Kinda', 'Lompo', 'Nacoulma', 'Palenfo', 'Sankara', 'Tapsoba', 'Yaméogo',
  'Zoungrana', 'Barry', 'Diallo', 'Koné', 'Sirima',
];

/** Sujets par domaine, croisés avec des qualificatifs — titres plausibles. */
const SUJETS = {
  droit: ['Droit foncier rural', 'Contentieux administratif', 'Droit du travail', 'Procédure civile', 'Droit des sociétés', 'Justice coutumière', 'Droit de la famille', 'Droit pénal des affaires'],
  medecine: ['Santé maternelle', 'Paludisme', 'Nutrition infantile', 'Épidémiologie de terrain', 'Pharmacopée traditionnelle', 'Santé publique en milieu rural', 'Chirurgie ambulatoire', 'Maladies chroniques'],
  informatique: ['Réseaux et protocoles', 'Bases de données', 'Apprentissage automatique', 'Génie logiciel', 'Sécurité des systèmes', 'Systèmes embarqués', 'Traitement d’images', 'Architecture des ordinateurs'],
  histoire: ['Empires du Sahel', 'Colonisation et résistances', 'Histoire des migrations', 'Sociétés précoloniales', 'Mémoire et archives', 'Villes et commerce transsaharien'],
  economie: ['Microfinance', 'Économie agricole', 'Commerce régional', 'Politiques publiques', 'Marchés du travail', 'Économie informelle'],
  langues: ['Grammaire mooré', 'Lexicologie dioula', 'Sociolinguistique', 'Didactique du français', 'Traduction et interprétation', 'Langues et scolarisation'],
  litterature: ['Roman contemporain', 'Poésie orale', 'Théâtre populaire', 'Récits de vie', 'Littérature et engagement', 'Contes et transmission'],
  philosophie: ['Philosophie politique', 'Éthique appliquée', 'Philosophie des sciences', 'Pensée africaine contemporaine', 'Logique et argumentation'],
  sciences: ['Chimie analytique', 'Physique des matériaux', 'Hydrologie', 'Agronomie des sols', 'Biodiversité sahélienne', 'Mathématiques appliquées'],
  arts: ['Arts plastiques', 'Musique et instruments', 'Cinéma documentaire', 'Textiles et motifs', 'Photographie sociale'],
};
const QUALIFICATIFS = [
  'au Burkina Faso', 'en Afrique de l’Ouest', '— approche comparée', '— étude de cas',
  'dans la région du Centre', '— manuel de premier cycle', '— actes du colloque',
  '— perspectives contemporaines', 'et développement local', '— travaux dirigés',
];
const TYPES = ['ouvrage', 'ouvrage', 'ouvrage', 'these', 'memoire', 'memoire', 'publication'];
/** Villes de soutenance — les mêmes que celles du fonds, pour rester plausible. */
const VILLES_SOUTENANCE = ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou', 'Dakar', 'Abidjan', 'Bamako'];

/** Générateur congruentiel : reproductible, sans dépendance. */
function tirage(graine) {
  let x = graine;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function genererNotices(combien) {
  const alea = tirage(20260910);
  const pioche = (liste) => liste[Math.floor(alea() * liste.length)];
  const domaines = Object.keys(SUJETS);
  const notices = [];
  const vus = new Set();
  let n = 0;
  while (notices.length < combien && n < combien * 20) {
    n += 1;
    const category = pioche(domaines);
    const titre = `${pioche(SUJETS[category])} ${pioche(QUALIFICATIFS)}`;
    // Titre = clé naturelle de l'idempotence du seed : jamais deux fois le même.
    if (vus.has(titre)) continue;
    vus.add(titre);
    const recordType = pioche(TYPES);
    // ⚠ UNE SOUTENANCE SE DÉCRIT ENTIÈREMENT, sinon elle ne démontre rien.
    // `cataloging.service` REFUSE une thèse ou un mémoire sans université de
    // soutenance et sans directeur ; le seed écrit en direct par Prisma et
    // contournait donc la règle du produit. Mesuré le 12 septembre 2026 sur
    // l'école de démonstration : 162 travaux académiques, 45 sans université,
    // et ZÉRO directeur. Le fonds contenait des notices que le produit lui-même
    // rejetterait — et ETD-MS, livré, n'avait rien à montrer : toute sa valeur
    // pour un moissonneur de thèses tient à la distinction advisor / author.
    const academique = recordType === 'these' || recordType === 'memoire';
    const ville = pioche(VILLES_SOUTENANCE);
    notices.push({
      title: titre,
      author: `${pioche(NOMS)}, ${pioche(PRENOMS)}`,
      // ⚠ `profile` DÉCIDE DE L'EXPOSITION ETD-MS : `exposableEnEtdms` ne retient
      // que « academique », et la colonne vaut « bibliographique » par défaut.
      // Sans cette ligne, une installation neuve exporterait ZÉRO thèse.
      profile: academique ? 'academique' : 'bibliographique',
      // Le directeur est porté ici et transformé en CONTRIBUTEUR plus bas : la
      // colonne `author` ne connaît que l'auteur principal.
      directeur: academique ? `${pioche(NOMS)}, ${pioche(PRENOMS)}` : null,
      defenseUniversity: academique ? `Université de ${ville}` : null,
      defensePlace: academique ? ville : null,
      // ⚠ LES DEUX ENDROITS, ET CE N'EST PAS UNE REDONDANCE. Depuis P3 les trois
      // champs de profil sont LUS dans `profileData` ; les colonnes restent le
      // temps de la transition. N'écrire que la colonne laisse l'export ETD-MS
      // sans `<grantor>` — 45 soutenances renseignées en base et invisibles à
      // l'entrepôt, mesuré sur l'école de démonstration.
      profileData: academique
        ? { defenseUniversity: `Université de ${ville}`, defensePlace: ville }
        : {},
      category,
      recordType,
      publishYear: 2012 + Math.floor(alea() * 14),
      isbn: `EXEMPLE-${String(1000 + notices.length)}`,
      // Couvertures VECTORIELLES d'exemple, servies en statique par le front,
      // réparties sur six variantes pour que la grille ne se répète pas.
      //
      // MESURE, en curl et sans cookie, sur le build de production du
      // 10 septembre 2026 — page d'accueil publique, tout compressé :
      //   JavaScript, 7 fragments ......... 151 964 o
      //   4 couvertures (celles qui sont
      //   RÉELLEMENT demandées au
      //   chargement, les 2 autres étant
      //   différées) ........................ 2 118 o   soit 1,4 % du JS
      //   3 panneaux du bandeau ............. 2 012 o
      //
      // ⚠ DEUX CORRECTIONS À UN RELEVÉ PRÉCÉDENT, et elles disent la même
      // chose. Le premier comptait SIX fragments JS : il manquait
      // `polyfills` (39 627 o compressés), que le navigateur ne demande pas
      // — il porte `noModule`, les navigateurs modernes le sautent — mais
      // qui est bien référencé dans le HTML et que servirait un navigateur
      // ancien. Il comptait aussi SIX couvertures là où quatre seulement
      // sont demandées. Dans les deux cas, le relevé venait du journal
      // réseau du NAVIGATEUR : il ne montre que ce que CE navigateur-là a
      // demandé, jamais ce que la page contient. C'est le même écart que
      // « présent dans le DOM ≠ servi », pris par l'autre bout.
      //
      // D'où la règle : un relevé de poids se fait en curl, sur les
      // fragments listés dans le HTML — aucun cookie, aucune session
      // parasite, aucune optimisation propre à un navigateur.
      coverUrl: `/demo/couvertures/0${(notices.length % 6) + 1}.svg`,
    });
  }
  return notices;
}

const RECORDS_ECRITS = [
  { title: 'Droit constitutionnel burkinabè', author: 'Traoré, Awa', directeur: 'Ouédraogo, Salif', defenseUniversity: 'Université de Ouagadougou', defensePlace: 'Ouagadougou', profile: 'academique', profileData: { defenseUniversity: 'Université de Ouagadougou', defensePlace: 'Ouagadougou' }, category: 'droit', recordType: 'these', publishYear: 2023, isbn: 'EXEMPLE-0001' },
  { title: 'Précis de droit foncier rural', author: 'Ouédraogo, Salif', directeur: 'Kaboré, Mariam', defenseUniversity: 'Université de Bobo-Dioulasso', defensePlace: 'Bobo-Dioulasso', profile: 'academique', profileData: { defenseUniversity: 'Université de Bobo-Dioulasso', defensePlace: 'Bobo-Dioulasso' }, category: 'droit', recordType: 'memoire', publishYear: 2021 },
  { title: 'Anatomie générale', author: 'Kaboré, Mariam', category: 'medecine', recordType: 'ouvrage', publishYear: 2022 },
  { title: 'Informatique pour tous', author: 'Sawadogo, Issa', category: 'informatique', recordType: 'ouvrage', publishYear: 2020 },
  { title: 'Algorithmique avancée', author: 'Zongo, Pauline', category: 'informatique', recordType: 'ouvrage', publishYear: 2021 },
  { title: 'Histoire des empires du Sahel', author: 'Kaboré, Émilie', category: 'histoire', recordType: 'publication', publishYear: 2019 },
  { title: 'Microéconomie appliquée', author: 'Nikiema, Rasmata', directeur: 'Zongo, Pauline', defenseUniversity: 'Université de Koudougou', defensePlace: 'Koudougou', profile: 'academique', profileData: { defenseUniversity: 'Université de Koudougou', defensePlace: 'Koudougou' }, category: 'economie', recordType: 'memoire', publishYear: 2022 },
  { title: 'Grammaire mooré-français', author: 'Ouoba, Benjamin', directeur: 'Sanogo, Alain', defenseUniversity: 'Université de Ouagadougou', defensePlace: 'Ouagadougou', profile: 'academique', profileData: { defenseUniversity: 'Université de Ouagadougou', defensePlace: 'Ouagadougou' }, category: 'langues', recordType: 'memoire', publishYear: 2018 },
  { title: 'Introduction à la philosophie africaine', author: 'Yaméogo, Céline', directeur: 'Sanou, Fatoumata', defenseUniversity: 'Université de Bobo-Dioulasso', defensePlace: 'Bobo-Dioulasso', profile: 'academique', profileData: { defenseUniversity: 'Université de Bobo-Dioulasso', defensePlace: 'Bobo-Dioulasso' }, category: 'philosophie', recordType: 'these', publishYear: 2020 },
  { title: 'Chimie générale — 1er cycle', author: 'Compaoré, Adama', category: 'sciences', recordType: 'ouvrage', publishYear: 2023 },
  { title: 'Arts plastiques du Burkina', author: 'Sanou, Fatoumata', category: 'arts', recordType: 'publication', publishYear: 2021 },
  { title: 'Anthologie de la littérature burkinabè', author: 'Sanogo, Alain', category: 'litterature', recordType: 'ouvrage', publishYear: 2017 },
];

/**
 * PDF d'exemple minimal, construit ici plutôt que versionné en binaire.
 *
 * Les décalages de la table xref sont CALCULÉS : un xref faux se lit quand
 * même dans pdf.js, qui sait reconstruire, mais un fichier qu'on produit
 * soi-même n'a aucune raison d'être invalide.
 */
function construirePdfDExemple() {
  const objets = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R'
      + '/Resources<</Font<</F1 5 0 R>>>>>>',
    null, // le flux de contenu, rempli juste après
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  const texte = 'BT /F1 22 Tf 60 760 Td (Document d\'exemple — Gafeso) Tj'
    + ' 0 -34 Td /F1 13 Tf (Catalogue de demonstration. Aucun contenu reel.) Tj ET';
  objets[3] = `<</Length ${texte.length}>>stream\n${texte}\nendstream`;

  let pdf = '%PDF-1.4\n';
  const decalages = [];
  objets.forEach((corps, i) => {
    decalages.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${corps}\nendobj\n`;
  });
  const debutXref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) pdf += `${String(d).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<</Size ${objets.length + 1}/Root 1 0 R>>\nstartxref\n${debutXref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const PDF_EXEMPLE = construirePdfDExemple();
const CLE_PDF_EXEMPLE = 'demo/document-d-exemple.pdf';

/**
 * Dépose le PDF d'exemple dans MinIO et rend sa clé. Rend `null` — sans faire
 * échouer le seed — si le dépôt est indisponible : mieux vaut une démonstration
 * sans documents numériques qu'un seed qui refuse de finir.
 */
async function deposerPdfDExemple() {
  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const endpoint = `http${process.env.MINIO_USE_SSL === 'true' ? 's' : ''}://`
      + `${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}`;
    const client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER,
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD,
      },
    });
    await client.send(
      new PutObjectCommand({
        // ⚠ « digital-copies », pas MINIO_BUCKET. Le nom du bac est une
        // CONSTANTE de l'API (storage.service.ts : DIGITAL_COPIES_BUCKET), pas
        // un réglage : MINIO_BUCKET du .env vaut « bibliocloud » et ce bac
        // n'existe pas. Vérifié — les bacs réels sont « covers » et
        // « digital-copies ».
        Bucket: 'digital-copies',
        Key: CLE_PDF_EXEMPLE,
        Body: PDF_EXEMPLE,
        ContentType: 'application/pdf',
      }),
    );
    return CLE_PDF_EXEMPLE;
  } catch (err) {
    // NON silencieux : sans ce message, « 0 document numérique » se lirait
    // comme un choix alors que c'est une panne.
    console.error(`  ⚠ dépôt du PDF d'exemple impossible : ${err.message}`);
    return null;
  }
}

/** Les douze écrites à la main, puis le complément généré. */
// Les douze écrites à la main reçoivent aussi une couverture : sans elle, ce
// sont précisément les plus visibles qui montreraient le repli.
const ECRITES = RECORDS_ECRITS.map((r, i) => ({
  ...r,
  coverUrl: `/demo/couvertures/0${(i % 6) + 1}.svg`,
}));

const RECORDS = [...ECRITES, ...genererNotices(340)];

async function seedTenant(db) {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Personnel (mot de passe défini pour la démo)
  //
  // `password` FIGURE AUSSI DANS `update`, et ce n'est pas un détail. Sans lui,
  // relancer le seed sur une base où le tenant existe déjà laissait les comptes
  // avec leur ANCIEN mot de passe, pendant que le script — et
  // gafeso-mobile/scripts/e2e-env.sh après lui — annonçaient fièrement la
  // nouvelle valeur. L'e2e mobile échouait alors sur « Identifiants
  // incorrects. », ce qui accuse l'application quand la cause est une fixture
  // périmée. Un seed de démonstration doit être AUTORITAIRE sur ses propres
  // comptes, sinon il n'est pas reproductible et le message qu'il affiche ment.
  for (const s of STAFF) {
    await db.user.upsert({
      where: { email: s.email },
      create: { ...s, password: hash, status: 'ACTIVE', activatedAt: new Date() },
      update: { role: s.role, status: 'ACTIVE', password: hash },
    });
  }
  // Étudiants actifs (clé sur le matricule, identifiant stable de l'étudiant)
  for (const s of STUDENTS) {
    await db.user.upsert({
      where: { matricule: s.matricule },
      create: {
        email: s.email, matricule: s.matricule, firstName: s.firstName,
        lastName: s.lastName, className: s.className, password: hash,
        role: 'STUDENT', status: 'ACTIVE', activatedAt: new Date(),
      },
      update: {
        email: s.email, firstName: s.firstName, lastName: s.lastName,
        className: s.className, status: 'ACTIVE', password: hash,
      },
    });
  }
  log(`${STAFF.length} comptes personnel + ${STUDENTS.length} étudiants`);

  // Liste des étudiants attendus (activation auto)
  for (const e of EXPECTED) {
    await db.expectedStudent.upsert({
      where: { matricule: e.matricule },
      create: { ...e },
      update: { email: e.email, className: e.className },
    });
  }
  log(`${EXPECTED.length} étudiants attendus`);

  // Classes
  for (const c of CLASSES) {
    await db.schoolClass.upsert({ where: { name: c.name }, create: c, update: c });
  }
  log(`${CLASSES.length} classes`);

  // Catalogue (notices) — clé naturelle : titre.
  //
  // ⚠ UNE SEULE lecture pour tout le catalogue, puis un createMany. La boucle
  // d'origine faisait un findFirst PAR notice : acceptable à douze, trois cent
  // cinquante allers-retours à quatre cents. Un seed qu'on subit à chaque
  // réinstallation finit par ne plus être relancé.
  const titresConnus = new Set(
    (await db.biblioRecord.findMany({ select: { title: true } })).map((r) => r.title),
  );
  const aCreer = RECORDS.filter((r) => !titresConnus.has(r.title));
  if (aCreer.length > 0) {
    await db.biblioRecord.createMany({
      // ⚠ `directeur` n'est PAS une colonne de `biblio_records` : c'est un
      // CONTRIBUTEUR, écrit plus bas dans `record_contributors`. Le laisser
      // passer ici ferait échouer l'écriture entière.
      data: aCreer.map(({ directeur: _d, ...r }) => ({ ...r, language: 'fr', marcData: {} })),
    });
  }
  // ⚠ Les DOUZE notices écrites à la main sont mises à jour même si elles
  // existent déjà. Sans cela, le seed ne ferait que « créer ce qui manque » et
  // une correction déclarée ici ne toucherait jamais une base déjà semée —
  // c'est ce qui est arrivé en remplaçant deux auteurs réels : la déclaration
  // était juste, la base gardait l'ancienne valeur. Les 340 générées ne sont
  // pas mises à jour : elles ne changent pas, et 340 écritures inutiles à
  // chaque relance rendraient le seed pénible pour rien.
  for (const { directeur: _d, ...r } of ECRITES) {
    await db.biblioRecord.updateMany({ where: { title: r.title }, data: { ...r } });
  }

  // ⚠ RATTRAPAGE des couvertures sur les notices DÉJÀ semées.
  //
  // Le commentaire ci-dessus disait « les 340 générées ne changent pas ». Ce
  // n'est plus vrai depuis qu'elles portent une couverture, et la première
  // relance l'a montré : 352 notices en base, 0 couverture — la branche de
  // création n'avait rien à créer, celle de mise à jour ne les regardait pas.
  // Une notice ajoutée au fichier n'est PAS le seul cas à traiter ; un champ
  // ajouté à une notice existante en est un autre, et il est silencieux.
  //
  // Six écritures groupées, une par variante, et seulement là où la couverture
  // manque : la deuxième relance ne touche donc plus rien.
  const parCouverture = new Map();
  for (const r of RECORDS) {
    if (!parCouverture.has(r.coverUrl)) parCouverture.set(r.coverUrl, []);
    parCouverture.get(r.coverUrl).push(r.title);
  }
  let rattrapees = 0;
  for (const [coverUrl, titres] of parCouverture) {
    const { count } = await db.biblioRecord.updateMany({
      where: { title: { in: titres }, coverUrl: null },
      data: { coverUrl },
    });
    rattrapees += count;
  }

  log(
    `${RECORDS.length} notices (${aCreer.length} créées, ${ECRITES.length} mises à jour` +
      `, ${rattrapees} couvertures rattrapées)`,
  );

  // ── Auteurs et rattachements ───────────────────────────────────────────
  //
  // ⚠ CE QUI MANQUAIT, et qui ne se voyait pas. Le seed écrivait `author`
  // comme une CHAÎNE sur la notice, et rien d'autre : 352 notices portaient un
  // nom, 278 noms distincts, et la table `authors` contenait UNE ligne.
  //
  // Le front était honnête — il affichait « 0 auteur » parce qu'il n'y en avait
  // pas — mais le nom de l'auteur est un LIEN sur chaque résultat de recherche.
  // Cliquer « Tapsoba, Moussa », le geste le plus naturel dans un catalogue,
  // menait donc à « Aucun auteur ». Trouvé le 10 septembre 2026 pendant la
  // passe sans cookie de la surface publique, pas en relisant le code.
  //
  // `normalizedName` suit EXACTEMENT `normalizeAuthorName`
  // (apps/api/src/authors/author-name.ts) : c'est la clé sur laquelle l'index
  // des auteurs cherche. Une normalisation approchante donnerait des auteurs
  // introuvables par leur propre nom — le défaut d'origine sous une autre forme.
  const normaliser = (nom) =>
    nom
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const notices = await db.biblioRecord.findMany({ select: { id: true, author: true } });
  const nomsDistincts = [...new Set(notices.map((n) => n.author).filter(Boolean))];

  const auteursConnus = new Map(
    (await db.author.findMany({ select: { id: true, displayName: true } })).map((a) => [
      a.displayName,
      a.id,
    ]),
  );
  const aCreerAuteurs = nomsDistincts.filter((nom) => !auteursConnus.has(nom));
  if (aCreerAuteurs.length > 0) {
    await db.author.createMany({
      data: aCreerAuteurs.map((nom) => ({ displayName: nom, normalizedName: normaliser(nom) })),
    });
    for (const a of await db.author.findMany({ select: { id: true, displayName: true } })) {
      auteursConnus.set(a.displayName, a.id);
    }
  }

  // Rattachements. Une seule lecture de l'existant, puis un createMany : la
  // boucle qui interrogerait la base par notice ferait 352 allers-retours.
  const rattachees = new Set(
    (await db.recordContributor.findMany({ select: { recordId: true } })).map((c) => c.recordId),
  );
  const liens = notices
    .filter((n) => n.author && !rattachees.has(n.id))
    .map((n) => ({
      recordId: n.id,
      name: n.author,
      role: 'AUTEUR_PRINCIPAL',
      position: 0,
      authorId: auteursConnus.get(n.author) ?? null,
    }));
  if (liens.length > 0) await db.recordContributor.createMany({ data: liens });

  // ── Le rôle dynamique « Enseignant » ──────────────────────────────────────
  //
  // ⚠ IL VIT DANS LE SEED, PAS DANS LE PRODUIT. `depot.valider` n'est portée par
  // AUCUN rôle système, et c'est délibéré côté API : « si personne ne peut
  // valider, le circuit reste inerte plutôt qu'ouvert ». Une école qui ne veut
  // pas de circuit de dépôt ne doit donc pas hériter d'un rôle qu'elle
  // n'utilise pas — le créer au provisioning serait lui imposer un métier.
  //
  // Ici, c'est l'école de DÉMONSTRATION : elle doit pouvoir montrer le circuit
  // de bout en bout, sinon P6 n'est démontrable qu'à moitié.
  //
  // ⚠ `encadrements.voir` EST POSÉE DEPUIS LE 12 SEPTEMBRE 2026. Elle n'existait
  // pas quand ce bloc a été écrit — la session front l'avait constaté et laissé
  // la note. Jean l'a tranchée : elle est créée au catalogue de fonctions, elle
  // porte « Mes encadrements » (P6-3), et elle est AUTO-PORTÉE — un enseignant
  // voit les notices où il est LUI-MÊME directeur, jamais celles d'un collègue.
  //
  const ENSEIGNANT = 'Enseignant';
  const roleEnseignant = await db.role.upsert({
    where: { name: ENSEIGNANT },
    create: {
      name: ENSEIGNANT,
      description:
        'Dirige des mémoires et des thèses : valide ou refuse les dépôts dont il est le directeur désigné.',
      functions: ['document.lire', 'depot.valider', 'encadrements.voir'],
      isSystem: false,
    },
    // ⚠ Les fonctions SONT mises à jour : le jour où le catalogue en gagne une
    // (encadrements.voir), une relance du seed doit la propager. Le nom et la
    // description, eux, appartiennent à l'école si elle les a changés.
    update: { functions: ['document.lire', 'depot.valider', 'encadrements.voir'] },
  });

  // ⚠ DES COMPTES DÉDIÉS, ET SURTOUT PAS LES COMPTES EXISTANTS. Mesuré dans
  // `authz.service.ts` avant d'écrire :
  //
  //     return user.customRole?.functions ?? functionsForLegacyRole(user.role);
  //
  // Un rôle dynamique REMPLACE les fonctions du rôle système, il ne s'y ajoute
  // pas. Poser « Enseignant » sur `bib@exemple.bf` lui retirerait donc
  // `catalogue.gerer`, `circulation.faire` et le reste — la bibliothécaire de
  // démonstration perdrait son métier pour gagner celui de directeur.
  //
  // Les deux comptes créés ici portent les noms de directeurs qui figurent DÉJÀ
  // sur des notices écrites à la main : le circuit est cohérent — ils ont
  // vraiment des travaux à valider — sans que personne ne soit dépouillé.
  const ENSEIGNANTS = [
    { email: 'zongo@exemple.bf', firstName: 'Pauline', lastName: 'Zongo' },
    { email: 'sanogo@exemple.bf', firstName: 'Alain', lastName: 'Sanogo' },
  ];
  for (const e of ENSEIGNANTS) {
    await db.user.upsert({
      where: { email: e.email },
      create: {
        ...e,
        role: 'STUDENT',
        roleId: roleEnseignant.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
        password: hash,
      },
      // ⚠ `role: 'STUDENT'` est l'enum de repli et il ne sert à RIEN ici : le
      // rôle dynamique le court-circuite. On le laisse au plus petit pour que,
      // si quelqu'un retire un jour le rôle dynamique, le compte retombe sans
      // droit plutôt qu'avec ceux d'un administrateur.
      update: { roleId: roleEnseignant.id, status: 'ACTIVE', password: hash },
    });
  }
  log(
    `rôle « ${ENSEIGNANT} » (depot.valider, encadrements.voir) sur ` +
      `${ENSEIGNANTS.length} comptes dédiés : ` +
      ENSEIGNANTS.map((e) => e.email).join(', '),
  );

  // ── Directeurs de mémoire / de thèse ──────────────────────────────────────
  //
  // ⚠ SANS EUX, ETD-MS NE DÉMONTRE RIEN. Le format est livré, et toute sa valeur
  // pour un moissonneur de thèses tient à la distinction qu'il expose :
  // `<contributor role="advisor">` pour le directeur, `<creator>` pour l'auteur.
  // Le fonds de démonstration ne portait que des AUTEUR_PRINCIPAL — 162 travaux
  // académiques, zéro directeur, mesuré le 12 septembre 2026. On exportait donc
  // un ETD-MS qui ressemblait à du Dublin Core.
  //
  // ⚠ Et le produit REFUSE ces notices : `cataloging.service` exige un directeur
  // et une université de soutenance pour une thèse ou un mémoire. Le seed écrit
  // en direct par Prisma, il contournait la règle — un fonds de démonstration
  // qui contient ce que le produit rejette ne démontre pas le produit.
  const parTitre = new Map(RECORDS.filter((r) => r.directeur).map((r) => [r.title, r.directeur]));
  const academiques = await db.biblioRecord.findMany({
    where: { recordType: { in: ['these', 'memoire'] } },
    select: { id: true, title: true, contributors: { select: { role: true } } },
  });
  const directeurs = academiques
    .filter((r) => !r.contributors.some((c) => c.role === 'DIRECTEUR_MEMOIRE'))
    .map((r) => ({ recordId: r.id, nom: parTitre.get(r.title) }))
    .filter((x) => x.nom);
  if (directeurs.length > 0) {
    // Les directeurs sont aussi des AUTORITÉS : sans fiche, ils ne se
    // dédoublonnent pas et n'apparaissent pas dans l'index des auteurs.
    const nomsDirecteurs = [...new Set(directeurs.map((d) => d.nom))];
    const inconnus = nomsDirecteurs.filter((n) => !auteursConnus.has(n));
    if (inconnus.length > 0) {
      await db.author.createMany({
        data: inconnus.map((nom) => ({ displayName: nom, normalizedName: normaliser(nom) })),
      });
      for (const a of await db.author.findMany({ select: { id: true, displayName: true } })) {
        auteursConnus.set(a.displayName, a.id);
      }
    }
    await db.recordContributor.createMany({
      data: directeurs.map((d) => ({
        recordId: d.recordId,
        name: d.nom,
        role: 'DIRECTEUR_MEMOIRE',
        // ⚠ Position 1 : l'auteur principal occupe la 0, et l'ordre est ce que
        // lit l'export ETD-MS.
        position: 1,
        authorId: auteursConnus.get(d.nom) ?? null,
      })),
    });
  }
  log(`${directeurs.length} directeurs de mémoire / thèse`);

  // ── Rattachement des enseignants à leur fiche d'autorité ──────────────────
  //
  // ⚠ SANS LUI, « MES ENCADREMENTS » (P6-3) NE MONTRE RIEN. L'écran part de
  // `Author.userId` : il cherche la fiche RATTACHÉE au compte de l'appelant,
  // puis ses contributions `DIRECTEUR_MEMOIRE`. Mesuré le 12 septembre 2026
  // avant d'écrire ceci : zéro fiche rattachée sur les deux écoles de
  // développement. Les deux enseignants ci-dessus avaient bien un compte, bien
  // une fiche, et rien entre les deux — l'écran leur aurait répondu « votre
  // compte n'est relié à aucune fiche d'auteur ».
  //
  // ⚠ ON RATTACHE ICI PAR LE NOM, ET C'EST ACCEPTABLE ICI SEULEMENT. Le produit
  // s'y refuse — `AuthorsService.rattacherAuCompte` exige un identifiant, parce
  // qu'un homonyme rattaché par erreur attribue à quelqu'un les encadrements
  // d'un autre, sur l'écran qui sert un dossier de promotion. Le seed, lui, a
  // CRÉÉ les deux côtés : il sait que « Zongo, Pauline » est la fiche de
  // `zongo@exemple.bf` parce que c'est lui qui a écrit les deux.
  let rattaches = 0;
  for (const e of ENSEIGNANTS) {
    const nomDeFiche = `${e.lastName}, ${e.firstName}`;
    const fiche = await db.author.findFirst({
      where: { displayName: nomDeFiche },
      select: { id: true, userId: true },
    });
    const compte = await db.user.findUnique({ where: { email: e.email }, select: { id: true } });
    if (!fiche || !compte) continue;
    // Idempotent, et il ne VOLE pas un rattachement existant : si la fiche est
    // déjà reliée à quelqu'un d'autre, on n'y touche pas — une relance de seed
    // ne doit pas défaire un geste de bibliothécaire.
    if (fiche.userId && fiche.userId !== compte.id) continue;
    if (fiche.userId === compte.id) {
      rattaches += 1;
      continue;
    }
    await db.author.update({ where: { id: fiche.id }, data: { userId: compte.id } });
    rattaches += 1;
  }
  log(`${rattaches}/${ENSEIGNANTS.length} enseignants rattachés à leur fiche d'autorité`);

  // ── Chaque enseignant rattaché DIRIGE quelque chose ───────────────────────
  //
  // ⚠ SANS CE BLOC, UN COMPTE RELIÉ PEUT N'AVOIR RIEN À MONTRER. Les directions
  // sont tirées au sort dans un vivier de noms : mesuré le 15 septembre 2026,
  // « Zongo, Pauline » en avait 2 et « Sanogo, Alain » AUCUNE. L'écran « Mes
  // encadrements » lui répondait donc une liste vide — et une liste vide sur un
  // compte qui a l'air correct est pire que pas d'écran : on ne sait pas si
  // c'est le produit ou la donnée.
  //
  // ⚠ ON RÉATTRIBUE, ON N'AJOUTE PAS. Ajouter un second `DIRECTEUR_MEMOIRE` à
  // une notice donnerait deux directeurs à un même mémoire — ce qu'aucune
  // université ne fait, et ce que l'export ETD-MS rendrait tel quel.
  const MINIMUM_ENCADREMENTS = 4;
  // ⚠ LES FICHES DES ENSEIGNANTS SONT EXCLUES DU VIVIER, TOUTES, ET DÈS LE
  // DÉPART. Sans ça, le second enseignant reprend les lignes qu'on vient de
  // donner au premier : `authorId: { not: fiche.id }` n'exclut que LUI-MÊME,
  // et deux sélections triées pareil rendent les mêmes lignes.
  //
  // Mesuré le 15 septembre 2026 en appliquant ce bloc à la main : « Zongo »
  // restait à 2 encadrements pendant que « Sanogo » en avait 4 — Sanogo lui
  // avait repris les siens. Trouvé par le témoin qui compte PAR enseignant,
  // pas par le total, qui lui était juste (162 avant, 162 après).
  const fichesEnseignants = (
    await Promise.all(
      ENSEIGNANTS.map((e) =>
        db.author.findFirst({
          where: { displayName: `${e.lastName}, ${e.firstName}` },
          select: { id: true },
        }),
      ),
    )
  ).filter(Boolean);
  const idsReserves = fichesEnseignants.map((f) => f.id);

  for (const fiche of fichesEnseignants) {
    const dejaSiennes = await db.recordContributor.count({
      where: { authorId: fiche.id, role: 'DIRECTEUR_MEMOIRE' },
    });
    const manque = MINIMUM_ENCADREMENTS - dejaSiennes;
    if (manque <= 0) continue; // idempotent : une relance ne réattribue rien
    const aPrendre = await db.recordContributor.findMany({
      where: { role: 'DIRECTEUR_MEMOIRE', authorId: { notIn: idsReserves } },
      select: { id: true },
      orderBy: { id: 'asc' }, // déterministe : deux exécutions prennent les mêmes
      take: manque,
    });
    for (const c of aPrendre) {
      await db.recordContributor.update({ where: { id: c.id }, data: { authorId: fiche.id } });
    }
  }
  const encadrements = await Promise.all(
    ENSEIGNANTS.map(async (e) => {
      const f = await db.author.findFirst({
        where: { displayName: `${e.lastName}, ${e.firstName}` },
        select: { id: true },
      });
      return f
        ? db.recordContributor.count({ where: { authorId: f.id, role: 'DIRECTEUR_MEMOIRE' } })
        : 0;
    }),
  );
  log(`encadrements par enseignant : ${encadrements.join(', ')} (minimum ${MINIMUM_ENCADREMENTS})`);
  // ⚠ UN TÉMOIN QUI ÉCHOUE, pas seulement qui journalise. La première écriture
  // de ce bloc laissait un enseignant à 2 encadrements et l'imprimait sans
  // broncher : une ligne de journal se lit distraitement, un seed qui s'arrête
  // ne se lit pas du tout.
  if (encadrements.some((n) => n < MINIMUM_ENCADREMENTS)) {
    throw new Error(
      `Un enseignant rattaché a moins de ${MINIMUM_ENCADREMENTS} encadrements ` +
        `(${encadrements.join(', ')}) : « Mes encadrements » lui montrerait une ` +
        'liste presque vide en démonstration.',
    );
  }

  // ⚠ Reliquat de fixture : « Auteur, Un », sans œuvre, trie EN TÊTE de l'index
  // alphabétique — c'est la première ligne que voit qui ouvre « Auteurs ». Un
  // auteur à zéro œuvre en tête d'index fait douter de tout le reste.
  //
  // Supprimé PAR SON NOM, et seulement s'il ne porte aucune œuvre. Pas « tous
  // les auteurs sans œuvre » : une fiche d'autorité créée avant de cataloguer
  // l'ouvrage est un usage légitime de bibliothécaire, et ce seed n'a pas à
  // décider qu'elle est de trop. La règle étroite ne se retourne contre
  // personne ; la règle large finirait par effacer un vrai travail.
  const RELIQUAT = 'Auteur, Un';
  const orphelin = await db.author.findFirst({
    where: { displayName: RELIQUAT, contributions: { none: {} } },
    select: { id: true },
  });
  if (orphelin) await db.author.delete({ where: { id: orphelin.id } });

  log(
    `${nomsDistincts.length} auteurs (${aCreerAuteurs.length} créés)` +
      `, ${liens.length} rattachements ajoutés` +
      `${orphelin ? `, reliquat « ${RELIQUAT} » retiré` : ''}`,
  );

  // ── Fichiers numériques ────────────────────────────────────────────────
  //
  // Un quart du fonds porte un fichier, pour que « documents numériques » ne
  // soit pas à zéro et que le filtre ait un sens.
  //
  // ⚠ TOUTES LES LIGNES POINTENT VERS LE MÊME OBJET. C'est un artefact de
  // démonstration assumé : le but est que la lecture FONCTIONNE, pas que
  // chaque notice ait son contenu propre. Sans fichier réel derrière, cliquer
  // « lire » donnerait une erreur devant le client — pire que pas de document
  // numérique du tout.
  //
  // ⚠ ELLES PASSENT PAR LA ROUTE DU PRODUIT DEPUIS LE 16 SEPTEMBRE 2026, et
  // ce paragraphe disait l'inverse. Le raccourci `digitalCopy.createMany` était
  // ASSUMÉ et ÉCRIT — « le chiffrement AEAD est fait par
  // DigitalCopyService.upload, que ce raccourci contourne délibérément ». Il
  // n'était donc pas une négligence. Mais son effet, lui, n'avait jamais été
  // mesuré : sur 155 documents, **UN SEUL** était prêt pour le hors-ligne, et
  // l'étagère mobile (`myDocuments` filtre `encStatus: 'ready'`) n'en aurait
  // montré qu'un — pendant que la fiche en promettait 155.
  //
  // ⚠ Ce que le raccourci économisait, mesuré avant de le retirer : 4,8 ms de
  // réparation xref + 0,6 ms de chiffrement + 6,5 ms de dépôt MinIO, soit
  // ~12 ms par document et **~2 s pour les 155**. Le coût invoqué n'existait
  // pas ; il n'avait simplement jamais été chiffré.
  //
  // La session vient du CHEMIN NORMAL — `/auth/login` avec le mot de passe que
  // ce seed vient de poser. Jamais un jeton fabriqué.
  const cle = await deposerPdfDExemple();
  if (cle) {
    // ⚠ La CIBLE est un quart du catalogue, pas « un quart de ce qui n'en a
    // pas encore ». La première rédaction prenait le second : chaque relance
    // ajoutait un quart du reste, et le fonds numérique gonflait à chaque
    // réinstallation sans que personne ne l'ait demandé. Un seed doit
    // CONVERGER, pas s'accumuler.
    const total = await db.biblioRecord.count();
    const deja = await db.digitalCopy.count();
    const objectif = Math.floor(total / 4);
    const manquants = Math.max(0, objectif - deja);
    const sansFichier =
      manquants === 0
        ? []
        : await db.biblioRecord.findMany({
            where: { digitalCopy: { is: null } },
            select: { id: true },
            take: manquants,
          });
    const cibles = sansFichier;
    // ⚠ ON VISE UN ÉTAT, PAS UN COMPTE : toute copie qui n'est pas `ready`
    // est (re)téléversée, y compris celles qu'une version antérieure de ce
    // seed a écrites directement. Relancer RÉPARE, et ne duplique rien — la
    // route remplace l'exemplaire numérique existant.
    const pasPretes = await db.digitalCopy.findMany({
      where: { OR: [{ encStatus: null }, { encStatus: { not: 'ready' } }] },
      select: { recordId: true },
    });
    const aTeleverser = [...cibles.map((r) => r.id), ...pasPretes.map((c) => c.recordId)];

    const token = await sessionBibliothecaire();
    if (!token) {
      log('⚠ fichiers numériques IGNORÉS — API injoignable ou connexion refusée');
    } else {
      const r = await assurerLesDocumentsNumeriques({
        db, api: API, token, pdf: PDF_EXEMPLE,
        nomFichier: 'document-d-exemple.pdf',
        cibler: async () => [...new Set(aTeleverser)],
      });
      for (const e of r.echecs.slice(0, 3)) log(`  ⚠ ${e}`);
      const prets = await db.digitalCopy.count({ where: { encStatus: 'ready' } });
      const total = await db.digitalCopy.count();
      // ⚠ LE CONTRÔLE EST UNE ARITHMÉTIQUE, pas une impression de réussite.
      log(
        `${total} fichiers numériques, ${prets} prêts pour le hors-ligne ` +
          `(${r.televerses} téléversé(s) par la route du produit)`,
      );
      if (prets !== total) log(`  ⚠ ${total - prets} document(s) NON prêt(s) hors-ligne — voir les échecs ci-dessus`);
    }
  } else {
    log('fichiers numériques IGNORÉS — dépôt MinIO indisponible');
  }

  // Exemplaires sur la première notice « droit » — les deux écrits à la main,
  // ceux dont les codes-barres servent d'exemple dans l'interface du guichet.
  const droit = await db.biblioRecord.findFirst({ where: { title: RECORDS[0].title } });
  for (const barcode of ['BIB-000123', 'BIB-000124']) {
    await db.item.upsert({
      where: { barcode },
      create: { recordId: droit.id, barcode, itemType: 'livre', callNumber: '342.5 TRA', location: 'Salle de lecture' },
      update: {},
    });
  }

  // ── LE FONDS PHYSIQUE ──────────────────────────────────────────────────
  //
  // ⚠ CE QUI MANQUAIT. Le catalogue paraissait riche — 352 notices, 278 auteurs,
  // 154 documents numériques — et comptait DEUX exemplaires, sur UNE notice.
  // 351 notices sur 352 disaient « aucun exemplaire » : une bibliothèque sans
  // livres. Constaté le 10 septembre 2026, passe mesurée de l'espace
  // professionnel.
  //
  // ⚠ UN FONDS RÉEL N'EST PAS UNIFORME, et c'est le point. Tout mettre à un
  // exemplaire disponible donnerait une bibliothèque de catalogue, pas une
  // bibliothèque : personne n'aurait rien emprunté, rien ne serait en retard,
  // aucun titre ne serait en plusieurs exemplaires. On répartit donc.
  const alea = tirage(20260911); // graine distincte de celle des notices
  const LIEUX = ['Salle de lecture', 'Magasin', 'Réserve', 'Salle des périodiques'];

  const toutes = await db.biblioRecord.findMany({
    select: { id: true, title: true, category: true },
    orderBy: { id: 'asc' }, // ⚠ ordre STABLE : sans lui, la répartition change à chaque relance
  });

  let compteur = 200; // les codes-barres < 200 sont ceux écrits à la main
  const aCreerItems = [];
  const sansExemplaire = [];
  for (const notice of toutes) {
    if (notice.id === droit.id) continue; // déjà servie ci-dessus
    const d = alea();
    // 15 % sans exemplaire (notice décrite, ouvrage non reçu ou perdu),
    // 70 % un seul, 12 % deux, 3 % trois.
    const combien = d < 0.15 ? 0 : d < 0.85 ? 1 : d < 0.97 ? 2 : 3;
    if (combien === 0) {
      sansExemplaire.push(notice.id);
      continue;
    }
    const lieu = LIEUX[Math.floor(alea() * LIEUX.length)];
    for (let n = 0; n < combien; n++) {
      compteur += 1;
      aCreerItems.push({
        recordId: notice.id,
        barcode: `BIB-${String(compteur).padStart(6, '0')}`,
        itemType: 'livre',
        callNumber: `${(notice.category ?? 'gen').slice(0, 3).toUpperCase()} ${notice.title.slice(0, 3).toUpperCase()}`,
        location: lieu,
      });
    }
  }

  // Une seule lecture de l'existant, puis un createMany : le code-barres est
  // unique et DÉTERMINISTE, donc une relance ne crée rien de neuf.
  const codesConnus = new Set(
    (await db.item.findMany({ select: { barcode: true } })).map((i) => i.barcode),
  );
  const nouveaux = aCreerItems.filter((i) => !codesConnus.has(i.barcode));
  if (nouveaux.length > 0) await db.item.createMany({ data: nouveaux });

  log(
    `${aCreerItems.length + 2} exemplaires (${nouveaux.length} créés)` +
      `, ${sansExemplaire.length} notices sans exemplaire`,
  );

  // Règle de circulation : étudiant × livre = 7 j, 50 FCFA/j
  await db.circulationRule.upsert({
    where: { patronCategory_itemType: { patronCategory: 'etudiant', itemType: 'livre' } },
    create: { patronCategory: 'etudiant', itemType: 'livre', loanPeriodDays: 7, maxRenewals: 1, maxCheckouts: 3, finePerDay: 50 },
    update: {},
  });
  log('règle de prêt (étudiant × livre, 50 FCFA/j)');

  // Adhérents liés aux étudiants
  const awa = await db.user.findUnique({ where: { email: 'awa@exemple.bf' } });
  const bouba = await db.user.findUnique({ where: { email: 'boubacar@exemple.bf' } });
  const patrons = [
    { barcode: 'P-2026-0001', userId: awa.id },
    { barcode: 'P-2026-0002', userId: bouba.id },
  ];
  for (const p of patrons) {
    await db.patron.upsert({
      where: { barcode: p.barcode },
      create: { barcode: p.barcode, userId: p.userId, category: 'etudiant' },
      update: {},
    });
  }

  // ── UNE VINGTAINE D'ADHÉRENTS, POUR QUE LE GUICHET AIT DE QUOI MONTRER ──
  //
  // ⚠ Ils reçoivent un COMPTE, et ce n'est pas un luxe : le modèle `Patron` ne
  // porte pas de nom. Le nom vit sur `User`, et le guichet retombe sur le
  // code-barres quand il n'y en a pas (guichet/page.tsx : `patron.user ? … :
  // patron.barcode`). Un adhérent sans compte s'affiche donc « P-2026-0007 »
  // pendant tout le prêt — honnête, mais une carte de lecteur sans nom est un
  // manque du MODÈLE, pas de l'écran. Noté au backlog.
  const hashLecteurs = await bcrypt.hash(PASSWORD, 10);
  const aleaL = tirage(20260912);
  // ⚠ SOIXANTE, et pas vingt. À vingt adhérents pour vingt par page, la liste
  // tenait sur une seule page : la pagination existait et ne s'affichait
  // jamais. Elle est un argument produit, et un argument ne se démontre pas sur
  // un écran où il est invisible. Porté à 60 le 11 septembre 2026 — trois
  // pages, donc les deux boutons ET le compteur sont exercés.
  const lecteurs = [];
  for (let n = 3; n <= 60; n++) {
    const prenom = PRENOMS[Math.floor(aleaL() * PRENOMS.length)];
    const nom = NOMS[Math.floor(aleaL() * NOMS.length)];
    const matricule = `ETU-2026-${String(100 + n).padStart(4, '0')}`;
    lecteurs.push({
      matricule,
      // ⚠ e-mail dérivé du MATRICULE, pas du nom : deux homonymes tirés du même
      // vivier produiraient la même adresse, et l'unicité de `email` ferait
      // échouer le seed une fois sur cinq — un échec qui ne se reproduit pas
      // à l'identique est le pire genre.
      email: `${matricule.toLowerCase()}@exemple.bf`,
      firstName: prenom,
      lastName: nom,
      className: CLASSES[n % CLASSES.length].name,
      barcode: `P-2026-${String(n).padStart(4, '0')}`,
    });
  }
  for (const l of lecteurs) {
    const u = await db.user.upsert({
      where: { matricule: l.matricule },
      create: {
        email: l.email, matricule: l.matricule, firstName: l.firstName,
        lastName: l.lastName, className: l.className, password: hashLecteurs,
        role: 'STUDENT', status: 'ACTIVE', activatedAt: new Date(),
      },
      update: { firstName: l.firstName, lastName: l.lastName, className: l.className },
    });
    await db.patron.upsert({
      where: { barcode: l.barcode },
      create: { barcode: l.barcode, userId: u.id, category: 'etudiant' },
      update: {},
    });
  }
  // ── DES CARTES QUI PORTENT LEUR PROPRE NOM ────────────────────────────
  //
  // ⚠ Depuis A2 (11 septembre 2026) le nom appartient à la CARTE, et non plus
  // au compte. Toutes les cartes ci-dessus sont liées à un compte : le fonds
  // n'exerçait donc ni le nom propre, ni le désaccord entre les deux. Une
  // fonctionnalité qui ne s'affiche sur aucune donnée ne se démontre pas.
  //
  // Deux cas, ceux pour lesquels A2 existe :
  //  1. des lecteurs SANS COMPTE — l'enfant trop jeune, le visiteur, celui qui
  //     n'a pas d'adresse électronique. Leur nom n'existe que sur la carte ;
  //  2. un DÉSACCORD assumé : la carte dit « Kaboré », le compte dit « Traoré ».
  //     C'est le nom d'épouse corrigé par la bibliothécaire, exactement le
  //     geste que le modèle rend possible — et que l'écran montre en
  //     information, jamais en alerte.
  const SANS_COMPTE = [
    { barcode: 'P-2026-0101', firstName: 'Fatimata', lastName: 'Sawadogo' },
    { barcode: 'P-2026-0102', firstName: 'Issouf', lastName: 'Zongo' },
    { barcode: 'P-2026-0103', firstName: 'Mariam', lastName: 'Ilboudo' },
  ];
  for (const c of SANS_COMPTE) {
    await db.patron.upsert({
      where: { barcode: c.barcode },
      create: { ...c, category: 'etudiant' },
      update: { firstName: c.firstName, lastName: c.lastName },
    });
  }

  // Les cartes liées reçoivent le nom de leur compte — c'est ce que fait la
  // liaison depuis A2, et sans cela les cartes déjà semées resteraient muettes.
  const liees = await db.patron.findMany({
    where: { userId: { not: null }, firstName: null },
    select: { id: true, user: { select: { firstName: true, lastName: true } } },
  });
  for (const l of liees) {
    if (!l.user) continue;
    await db.patron.update({
      where: { id: l.id },
      data: { firstName: l.user.firstName, lastName: l.user.lastName },
    });
  }

  // Le désaccord, sur une carte liée : la carte a été corrigée, pas le compte.
  const aCorriger = await db.patron.findFirst({
    where: { barcode: 'P-2026-0003' },
    select: { id: true, lastName: true },
  });
  if (aCorriger && aCorriger.lastName !== 'Kaboré') {
    await db.patron.update({ where: { id: aCorriger.id }, data: { lastName: 'Kaboré' } });
  }

  const sansNom = await db.patron.count({ where: { firstName: null, lastName: null } });
  log(
    `${patrons.length + lecteurs.length + SANS_COMPTE.length} adhérents` +
      ` (${SANS_COMPTE.length} sans compte, ${liees.length} noms recopiés, ${sansNom} sans nom)`,
  );

  // ── DES PRÊTS EN COURS, ET QUELQUES RETARDS ────────────────────────────
  //
  // ⚠ Une bibliothèque où tout est disponible ne ressemble pas à une
  // bibliothèque. On emprunte donc une part du fonds, et une partie de ces
  // prêts est en retard — c'est ce que le guichet et l'écran des rappels
  // existent pour traiter.
  //
  // Les dates sont RELATIVES À AUJOURD'HUI, délibérément : un retard doit être
  // en retard le jour de la démonstration, pas à une date figée par une graine.
  const empruntables = await db.item.findMany({
    where: { status: 'AVAILABLE', checkouts: { none: { returnDate: null } } },
    select: { id: true },
    orderBy: { barcode: 'asc' },
  });
  const adherents = await db.patron.findMany({ select: { id: true }, orderBy: { barcode: 'asc' } });
  const REGLE_JOURS = 7;
  const AMENDE_PAR_JOUR = 50;
  const jour = 24 * 60 * 60 * 1000;

  // Un exemplaire sur huit est dehors ; un tiers de ceux-là est en retard.
  const cible = Math.floor(empruntables.length / 8);
  const dejaDehors = await db.checkout.count({ where: { returnDate: null } });
  const aEmprunter = Math.max(0, cible - dejaDehors);
  const prets = [];
  for (let n = 0; n < aEmprunter; n++) {
    const item = empruntables[n];
    const patron = adherents[n % adherents.length];
    const enRetard = n % 3 === 0;
    // En retard : emprunté il y a 10 à 24 jours. À l'heure : il y a 0 à 6 jours.
    const ilYA = enRetard ? 10 + (n % 15) : n % REGLE_JOURS;
    const depuis = new Date(Date.now() - ilYA * jour);
    const echeance = new Date(depuis.getTime() + REGLE_JOURS * jour);
    const joursDeRetard = Math.max(0, Math.floor((Date.now() - echeance.getTime()) / jour));
    prets.push({
      itemId: item.id,
      patronId: patron.id,
      checkoutDate: depuis,
      dueDate: echeance,
      fineAmount: joursDeRetard * AMENDE_PAR_JOUR,
    });
  }
  if (prets.length > 0) {
    await db.checkout.createMany({ data: prets });
    await db.item.updateMany({
      where: { id: { in: prets.map((p) => p.itemId) } },
      data: { status: 'CHECKED_OUT' },
    });
  }
  // ── DES PRÊTS RENDUS, POUR QUE L'HISTORIQUE EXISTE ────────────────────
  //
  // ⚠ Sans eux, la section « Historique des prêts » de la fiche est vide pour
  // tout le monde : la fonctionnalité existe et ne se démontre nulle part.
  // Même raison que les soixante adhérents — un écran ne prouve rien sur un
  // fonds qui n'exerce pas ce qu'il montre.
  //
  // Un adhérent reçoit assez d'historique pour dépasser UNE page (dix lignes
  // côté front) : sans cela, la pagination de l'historique ne s'afficherait
  // jamais, et c'est exactement le défaut qu'on vient de corriger sur la liste.
  const tousLesItems = await db.item.findMany({ select: { id: true }, orderBy: { barcode: 'asc' } });
  // ⚠ On compte les prêts RENDUS, pas tous les prêts. La première rédaction
  // comptait `_count.checkouts`, qui inclut les prêts EN COURS : les adhérents
  // qui en avaient déjà un recevaient d'autant moins d'historique, et le
  // premier plafonnait à dix lignes — exactement une page, donc la pagination
  // de l'historique ne s'affichait toujours pas. Le garde mesurait autre chose
  // que ce qu'il devait borner.
  const lecteursPourHistorique = await db.patron.findMany({
    select: {
      id: true,
      _count: { select: { checkouts: { where: { returnDate: { not: null } } } } },
    },
    orderBy: { barcode: 'asc' },
    take: 12,
  });
  const rendus = [];
  let curseurItem = 0;
  lecteursPourHistorique.forEach((p, rang) => {
    // Le premier en a quatorze : deux pages. Les suivants, de un à six.
    const voulu = rang === 0 ? 14 : 1 + (rang % 6);
    const dejaLa = p._count.checkouts;
    for (let n = dejaLa; n < voulu; n++) {
      const item = tousLesItems[curseurItem % tousLesItems.length];
      curseurItem += 1;
      // Emprunté il y a 30 à 400 jours, rendu 5 à 20 jours après. Un sur cinq
      // est rendu en retard : une bibliothèque sans retard n'existe pas.
      const ilYA = 30 + ((rang * 7 + n * 13) % 370);
      const garde = 5 + ((n * 3) % 16);
      const depuis = new Date(Date.now() - ilYA * jour);
      const echeance = new Date(depuis.getTime() + REGLE_JOURS * jour);
      const retour = new Date(depuis.getTime() + garde * jour);
      const joursDeRetard = Math.max(
        0,
        Math.floor((retour.getTime() - echeance.getTime()) / jour),
      );
      rendus.push({
        itemId: item.id,
        patronId: p.id,
        checkoutDate: depuis,
        dueDate: echeance,
        returnDate: retour,
        fineAmount: joursDeRetard * AMENDE_PAR_JOUR,
      });
    }
  });
  if (rendus.length > 0) await db.checkout.createMany({ data: rendus });
  const historiqueTotal = await db.checkout.count({ where: { returnDate: { not: null } } });
  log(`${historiqueTotal} prêts rendus en historique (${rendus.length} ajoutés)`);

  const enRetardTotal = await db.checkout.count({
    where: { returnDate: null, dueDate: { lt: new Date() } },
  });
  log(
    `${dejaDehors + prets.length} prêts en cours (${prets.length} ajoutés)` +
      `, dont ${enRetardTotal} en retard`,
  );
}

// ── Activité : dépôts, usage, lectures hors ligne ─────────────
//
// ⚠ CE QUI MANQUAIT POUR QUE LE RAPPORT ANNUEL SE MONTRE. Mesuré le
// 15 septembre 2026 : le seed ne créait AUCUN dépôt, aucune licence hors
// ligne, aucun événement d'usage. Le bloc « dépôt » — celui qu'aucun autre
// produit ne peut fournir, et celui qui intéresse une directrice — serait
// resté vide devant un client.
//
// ⚠ ET LE RAPPORT LE PLUS HONNÊTE EST LE MOINS DÉMONTRABLE : la règle « un
// chiffre incalculable est ABSENT, jamais zéro » donne, sur des données vides,
// un document de réserves. On enrichit donc la DONNÉE, jamais la règle.
//
// ⚠ RÉPARTI SUR DEUX ANNÉES CIVILES, et ce n'est pas un excès. Le rapport
// propose par défaut l'année ÉCOULÉE — un rapport se produit en janvier pour
// l'année qui vient de finir. Ne semer que l'année courante rendrait un
// document VIDE à qui ouvre l'écran sans rien changer, c'est-à-dire à tout le
// monde la première fois.
// ⚠ LA MARQUE VIT SUR L'IDENTIFIANT, JAMAIS DANS UN TEXTE AFFICHÉ. Elle sert
// l'idempotence — relancer ne doit toucher QUE ce que cette section a produit —
// et un préfixe dans le TITRE se serait affiché tel quel en démonstration :
// « [demo] Le régime foncier coutumier au Burkina Faso ». Un identifiant, non.
const MARQUE_SEED = 'demo-p8-';

const DEPOTS = [
  { titre: 'Le régime foncier coutumier au Burkina Faso', type: 'these', etat: 'valide', moisAvant: 20, catalogue: true },
  { titre: 'Accès aux soins maternels en zone rurale', type: 'these', etat: 'valide', moisAvant: 14, catalogue: true },
  { titre: 'La médiation pénale dans le droit OHADA', type: 'memoire', etat: 'valide', moisAvant: 8, catalogue: false },
  { titre: 'Numérisation des archives administratives', type: 'memoire', etat: 'refuse', moisAvant: 6, catalogue: false },
  { titre: 'Le contentieux électoral au Sahel', type: 'these', etat: 'soumis', moisAvant: 2, catalogue: false },
  { titre: 'Pharmacopée traditionnelle et santé publique', type: 'memoire', etat: 'brouillon', moisAvant: 1, catalogue: false },
];

/** Une date à N mois en arrière, à midi UTC — jamais sur une borne d'année. */
function ilYA(mois, maintenant = new Date()) {
  const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - mois, 12, 12));
  return d;
}

async function seedActivite(db) {
  const deposant = await db.user.findFirst({ where: { email: 'awa@exemple.bf' } });
  // ⚠ LE DIRECTEUR EST UN ENSEIGNANT, PAS LE BIBLIOTHÉCAIRE. Mesuré le
  // 15 septembre 2026 : `bib@exemple.bf` retombe sur le rôle système
  // LIBRARIAN, qui ne porte PAS `depot.valider`. Les six dépôts de
  // démonstration lui étaient confiés — sa file « Dépôts à valider » serait
  // restée vide, et le circuit bloqué au milieu devant un client.
  //
  // `zongo@exemple.bf` porte le rôle « Enseignant » (`depot.valider`,
  // `encadrements.voir`) : il peut décider, et il a des encadrements à montrer.
  const directeur = await db.user.findFirst({ where: { email: 'zongo@exemple.bf' } });
  if (!deposant || !directeur) {
    console.log('  ⚠ activité : comptes de démonstration absents, section ignorée.');
    return;
  }

  // ⚠ ET ON VÉRIFIE QU'IL PEUT DÉCIDER, plutôt que de le supposer. Un circuit
  // dont le directeur n'a pas le droit est infranchissable — c'est le défaut
  // exact de P6, et il ne se voit qu'en essayant.
  const roleDuDirecteur = directeur.roleId
    ? await db.role.findUnique({ where: { id: directeur.roleId }, select: { functions: true } })
    : null;
  if (!roleDuDirecteur?.functions.includes('depot.valider')) {
    throw new Error(
      `Le directeur des dépôts de démonstration (${directeur.email}) ne porte pas ` +
        '`depot.valider` : la file « Dépôts à valider » serait vide et le circuit bloqué.',
    );
  }

  // ⚠ IDEMPOTENCE PAR MARQUE, jamais par compte. Relancer ne doit rien empiler,
  // et ne doit toucher QUE ce que cette section a produit — la recette du
  // 13 septembre a laissé deux dépôts titrés « RECETTE » qui ne sont pas à
  // nous : on ne les emporte pas.
  await db.deposit.deleteMany({ where: { id: { startsWith: MARQUE_SEED } } });
  await db.offlineLicense.deleteMany({ where: { id: { startsWith: MARQUE_SEED } } });
  await db.device.deleteMany({ where: { id: { startsWith: MARQUE_SEED } } });
  await db.usageEvent.deleteMany({ where: { id: { startsWith: MARQUE_SEED } } });

  // ⚠ UN DÉPÔT SANS DOCUMENT EST UN ÉTAT QUE LE PRODUIT REFUSE. `soumettre`
  // exige `fileKey` — « Téléversez le document avant de soumettre ». Le seed
  // écrivant en base, il pouvait fabriquer des dépôts soumis, validés et
  // catalogués SANS fichier : l'écran affichait alors, sur la même carte,
  // « Le document n'est plus remplaçable : il a été transmis à votre
  // directeur » ET « Aucun document joint pour l'instant ».
  //
  // Un fonds de démonstration qui contient ce que le produit rejette ne
  // démontre pas le produit — c'est la règle que ce fichier applique déjà aux
  // notices, et qu'il n'appliquait pas aux dépôts. Mesuré à l'écran le
  // 15 septembre 2026, session `awa@`.
  const clePdf = await deposerPdfDExemple();

  const notices = await db.biblioRecord.findMany({ select: { id: true }, take: 40 });
  if (notices.length === 0) {
    console.log('  ⚠ activité : aucune notice, section ignorée.');
    return;
  }

  let deposes = 0;
  for (const d of DEPOTS) {
    const cree = ilYA(d.moisAvant);
    const soumis = d.etat === 'brouillon' ? null : ilYA(d.moisAvant - 1 < 0 ? 0 : d.moisAvant - 1);
    const decide = d.etat === 'valide' || d.etat === 'refuse' ? ilYA(Math.max(0, d.moisAvant - 2)) : null;
    await db.deposit.create({
      data: {
        depositorId: deposant.id,
        directorId: directeur.id,
        notifiedDirectorId: soumis ? directeur.id : null,
        authorName: 'Awa Traoré',
        id: `${MARQUE_SEED}depot-${deposes}`,
        title: d.titre,
        documentType: d.type,
        status: d.etat,
        createdAt: cree,
        updatedAt: decide ?? soumis ?? cree,
        submittedAt: soumis,
        decidedAt: decide,
        recordId: d.catalogue ? notices[deposes % notices.length].id : null,
        // ⚠ LE BROUILLON N'EN A PAS, et c'est voulu : c'est l'état où
        // l'étudiant n'a pas encore joint son document, et l'écran doit
        // pouvoir le montrer. Tous les autres en ont un, sinon ils
        // décriraient un état impossible.
        ...(d.etat === 'brouillon' || !clePdf
          ? {}
          : {
              fileKey: clePdf,
              fileName: 'memoire.pdf',
              fileFormat: 'PDF',
              fileSize: 1024,
            }),
        refusalReason: d.etat === 'refuse' ? 'Plan insuffisamment étayé — à reprendre.' : null,
        decidedById: d.etat === 'valide' || d.etat === 'refuse' ? directeur.id : null,
      },
    });
    deposes++;
  }

  // ⚠ LICENCES HORS LIGNE : le matériel cryptographique est VOLONTAIREMENT
  // non vérifiable et il le DIT. Une signature plausible ferait croire à une
  // licence réelle, qu'un appareil rejetterait sans qu'on comprenne pourquoi.
  // Le rapport ne compte que `issuedAt` ; il n'a pas besoin qu'elles soient
  // valides, et personne ne doit croire qu'elles le sont.
  const appareil = await db.device.create({
    data: {
      userId: deposant.id,
      id: `${MARQUE_SEED}appareil`,
      label: 'Téléphone de démonstration',
      publicKey: 'cle-publique-de-demonstration-NON-FONCTIONNELLE',
    },
  });
  let licences = 0;
  for (const mois of [15, 11, 7, 4, 2]) {
    const emise = ilYA(mois);
    await db.offlineLicense.create({
      data: {
        recordId: notices[licences % notices.length].id,
        userId: deposant.id,
        deviceId: appareil.id,
        issuedAt: emise,
        expiresAt: new Date(emise.getTime() + 30 * 24 * 3600 * 1000),
        id: `${MARQUE_SEED}licence-${licences}`,
        wrappedCek: 'cek-de-demonstration-NON-FONCTIONNELLE',
        signature: 'signature-de-demonstration-NON-VERIFIABLE',
      },
    });
    licences++;
  }

  // ⚠ USAGE : des ÉVÉNEMENTS, pas des personnes — aucun identifiant
  // d'utilisateur n'existe sur cette table. Étalés sur vingt mois pour que les
  // deux années civiles portent des chiffres.
  const evenements = [];
  for (let i = 0; i < 480; i++) {
    const mois = i % 20;
    const jour = (i * 7) % 26;
    const quand = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth() - mois,
      jour + 1,
      9 + (i % 9),
    ));
    evenements.push({
      id: `${MARQUE_SEED}usage-${i}`,
      recordId: notices[i % notices.length].id,
      kind: i % 6 === 0 ? 'TELECHARGEMENT' : 'LECTURE',
      occurredAt: quand,
    });
  }
  await db.usageEvent.createMany({ data: evenements });

  // ── L'ANNÉE PRÉCÉDENTE N'EST PAS VIDE ─────────────────────────────────────
  //
  // ⚠ LE RAPPORT ANNUEL S'OUVRE SUR L'ANNÉE ÉCOULÉE — c'est le contrat, et il
  // est juste : un rapport se produit en janvier pour l'année qui vient de
  // finir. Or le seed créait TOUTES les notices et TOUS les prêts au moment où
  // il tourne. Le rapport par défaut décrivait donc **une bibliothèque morte** :
  // 0 prêt, 0 retour, 0 catalogué, 0 lecteur actif — sur les blocs qui sont le
  // cœur du document.
  //
  // Signalé par la recette du front le 15 septembre 2026, et la remarque est
  // juste : quelqu'un avait pensé à étaler les événements NUMÉRIQUES sur deux
  // années, personne ne l'avait fait pour la circulation ni pour le catalogue.
  //
  // ⚠ ON ANTIDATE UNE PART, ON N'EN CRÉE PAS DE NOUVEAUX. Ajouter des prêts
  // fausserait les totaux que d'autres écrans affichent ; déplacer une part des
  // dates répartit la même activité sur deux exercices, ce qu'une bibliothèque
  // réelle présente de toute façon.
  const AN_DERNIER = new Date().getUTCFullYear() - 1;
  const dansAnDernier = (mois, jour) => new Date(Date.UTC(AN_DERNIER, mois, jour, 10));

  const toutesLesNotices = await db.biblioRecord.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const aAntidater = toutesLesNotices.slice(0, Math.floor(toutesLesNotices.length * 0.45));
  for (const [i, n] of aAntidater.entries()) {
    await db.biblioRecord.update({
      where: { id: n.id },
      data: { createdAt: dansAnDernier(i % 12, (i % 26) + 1) },
    });
  }

  const prets = await db.checkout.findMany({
    select: { id: true, returnDate: true },
    orderBy: { id: 'asc' },
  });
  const pretsAAntidater = prets.slice(0, Math.floor(prets.length * 0.5));
  for (const [i, c] of pretsAAntidater.entries()) {
    const sortie = dansAnDernier(i % 12, (i % 26) + 1);
    await db.checkout.update({
      where: { id: c.id },
      data: {
        checkoutDate: sortie,
        dueDate: new Date(sortie.getTime() + 21 * 24 * 3600 * 1000),
        // ⚠ Le retour suit la sortie, sinon un prêt de 2025 serait « rendu »
        // en 2026 et le compte des RETOURS de 2025 resterait à zéro — le
        // défaut qu'on corrige, déplacé d'une ligne.
        returnDate: c.returnDate ? new Date(sortie.getTime() + 10 * 24 * 3600 * 1000) : null,
      },
    });
  }
  log(
    `${aAntidater.length} notice(s) et ${pretsAAntidater.length} prêt(s) datés de ${AN_DERNIER} — ` +
      'le rapport de l’année écoulée n’est plus vide',
  );

  console.log(
    `  ✔ activité : ${deposes} dépôt(s) aux quatre états, ${licences} licence(s) hors ligne, ` +
      `${evenements.length} événement(s) d’usage sur 20 mois`,
  );
}

/**
 * Session de bibliothécaire par le CHEMIN NORMAL, mise en cache pour la durée
 * du seed. Jamais un jeton fabriqué depuis un secret d'environnement — c'est
 * l'interdit de `CLAUDE.md`, et il ne souffre pas d'exception « ponctuelle ».
 * Rend `null` si l'API est injoignable : l'appelant le DIT, il ne devine pas.
 */
let _session;
async function sessionBibliothecaire() {
  if (_session !== undefined) return _session;
  try {
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'localhost' },
      body: JSON.stringify({ email: 'bib@exemple.bf', password: PASSWORD }),
    });
    _session = login.ok ? ((await login.json()).accessToken ?? null) : null;
  } catch {
    _session = null;
  }
  return _session;
}

// ── Réindexation Meilisearch (via l'API) ───────────────────
async function reindex() {
  const accessToken = await sessionBibliothecaire();
  if (!accessToken) {
    log('réindexation ignorée (login bibliothécaire indisponible)');
    return;
  }
  await fetch(`${API}/cataloging/reindex`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Host: 'localhost' },
  });
  log('catalogue réindexé (Meilisearch)');
}

// ── Collections et règles d'accès ─────────────────────────────
//
// ⚠ POURQUOI CETTE PARTIE EXISTE, mesuré le 14 septembre 2026. Gafeso se vend
// sur une phrase : « un étudiant n'accède PAS à toute la bibliothèque ; l'accès
// dépend de sa classe ». Le mécanisme est écrit, testé, et il a deux portes
// gardées. Mais l'école de démonstration portait UNE collection, UNE règle et
// ZÉRO titre dedans : il n'y avait rien à restreindre, donc rien à montrer.
//
// Ce n'était pas un défaut de code — c'était un défaut de JEU DE DONNÉES, et
// pour une démonstration c'est pire : on ne peut pas montrer ce qui distingue
// le produit.
//
// Ce que ça compose, et c'est un RÉCIT, pas un remplissage :
//   · le fonds général, ouvert à toutes les classes — ouvrages et publications ;
//   · un fonds de recherche par classe peuplée, restreint à elle seule.
// La démonstration tient alors en dix secondes : le même catalogue, deux
// étudiants, deux résultats.
const RECHERCHE_PAR_CLASSE = [
  { classe: 'L1_DROIT', domaine: 'droit', nom: 'Travaux de recherche — Droit' },
  { classe: 'L1_INFO', domaine: 'informatique', nom: 'Travaux de recherche — Informatique' },
  { classe: 'M2_MEDECINE', domaine: 'medecine', nom: 'Travaux de recherche — Médecine' },
];

async function seedCollections(pub, db) {
  const tenant = await pub.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) throw new Error('école introuvable — le provisioning a-t-il tourné ?');

  /** Une collection identifiée par son NOM dans cette école ; créée si absente. */
  const collection = async (nom, extra = {}) => {
    const existante = await pub.collection.findFirst({ where: { tenantId: tenant.id, name: nom } });
    if (existante) return existante;
    return pub.collection.create({ data: { tenantId: tenant.id, name: nom, ...extra } });
  };

  /** Une règle d'accès, créée si la même n'existe pas déjà. */
  const regle = async (collectionId, className) => {
    const deja = await pub.accessRule.findFirst({
      where: { collectionId, tenantId: tenant.id, className },
    });
    if (!deja) await pub.accessRule.create({ data: { collectionId, tenantId: tenant.id, className } });
  };

  /**
   * Rattache des notices à une collection.
   *
   * ⚠ `skipDuplicates` s'appuie sur `@@unique([collectionId, recordId])` : c'est
   * ce qui rend cette fonction rejouable. Sans lui, un second passage lèverait —
   * et un seed qui ne se rejoue pas n'est pas un seed.
   */
  const rattacher = async (collectionId, recordIds) => {
    if (recordIds.length === 0) return 0;
    const { count } = await pub.collectionTitle.createMany({
      data: recordIds.map((recordId) => ({ collectionId, recordId })),
      skipDuplicates: true,
    });
    return count;
  };

  // ── Le fonds général : ouvert à TOUTES les classes ───────────────────────
  // Il existe déjà (le provisionnement pose une collection socle, `isDefault`),
  // et sa règle est « toutes classes ». Ce qui manquait, c'est son CONTENU.
  const socle =
    (await pub.collection.findFirst({ where: { tenantId: tenant.id, isDefault: true } })) ??
    (await collection('Fonds général', { isDefault: true }));
  await regle(socle.id, null);
  const general = await db.biblioRecord.findMany({
    where: { recordType: { in: ['ouvrage', 'publication'] } },
    select: { id: true },
  });
  const posesGeneral = await rattacher(socle.id, general.map((r) => r.id));
  log(`collection « ${socle.name} » (toutes classes) : ${general.length} notices, ${posesGeneral} ajoutées`);

  // ── Un fonds de recherche par classe, restreint à elle seule ─────────────
  for (const { classe, domaine, nom } of RECHERCHE_PAR_CLASSE) {
    const col = await collection(nom, {
      description: `Mémoires et thèses du domaine « ${domaine} », réservés à la classe ${classe}.`,
    });
    await regle(col.id, classe);
    const travaux = await db.biblioRecord.findMany({
      where: { recordType: { in: ['memoire', 'these'] }, category: domaine },
      select: { id: true },
    });
    const poses = await rattacher(col.id, travaux.map((r) => r.id));
    log(`collection « ${nom} » (classe ${classe}) : ${travaux.length} notices, ${poses} ajoutées`);
  }
}

// ── Orchestration ─────────────────────────────────────────────
/**
 * L'inscription qui accompagne la classe, avec son témoin.
 *
 * ⚠ L'ANNÉE ACADÉMIQUE EST DEMANDÉE AU PRODUIT, jamais recalculée ici : sa
 * règle a déjà été fausse une fois (calcul sur l'année civile, juste de
 * septembre à décembre). Si `dist/` est absent, on le DIT et on s'arrête —
 * plutôt que de deviner et de semer une année fausse dans la démonstration.
 */
async function assurerLesInscriptionsDeLEcole(db) {
  const regle = new URL('../apps/api/dist/enrollment/academic-year.js', import.meta.url);
  let currentAcademicYear;
  try {
    ({ currentAcademicYear } = await import(regle.href));
  } catch {
    throw new Error(
      'apps/api/dist/enrollment/academic-year.js est absent — l’année académique est la ' +
        'RÈGLE DU PRODUIT et n’est pas recopiée ici.\n' +
        '  Construisez l’API d’abord :  npm run build -w @gafeso/api',
    );
  }
  const annee = currentAcademicYear();
  const { prevues, creees, sansClasse } = await assurerLesInscriptions(db, annee);
  for (const m of sansClasse) log(`⚠ classe inconnue, compte NON inscrit : ${m}`);
  if (creees !== prevues) throw new Error(`inscriptions : ${creees} apparues pour ${prevues} prévues`);
  log(`inscriptions ${annee} : ${creees} créée(s)`);
}

async function main() {
  /**
   * ⚠ NE REJOUER QU'UNE PARTIE — `SEED_ONLY=collections`.
   *
   * Le seed complet RÉÉCRIT tous les comptes de l'école, mot de passe compris :
   * c'est assez proche d'une suppression pour qu'on ne le lance pas à la légère,
   * et ça change le mot de passe que quelqu'un a peut-être déjà noté.
   *
   * Or les collections et leurs règles d'accès sont ce qu'on a le plus souvent
   * besoin de refaire — c'est la donnée qui manquait le 14 septembre 2026, et
   * celle qui porte la démonstration du contrôle d'accès. Cette porte les rejoue
   * seules, sans toucher à personne.
   */
  const partie = process.env.SEED_ONLY ?? '';
  const PARTIES = ['collections', 'activite'];
  if (partie && !PARTIES.includes(partie)) {
    throw new Error(`SEED_ONLY inconnu : « ${partie} ». Valeurs admises : ${PARTIES.join(', ')}.`);
  }
  if (partie === 'activite') {
    // ⚠ Rejoue les dépôts, l'usage et les lectures hors ligne SEULS. Aucun
    // compte touché, aucun mot de passe changé — c'est ce qui permet de
    // regarnir le rapport annuel avant une démonstration sans rien casser.
    console.log('Seed Gafeso — activité (dépôts, usage, hors ligne) SEULEMENT\n');
    const db = new PrismaClient({ datasources: { db: { url: tenantUrl() } } });
    try {
      await seedActivite(db);
    } finally {
      await db.$disconnect();
    }
    console.log('\n✔ Activité à jour. Aucun compte touché.');
    return;
  }
  if (partie === 'collections') {
    console.log('Seed Gafeso — collections et règles d’accès SEULEMENT\n');
    const pub = new PrismaClient();
    const db = new PrismaClient({ datasources: { db: { url: tenantUrl() } } });
    try {
      await seedCollections(pub, db);
    } finally {
      await pub.$disconnect();
      await db.$disconnect();
    }
    console.log('\n✔ Collections à jour. Aucun compte touché.');
    return;
  }

  console.log('Seed Gafeso — Université d’Exemple\n');
  await provision();

  const pub = new PrismaClient();
  const db = new PrismaClient({ datasources: { db: { url: tenantUrl() } } });
  try {
    await seedPublic(pub);
    await seedTenant(db);
    // ⚠ APRÈS les deux : les collections vivent dans le schéma PUBLIC et
    // rattachent des notices du schéma de l'ÉCOLE. Elle a donc besoin des deux
    // clients, et des notices déjà créées.
    await seedCollections(pub, db);
    // ⚠ APRÈS les notices : les dépôts catalogués et les licences hors ligne
    // pointent des `BiblioRecord.id` qui doivent exister.
    await seedActivite(db);
    // ⚠ EN DERNIER, ET C'EST UNE CORRECTION DU 16 SEPTEMBRE 2026.
    //
    // Ce seed écrivait `users.class_name` directement, sans jamais créer
    // l'inscription correspondante. Or `AccountsService` écrit les DEUX dans
    // la même transaction et son commentaire l'affirme : « les deux ne peuvent
    // pas diverger ». Elles divergeaient, parce que ce fichier est un SECOND
    // écrivain qui ne passe pas par les règles du produit.
    //
    // Ce que ça coûtait : `/admin/classes` lit `_count.enrollments` et
    // affichait « 0 étudiant » pour les huit classes, dont trois en portaient
    // 21, 20 et 20. Le contrôle d'accès, lui, lit `class_name` et
    // fonctionnait — deux écrans, deux vérités.
    //
    // ⚠ EN DERNIER parce que les comptes naissent avant les classes dans ce
    // fichier, et que d'autres étudiants sont créés plus bas encore. Placé
    // ailleurs, il en manquerait une partie sans le dire.
    await assurerLesInscriptionsDeLEcole(db);
  } finally {
    await pub.$disconnect();
    await db.$disconnect();
  }

  await reindex();
  console.log(`\n✔ Démo prête. Mot de passe de TOUS les comptes : ${PASSWORD}`);
  console.log('  (tiré au hasard — fixez-le avec SEED_PASSWORD pour le garder d’une fois sur l’autre)');
  console.log('  Comptes :');
  console.log('   admin@exemple.bf · gestion@exemple.bf · bib@exemple.bf · awa@exemple.bf');
}

main().catch((err) => {
  console.error('\n✖ Seed échoué :', err.message);
  process.exit(1);
});
