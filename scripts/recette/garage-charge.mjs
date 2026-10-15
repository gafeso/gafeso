#!/usr/bin/env node
/**
 * CHARGE : un PDF de 50 Mo televerse, relu par URL SIGNEE, et la lecture
 * publique anonyme de la couverture par le point d'entree web.
 *
 * ⚠ CE QUE CETTE MESURE NE DIT PAS : le PDF est ENGENDRE. Une these scannee de
 * 50 Mo n'a pas la meme structure interne, et nos objets reels font 84 ko au
 * maximum. On mesure le TRANSPORT, pas le document.
 */
import { client, sha, PutObjectCommand, GetObjectCommand, getSignedUrl } from './garage-commun.mjs';

const c = client(process.env.SONDE_CIBLE, process.env.SONDE_DST_CLE, process.env.SONDE_DST_SECRET);
const TAILLE = 50 * 1024 * 1024;
const octets = Buffer.alloc(TAILLE, 0x41);
octets.write('%PDF-1.4', 0);
const empreinte = sha(octets);

let t = Date.now();
await c.send(new PutObjectCommand({ Bucket: 'digital-copies', Key: 'charge/50mo.pdf',
  Body: octets, ContentType: 'application/pdf' }));
console.log(`     televerse 50 Mo en ${Date.now() - t} ms`);

// l'URL signee TELLE QUE storage.service.ts la pose
const url = await getSignedUrl(c, new GetObjectCommand({ Bucket: 'digital-copies',
  Key: 'charge/50mo.pdf', ResponseContentDisposition: 'inline; filename="these.pdf"' }),
  { expiresIn: 300 });
t = Date.now();
const r = await fetch(url);
const relu = Buffer.from(await r.arrayBuffer());
console.log(`     relu par URL signee en ${Date.now() - t} ms — HTTP ${r.status}, ` +
            `Content-Disposition: ${r.headers.get('content-disposition')}`);
if (!r.ok) { console.error('     la lecture signee a echoue'); process.exit(1); }
if (relu.length !== TAILLE || sha(relu) !== empreinte) {
  console.error(`     OCTETS DIFFERENTS : ${relu.length} octets relus`); process.exit(1);
}
console.log('     somme SHA-256 identique apres aller-retour');

// ⚠ LA LECTURE ANONYME N'EST PAS MESUREE ICI, et c'est une BORNE, pas un
// oubli : le point d'entree web de Garage choisit le bucket par le NOM
// D'HOTE, et `Host` est un en-tete INTERDIT a `fetch` — il est retire en
// silence. Mon premier jet le posait quand meme et obtenait 404 : la mesure
// accusait Garage alors que l'instrument etait fautif. Elle est faite par
// `curl` dans garage-repetition.sh, avec son temoin d'absence.

// ⚠ et une URL EXPIREE doit etre REFUSEE — sinon la mesure precedente ne dit
// rien : un serveur qui accepte tout satisfait aussi « la lecture marche ».
const courte = await getSignedUrl(c, new GetObjectCommand({ Bucket: 'digital-copies',
  Key: 'charge/50mo.pdf' }), { expiresIn: 1 });
await new Promise((res) => setTimeout(res, 2200));
const exp = await fetch(courte, { method: 'HEAD' });
console.log(`     URL signee expiree : HTTP ${exp.status}`);
if (exp.ok) { console.error('     une URL expiree a ete ACCEPTEE'); process.exit(1); }
process.exit(0);
