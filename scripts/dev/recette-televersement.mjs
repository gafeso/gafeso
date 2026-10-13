#!/usr/bin/env node
/**
 * RECETTE DU TELEVERSEMENT -- par les ROUTES DU PRODUIT, dans le conteneur.
 *
 * ## CE QU ELLE FERME
 *
 * `recette-voie-demo-dans-le-conteneur.sh` s arretait a l AUTHENTIFICATION : le
 * mot de passe d un bibliothecaire n existe pas dans une pile jetable, et en
 * fabriquer un est interdit. La borne etait ecrite, et elle laissait le
 * televersement NON MESURE -- c est-a-dire le geste meme que l exploitant fait.
 *
 * ## CE QUI LA REND LEGITIME -- les quatre conditions tiennent ENSEMBLE
 *
 * Autorise par Jean le 12 octobre 2026, et ce n est pas une exception raisonnee
 * par analogie : c est un cas qui satisfait les conditions ecrites dans
 * CLAUDE.md, une par une.
 *
 * | La condition | Ici |
 * |---|---|
 * | le compte se cree par le CHEMIN NORMAL | `POST /accounts/set-password`, la route PUBLIQUE du produit |
 * | aucun secret n est fabrique ni reutilise | mot de passe ALEATOIRE, lu dans l environnement |
 * | il ne quitte jamais le processus | aucun journal, aucun fichier, aucune sortie |
 * | il meurt avec la pile | pile jetable, detruite par difference d ensembles |
 *
 * AUCUN HACHAGE ICI. Le mot de passe est pose par le PRODUIT : ce script emet
 * un jeton a usage unique avec l aide PARTAGEE (`lib/lien-mot-de-passe`), puis
 * appelle la route publique. La politique de mot de passe vit a UN endroit --
 * c est la regle de `comptes-de-recette.mjs`, et un garde la tient.
 *
 * La forme a NE PAS prendre, et elle est a portee de main :
 * `user.update({ data: { password: await bcrypt.hash(...) } })`. Elle marche,
 * elle est plus courte, et elle double la politique du produit a un endroit que
 * personne ne relira.
 *
 * ## Ce qu elle mesure, et dans cet ordre
 *
 *   1. le mot de passe pose par la route publique
 *   2. une session obtenue par /auth/login -- le chemin normal
 *   3. une notice creee par POST /cataloging/records
 *   4. un document du CORPUS engendre DANS le conteneur
 *   5. televerse par POST /cataloging/records/:id/digital-copy (celle qui CHIFFRE)
 *   6. et `offlineReady` lu sur GET /opac/records/:id -- la reponse DU PRODUIT,
 *      pas une colonne. C est le champ que le mobile consomme.
 *
 * Usage, dans le conteneur :
 *   RECETTE_SLUG=... RECETTE_EMAIL=... RECETTE_PASSWORD=... \
 *     node scripts/dev/recette-televersement.mjs
 */
import { PrismaClient } from '@prisma/client';

import { emettreLienMotDePasse } from '../lib/lien-mot-de-passe.mjs';
import { urlDeLEcole } from '../lib/base-tenant.mjs';
import { engendrerDocumentDemo } from './engendrer-document-demo.mjs';

const SLUG = process.env.RECETTE_SLUG;
const EMAIL = process.env.RECETTE_EMAIL;
const MOT_DE_PASSE = process.env.RECETTE_PASSWORD;
const API = (process.env.RECETTE_API ?? 'http://localhost:4000').replace(/\/+$/, '');
const APP = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

let echecs = 0;
const ok = (m) => console.log('  [ok] ' + m);
const ko = (m) => { console.log('  [KO] ' + m); echecs += 1; };
const fin = async (db, racine) => {
  if (db) await db.$disconnect().catch(() => {});
  if (racine) await racine.$disconnect().catch(() => {});
  process.exit(echecs === 0 ? 0 : 1);
};

if (!SLUG || !EMAIL || !MOT_DE_PASSE) {
  // On NOMME la variable manquante, jamais sa valeur.
  ko('RECETTE_SLUG, RECETTE_EMAIL et RECETTE_PASSWORD sont requis.');
  process.exit(2);
}

const racine = new PrismaClient();
const tenant = await racine.tenant.findUnique({
  where: { slug: SLUG },
  select: { domains: { where: { isPrimary: true }, select: { domain: true }, take: 1 } },
});
if (!tenant) { ko('ecole introuvable : ' + SLUG); await fin(null, racine); }
const HOTE = tenant.domains[0]?.domain;
if (!HOTE) { ko('aucun domaine principal pour ' + SLUG); await fin(null, racine); }
// x-forwarded-host : `Host` est un en-tete interdit a fetch, et il est
// silencieusement jete. Mesure du 11 octobre 2026.
const hote = { 'x-forwarded-host': HOTE };

const db = new PrismaClient({
  datasources: { db: { url: urlDeLEcole(process.env.DATABASE_URL, SLUG) } },
});

// -- 1. LE MOT DE PASSE EST POSE PAR LE PRODUIT -------------------------------
const compte = await db.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
if (!compte) { ko('compte introuvable dans ' + SLUG + ' : ' + EMAIL); await fin(db, racine); }

const lien = await db.$transaction((tx) => emettreLienMotDePasse(tx, compte.id, APP));
// Le jeton vit dans l URL, pas dans un champ : `emettreLienMotDePasse` rend
// `{ url, expiresAt }`. J avais SUPPOSE `{ token }` sans lire l aide, et
// `set-password` a refuse en 400 -- « une doublure est une hypothese »,
// applique a la forme de retour d une fonction du depot.
const jetonMdp = new URL(lien.url).searchParams.get('token');
if (!jetonMdp) { ko('aucun jeton dans l URL rendue par emettreLienMotDePasse'); await fin(db, racine); }
let r = await fetch(API + '/accounts/set-password', {
  method: 'POST',
  headers: { ...hote, 'content-type': 'application/json' },
  body: JSON.stringify({ token: jetonMdp, password: MOT_DE_PASSE }),
});
if (!r.ok) {
  // Le CORPS du refus, pas seulement le code : c est une erreur de validation,
  // elle ne porte aucun secret, et sans elle on cherche a l aveugle.
  ko('set-password a refuse (HTTP ' + r.status + ') ' + (await r.text()).slice(0, 200));
  await fin(db, racine);
}
ok('mot de passe pose PAR LE PRODUIT (route publique, aucun hachage ici)');

// -- 2. UNE SESSION, par le chemin normal -------------------------------------
r = await fetch(API + '/auth/login', {
  method: 'POST',
  headers: { ...hote, 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: MOT_DE_PASSE }),
});
if (!r.ok) { ko('connexion refusee (HTTP ' + r.status + ')'); await fin(db, racine); }
const session = await r.json();
const jeton = session.access_token ?? session.accessToken ?? session.token;
if (!jeton) { ko('aucun jeton dans la reponse de connexion'); await fin(db, racine); }
ok('session obtenue par /auth/login');
const auth = { ...hote, authorization: 'Bearer ' + jeton };

// -- 3. UNE NOTICE, par la route de catalogage --------------------------------
r = await fetch(API + '/cataloging/records', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({
    title: 'Notice de recette du televersement',
    recordType: 'these',
    category: 'droit',
    publishYear: 2026,
    // Le produit EXIGE un auteur principal a la creation, et il a raison de le
    // dire : j avais omis `contributors` et la route a refuse en 400 avec sa
    // raison en clair. On lui donne une identite NEUTRE -- aucune personne
    // reelle, aucune universite reelle.
    // Le produit exige AUSSI un directeur pour une these. Trois refus
    // successifs, chacun nommant SA cause en clair -- « le message d echec dit
    // QUOI FAIRE » paye ici : trois lectures de DTO auraient coute plus cher.
    contributors: [
      { name: 'Nom Prenom', role: 'AUTEUR_PRINCIPAL' },
      { name: 'Prenom Nom', role: 'DIRECTEUR_MEMOIRE' },
    ],
    // Le produit exige l universite de soutenance pour une these ou un memoire,
    // et il le DIT aussi. On NE change pas `recordType` pour contourner la
    // regle : le gabarit `these` est precisement ce que ce cas verifie.
    //
    // AUCUNE UNIVERSITE REELLE sur un document fictif -- c est la regle de la
    // planche d exemples, et elle vaut partout. Ici c est l ecole JETABLE
    // elle-meme, provisionnee a l etape precedente.
    defenseUniversity: 'Ecole de recette',
    // Et trois mots-cles au minimum. Quatrieme refus, quatrieme cause nommee.
    keywords: ['recette', 'televersement', 'document numerique'],
  }),
});
if (!r.ok) {
  ko('creation de notice refusee (HTTP ' + r.status + ') ' + (await r.text()).slice(0, 200));
  await fin(db, racine);
}
const notice = await r.json();
ok('notice creee : ' + notice.id);

// -- 4. UN DOCUMENT DU CORPUS, engendre DANS le conteneur ---------------------
const engendre = await engendrerDocumentDemo({
  id: notice.id,
  title: 'Notice de recette du televersement',
  category: 'droit',
  publishYear: 2026,
  author: 'Nom Prenom',
  etablissement: 'Ecole de recette',
});
const octets = engendre.octets ?? engendre;
if (!(octets && octets.byteLength > 5000)) {
  ko('le document engendre est vide ou minuscule');
  await fin(db, racine);
}
ok('document du corpus engendre : ' + octets.byteLength + ' octets, oeuvre « '
   + (engendre.oeuvre?.titre ?? engendre.oeuvre?.oeuvre ?? '?') + ' »');

// -- 5. TELEVERSE par la route du produit (celle qui CHIFFRE) -----------------
const form = new FormData();
form.append('file', new Blob([octets], { type: 'application/pdf' }), 'recette.pdf');
r = await fetch(API + '/cataloging/records/' + notice.id + '/digital-copy', {
  // PAS de content-type : la frontiere multipart est posee par fetch, et un
  // Content-Type impose l empeche. Mesure du 12 septembre 2026.
  method: 'POST',
  headers: auth,
  body: form,
});
if (!r.ok) {
  ko('televersement refuse (HTTP ' + r.status + ') ' + (await r.text()).slice(0, 200));
  await fin(db, racine);
}
ok('televerse par POST /cataloging/records/:id/digital-copy');

// -- 6. PRET HORS LIGNE ? La reponse DU PRODUIT, pas une colonne -------------
r = await fetch(API + '/opac/records/' + notice.id, { headers: hote });
if (!r.ok) { ko('la fiche publique refuse (HTTP ' + r.status + ')'); await fin(db, racine); }
const fiche = await r.json();
if (fiche.offlineReady === true) {
  ok('PRET HORS LIGNE : offlineReady = true');
} else {
  ko('offlineReady = ' + JSON.stringify(fiche.offlineReady) + ' (attendu true)');
}
// Et la couverture, au passage : la fiche la sert, et on connait la reponse.
if (fiche.coverTemplate === 'these' && fiche.coverDomain === 'droit') {
  ok('couverture servie : ' + fiche.coverTemplate + ' / ' + fiche.coverDomain);
} else {
  ko('couverture inattendue : ' + fiche.coverTemplate + ' / ' + fiche.coverDomain);
}

await fin(db, racine);
