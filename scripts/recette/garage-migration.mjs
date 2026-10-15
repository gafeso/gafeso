#!/usr/bin/env node
/**
 * MIGRATION MinIO -> Garage, verifiee OBJET PAR OBJET.
 *
 * ⚠ Le point qui decide : on ne compare pas des NOMBRES, on compare chaque
 * objet — sa cle, sa taille, et sa somme SHA-256. Un compte egal ne prouve
 * rien : deux ensembles de meme cardinal peuvent differer element par element,
 * et ce depot a deja paye cette lecon sur une liste de chemins.
 */
import { client, sha, corps, lister, CreateBucketCommand, PutObjectCommand } from './garage-commun.mjs';

const src = client(process.env.SONDE_SOURCE, process.env.SONDE_SRC_CLE, process.env.SONDE_SRC_SECRET);
const dst = client(process.env.SONDE_CIBLE, process.env.SONDE_DST_CLE, process.env.SONDE_DST_SECRET);
const BUCKETS = ['digital-copies', 'covers'];

// ── on seme un fonds de depart realiste dans MinIO : 60 PDF de 20 a 90 ko,
//    comme nos objets reels (mesure : 156 objets, max 84 ko), plus 20 couvertures.
const attendu = new Map();
for (const b of BUCKETS) { try { await src.send(new CreateBucketCommand({ Bucket: b })); } catch {} }
for (let i = 0; i < 60; i += 1) {
  const taille = 20_000 + ((i * 1171) % 70_000);
  const octets = Buffer.alloc(taille, 65 + (i % 26));
  octets.write('%PDF-1.4', 0);
  const k = `theses/${String(i).padStart(3, '0')}.pdf`;
  await src.send(new PutObjectCommand({ Bucket: 'digital-copies', Key: k, Body: octets }));
  attendu.set(`digital-copies/${k}`, { taille, sha: sha(octets) });
}
for (let i = 0; i < 20; i += 1) {
  const octets = Buffer.alloc(3_000 + i * 97, 100 + (i % 20));
  const k = `couv/${i}.jpg`;
  await src.send(new PutObjectCommand({ Bucket: 'covers', Key: k, Body: octets }));
  attendu.set(`covers/${k}`, { taille: octets.length, sha: sha(octets) });
}
console.log(`     fonds de depart : ${attendu.size} objets dans MinIO`);

// ── la copie
let copies = 0;
for (const b of BUCKETS) {
  for (const o of await lister(src, b)) {
    await dst.send(new PutObjectCommand({ Bucket: b, Key: o.Key, Body: await corps(src, b, o.Key) }));
    copies += 1;
  }
}
console.log(`     copies : ${copies}`);

// ── LA VERIFICATION, un par un
const ecarts = [];
let verifies = 0;
for (const b of BUCKETS) {
  const vus = new Set();
  for (const o of await lister(dst, b)) {
    const ref = attendu.get(`${b}/${o.Key}`);
    vus.add(`${b}/${o.Key}`);
    if (!ref) { ecarts.push(`EN TROP : ${b}/${o.Key}`); continue; }
    if (o.Size !== ref.taille) { ecarts.push(`TAILLE ${b}/${o.Key} : ${o.Size} au lieu de ${ref.taille}`); continue; }
    const h = sha(await corps(dst, b, o.Key));
    if (h !== ref.sha) { ecarts.push(`SOMME ${b}/${o.Key}`); continue; }
    verifies += 1;
  }
  for (const k of attendu.keys()) if (k.startsWith(b + '/') && !vus.has(k)) ecarts.push(`MANQUANT : ${k}`);
}
console.log(`     verifies cle+taille+SHA-256 : ${verifies}/${attendu.size}`);
// ⚠ TEMOIN : l'instrument doit AVOIR regarde. Un zero ecart sur zero objet
// examine serait un vert a vide, et c'est la forme que ce depot traque.
if (verifies === 0) { console.error('     AUCUN objet verifie : cette sonde ne mesure rien.'); process.exit(1); }
if (ecarts.length) { for (const e of ecarts.slice(0, 8)) console.error('     ' + e); process.exit(1); }
if (verifies !== attendu.size) { console.error('     compte incomplet'); process.exit(1); }
process.exit(0);
