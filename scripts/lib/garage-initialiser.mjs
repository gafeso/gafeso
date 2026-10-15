#!/usr/bin/env node
/**
 * INITIALISATION DE GARAGE — entierement par son API d'ADMINISTRATION.
 *
 * ⭐ POURQUOI PAS UN SCRIPT DANS LE CONTENEUR : l'image de Garage ne contient
 * NI sh, NI tar, NI busybox — mesure, pas suppose. On ne peut donc pas y
 * enchainer des commandes, et un `docker exec garage /garage ...` par geste
 * demanderait un orchestrateur hors du compose. L'API d'administration est la
 * seule voie qui tienne dans une installation sans geste manuel.
 *
 * ⚠ ELLE EST IDEMPOTENTE, et c'est une PROPRIETE DE L'ETAT VISE, pas une
 * absence de doublons : relancee, elle vise le meme etat final et ne cree rien
 * de plus. Ce depot a paye la distinction : « un script qui ajoute N elements
 * en evitant les doublons n'est pas idempotent, il est non-destructeur ».
 * Elle se verifie en la LANCANT DEUX FOIS.
 *
 * Ce qu'elle pose :
 *   1. le layout (une zone, une capacite) — saute si une version existe deja ;
 *   2. une cle S3 nommee, dont le secret n'est RENDU QU'A LA CREATION ;
 *   3. les deux buckets, avec les droits de la cle ;
 *   4. l'alias GLOBAL du bucket public = LE DOMAINE des couvertures ;
 *   5. l'acces web de ce bucket, qui est la seule lecture publique de Garage.
 *
 * ⚠ LE SECRET N'EST JAMAIS IMPRIME. Il est ecrit dans le fichier que l'appelant
 * designe, en 0600. Un secret dans une sortie finit dans un journal de CI.
 */

const BASE = process.env.GARAGE_ADMIN_URL;
const JETON = process.env.GARAGE_ADMIN_TOKEN;
const ZONE = process.env.GARAGE_ZONE ?? 'dc1';
const CAPACITE = Number(process.env.GARAGE_CAPACITY_BYTES ?? 10 * 1024 ** 3);
const NOM_CLE = process.env.GARAGE_KEY_NAME ?? 'gafeso';
// ⚠ Les identifiants S3 de l'exploitant, tels que l'API les emploie : cette
// initialisation les IMPORTE dans Garage au lieu d'en creer d'autres.
const CLE_ID = process.env.MINIO_ROOT_USER;
const CLE_SECRET = process.env.MINIO_ROOT_PASSWORD;
const DOMAINE_PUBLIC = process.env.STORAGE_PUBLIC_DOMAIN;
const BUCKET_PRIVE = 'digital-copies';
const BUCKET_PUBLIC = 'covers';

const refuse = (m, lignes = []) => {
  console.error('REFUS : ' + m);
  for (const l of lignes) console.error('   ' + l);
  process.exit(1);
};
if (!BASE || !JETON) {
  refuse('GARAGE_ADMIN_URL et GARAGE_ADMIN_TOKEN sont exiges.', [
    "Sans eux, cette initialisation ne peut rien faire, et un demarrage",
    "silencieux laisserait une instance sans bucket.",
  ]);
}
if (!DOMAINE_PUBLIC) {
  refuse('STORAGE_PUBLIC_DOMAIN est exige.', [
    "Le point d'entree web de Garage choisit le bucket par le NOM D'HOTE :",
    "le bucket public porte donc le domaine des couvertures pour nom.",
    "Sans lui, aucune couverture ne serait lisible publiquement.",
  ]);
}

// ⚠ TOUT CE QUI SE VERIFIE SANS RESEAU SE VERIFIE AVANT LE RESEAU.
//
// Mon premier jet controlait la forme de la cle APRES le premier appel a
// Garage : lance avec une adresse injoignable ET une cle mal formee, il
// plantait sur une erreur de bibliotheque au lieu de dire laquelle des deux
// fautes corriger. C'est la meme lecon que le controle des secrets de rc4,
// qui avait ete deplace AVANT les migrations pour la meme raison.
const FORME_CLE = /^GK[0-9a-f]{24}$/;
if (!CLE_ID || !CLE_SECRET) {
  refuse('MINIO_ROOT_USER et MINIO_ROOT_PASSWORD sont exiges.', [
    "Ce sont les identifiants S3 que l'API emploie, et ceux que cette",
    'initialisation IMPORTE dans Garage.',
  ]);
}
// ⚠ ET LE SECRET A SA PROPRE FORME, mesuree separement : exactement 64
// caracteres hexadecimaux. Un hex de 48, un hex de 32 et un base64 de 32
// octets sont TOUS refuses (HTTP 400, « not a valid Garage secret key »).
// C'est une contrainte de plus pour l'exploitant, et elle ne se devine pas.
const FORME_SECRET = /^[0-9a-f]{64}$/;
if (!FORME_SECRET.test(CLE_SECRET)) {
  refuse('MINIO_ROOT_PASSWORD n a pas la forme exigee par Garage.', [
    'Garage impose EXACTEMENT 64 caracteres hexadecimaux minuscules.',
    'Mesure : 48 hex, 32 hex et base64 de 32 octets sont refuses (HTTP 400).',
    'Pour en engendrer un :',
    '    openssl rand -hex 32',
    'Puis reportez-le dans MINIO_ROOT_PASSWORD.',
    '',
    'ATTENTION, instance EXISTANTE : votre ancien mot de passe MinIO ne',
    'respecte probablement pas cette forme. Il FAUT en engendrer un nouveau,',
    'et c est le script de migration qui recopie les objets avec les deux',
    'jeux d identifiants — voir scripts/migration-minio-vers-garage.mjs.',
  ]);
}
if (!FORME_CLE.test(CLE_ID)) {
  refuse('MINIO_ROOT_USER n a pas la forme exigee par Garage.', [
    'Garage impose « GK » suivi de 24 caracteres hexadecimaux minuscules.',
    'Mesure : un nom lisible et un hex sans prefixe sont refuses (HTTP 400).',
    'Pour en engendrer une :',
    '    printf \'GK%s\\n\' "$(openssl rand -hex 12)"',
    'Puis reportez-la dans MINIO_ROOT_USER.',
  ]);
}

async function appel(methode, chemin, corps) {
  const r = await fetch(BASE + chemin, {
    method: methode,
    headers: {
      Authorization: 'Bearer ' + JETON,
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  let json;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
  return { statut: r.status, json, texte };
}

// ── 1. le layout
const etat = await appel('GET', '/v1/status');
if (etat.statut !== 200) refuse('Garage ne repond pas (HTTP ' + etat.statut + ').');
const noeud = etat.json.node;
if (etat.json.layoutVersion > 0) {
  console.log('layout : deja applique (version ' + etat.json.layoutVersion + ') — rien a faire');
} else {
  const a = await appel('POST', '/v1/layout',
    [{ id: noeud, zone: ZONE, capacity: CAPACITE, tags: [] }]);
  if (a.statut !== 200) refuse('layout refuse (HTTP ' + a.statut + ') : ' + a.texte.slice(0, 120));
  const b = await appel('POST', '/v1/layout/apply', { version: 1 });
  if (b.statut !== 200) refuse('layout non applique (HTTP ' + b.statut + ') : ' + b.texte.slice(0, 120));
  console.log('layout : applique (zone ' + ZONE + ', ' + Math.round(CAPACITE / 1024 ** 3) + ' Go)');
}

// ── 2. la cle : ON IMPORTE CELLE DE L'EXPLOITANT, on n'en cree pas.
//
// ⭐ C'EST LA DIFFERENCE QUI DECIDE DE TOUT LE RESTE. Creer la cle ici
// produirait un secret que l'API ne connait pas encore — or elle demarre avec
// MINIO_ROOT_USER / MINIO_ROOT_PASSWORD, posees dans .env.prod AVANT le
// premier demarrage. Une cle creee a l'initialisation serait donc un secret
// qu'il faudrait recopier a la main dans la configuration, c'est-a-dire
// exactement le geste manuel qu'on supprime.
//
// En l'IMPORTANT, l'exploitant garde le geste qu'il connait : deux valeurs
// dans son fichier d'environnement, et rien a relire nulle part.
//
// ⚠ ET LE FORMAT N'EST PAS LIBRE — mesure, pas suppose : Garage exige
// « GK » suivi de 24 caracteres hexadecimaux. Un nom lisible ou un hex sans
// prefixe sont refuses (HTTP 400, « Invalid key format »). On le verifie ICI,
// avec un message qui dit comment en engendrer une, plutot que de laisser
// l'import echouer sur un message de bibliotheque.
const cles = await appel('GET', '/v1/key?list');
const existante = (cles.json ?? []).find((k) => k.id === CLE_ID);
if (existante) {
  console.log('cle ' + CLE_ID + ' : deja presente — rien a importer');
} else {
  const c = await appel('POST', '/v1/key/import',
    { accessKeyId: CLE_ID, secretAccessKey: CLE_SECRET, name: NOM_CLE });
  if (c.statut !== 200) {
    refuse('import de la cle refuse (HTTP ' + c.statut + ') : ' + c.texte.slice(0, 140), [
      'Si le message parle de QUORUM, le layout n est pas encore applique :',
      'cette initialisation le pose avant, donc relancez-la telle quelle.',
    ]);
  }
  console.log('cle ' + CLE_ID + ' : importee (secret NON affiche)');
}
const ID_CLE = CLE_ID;

// ── 3. les buckets et les droits
for (const nom of [BUCKET_PRIVE, BUCKET_PUBLIC]) {
  const alias = nom === BUCKET_PUBLIC ? DOMAINE_PUBLIC : nom;
  const liste = await appel('GET', '/v1/bucket?list');
  const vu = (liste.json ?? []).find((b) => (b.globalAliases ?? []).includes(alias));
  let id = vu?.id;
  if (!id) {
    const c = await appel('POST', '/v1/bucket', { globalAlias: alias });
    if (c.statut !== 200) refuse('bucket « ' + alias + ' » refuse (HTTP ' + c.statut + ') : ' + c.texte.slice(0, 120));
    id = c.json.id;
    console.log('bucket « ' + alias + ' » : cree');
  } else {
    console.log('bucket « ' + alias + ' » : existe deja');
  }
  const p = await appel('POST', '/v1/bucket/allow',
    { bucketId: id, accessKeyId: ID_CLE, permissions: { read: true, write: true, owner: true } });
  if (p.statut !== 200) refuse('droits refuses sur « ' + alias + ' » (HTTP ' + p.statut + ')');

  // ── 4 et 5. le bucket PUBLIC seul recoit l'acces web.
  //    ⚠ C'est la SEULE lecture publique de Garage : il n'implemente pas
  //    PutBucketPolicy (mesure : NotImplemented), et le bucket y est choisi
  //    par le NOM D'HOTE — d'ou l'alias egal au domaine.
  if (nom === BUCKET_PUBLIC) {
    const w = await appel('PUT', '/v1/bucket?id=' + encodeURIComponent(id),
      { websiteAccess: { enabled: true, indexDocument: 'index.html', errorDocument: '404.html' } });
    if (w.statut !== 200) refuse('acces web refuse (HTTP ' + w.statut + ') : ' + w.texte.slice(0, 120));
    console.log('bucket « ' + alias + ' » : acces web ouvert (lecture anonyme)');
  }
}

// ⚠ PLUS DE FICHIER DE CLE A ECRIRE : la cle vient de l'exploitant, elle ne
// naît pas ici. C'est ce qui supprime le dernier geste manuel — et le dernier
// endroit ou un secret aurait transite par une sortie.
console.log('initialisation terminee.');
