import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const walk=(d,o=[])=>{ if(!existsSafe(d)) return o;
  for(const e of readdirSync(d)){const p=join(d,e);
  statSync(p).isDirectory()?walk(p,o):o.push(p);}return o;};
function existsSafe(p){ try{ statSync(p); return true }catch{ return false } }
const lire=(p)=>readFileSync(p,'utf8');

// ═══ 1. MODULES ═══════════════════════════════════════════════════════════
const regSrc = lire('apps/api/src/modules/registre-modules.ts');
const modules = [];
{
  // ⚠ DÉCOUPAGE PAR BLOCS, pas par motif : les `description` sont concaténées
  // sur plusieurs lignes, et une regex qui les traverse manque quatre modules
  // sur onze. Le témoin de compte l'a dit ; la relecture ne l'avait pas vu.
  const debut = regSrc.indexOf('export const MODULES');
  const corps = regSrc.slice(debut, regSrc.indexOf('\n];', debut));
  const morceaux = corps.split(/\n  \{\n/).slice(1);
  for (const bloc of morceaux) {
    const id = (bloc.match(/id: '([a-z]+)'/) || [])[1];
    if (!id) continue;
    const libelle = (bloc.match(/libelle: '([^']+)'/) || [,''])[1];
    const brut = (bloc.match(/description:\s*([\s\S]*?),\n\s*dependances:/) || [,''])[1];
    const description = [...brut.matchAll(/'([^']*)'/g)].map(x => x[1]).join('').replace(/\s+/g, ' ').trim();
    modules.push({
      id, libelle, description,
      dependances: [...((bloc.match(/dependances: \[([^\]]*)\]/) || [,''])[1]).matchAll(/'([^']+)'/g)].map(x => x[1]),
      noyau: /noyau: true/.test(bloc),
      ecrans: [...bloc.matchAll(/chemin: '([^']+)', quoi: '([^']+)'/g)].map(x => ({ chemin: x[1], quoi: x[2] })),
    });
  }
}
// routes par module
const routesParModule = {};
const rpm = regSrc.slice(regSrc.indexOf('ROUTES_PAR_MODULE'));
for (const m of rpm.matchAll(/^  ([a-z]+): \[([\s\S]*?)\],\n/gm))
  routesParModule[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x=>x[1]);

// ═══ 2. FONCTIONS ═════════════════════════════════════════════════════════
const fnSrc = lire('apps/api/src/auth/functions.ts');
const fonctions = [];
{
  const lignes = fnSrc.split('\n');
  for (let i=0;i<lignes.length;i++){
    const m = lignes[i].match(/^  ([A-Z_0-9]+): '([a-z._]+)',/);
    if(!m) continue;
    // première phrase du bloc de doc juste au-dessus
    let j=i-1, doc=[];
    while(j>=0 && (lignes[j].trim().startsWith('*')||lignes[j].trim().startsWith('/**'))){ doc.unshift(lignes[j].trim().replace(/^\/?\*+\/?/,'').trim()); j--; }
    const premiere = doc.filter(Boolean).find(l=>l && !l.startsWith('⚠')) ?? '';
    fonctions.push({ cle:m[1], valeur:m[2], quoi: premiere.replace(/\s+/g,' ').trim() });
  }
}
const toutes = fonctions.map(f=>f.valeur);
const bloc = fnSrc.slice(fnSrc.indexOf('export const ROLES_SYSTEME'));
const roles = [...bloc.matchAll(/name: '([^']+)',[\s\S]*?legacyRole: UserRole\.(\w+),[\s\S]*?functions:\s*(\[[\s\S]*?\]|TOUTES_LES_FONCTIONS)/g)]
  .map(m=>({nom:m[1], enumRole:m[2],
    fns: m[3]==='TOUTES_LES_FONCTIONS' ? toutes
       : [...m[3].matchAll(/FONCTIONS\.([A-Z_0-9]+)/g)].map(x=>fonctions.find(f=>f.cle===x[1])?.valeur ?? '?'+x[1])}));
const reservees = (fnSrc.match(/FONCTIONS_RESERVEES_ADMIN[^=]*=\s*\[([^\]]*)\]/)||[,''])[1]
  .split(',').map(s=>s.trim().replace(/'/g,'')).filter(Boolean);

// ═══ 3. ROUTES D'API ══════════════════════════════════════════════════════
const routes=[];
for (const f of walk('apps/api/src').filter(p=>p.endsWith('.controller.ts'))) {
  const src=lire(f), lignes=src.split('\n');
  const base=(src.match(/@Controller\(\s*'([^']*)'/)||[,''])[1];
  for (let i=0;i<lignes.length;i++){
    const m=lignes[i].match(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/);
    if(!m) continue;
    let fin=i+1;
    while (fin<lignes.length && !/^ {2}[a-zA-Z_$]/.test(lignes[fin])) fin++;
    const ctx=lignes.slice(i,fin).join('\n');
    const fns=[...ctx.matchAll(/@RequiresFunctions\(([^)]*)\)/g)]
      .flatMap(x=>[...x[1].matchAll(/FONCTIONS\.([A-Z_0-9]+)/g)].map(y=>fonctions.find(f=>f.cle===y[1])?.valeur ?? y[1]));
    const mod=(ctx.match(/@ModuleRequis\('([^']+)'\)/)||[])[1];
    const resume=(ctx.match(/summary:\s*'([^']*)'/)||ctx.match(/summary:\s*\n?\s*'([^']*)'/)||[,''])[1];
    routes.push({verbe:m[1].toUpperCase(),
      chemin:('/'+[base,m[2]??''].filter(Boolean).join('/')).replace(/\/+/g,'/'),
      fns, mod, resume, domaine: f.replace('apps/api/src/','').split('/')[0]});
  }
}

// ═══ 4. ÉCRANS ════════════════════════════════════════════════════════════
const ecrans=[];
for (const f of walk('apps/web/app').filter(p=>/\/page\.tsx$/.test(p))) {
  const src=lire(f);
  const adresse='/'+f.replace('apps/web/app/','').replace(/\/page\.tsx$/,'').replace(/^page\.tsx$/,'');
  const fns=[...src.matchAll(/functions\??\.includes\('([a-z._]+)'\)/g)].map(x=>x[1]);
  const cible=[...src.matchAll(/PERMISSIONS?_CIBLES?\.([A-Z_]+)/g)].map(x=>x[1]);
  ecrans.push({adresse: adresse==='/'?'/':adresse.replace(/\/$/,''), fns:[...new Set(fns)], cible, fichier:f.replace('apps/web/','')});
}

// ── la NAVIGATION est la vraie source du droit d'un écran ; la garde dans la
// page n'en est qu'une seconde couche (cf. « une permission ne se filtre jamais
// à un seul endroit » — navigation, garde d'écran, API).
const navSrc = lire('apps/web/lib/navigation.ts');
// ⚠ EXTRACTION PAR OBJET, pas par ligne : l'ordre des clés varie et certaines
// entrées portent des champs en plus. Une regex qui fige l'ordre en voyait 8
// sur 26 — le témoin de compte l'a dit.
const nav = [];
for (const m of navSrc.matchAll(/\{[^{}]*href: '([^']+)'[^{}]*\}/g)) {
  const obj = m[0];
  nav.push({
    href: m[1],
    libelle: (obj.match(/libelle: '([^']+)'/) || [, ''])[1],
    fonctions: [...((obj.match(/fonctions: \[([^\]]*)\]/) || [, ''])[1]).matchAll(/'([^']+)'/g)].map(x => x[1]),
  });
}
for (const e of ecrans) {
  const n = nav.find(x => x.href === e.adresse);
  e.libelleNav = n?.libelle ?? null;
  e.droitNav = n?.fonctions ?? [];
  e.droit = [...new Set([...(n?.fonctions ?? []), ...e.fns])];
}

// ═══ TÉMOINS ══════════════════════════════════════════════════════════════
const err=[];
if (modules.length !== 11) err.push(`modules : ${modules.length} extraits, 11 attendus (5 noyau + 6 activables)`);
if (fonctions.length !== 25) err.push(`fonctions : ${fonctions.length}, 25 attendues`);
if (roles.length !== 5) err.push(`rôles : ${roles.length}, 5 attendus`);
if (!roles.some(r=>r.enumRole==='LIBRARIAN' && r.fns.length===7)) err.push('Bibliothécaire ≠ 7 fonctions');
if (!roles.some(r=>r.enumRole==='ADMIN' && r.fns.length===25)) err.push('Administrateur ≠ 25 fonctions');
if (routes.length !== 208) err.push(`routes : ${routes.length}, 208 attendues`);
if (!routes.some(r=>r.chemin==='/opac/search')) err.push('GET /opac/search introuvable');
if (routes.some(r=>r.chemin==='/jamais/inventee')) err.push('route inventée trouvée');
if (!ecrans.some(e=>e.adresse==='/guichet')) err.push('/guichet introuvable');
if (ecrans.some(e=>e.adresse==='/jamais-inventee')) err.push('écran inventé trouvé');
const hrefs = (navSrc.match(/href: '/g) || []).length;
if (nav.length !== hrefs) err.push(`navigation : ${nav.length} objets pour ${hrefs} \`href:\` dans le fichier`);
if (!nav.some(n=>n.href==='/admin/catalogue' && n.fonctions.includes('catalogue.gerer'))) err.push('navigation : /admin/catalogue sans catalogue.gerer');
if (nav.some(n=>n.href==='/jamais')) err.push('navigation : entrée inventée');
if (err.length){ console.error('⚠ INSTRUMENT FAUX :\n  '+err.join('\n  ')); process.exit(1); }
// ═══ RENDU ════════════════════════════════════════════════════════════════
const { execSync } = await import('node:child_process');
const MESURE_LE = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
const COMMIT = execSync('git rev-parse --short HEAD').toString().trim();
const { writeFileSync } = await import('node:fs');
const d = { modules, routesParModule, fonctions, roles, reservees, routes, ecrans, nav };
// ⚠ LE BACKLOG EST UN DOCUMENT INTERNE, ET CE SCRIPT EST PUBLIÉ. Le lire sans
// garde faisait échouer le générateur en ENOENT chez quiconque clone le dépôt —
// trouvé le 17 septembre 2026, en même temps que la CI publique rouge.
//
// ⚠ ON NE SE TAIT PAS : le compte devient « non mesurable ici », jamais zéro.
// Un zéro se lirait « aucune dette ouverte », ce qui est l'inverse du vrai.
const bl = existsSafe('docs/backlog-backend.md') ? lire('docs/backlog-backend.md') : null;
const L = [];
const p = (...x) => L.push(...x);
const esc = (s) => (s ?? '').replace(/\|/g, '\\|');

p('# Inventaire du produit Gafeso');
p('');
p('> **Ce document est MESURÉ, pas raconté** — et il dit lequel de ses morceaux');
p('> l\'est.');
p('>');
p('> **Sections 1 à 4 : ENGENDRÉES** par `scripts/inventaire-produit.mjs`, qui');
p('> lit le code et refuse de rendre quoi que ce soit si ses témoins de compte');
p('> tombent. Personne ne les édite à la main.');
p('>');
p('> **Sections 5 à 8 : RÉDIGÉES**, dans');
p('> `docs/inventaire-produit.partie-redigee.md`. Elles énoncent des invariants');
p('> et des limites qu\'aucun extracteur ne sait lire — chaque affirmation y');
p('> nomme donc ce qui l\'a mesurée, et la section 8 dit ce qui ne l\'est pas.');
p('');
p(`*Mesuré le ${MESURE_LE} sur le dépôt \`gafeso-dev\`, commit \`${COMMIT}\`.*`);
p('');
p('## Ce que la mesure a compté');
p('');
p('| | |');
p('|---|---|');
p(`| Modules déclarés | **${d.modules.length}** — ${d.modules.filter(m=>m.noyau).length} de noyau, ${d.modules.filter(m=>!m.noyau).length} activables |`);
p(`| Fonctions au catalogue | **${d.fonctions.length}** |`);
p(`| Rôles système | **${d.roles.length}** |`);
p(`| Routes d'API | **${d.routes.length}** dans ${new Set(d.routes.map(r=>r.domaine)).size} domaines |`);
p(`| Écrans (\`page.tsx\`) | **${d.ecrans.length}** |`);
p(`| Entrées de navigation | **${d.nav.length}** |`);
p(
  bl
    ? `| Entrées de backlog ouvertes | **${[...bl.matchAll(/^## (\d+) · (.+)$/gm)].filter(m=>!/✅|CLOS|LIVRÉ|RETIRÉ/.test(m[2])).length}** |`
    : '| Entrées de backlog ouvertes | *non mesurable ici — `docs/backlog-backend.md` est un document interne, non publié* |',
);
p('');

// ─────────────────────────────────────────────────────────── MODULES
p('---');
p('');
p('## 1. Les modules');
p('');
p('Source : `apps/api/src/modules/registre-modules.ts`.');
p('');
p('⚠ **Un module de NOYAU ne s\'éteint pas.** Il est déclaré pour être VISIBLE');
p('et verrouillé dans l\'écran des modules, pas caché : une école doit voir ce');
p('qu\'elle ne peut pas retirer.');
p('');
p('| Module | Activable | Dépend de | Ce qu\'il couvre |');
p('|---|---|---|---|');
for (const m of d.modules)
  p(`| **${m.libelle}** (\`${m.id}\`) | ${m.noyau ? '❌ noyau' : '✅'} | ${m.dependances.join(', ') || '—'} | ${esc(m.description)} |`);
p('');
p('### ⚠ Ce que chaque module activable CESSE de faire quand on l\'éteint');
p('');
p('Deux effets, et ils sont indépendants : **l\'interface** retire des écrans,');
p('**l\'API** refuse des routes en nommant le module (403). Les écrans viennent');
p('du registre ; les routes viennent de `ROUTES_PAR_MODULE`.');
p('');
for (const m of d.modules.filter(x => !x.noyau)) {
  p(`#### ${m.libelle} (\`${m.id}\`)`);
  p('');
  if (m.ecrans.length) {
    p('**Écrans retirés :**');
    p('');
    for (const e of m.ecrans) p(`- \`/${e.chemin}\` — ${esc(e.quoi)}`);
  } else {
    p('**Aucun écran retiré** — l\'extinction n\'agit pas sur l\'interface.');
  }
  p('');
  const rs = d.routesParModule[m.id] ?? [];
  p(`**Routes refusées (${rs.length})** :`);
  p('');
  if (rs.length) for (const r of rs) p(`- \`${r}\``);
  else p('- *aucune* — voir la note ci-dessous.');
  p('');
}
p('⚠ **`amendes` n\'a aucune route exclusive de calcul, et c\'est mesuré.** Les');
p('amendes se calculent DANS `POST /circulation/return`, qui est du noyau : la');
p('garder refuserait de rendre un livre dans une école ayant éteint les amendes.');
p('Seuls les TARIFS sont des routes du module ; le calcul se règle par une');
p('branche — l\'amende vaut zéro, le retour se fait.');
p('');

// ─────────────────────────────────────────────────────────── FONCTIONS
p('---');
p('');
p('## 2. Les fonctions, et ce qu\'elles ouvrent');
p('');
p('Source : `apps/api/src/auth/functions.ts`. Les droits sont des **fonctions**,');
p('résolues EN BASE à chaque requête (`AuthzService`) — une révocation prend');
p('effet sans attendre l\'expiration du JWT.');
p('');
p('| Fonction | Ce qu\'elle ouvre | Routes | Écrans |');
p('|---|---|---|---|');
for (const f of d.fonctions) {
  const nr = d.routes.filter(r => r.fns.includes(f.valeur)).length;
  const ne = d.ecrans.filter(e => e.droit.includes(f.valeur)).map(e => e.adresse);
  p(`| \`${f.valeur}\` | ${esc(f.quoi) || '*(non documentée dans le code)*'} | ${nr} | ${ne.length ? ne.map(x=>`\`${x}\``).join(' ') : '—'} |`);
}
p('');
p('### Les rôles système');
p('');
p('⚠ Cinq rôles **seedés et non modifiables**. Une école peut créer des rôles');
p('personnalisés par-dessus (CRUD `/roles`).');
p('');
p('| Rôle | Enum historique | Fonctions |');
p('|---|---|---|');
for (const r of d.roles)
  p(`| **${r.nom}** | \`${r.enumRole}\` | ${r.fns.length === d.fonctions.length ? '**toutes** (' + r.fns.length + ')' : r.fns.map(f=>`\`${f}\``).join(' ')} |`);
p('');
p(`⚠ **Réservées à l'Administrateur**, interdites à tout rôle personnalisé : ${d.reservees.map(f=>`\`${f}\``).join(', ')}.`);
p('C\'est le seul verrou contre l\'escalade par composition : `securite.roles`');
p('ouvre l\'écran qui distribue toutes les autres.');
p('');
p('⚠ **Sans rôle dynamique assigné** (`users.role_id` à null), le porteur retombe');
p('sur les fonctions du rôle système de l\'enum.');
p('');



// ─────────────────────────────────────────────────────────── ÉCRANS
p('---'); p(''); p('## 3. Les écrans'); p('');
p('Source : les `page.tsx` d\'`apps/web/app`, croisés avec `apps/web/lib/navigation.ts`.');
p('');
p('⚠ **Le droit d\'un écran se lit à DEUX endroits** : l\'entrée de navigation qui');
p('le montre, et la garde que la page porte elle-même. Les deux sont relevés, et');
p('leur union est la colonne « droit exigé ». *Un troisième contrôle existe et');
p('n\'est pas dans cette table : l\'API refuse l\'action même si l\'écran s\'ouvre.*');
p('');
const pro = d.ecrans.filter(e => e.adresse.startsWith('/admin') || ['/guichet','/depots-a-valider','/mon-depot','/mes-encadrements','/recolement'].some(x=>e.adresse.startsWith(x)));
const perso = d.ecrans.filter(e => ['/profil','/mes-prets','/mon-depot'].some(x=>e.adresse===x));
const publics = d.ecrans.filter(e => !pro.includes(e) && !perso.includes(e));
const table = (titre, arr, note) => {
  p(`### ${titre}`); p('');
  if (note) { p(note); p(''); }
  p('| Adresse | Libellé au menu | Droit exigé |'); p('|---|---|---|');
  for (const e of arr.sort((a,b)=>a.adresse.localeCompare(b.adresse)))
    p(`| \`${e.adresse}\` | ${esc(e.libelleNav) || '—'} | ${e.droit.length ? e.droit.map(f=>`\`${f}\``).join(' ') : '*aucun relevé*'} |`);
  p('');
};
table(`Espace professionnel (${pro.length})`, pro);
table(`Écrans de la personne (${perso.length})`, perso,
  '⚠ Ils ne portent aucun droit **par construction** : ce sont les écrans de son\npropre compte. Depuis la refonte du 16 septembre, ils sortent de la barre de\ntravail et vivent sous un menu au prénom.');
table(`Public et authentification (${publics.length})`, publics,
  'Aucun droit : ce sont les écrans accessibles sans session, plus ceux du\nparcours de connexion.');
p('⚠ **Ce que cette table ne mesure pas.** Un sous-écran de détail (`[id]`) ne');
p('porte le plus souvent aucune garde propre : il hérite de l\'entrée de');
p('navigation de son parent. Cela veut dire qu\'une adresse TAPÉE À LA MAIN');
p('contourne la navigation — c\'est une classe de défaut déjà rencontrée, et ce');
p('document ne peut pas dire écran par écran si l\'API rattrape derrière.');
p('');

// ─────────────────────────────────────────────────────────── ROUTES
p('---'); p(''); p('## 4. Les routes d\'API'); p('');
p(`**${d.routes.length} routes**, groupées par module NestJS. Les colonnes`);
p('« fonction » et « module » sont les gardes RÉELLEMENT posées en décorateur.');
p('');
p('⚠ Une route sans fonction déclarée n\'est pas une route ouverte : elle peut');
p('être publique par destination (OPAC, OAI, SRU), protégée par la seule');
p('authentification, ou gardée par une clé d\'API. La colonne dit ce que le');
p('décorateur porte, pas ce que la route décide.');
p('');
const domaines = [...new Set(d.routes.map(r => r.domaine))].sort();
for (const dom of domaines) {
  const rs = d.routes.filter(r => r.domaine === dom);
  p(`### \`${dom}\` — ${rs.length} route(s)`); p('');
  p('| Verbe | Chemin | Fonction exigée | Module | Résumé |'); p('|---|---|---|---|---|');
  for (const r of rs)
    p(`| ${r.verbe} | \`${r.chemin}\` | ${r.fns.length ? r.fns.map(f=>`\`${f}\``).join(' ') : '—'} | ${r.mod ? `\`${r.mod}\`` : '—'} | ${esc(r.resume).slice(0,90)} |`);
  p('');
}



// ── la partie RÉDIGÉE (sections 5 à 8) est tenue à la main : elle énonce des
// invariants et des limites qu'aucun extracteur ne sait lire. Elle est
// CONCATÉNÉE, jamais engendrée — et le dire ici évite de laisser croire que
// tout ce document est mesuré au même titre.
const redigee = lire('docs/inventaire-produit.partie-redigee.md');
writeFileSync('docs/inventaire-produit.md', L.join('\n') + '\n' + redigee);
console.log(`docs/inventaire-produit.md — ${L.length} lignes engendrées + la partie rédigée`);
