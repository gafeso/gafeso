#!/usr/bin/env node
import { client, lister } from './garage-commun.mjs';
const c = client(process.env.SONDE_CIBLE, process.env.SONDE_DST_CLE, process.env.SONDE_DST_SECRET);
let n = 0;
for (const b of ['digital-copies', 'covers']) {
  try { n += (await lister(c, b)).length; } catch { /* bucket illisible : compte 0 */ }
}
console.log(n);
