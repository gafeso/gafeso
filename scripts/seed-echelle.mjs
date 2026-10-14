// Fonds de MESURE à l'échelle d'une vraie école — second tenant.
//
// ⚠ CE N'EST PAS UNE DÉMONSTRATION. `seed-demo.mjs` fabrique une école qu'on
// MONTRE : douze notices écrites à la main, des cas limites choisis, des noms
// plausibles. Celui-ci fabrique un fonds qu'on MESURE : du volume, et la
// variété juste nécessaire pour que les écrans ne trichent pas (domaines
// répartis, auteurs nombreux, exemplaires multiples, prêts en cours et rendus).
// Personne ne doit prendre ce catalogue pour un contenu choisi.
//
// ⚠ POURQUOI UN SECOND TENANT, ET JAMAIS `zinda`. Grossir `zinda` détruirait la
// référence du filet de comparaison : son échantillon prend deux notices PAR
// FORME, tirées par `ORDER BY id LIMIT 2` sur des uuid ALÉATOIRES — insérer des
// milliers de lignes déplace l'échantillon, et le script refuse alors de
// conclure. Cette preuve-là ne se refabrique pas. Arbitré avec la session back
// le 11 septembre 2026 (docs/passation.md).
//
// Et le bénéfice qu'on n'avait pas demandé : c'est la PREMIÈRE école créée
// APRÈS les lots de P3 et P4. Leurs recettes demandent toutes « éprouvé sur un
// établissement créé avant ET après » ; jusqu'ici la seconde moitié n'était
// vérifiée que par lecture de code.
//
// Usage (depuis la racine, l'API doit tourner) :
//   node scripts/seed-echelle.mjs
//   ECHELLE_NOTICES=2000 node scripts/seed-echelle.mjs   # plus court, pour essayer
//
// Idempotent : relancé, il complète ce qui manque et ne double rien.

import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadEnvIfPresent } from './lib/load-env.mjs';

loadEnvIfPresent();

const API = process.env.SEED_API_URL ?? 'http://localhost:4000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev_admin_key_local';
const SLUG = process.env.ECHELLE_SLUG ?? 'horizon';
const SCHOOL = 'Université Horizon (fonds de mesure)';
const DOMAINE = `${SLUG}.localhost`;

const NOTICES = Number(process.env.ECHELLE_NOTICES ?? 8000);
const PATRONS = Number(process.env.ECHELLE_PATRONS ?? 800);
const PRETS = Number(process.env.ECHELLE_PRETS ?? 2500);

// ⚠ MÊME GARDE-FOU DE CIBLE QUE `seed-demo`, et pour une raison de plus : celui-ci
// écrit des dizaines de milliers de lignes. Sur une installation en service, il
// ne « pollue » pas le catalogue — il le noie.
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API) && process.env.SEED_FORCE !== '1') {
  console.error(`✖ Cible non locale (${API}).`);
  console.error('  Ce seed écrit des dizaines de milliers de lignes.');
  process.exit(2);
}

// Mot de passe du compte de mesure. TIRÉ AU HASARD par défaut et affiché une
// seule fois en fin d'exécution — jamais écrit dans le dépôt, jamais dans un
// document. Surchargeable par ECHELLE_PASSWORD pour retrouver le même compte
// d'une exécution à l'autre.
const MOT_DE_PASSE =
  process.env.ECHELLE_PASSWORD ?? `Gafeso-${randomBytes(9).toString('base64url')}!1`;

const log = (m) => console.log(`  • ${m}`);
const PAQUET = 1000;

/** Générateur congruentiel : reproductible, sans dépendance. */
function tirage(graine) {
  let x = graine;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}
const alea = tirage(20260911);
const pioche = (l) => l[Math.floor(alea() * l.length)];

const PRENOMS = ['Awa','Salif','Mariam','Issa','Fatoumata','Boukary','Aminata','Rasmata','Adama','Céline','Pauline','Alain','Benjamin','Émilie','Drissa','Safiatou','Hamidou','Nafissatou','Moussa','Kadidia'];
const NOMS = ['Traoré','Ouédraogo','Kaboré','Sawadogo','Zongo','Compaoré','Sanou','Nikiema','Ouoba','Sanogo','Bationo','Congo','Dabiré','Ilboudo','Kinda','Lompo','Nacoulma','Palenfo','Sankara','Tapsoba','Yaméogo','Zoungrana','Barry','Diallo','Koné','Sirima','Bambara','Coulibaly','Gnoumou','Héma'];

const SUJETS = {
  droit: ['Droit foncier rural','Contentieux administratif','Droit du travail','Procédure civile','Droit des sociétés','Justice coutumière','Droit de la famille','Droit pénal des affaires','Droit de l’environnement','Droit communautaire'],
  medecine: ['Santé maternelle','Paludisme','Nutrition infantile','Épidémiologie de terrain','Pharmacopée traditionnelle','Santé publique en milieu rural','Chirurgie ambulatoire','Maladies chroniques','Santé scolaire','Vaccination'],
  informatique: ['Réseaux et protocoles','Bases de données','Apprentissage automatique','Génie logiciel','Sécurité des systèmes','Systèmes embarqués','Traitement d’images','Architecture des ordinateurs','Systèmes distribués','Interfaces homme-machine'],
  histoire: ['Empires du Sahel','Colonisation et résistances','Histoire des migrations','Sociétés précoloniales','Mémoire et archives','Villes et commerce transsaharien','Histoire des institutions','Historiographie'],
  economie: ['Microfinance','Économie agricole','Commerce régional','Politiques publiques','Marchés du travail','Économie informelle','Finances publiques','Économie du développement'],
  langues: ['Grammaire mooré','Lexicologie dioula','Sociolinguistique','Didactique du français','Traduction et interprétation','Langues et scolarisation','Phonologie','Langues et médias'],
  litterature: ['Roman contemporain','Poésie orale','Théâtre populaire','Récits de vie','Littérature et engagement','Contes et transmission','Littérature comparée','Écritures féminines'],
  philosophie: ['Philosophie politique','Éthique appliquée','Philosophie des sciences','Pensée africaine contemporaine','Logique et argumentation','Esthétique'],
  sciences: ['Chimie analytique','Physique des matériaux','Hydrologie','Agronomie des sols','Biodiversité sahélienne','Mathématiques appliquées','Énergies renouvelables','Statistique'],
  arts: ['Arts plastiques','Musique et instruments','Cinéma documentaire','Textiles et motifs','Photographie sociale','Danse et rituel'],
};
const QUALIFICATIFS = ['au Burkina Faso','en Afrique de l’Ouest','— approche comparée','— étude de cas','dans la région du Centre','— manuel de premier cycle','— actes du colloque','— perspectives contemporaines','et développement local','— travaux dirigés','— bilan et perspectives','— méthodes et terrains'];
const TYPES = ['ouvrage','ouvrage','ouvrage','these','memoire','memoire','publication'];
const VILLES = ['Ouagadougou','Bobo-Dioulasso','Koudougou','Dakar','Abidjan','Bamako','Niamey','Lomé'];
// ⚠ AUCUNE INSTITUTION RÉELLE NE SIGNE UNE ŒUVRE FICTIVE. Deux entrées de
// cette liste nommaient des presses universitaires et un centre de recherche
// qui EXISTENT : les porter sur 8 000 notices inventées leur attribuait des
// publications qu'ils n'ont jamais faites. La base portait déjà la convention
// — « d'Exemple » — et ce seed ne la suivait pas.
//
// ⚠ Et les noms fautifs ne sont PAS cités ici : une forme interdite se décrit,
// elle ne se recopie pas. Mon premier jet les citait en exemple, et le relevé
// du critère de publication a continué de les trouver — dans mon commentaire.
const EDITEURS = ['Presses universitaires d’Exemple','Éditions Sahel','Harmattan Burkina','Presses de l’Institut d’Exemple','Éditions Découvertes','Karthala'];

/**
 * Titres en nombre. Le produit sujets × qualificatifs plafonne vers 900 ; un
 * TOME discriminant porte le fonds aussi loin qu'on veut sans jamais deux fois
 * le même titre — la clé naturelle de l'idempotence reste le titre.
 */
function genererNotices(combien) {
  const domaines = Object.keys(SUJETS);
  const notices = [];
  const vus = new Set();
  let tome = 0;
  while (notices.length < combien) {
    tome += 1;
    for (const category of domaines) {
      for (const sujet of SUJETS[category]) {
        if (notices.length >= combien) break;
        const base = `${sujet} ${pioche(QUALIFICATIFS)}`;
        const titre = tome === 1 ? base : `${base} — tome ${tome}`;
        if (vus.has(titre)) continue;
        vus.add(titre);
        const recordType = pioche(TYPES);
        const these = recordType === 'these' || recordType === 'memoire';
        notices.push({
          title: titre,
          author: `${pioche(NOMS)}, ${pioche(PRENOMS)}`,
          category,
          recordType,
          publishYear: 2005 + Math.floor(alea() * 21),
          isbn: `MESURE-${String(100000 + notices.length)}`,
          language: 'fr',
          marcData: {},
          // Les champs de profil sont remplis de façon INÉGALE, exprès : un fonds
          // où tout est renseigné ne mesure pas les écrans qui gèrent l'absence.
          publisher: these ? null : alea() < 0.8 ? pioche(EDITEURS) : null,
          publicationCity: these ? null : alea() < 0.6 ? pioche(VILLES) : null,
          defenseUniversity: these ? `Université d’Exemple — ${pioche(VILLES)}` : null,
          defensePlace: these && alea() < 0.7 ? pioche(VILLES) : null,
          summary: alea() < 0.35 ? `Étude portant sur ${sujet.toLowerCase()}.` : null,
        });
      }
    }
  }
  return notices;
}

/** Le schéma de l'école existe-t-il ? Lecture seule, sans passer par l'API. */
async function schemaExiste() {
  const { PrismaClient: PC } = await import('@prisma/client');
  const c = new PC({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const r = await c.$queryRawUnsafe(
      `SELECT 1 AS n FROM information_schema.schemata WHERE schema_name = $1`,
      `tenant_${SLUG}`,
    );
    return r.length > 0;
  } finally {
    await c.$disconnect();
  }
}

async function provision() {
  // ⚠ L'API EST REQUISE POUR CRÉER L'ÉCOLE, PAS POUR CONFORMER SES DONNÉES.
  //
  // Provisionner et synchroniser le schéma passent par les routes du produit,
  // et c'est voulu — on ne crée pas une école en SQL. Mais quand l'école
  // EXISTE déjà, exiger l'API rendrait impossible de remettre en conformité un
  // fonds sur un poste où elle ne tourne pas.
  //
  // ⚠ ET LE REPLI SE DIT. Sauter la synchronisation de schéma en silence
  // laisserait croire qu'elle a eu lieu : c'est exactement la forme qu'on
  // corrige partout ailleurs — une fonction qui ne peut pas accomplir son
  // office ne sort pas comme si elle l'avait accompli.
  const joignable = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok)
    .catch(() => false);
  if (!joignable) {
    const existe = await schemaExiste();
    if (!existe) {
      throw new Error(
        `L'API (${API}) est injoignable et l'école « ${SLUG} » n'existe pas encore. ` +
          `Une école se crée par les routes du produit : démarrez l'API, puis relancez.`,
      );
    }
    log(`⚠ API injoignable — école « ${SLUG} » déjà en base, on continue.`);
    log(`⚠ LA SYNCHRONISATION DE SCHÉMA N'A PAS EU LIEU : si le schéma a changé`);
    log(`⚠ depuis le dernier passage, relancez avec l'API démarrée.`);
    return;
  }
  const res = await fetch(`${API}/admin/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-api-key': ADMIN_KEY },
    body: JSON.stringify({ name: SCHOOL, slug: SLUG, domain: DOMAINE }),
  });
  if (res.status === 201) log(`école « ${SLUG} » provisionnée`);
  else if (res.status === 409) log(`école « ${SLUG} » déjà provisionnée`);
  else throw new Error(`provisioning: HTTP ${res.status} ${await res.text()}`);

  const sync = await fetch(`${API}/admin/tenants/${SLUG}/sync-schema`, {
    method: 'POST',
    headers: { 'x-admin-api-key': ADMIN_KEY },
  });
  const corps = await sync.json().catch(() => ({}));
  log(`schéma synchronisé (HTTP ${sync.status})`);

  // ⚠ DEMANDE EXPLICITE DE LA SESSION BACK. `LIKE … INCLUDING ALL` devrait
  // copier la collation avec la définition de colonne, mais ça n'a été mesuré
  // que sur un ALTER, jamais sur une CRÉATION. Une liste non vide ici est une
  // trouvaille, pas un détail — elle signifie que la création NE copie PAS.
  const rattrapees = corps.collationsRattrapees;
  if (Array.isArray(rattrapees)) {
    log(
      rattrapees.length === 0
        ? '⚑ collationsRattrapees = [] — la CRÉATION copie bien la collation'
        : `⚑⚑ collationsRattrapees = ${JSON.stringify(rattrapees)} — À DIRE AU BACK`,
    );
  } else {
    log('⚑ la réponse ne porte pas `collationsRattrapees` (champ absent, pas vide)');
  }
}

function clientTenant() {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema', `tenant_${SLUG}`);
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

const normaliser = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function parPaquets(liste, ecrire) {
  for (let i = 0; i < liste.length; i += PAQUET) {
    await ecrire(liste.slice(i, i + PAQUET));
    if (liste.length > PAQUET * 2) process.stdout.write('.');
  }
  if (liste.length > PAQUET * 2) process.stdout.write('\n');
}

async function main() {
  console.log(`\nFonds de mesure — ${NOTICES} notices dans « ${SLUG} »\n`);
  await provision();

  const db = clientTenant();
  try {
    // ── Notices ────────────────────────────────────────────────────────────
    const voulues = genererNotices(NOTICES);
    const connus = new Set(
      (await db.biblioRecord.findMany({ select: { title: true } })).map((r) => r.title),
    );
    const aCreer = voulues.filter((n) => !connus.has(n.title));
    await parPaquets(aCreer, (p) => db.biblioRecord.createMany({ data: p }));
    log(`${aCreer.length} notices créées (${voulues.length - aCreer.length} déjà là)`);

    // ── Auteurs, puis rattachements ────────────────────────────────────────
    const noms = [...new Set(voulues.map((n) => n.author))];
    const auteurs = new Map(
      (await db.author.findMany({ select: { id: true, displayName: true } })).map((a) => [a.displayName, a.id]),
    );
    const auteursACreer = noms.filter((n) => !auteurs.has(n));
    await parPaquets(auteursACreer, (p) =>
      db.author.createMany({ data: p.map((nom) => ({ displayName: nom, normalizedName: normaliser(nom) })) }),
    );
    if (auteursACreer.length > 0) {
      for (const a of await db.author.findMany({ select: { id: true, displayName: true } })) {
        auteurs.set(a.displayName, a.id);
      }
    }
    log(`${auteursACreer.length} auteurs créés (${auteurs.size} au total)`);

    const enBase = await db.biblioRecord.findMany({ select: { id: true, title: true, author: true } });
    const dejaRattachees = new Set(
      (await db.recordContributor.findMany({ select: { recordId: true } })).map((c) => c.recordId),
    );
    const liens = enBase
      .filter((r) => r.author && !dejaRattachees.has(r.id))
      .map((r) => ({ recordId: r.id, name: r.author, role: 'AUTEUR_PRINCIPAL', position: 0, authorId: auteurs.get(r.author) ?? null }));
    await parPaquets(liens, (p) => db.recordContributor.createMany({ data: p }));
    log(`${liens.length} rattachements`);

    // ⚠ UNE THÈSE OU UN MÉMOIRE PORTE SON DIRECTEUR, ET C'EST UN CONTRIBUTEUR.
    //
    // `cataloging.service` REFUSE la création d'un travail soutenu sans un
    // contributeur de rôle `DIRECTEUR_MEMOIRE` — la règle est nommée dans
    // `requireDefenseFields`. Ce seed écrivait par Prisma, donc il produisait
    // 3 549 travaux académiques que le produit n'aurait jamais acceptés ; leur
    // export ETD-MS rendait du Dublin Core déguisé, alors que la distinction
    // `advisor` / `creator` est précisément ce qu'ETD-MS apporte.
    //
    // ⚠ Le directeur n'est PAS dans `profileData` : chercher `profile_data->>
    // 'directeur'` rend « aucun » sur toutes les lignes, y compris réparées —
    // un chemin qui n'existe pas rend NULL, pas une erreur.
    const travaux = await db.biblioRecord.findMany({
      where: { recordType: { in: ['these', 'memoire'] } },
      select: { id: true },
    });
    const avecDirecteur = new Set(
      (
        await db.recordContributor.findMany({
          where: { role: 'DIRECTEUR_MEMOIRE' },
          select: { recordId: true },
        })
      ).map((c) => c.recordId),
    );
    const directeurs = travaux
      .filter((t) => !avecDirecteur.has(t.id))
      .map((t, i) => {
        const nom = `${NOMS[(i * 7) % NOMS.length]}, ${PRENOMS[(i * 11) % PRENOMS.length]}`;
        return {
          recordId: t.id,
          name: nom,
          role: 'DIRECTEUR_MEMOIRE',
          // Position 1 : l'auteur principal occupe la 0.
          position: 1,
          authorId: auteurs.get(nom) ?? null,
        };
      });
    await parPaquets(directeurs, (p) => db.recordContributor.createMany({ data: p }));
    log(`${directeurs.length} directeur(s) de mémoire/thèse rattaché(s)`);

    // ── Exemplaires ────────────────────────────────────────────────────────
    const avecEx = new Set((await db.item.findMany({ select: { recordId: true } })).map((i) => i.recordId));
    const exemplaires = [];
    let cote = 0;
    for (const r of enBase) {
      if (avecEx.has(r.id)) continue;
      const combien = alea() < 0.25 ? 2 : 1; // un quart des titres en double
      for (let k = 0; k < combien; k += 1) {
        cote += 1;
        exemplaires.push({
          recordId: r.id,
          barcode: `MES-${String(cote).padStart(7, '0')}`,
          callNumber: `${r.title.slice(0, 3).toUpperCase()}-${String(cote).padStart(5, '0')}`,
          location: pioche(['Salle de lecture', 'Magasin', 'Réserve', 'Salle des thèses']),
          itemType: 'livre',
        });
      }
    }
    await parPaquets(exemplaires, (p) => db.item.createMany({ data: p }));
    log(`${exemplaires.length} exemplaires`);

    // ── Adhérents ──────────────────────────────────────────────────────────
    const codesConnus = new Set((await db.patron.findMany({ select: { barcode: true } })).map((p) => p.barcode));
    const adherents = [];
    for (let i = 1; i <= PATRONS; i += 1) {
      const barcode = `H-2026-${String(i).padStart(5, '0')}`;
      if (codesConnus.has(barcode)) continue;
      adherents.push({
        barcode,
        firstName: pioche(PRENOMS),
        lastName: pioche(NOMS),
        category: pioche(['etudiant', 'etudiant', 'etudiant', 'enseignant', 'personnel']),
      });
    }
    await parPaquets(adherents, (p) => db.patron.createMany({ data: p }));
    log(`${adherents.length} adhérents`);

    // ── Prêts : en cours, en retard, rendus ────────────────────────────────
    const dejaPretes = await db.checkout.count();
    if (dejaPretes >= PRETS) {
      log(`${dejaPretes} prêts déjà en base, rien à ajouter`);
    } else {
      const tousEx = await db.item.findMany({ select: { id: true }, take: PRETS * 2 });
      const tousAdh = await db.patron.findMany({ select: { id: true } });
      const JOUR = 86400000;
      const maintenant = Date.now();
      const prets = [];
      for (let i = dejaPretes; i < PRETS; i += 1) {
        const item = tousEx[i % tousEx.length];
        const adh = tousAdh[Math.floor(alea() * tousAdh.length)];
        const debut = maintenant - Math.floor(alea() * 400) * JOUR;
        const echeance = debut + 21 * JOUR;
        // Un tiers en cours, dont une part en retard ; le reste rendu.
        const enCours = alea() < 0.33;
        prets.push({
          itemId: item.id,
          patronId: adh.id,
          checkoutDate: new Date(debut),
          dueDate: new Date(echeance),
          returnDate: enCours ? null : new Date(Math.min(echeance + Math.floor(alea() * 20 - 5) * JOUR, maintenant)),
        });
      }
      await parPaquets(prets, (p) => db.checkout.createMany({ data: p }));
      log(`${prets.length} prêts`);
    }

    // ⚠ L'EXEMPLAIRE PRÊTÉ PASSE À `CHECKED_OUT`. Le produit écrit le prêt ET
    // le statut dans la MÊME transaction (`CirculationService.checkout`) : un
    // prêt ouvert sur un exemplaire `AVAILABLE` est un état qu'il ne peut pas
    // produire. Ce seed en avait fabriqué 820, et ils dataient de la création
    // du fonds — personne ne les avait vus, parce qu'aucun test ne relit la
    // base.
    //
    // ⚠ CE PASSAGE S'EXÉCUTE AUSSI QUAND LE SEED N'AJOUTE RIEN. Un seed qui se
    // contente de sauter quand le compte est atteint laisse sa propre sortie
    // non conforme pour toujours : il doit ASSUMER ce qu'il a écrit, pas
    // seulement l'écrire.
    const ouverts = await db.checkout.findMany({
      where: { returnDate: null },
      select: { itemId: true },
    });
    const aSortir = [...new Set(ouverts.map((c) => c.itemId))];
    const remis = aSortir.length
      ? await db.item.updateMany({
          where: { id: { in: aSortir }, status: 'AVAILABLE' },
          data: { status: 'CHECKED_OUT' },
        })
      : { count: 0 };
    log(`${remis.count} exemplaire(s) remis en CHECKED_OUT (prêt ouvert)`);

    // ── Comptes, classes, inscriptions, réservations ───────────────────────
    //
    // ⚠ POURQUOI CES QUATRE-LÀ, ET PAS LES AUTRES. Un fonds de mesure ne doit
    // grossir que ce qui grossit VRAIMENT dans une école. Les comptes suivent
    // les adhérents (un par étudiant), les inscriptions suivent les comptes, les
    // réservations suivent la circulation. Collections, catégories et rôles
    // restent petites par nature : les grossir mesurerait une fiction, pas une
    // école — et une mesure sur une fiction est pire qu'une mesure absente,
    // parce qu'on la croit.
    //
    // ⚠ `audit_logs` reste DEHORS, et c'est un choix documenté au backlog n° 23 :
    // c'est la seule table partagée par toutes les écoles et sans borne de
    // croissance. La grossir depuis un seul tenant simulerait dix écoles par une,
    // sans la répartition ni l'ancienneté qui font la difficulté.
    const classesVoulues = [
      { name: 'L1_DROIT', label: 'Licence 1 Droit', level: 'L1' },
      { name: 'L2_DROIT', label: 'Licence 2 Droit', level: 'L2' },
      { name: 'L1_MEDECINE', label: 'Licence 1 Médecine', level: 'L1' },
      { name: 'M1_INFO', label: 'Master 1 Informatique', level: 'M1' },
      { name: 'M2_INFO', label: 'Master 2 Informatique', level: 'M2' },
      { name: 'L3_LETTRES', label: 'Licence 3 Lettres', level: 'L3' },
      { name: 'M2_ECONOMIE', label: 'Master 2 Économie', level: 'M2' },
    ];
    const classesConnues = new Map(
      (await db.schoolClass.findMany({ select: { id: true, name: true } })).map((c) => [c.name, c.id]),
    );
    const classesACreer = classesVoulues.filter((c) => !classesConnues.has(c.name));
    if (classesACreer.length > 0) {
      await db.schoolClass.createMany({ data: classesACreer });
      for (const c of await db.schoolClass.findMany({ select: { id: true, name: true } })) {
        classesConnues.set(c.name, c.id);
      }
    }
    log(`${classesACreer.length} classes créées (${classesConnues.size} au total)`);

    // Un compte par adhérent étudiant — c'est ce que fait une vraie école.
    const adherentsEnBase = await db.patron.findMany({
      select: { id: true, barcode: true, firstName: true, lastName: true, category: true, userId: true },
    });
    const emailsConnus = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email));
    const nomsDeClasses = [...classesConnues.keys()];
    const comptes = [];
    for (const p of adherentsEnBase) {
      if (p.userId || p.category !== 'etudiant') continue;
      const email = `${p.barcode.toLowerCase()}@etu.horizon.bf`;
      if (emailsConnus.has(email)) continue;
      comptes.push({
        email,
        matricule: p.barcode,
        firstName: p.firstName ?? 'Étudiant',
        lastName: p.lastName ?? 'Horizon',
        role: 'STUDENT',
        // ⚠ `status` réparti EXPRÈS : un écran de comptes qui n'a que des ACTIVE
        // ne montre ni l'onglet « en attente » ni le geste d'activation, qui est
        // pourtant le travail quotidien d'un gestionnaire.
        ...(() => {
          // ⚠ UNE ACTIVATION PORTE SA DATE. `AccountsService.activate` pose
          // `status` ET `activatedAt` ensemble ; un compte ACTIVE sans date est
          // un état que le produit ne produit jamais. Ce seed en avait fait 412.
          const actif = alea() >= 0.12;
          return {
            status: actif ? 'ACTIVE' : 'PENDING',
            activatedAt: actif ? new Date(Date.now() - Math.floor(alea() * 300) * 86400000) : null,
          };
        })(),
        className: pioche(nomsDeClasses),
        // ⚠ Pas de mot de passe : ces comptes ne servent pas à se connecter, ils
        // servent à REMPLIR l'écran. Aucun n'est utilisable, et c'est voulu.
        password: null,
      });
    }
    await parPaquets(comptes, (p) => db.user.createMany({ data: p }));
    log(`${comptes.length} comptes étudiants`);

    // ⚠ MISE EN CONFORMITÉ — même raison que pour les prêts et les mises de
    // côté : ce seed doit assumer ce qu'il a DÉJÀ écrit, pas seulement ce qu'il
    // écrit aujourd'hui. Il avait produit 412 comptes ACTIVE sans date
    // d'activation ; `AccountsService.activate` pose les deux ensemble, donc
    // cet état n'existe pas dans le produit.
    //
    // ⚠ La date n'est pas inventée au hasard : on la pose à la CRÉATION du
    // compte. Un compte activé ne peut pas l'avoir été avant d'exister, et
    // c'est la seule borne que la base connaisse avec certitude.
    const sansDate = await db.$executeRawUnsafe(
      `UPDATE "tenant_${SLUG}".users SET activated_at = created_at
        WHERE status = 'ACTIVE' AND activated_at IS NULL`,
    );
    if (sansDate > 0) log(`${sansDate} compte(s) actif(s) doté(s) de leur date d'activation`);

    // Inscriptions : une par compte actif, dans sa classe.
    const usersEnBase = await db.user.findMany({
      select: { id: true, className: true, matricule: true },
      where: { role: 'STUDENT' },
    });
    const dejaInscrits = new Set(
      (await db.enrollment.findMany({ select: { userId: true } })).map((e) => e.userId),
    );
    const inscriptions = usersEnBase
      .filter((u) => !dejaInscrits.has(u.id) && u.className && classesConnues.has(u.className))
      .map((u) => ({
        userId: u.id,
        classId: classesConnues.get(u.className),
        academicYear: '2026-2027',
      }));
    await parPaquets(inscriptions, (p) => db.enrollment.createMany({ data: p }));
    log(`${inscriptions.length} inscriptions`);

    // ── Réservations : PAR LA RÈGLE DU PRODUIT ─────────────────────────────
    //
    // ⚠ `CirculationService.placeHoldForPatron` ne laisse PAS le choix :
    //   · un exemplaire libre existe → mise de côté IMMÉDIATE, `AVAILABLE`,
    //     `priority: 0`, `expiryDate = maintenant + HOLD_PICKUP_DAYS`,
    //     et l'exemplaire passe à `ON_HOLD` ;
    //   · aucun exemplaire libre     → file d'attente, `PENDING`,
    //     `priority = longueur de la file + 1`.
    //
    // La version précédente tirait le statut au hasard (`i % 7 === 0`) sur des
    // notices empruntées. Elle a produit DEUX états impossibles : 257 files
    // d'attente sur une notice dont un exemplaire était libre — une file que
    // rien ne vient jamais servir, puisqu'une file n'est promue qu'au RETOUR —
    // et 43 mises de côté sans échéance, donc que rien ne fait expirer.
    const dejaReservees = await db.hold.count();
    if (dejaReservees === 0) {
      const JOUR_MS = 86400000;
      const RETRAIT_JOURS = 7; // HOLD_PICKUP_DAYS, défaut du produit
      const maintenant = Date.now();

      // Notices SANS exemplaire libre : les seules où une file a un sens.
      const sansLibre = await db.$queryRawUnsafe(
        `SELECT r.id FROM "tenant_${SLUG}".biblio_records r
          WHERE EXISTS (SELECT 1 FROM "tenant_${SLUG}".items i WHERE i.record_id = r.id)
            AND NOT EXISTS (SELECT 1 FROM "tenant_${SLUG}".items i
                            WHERE i.record_id = r.id AND i.status = 'AVAILABLE')
          LIMIT 300`,
      );
      // Notices AVEC un exemplaire libre : mise de côté immédiate, et c'est
      // l'exemplaire lui-même qui change d'état.
      const avecLibre = await db.$queryRawUnsafe(
        `SELECT DISTINCT ON (i.record_id) i.record_id AS id, i.id AS item_id
           FROM "tenant_${SLUG}".items i
          WHERE i.status = 'AVAILABLE'
          LIMIT 45`,
      );

      const adherentsIds = adherentsEnBase.map((p) => p.id);
      const pris = new Set();
      const unAdherent = (cle) => {
        // Un adhérent ne peut pas avoir DEUX réservations actives sur la même
        // notice : le produit refuse le doublon. On ne réutilise donc pas.
        for (let k = 0; k < adherentsIds.length; k += 1) {
          const id = adherentsIds[(cle + k) % adherentsIds.length];
          if (!pris.has(id)) { pris.add(id); return id; }
        }
        return null;
      };

      const enAttente = sansLibre
        .map((r, i) => ({ recordId: r.id, patronId: unAdherent(i), status: 'PENDING', priority: 1 }))
        .filter((h) => h.patronId);
      const misesDeCote = avecLibre
        .map((r, i) => ({
          recordId: r.id,
          patronId: unAdherent(i + 10007),
          status: 'AVAILABLE',
          priority: 0,
          expiryDate: new Date(maintenant + RETRAIT_JOURS * JOUR_MS),
          _itemId: r.item_id,
        }))
        .filter((h) => h.patronId);

      await parPaquets(enAttente, (p) => db.hold.createMany({ data: p }));
      await parPaquets(misesDeCote, (p) =>
        db.hold.createMany({ data: p.map(({ _itemId, ...h }) => h) }),
      );
      // ⚠ L'exemplaire mis de côté SORT du fonds disponible. Sans cela, la
      // notice porterait une mise de côté ET un exemplaire libre — l'état
      // exact que la règle ci-dessus existe pour empêcher.
      if (misesDeCote.length > 0) {
        await db.item.updateMany({
          where: { id: { in: misesDeCote.map((h) => h._itemId) } },
          data: { status: 'ON_HOLD' },
        });
      }
      log(`${enAttente.length} files d'attente + ${misesDeCote.length} mises de côté`);
    } else {
      log(`${dejaReservees} réservations déjà en base`);
    }

    // ⚠ MISE EN CONFORMITÉ DE CE QUE CE SEED A DÉJÀ ÉCRIT — voir le passage
    // équivalent sur les prêts. Une mise de côté sans échéance n'expire jamais ;
    // une file d'attente sur une notice à exemplaire libre ne se vide jamais.
    const sansEcheance = await db.hold.updateMany({
      where: { status: 'AVAILABLE', expiryDate: null },
      data: { expiryDate: new Date(Date.now() + 7 * 86400000) },
    });
    if (sansEcheance.count > 0) log(`${sansEcheance.count} mise(s) de côté dotée(s) d'une échéance`);

    const filesFautives = await db.$queryRawUnsafe(
      `SELECT h.id FROM "tenant_${SLUG}".holds h
        WHERE h.status = 'PENDING'
          AND EXISTS (SELECT 1 FROM "tenant_${SLUG}".items i
                      WHERE i.record_id = h.record_id AND i.status = 'AVAILABLE')`,
    );
    if (filesFautives.length > 0) {
      // Le produit les aurait mises de côté immédiatement. On applique SA
      // règle : statut, priorité, échéance — et l'exemplaire qui sort.
      for (const { id } of filesFautives) {
        const h = await db.hold.findUnique({ where: { id }, select: { recordId: true } });
        const libre = await db.item.findFirst({
          where: { recordId: h.recordId, status: 'AVAILABLE' },
          select: { id: true },
        });
        if (!libre) continue;
        await db.$transaction([
          db.hold.update({
            where: { id },
            data: {
              status: 'AVAILABLE',
              priority: 0,
              expiryDate: new Date(Date.now() + 7 * 86400000),
            },
          }),
          db.item.update({ where: { id: libre.id }, data: { status: 'ON_HOLD' } }),
        ]);
      }
      log(`${filesFautives.length} file(s) d'attente converties en mise de côté (règle du produit)`);
    }

    // ── Un compte de personnel, pour mesurer les écrans professionnels ─────
    //
    // ⚠ C'est le CHEMIN NORMAL : un compte créé avec un mot de passe haché, comme
    // le fait `seed-demo`. Ce n'est pas une session fabriquée depuis un secret
    // d'environnement — l'interdit porte sur le JWT signé à la main pour sauter
    // l'authentification, pas sur la création d'un compte qu'on utilisera ensuite
    // en se connectant comme tout le monde.
    const hash = await bcrypt.hash(MOT_DE_PASSE, 10);
    const compteNeuf = !(await db.user.findUnique({
      where: { email: 'mesure@horizon.bf' },
      select: { id: true },
    }));
    await db.user.upsert({
      where: { email: 'mesure@horizon.bf' },
      create: {
        email: 'mesure@horizon.bf', firstName: 'Compte', lastName: 'de mesure',
        role: 'ADMIN', status: 'ACTIVE', activatedAt: new Date(), password: hash,
      },
      // ⚠ LE MOT DE PASSE N'EST PAS RÉÉCRIT À LA RELANCE, et j'ai fait la faute
      // avant de l'écrire. Ce seed est idempotent partout ailleurs ; son upsert
      // de compte, lui, posait un mot de passe NEUF à chaque exécution — donc le
      // compte que quelqu'un venait de noter cessait de fonctionner sans que
      // rien ne le dise. C'est exactement ce que je reprochais à `seed-demo`, et
      // c'est pour ça que je refuse de le relancer sur l'école de démonstration.
      //
      // Il ne se réécrit que si ECHELLE_PASSWORD est fourni : reprendre la main
      // sur un compte devient alors un geste DÉLIBÉRÉ, pas un effet de bord.
      update: process.env.ECHELLE_PASSWORD
        ? { role: 'ADMIN', status: 'ACTIVE', password: hash }
        : { role: 'ADMIN', status: 'ACTIVE' },
    });
    log('compte de mesure : mesure@horizon.bf');

    // ── Compte rendu ───────────────────────────────────────────────────────
    const [n, a, e, p, c] = await Promise.all([
      db.biblioRecord.count(), db.author.count(), db.item.count(),
      db.patron.count(), db.checkout.count(),
    ]);
    console.log(`\n  ${SLUG} : ${n} notices · ${a} auteurs · ${e} exemplaires · ${p} adhérents · ${c} prêts`);
    console.log(`  Écran public : http://${DOMAINE}:3005/`);
    console.log(`  Connexion    : mesure@horizon.bf`);
    // ⚠ N'ANNONCE QUE CE QUI A ÉTÉ POSÉ. Afficher un mot de passe tiré au hasard
    // alors que l'upsert ne l'a PAS écrit serait un faux — et un faux qui
    // immobilise : la personne noterait une valeur qui n'ouvre rien.
    if (process.env.ECHELLE_PASSWORD) {
      console.log(`  Mot de passe : celui d'ECHELLE_PASSWORD\n`);
    } else if (compteNeuf) {
      console.log(`  Mot de passe : ${MOT_DE_PASSE}   (affiché une seule fois)\n`);
    } else {
      console.log(
        `  Mot de passe : INCHANGÉ (le compte existait déjà).\n` +
          `                 Pour en poser un : ECHELLE_PASSWORD='<le vôtre>' node scripts/seed-echelle.mjs\n`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error('\n✖', e.message);
  process.exit(1);
});
