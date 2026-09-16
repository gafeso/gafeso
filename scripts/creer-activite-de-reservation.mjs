#!/usr/bin/env node
/**
 * ACTIVITÉ DE RÉSERVATION POUR LA DÉMONSTRATION — une file d'attente réelle.
 *
 * ⚠ POURQUOI IL EXISTE. La table `holds` de l'école de démonstration est VIDE.
 * Or le MOMENT 4 du script du 21 septembre promet une phrase :
 *
 *   « Au retour d'un document réservé, l'écran dit s'il a été possible de
 *     prévenir le lecteur — et s'il ne l'a pas été, il le dit. »
 *
 * Cette phrase naît de la PROMOTION d'une réservation en attente au retour de
 * l'exemplaire (`CirculationService.returnItem`). Sans réservation en attente,
 * le retour est un retour ordinaire et rien ne s'affiche : le présentateur
 * rendrait un livre en attendant une phrase qui ne viendra pas.
 *
 * ⚠ CE QU'IL PRODUIT EST CE QUE LE PRODUIT PRODUIRAIT. `placeHold` crée une
 * réservation PENDING dont la `priority` est la position dans la file, comptée
 * sur les réservations ACTIVES de la même notice. Ce script applique la même
 * règle. Un seed qui écrit un état que le produit refuse ne démontre pas le
 * produit — c'est la faute qu'on a déjà payée trois fois.
 *
 * ⚠ CE QU'IL NE FAIT PAS.
 *  · Il ne crée aucune réservation AVAILABLE : celles-là naissent d'un retour,
 *    et c'est précisément le geste qu'on veut montrer en direct.
 *  · Il ne réserve jamais pour l'emprunteur en cours — le produit le refuse.
 *  · Il ne touche à rien d'autre : ni prêts, ni exemplaires, ni comptes.
 *
 * ⚠ IDEMPOTENT — ET IL NE L'ÉTAIT PAS À SA PREMIÈRE ÉCRITURE. Il sautait les
 * notices déjà réservées, puis en choisissait d'AUTRES : relancé, il créait
 * trois files de plus. La promesse était dans le commentaire, et rien ne la
 * vérifiait — un faux dispositif dans le script écrit pour en réparer un.
 * Trouvé en le relançant, pas en le relisant, et les six lignes ont été
 * retirées par différence d'ensembles avec le recensement.
 *
 * Il vise désormais un TOTAL : `--combien` est le nombre de files ACTIVES
 * qu'on veut en base, pas le nombre à ajouter. Relancé, il ne crée rien.
 *
 * LECTURE SEULE par défaut — un script qui écrit sans qu'on le demande est un
 * script qu'on lance par mégarde.
 *
 *   node scripts/creer-activite-de-reservation.mjs --ecole=zinda
 *   node scripts/creer-activite-de-reservation.mjs --ecole=zinda --appliquer
 *
 * En production, `DATABASE_URL` doit désigner la base de la démonstration.
 */
import { loadEnvIfPresent } from './lib/load-env.mjs';
import { ouvrirEcole, RACINE } from './lib/base-tenant.mjs';
import { join } from 'node:path';

loadEnvIfPresent(join(RACINE, '.env'));

const args = process.argv.slice(2);
const appliquer = args.includes('--appliquer');
const ecole = args.find((a) => a.startsWith('--ecole='))?.slice(8);
/**
 * Combien de files ACTIVES on veut EN TOUT (pas combien en ajouter). Trois
 * suffisent à montrer, et à avoir du rab si un code-barres se scanne mal.
 */
const COMBIEN = Number(args.find((a) => a.startsWith('--combien='))?.slice(10) ?? 3);

/**
 * ⚠ `--sans-courriel` : NE RÉSERVER QUE POUR DES ADHÉRENTS SANS ADRESSE
 * EXPLOITABLE — et ce n'est pas un détail d'affichage, c'est LA PHRASE.
 *
 * Au retour, `notifyAvailable` regarde l'adresse du réservataire et rend un
 * motif. Deux phrases en découlent, et elles ne disent pas la même chose :
 *
 *   · adresse absente ou invalide → `aucun_destinataire` → **« Ce lecteur n'a
 *     PAS pu être prévenu, ET IL NE LE SERA PAS »** — une IMPOSSIBILITÉ que le
 *     produit constate et annonce ;
 *   · envoi échoué → **« n'a pas ENCORE été prévenu, l'envoi sera retenté »** —
 *     qui se lit, devant une salle, comme un incident de configuration. La
 *     question porte alors sur le serveur de courriel de celui qui présente,
 *     pas sur le produit.
 *
 * Demandé par Jean le 16 septembre 2026, avec ce motif exact. La première
 * phrase se lit dans la DONNÉE ; la seconde dans la CONFIGURATION.
 */
const sansCourriel = args.includes('--sans-courriel');

if (!ecole) { console.error('⚠ --ecole=<slug> est obligatoire.'); process.exit(2); }
if (!Number.isInteger(COMBIEN) || COMBIEN < 1) {
  console.error(`⚠ --combien doit être un entier ≥ 1 (reçu « ${COMBIEN} »).`);
  process.exit(2);
}

// ⚠ `ouvrirEcole` VÉRIFIE que le schéma existe et RÉÉCRIT le paramètre
// `schema` de l'URL plutôt que d'en ajouter un second. Ce script concaténait,
// et `DATABASE_URL` porte déjà `?schema=public` : il produisait deux
// paramètres, et ça marchait parce que Prisma prenait le dernier.
let db;
try {
  db = await ouvrirEcole(ecole);
} catch (e) {
  console.error(`⚠ ${e.message}`);
  process.exit(2);
}

try {
  // ── RECENSEMENT AVANT, par IDENTIFIANTS.
  const avant = new Set((await db.hold.findMany({ select: { id: true } })).map((h) => h.id));
  console.log(`${ecole} : ${avant.size} réservation(s) avant.${appliquer ? '' : '   (LECTURE SEULE — ajoutez --appliquer)'}`);

  // Des notices dont un exemplaire est ACTUELLEMENT prêté : ce sont les seules
  // sur lesquelles un retour peut se produire devant le public.
  const pretsOuverts = await db.checkout.findMany({
    where: { returnDate: null },
    select: { patronId: true, item: { select: { recordId: true, barcode: true } } },
    take: 200,
  });
  const dejaActives = new Set(
    (await db.hold.findMany({
      where: { status: { in: ['PENDING', 'AVAILABLE'] } },
      select: { recordId: true },
    })).map((h) => h.recordId),
  );
  // ⚠ L'ADRESSE EST LUE SUR LE COMPTE LIÉ, pas sur la fiche d'adhérent : c'est
  // ce que `notifyAvailable` regarde (`hold.patron.user.email`). Un adhérent
  // sans compte n'a par construction aucune adresse — c'est le cas le plus net.
  const adherents = (
    await db.patron.findMany({
      select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } },
    })
  ).filter((a) => {
    if (!sansCourriel) return true;
    const courriel = a.user?.email?.trim() ?? '';
    // Même test que l'API : absent, vide, ou sans arobase encadrée.
    return !courriel || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel);
  });

  // ⚠ ON NE SUPPOSE RIEN DU FONDS. Chaque manque est DIT, avec son chiffre :
  // une sortie vide sans explication se lit comme « tout va bien ».
  if (sansCourriel) {
    console.log(
      `\n--sans-courriel : ${adherents.length} adhérent(s) sans adresse exploitable.\n` +
        `Ce sont eux qui produisent la phrase « il ne le sera pas ».`,
    );
  }
  if (pretsOuverts.length === 0 || adherents.length < 2) {
    console.log(`\n${pretsOuverts.length} prêt(s) en cours, ${adherents.length} adhérent(s).`);
    console.log(
      'Rien à créer : il faut au moins UN prêt en cours (c’est lui qu’on rendra\n' +
        'devant le public) et DEUX adhérents (on ne réserve pas pour l’emprunteur).',
    );
    process.exitCode = 1;
    await db.$disconnect();
    process.exit(1);
  }

  // ⚠ LES NOTICES DONT UN EXEMPLAIRE EST LIBRE SONT EXCLUES, et c'est la règle
  // du produit, pas une précaution : `placeHold` met la réservation à
  // AVAILABLE immédiatement s'il trouve un exemplaire disponible. Une
  // réservation PENDING sur une notice qui en a un est un état que le produit
  // ne produit JAMAIS — exactement ce qu'un écrivain direct fabrique sans le
  // savoir. Vérifié après coup la première fois ; désormais par construction.
  const avecExemplaireLibre = new Set(
    (await db.item.findMany({ where: { status: 'AVAILABLE' }, select: { recordId: true } }))
      .map((i) => i.recordId),
  );

  // ⚠ ON VISE UN TOTAL : ce qui existe déjà COMPTE dans la cible. Sans cette
  // ligne, chaque relance ajoute `COMBIEN` files de plus.
  // ⚠ RETENU AVANT LA BOUCLE : celle-ci alimente `dejaActives` au fil de ses
  // choix, donc l'afficher après ferait dire au message un nombre qui inclut
  // ce qu'on vient de décider. Un compte relu après coup n'est pas le compte
  // de départ.
  const actifsAuDepart = dejaActives.size;
  const aAjouter = Math.max(0, COMBIEN - actifsAuDepart);
  const choisies = [];
  for (const p of pretsOuverts) {
    if (choisies.length >= aAjouter) break;
    if (!p.item?.recordId || dejaActives.has(p.item.recordId)) continue;
    if (avecExemplaireLibre.has(p.item.recordId)) continue;
    // ⚠ JAMAIS L'EMPRUNTEUR EN COURS : le produit refuse qu'on réserve ce
    // qu'on détient, et un état qu'il refuse ne démontre pas le produit.
    // ⚠ UN ADHÉRENT DIFFÉRENT PAR FILE, et ce n'est pas cosmétique : trois
    // réservations au même nom se lisent comme une donnée fabriquée, ce qui
    // est exactement l'impression qu'une démonstration doit éviter.
    const candidats = adherents.filter((a) => a.id !== p.patronId);
    const candidat = candidats[choisies.length % candidats.length];
    if (!candidat) continue;
    dejaActives.add(p.item.recordId);
    choisies.push({ recordId: p.item.recordId, patronId: candidat.id, codeBarres: p.item.barcode,
                    qui: `${candidat.firstName} ${candidat.lastName}` });
  }

  const titres = new Map((await db.biblioRecord.findMany({
    where: { id: { in: choisies.map((c) => c.recordId) } }, select: { id: true, title: true },
  })).map((r) => [r.id, r.title]));

  console.log(`\n${actifsAuDepart} file(s) active(s) déjà en base, cible ${COMBIEN} → ${choisies.length} à créer :`);
  if (choisies.length === 0 && actifsAuDepart < COMBIEN) {
    console.log('   ⚠ aucune notice éligible : il faut un prêt en cours sur une notice');
    console.log('     dont AUCUN exemplaire n’est libre, et pas déjà réservée.');
  }
  for (const c of choisies) console.log(`   · « ${titres.get(c.recordId)} » — code-barres ${c.codeBarres} — réservé par ${c.qui}`);

  if (appliquer && choisies.length) {
    for (const c of choisies) {
      // Même règle que `placeHold` : la priorité est la position dans la file
      // des réservations ACTIVES de cette notice.
      const file = await db.hold.count({
        where: { recordId: c.recordId, status: { in: ['PENDING', 'AVAILABLE'] } },
      });
      await db.hold.create({
        data: { recordId: c.recordId, patronId: c.patronId, status: 'PENDING', priority: file + 1 },
      });
    }
    // ── CONTRÔLE PAR DIFFÉRENCE D'ENSEMBLES, confronté au recensement.
    const apres = await db.hold.findMany({ select: { id: true } });
    const nouvelles = apres.filter((h) => !avant.has(h.id));
    console.log(`\n✓ ${nouvelles.length} réservation(s) apparue(s) (attendu ${choisies.length})`);
    if (nouvelles.length !== choisies.length) {
      console.error('⚠ ÉCART entre le prévu et l’apparu — relisez avant de continuer.');
      process.exitCode = 1;
    }
    console.log('\n⚠ POUR LA DÉMONSTRATION : rendez l’un de ces codes-barres au Guichet.');
    console.log('  La réservation passe en « mise de côté », et l’écran dit si le');
    console.log('  réservataire a pu être prévenu — ou s’il ne l’a pas été.');
    if (sansCourriel) {
      console.log('\n  Ces réservataires n’ont AUCUNE adresse exploitable : l’écran dira');
      console.log('  « il ne le sera pas », l’impossibilité constatée — et non');
      console.log('  « l’envoi sera retenté », qui se lit comme un incident technique.');
    }
  } else if (!appliquer) {
    console.log('\nRien écrit (mode lecture).');
  }
} finally {
  await db.$disconnect();
}
