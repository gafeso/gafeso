#!/usr/bin/env node
/**
 * MIGRATION MinIO -> Garage, pour une instance EXISTANTE.
 *
 * ⚠ ELLE NE SUPPRIME RIEN. Le volume MinIO reste intact apres la bascule :
 * c'est LUI, le retour arriere. Un script de migration qui efface la source
 * supprime en meme temps la seule chose qui permet de revenir.
 *
 * Les cinq temps, et chacun refuse plutot que de continuer :
 *   1. LES ECRITURES SONT ARRETEES — verifie, pas suppose : si l'API repond
 *      encore, on refuse. Une copie prise pendant qu'on ecrit est une copie
 *      dont on ne sait rien.
 *   2. COPIE objet par objet, de MinIO vers Garage.
 *   3. VERIFICATION cle + taille + SHA-256, sur CHAQUE objet, dans les deux
 *      sens — rien en trop, rien en moins. Un COMPTE egal ne prouve rien :
 *      deux ensembles de meme cardinal peuvent differer element par element.
 *   4. BASCULE de la configuration, dans un fichier SAUVEGARDE d'abord.
 *   5. LE RETOUR ARRIERE est ecrit dans la sortie, avec sa commande.
 *
 * ⚠ Elle ne redemarre RIEN elle-meme : demarrer et arreter les services d'une
 * instance en service est une decision d'exploitant, pas d'un script.
 *
 * Usage :
 *   node scripts/migration-minio-vers-garage.mjs --verifier-seulement
 *   node scripts/migration-minio-vers-garage.mjs --migrer --confirmation=<domaine>
 */
import { copyFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { clientS3, sha256, corpsDeLObjet, listerLesObjets } from './lib/objets-s3.mjs';

/**
 * ⭐ LE BUCKET PUBLIC CHANGE DE NOM ENTRE LES DEUX, et c'est la repetition qui
 * l'a trouve — pas une relecture. Sur MinIO il s'appelle « covers » ; sur
 * Garage il porte LE DOMAINE des couvertures pour nom, parce que son point
 * d'entree web choisit le bucket par le NOM D'HOTE.
 *
 * ⚠ Ma premiere version ecrivait « covers » des deux cotes et echouait sur
 * NoSuchBucket au premier objet de couverture — apres avoir copie les 40 PDF.
 * Une migration doit donc porter une CORRESPONDANCE de noms, pas une liste.
 */
const correspondance = (domainePublic) => [
  { source: 'digital-copies', cible: 'digital-copies' },
  { source: 'covers', cible: domainePublic },
];
const refuse = (m, lignes = []) => {
  console.error('REFUS : ' + m);
  for (const l of lignes) console.error('   ' + l);
  process.exit(1);
};
const argv = process.argv.slice(2);
const migrer = argv.includes('--migrer');
const brut = argv.find((a) => a.startsWith('--confirmation'));
const confirmation = brut && brut.includes('=') ? brut.split('=').slice(1).join('=') : null;

const E = process.env;
for (const v of ['MINIO_SOURCE_URL', 'MINIO_SOURCE_KEY', 'MINIO_SOURCE_SECRET',
                 'GARAGE_S3_URL', 'GARAGE_KEY', 'GARAGE_SECRET']) {
  if (!E[v]) refuse(v + ' est exige.', ['Les six adresses et cles sont necessaires pour comparer.']);
}
if (migrer && !confirmation) {
  refuse('--confirmation=<domaine public> est exigee pour BASCULER.', [
    'Elle doit valoir le domaine des couvertures, car le bucket public de',
    'Garage porte ce domaine pour nom : se tromper rendrait les couvertures',
    'illisibles sans que rien ne casse.',
  ]);
}

const src = clientS3(E.MINIO_SOURCE_URL, E.MINIO_SOURCE_KEY, E.MINIO_SOURCE_SECRET);
const dst = clientS3(E.GARAGE_S3_URL, E.GARAGE_KEY, E.GARAGE_SECRET);

/**
 * ⚠ JOIGNABLE ≠ LISIBLE. Sans ce controle, une adresse fausse et un bucket
 * absent produisent le MEME message plus bas (« bucket illisible »), et
 * rien ne dit si c'est le RESEAU ou les IDENTIFIANTS qui sont en cause.
 *
 * Trouve le 16 octobre 2026, en executant la migration depuis un
 * conteneur sur le reseau du compose : une adresse mal orthographiee
 * (nom de service errone) et un identifiant faux produisaient tous les
 * deux « illisible », sans dire LEQUEL des deux cotes ne repondait pas.
 */
async function verifierJoignable(nom, url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch (e) {
    refuse(nom + ' est INJOIGNABLE a ' + url + ' : ' + (e.cause?.code ?? e.name), [
      "Toute reponse HTTP, meme une erreur S3, aurait suffi a prouver que",
      "l'adresse repond. Verifiez le nom du service et qu'il est sur le",
      "MEME reseau Docker que ce conteneur (`docker network inspect`).",
    ]);
  }
}
await verifierJoignable('la SOURCE (MinIO)', E.MINIO_SOURCE_URL);
await verifierJoignable('la CIBLE (Garage)', E.GARAGE_S3_URL);

// ── 1. les ecritures sont-elles ARRETEES ?
if (migrer) {
  const sonde = E.API_HEALTH_URL;
  if (!sonde) {
    refuse('API_HEALTH_URL est exigee pour BASCULER.', [
      "Sans elle, on ne peut pas verifier que les ecritures sont arretees,",
      "et une copie prise pendant qu'on ecrit est une copie dont on ne sait rien.",
    ]);
  }
  let repond = false;
  try {
    const r = await fetch(sonde, { signal: AbortSignal.timeout(5000) });
    repond = r.ok;
  } catch { repond = false; }
  if (repond) {
    refuse("L'API REPOND ENCORE : les ecritures ne sont pas arretees.", [
      'Arretez les services qui ecrivent (api, web) avant de migrer, puis',
      'relancez. Ce refus est la seule chose qui garantit que la copie est',
      "prise sur un etat fixe.",
    ]);
  }
  console.log('ecritures arretees : ' + sonde + ' ne repond pas');
}

// ── 2 et 3. copie puis VERIFICATION, bucket par bucket
let copies = 0; let verifies = 0;
const ecarts = [];
// ⚠ Hors bascule, le domaine n'est pas confirme : on prend celui de
// l'environnement, et on REFUSE s'il manque — sinon la verification porterait
// sur un bucket dont on a invente le nom.
const domainePublic = confirmation ?? E.STORAGE_PUBLIC_DOMAIN;
if (!domainePublic) {
  refuse('STORAGE_PUBLIC_DOMAIN est exige meme pour VERIFIER.', [
    'Le bucket public de Garage porte le domaine pour nom : sans lui, on ne',
    'sait pas quel bucket comparer, et une absence se lirait comme un vide.',
  ]);
}
for (const { source: bs, cible: bc } of correspondance(domainePublic)) {
  let source;
  try { source = await listerLesObjets(src, bs); }
  catch (e) { refuse('bucket source « ' + bs + ' » illisible : ' + e.name); }
  console.log(bs + ' -> ' + bc + ' : ' + source.length + ' objet(s) a la source');
  if (migrer) {
    for (const o of source) {
      await dst.send(new PutObjectCommand({ Bucket: bc, Key: o.Key, Body: await corpsDeLObjet(src, bs, o.Key) }));
      copies += 1;
    }
  }
  let cible;
  try { cible = await listerLesObjets(dst, bc); }
  catch (e) {
    refuse('bucket CIBLE « ' + bc + ' » illisible : ' + e.name, [
      "L'initialisation de Garage a-t-elle tourne ? Le bucket public porte le",
      'DOMAINE pour nom, pas « covers ».',
    ]);
  }
  const parCle = new Map(cible.map((o) => [o.Key, o]));
  for (const o of source) {
    const c = parCle.get(o.Key);
    if (!c) { ecarts.push('MANQUANT ' + bc + '/' + o.Key); continue; }
    if (c.Size !== o.Size) { ecarts.push('TAILLE ' + bc + '/' + o.Key + ' ' + c.Size + ' au lieu de ' + o.Size); continue; }
    const [a, z] = await Promise.all([corpsDeLObjet(src, bs, o.Key), corpsDeLObjet(dst, bc, o.Key)]);
    if (sha256(a) !== sha256(z)) { ecarts.push('SOMME ' + bc + '/' + o.Key); continue; }
    verifies += 1;
  }
  // ⚠ ET DANS L'AUTRE SENS : un objet EN TROP a la cible est une information.
  const cles = new Set(source.map((o) => o.Key));
  for (const o of cible) if (!cles.has(o.Key)) ecarts.push('EN TROP ' + bc + '/' + o.Key);
}
const total = verifies + ecarts.length;
console.log('verifies cle+taille+SHA-256 : ' + verifies + ' ; ecarts : ' + ecarts.length);
for (const e of ecarts.slice(0, 10)) console.error('   ' + e);
if (ecarts.length) refuse('la verification a trouve des ecarts — AUCUNE bascule.');
// ⚠ TEMOIN : zero ecart sur zero objet examine serait un vert a vide.
if (total === 0) {
  refuse('AUCUN objet examine : cette migration ne mesure rien.', [
    "Un bucket source vide ne se distingue pas d'une adresse fausse.",
  ]);
}
if (!migrer) { console.log('--verifier-seulement : AUCUNE bascule, AUCUNE ecriture de configuration.'); process.exit(0); }
console.log('copies : ' + copies);

// ── 4. la bascule, dans un fichier SAUVEGARDE d'abord
const fichier = E.ENV_FILE ?? '.env.prod';
if (!existsSync(fichier)) refuse('fichier de configuration introuvable : ' + fichier);
const sauvegarde = fichier + '.avant-garage';
copyFileSync(fichier, sauvegarde);
chmodSync(sauvegarde, 0o600);
// ⚠ On RELIT la sauvegarde : un `cp` qui echoue en silence laisserait la
// bascule sans retour arriere, et c'est exactement le moment ou il faut un.
if (readFileSync(sauvegarde, 'utf8') !== readFileSync(fichier, 'utf8')) {
  refuse('la sauvegarde de la configuration ne correspond pas a l original.');
}
console.log('configuration sauvegardee : ' + sauvegarde + ' (0600)');

const lignes = readFileSync(fichier, 'utf8').split('\n');
const poser = (nom, valeur) => {
  const i = lignes.findIndex((l) => l.startsWith(nom + '='));
  if (i >= 0) lignes[i] = nom + '=' + valeur; else lignes.push(nom + '=' + valeur);
};
poser('MINIO_ROOT_USER', E.GARAGE_KEY);
poser('MINIO_ROOT_PASSWORD', E.GARAGE_SECRET);
poser('STORAGE_PUBLIC_BUCKET_IN_PATH', 'false');
poser('STORAGE_PUBLIC_DOMAIN', confirmation);
writeFileSync(fichier, lignes.join('\n'));
chmodSync(fichier, 0o600);
console.log('configuration basculee (valeurs NON affichees)');

// ── 5. le retour arriere, ECRIT
console.log('');
console.log('RETOUR ARRIERE, si quelque chose ne va pas :');
console.log('  cp ' + sauvegarde + ' ' + fichier);
console.log('  puis redemarrez les services.');
console.log('Le volume MinIO n a PAS ete touche : il porte encore tous les objets.');
