#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// REPRENDRE L'ACCÈS À DES COMPTES NOMMÉS — sans qu'aucun mot de passe existe.
//
// ## Ce que ce script fait, et pourquoi il ne fait PAS ce qu'on lui demandait
//
// La demande était « repose un mot de passe, la valeur vient de
// l'environnement ». Le produit offre mieux, et la consigne disait de le
// préférer : `POST /accounts/set-password` consomme un JETON à usage unique,
// valide la longueur (8 caractères minimum), hache avec ses propres tours et
// marque le jeton utilisé — le tout dans sa transaction.
//
// ⭐ Ce script émet donc un LIEN, jamais un mot de passe. Conséquence : il n'y
// a aucune valeur secrète à mettre dans l'environnement, aucune à lire dans un
// `ps`, aucune à retrouver dans un historique de shell, et rien à nettoyer
// après coup. Le mot de passe est choisi par la personne, dans le navigateur,
// et le PRODUIT l'écrit.
//
// ⚠ POURQUOI UNE ÉCRITURE DIRECTE RESTE NÉCESSAIRE, et ce qu'elle écrit.
// Le chemin normal pour obtenir ce lien est l'activation d'un compte par
// quelqu'un qui porte `comptes.activer` — donc une session authentifiée. Quand
// le mot de passe de l'administrateur est perdu, ce chemin est fermé : c'est
// précisément la panne. Il n'existe aucune route plateforme (`x-admin-api-key`)
// qui réémette un lien.
//
// L'écriture directe est donc réduite au strict minimum : **une ligne dans
// `password_tokens`**. Ce n'est pas un identifiant — c'est un laissez-passer à
// usage unique et daté, et la seule chose qu'il permet est d'atteindre l'écran
// du produit. La table `users` n'est pas touchée : ce script n'écrit JAMAIS
// dans la colonne `password`.
//
// ## Les trois garanties, et ce qui les prouve
//
//   1. IL NE TOUCHE QUE LES COMPTES NOMMÉS. Les adresses viennent de la ligne
//      de commande ; aucune expansion, aucun motif, aucun « tous les admins ».
//   2. IL ÉCHOUE SI L'UN N'EXISTE PAS, et AVANT d'écrire quoi que ce soit — un
//      script qui émet deux liens sur trois laisse un état à moitié repris,
//      dont personne ne sait ce qu'il contient.
//   3. IL DIT CE QU'IL A CHANGÉ, nommément, avec l'échéance de chaque lien.
//
// ## Usage
//
//   # 1. VOIR les comptes (lecture seule — n'écrit RIEN)
//   docker compose exec api node scripts/reprendre-acces-comptes.mjs --ecole <slug> --lister
//
//   # 2. ÉMETTRE les liens, pour les comptes qu'on nomme
//   docker compose exec api node scripts/reprendre-acces-comptes.mjs \
//     --ecole <slug> admin@… bib@… etudiant@…
//
// ⚠ `--lister` existe parce que les adresses d'une instance ne sont pas
// connaissables depuis le dépôt : `provision-production.mjs` les DÉRIVE de
// `APP_URL` et elles peuvent être surchargées par `PROVISION_ADMIN_EMAIL`. On
// regarde, puis on nomme — on ne devine pas.
//
// Environnement : `DATABASE_URL` et `APP_URL` (déjà présents dans le conteneur
// `api`). Aucun secret n'est attendu en argument ni en variable.
import { ouvrirEcole, listerLesEcoles } from './lib/base-tenant.mjs';
import { emettreLienMotDePasse, TOKEN_TTL_HOURS } from './lib/lien-mot-de-passe.mjs';

const ROUGE = '\x1b[0;31m';
const VERT = '\x1b[0;32m';
const GRIS = '\x1b[0;90m';
const JAUNE = '\x1b[0;33m';
const FIN = '\x1b[0m';
const ok = (m) => console.log(`${VERT}✓${FIN} ${m}`);
const info = (m) => console.log(`${GRIS}   ${m}${FIN}`);
const alerte = (m) => console.log(`${JAUNE}⚠${FIN} ${m}`);
const echec = (m) => console.error(`${ROUGE}✗ ${m}${FIN}`);

function arguments_() {
  const a = process.argv.slice(2);
  let ecole = null;
  let lister = false;
  const adresses = [];
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--ecole') {
      ecole = a[i + 1] ?? null;
      i += 1;
    } else if (a[i] === '--lister') {
      lister = true;
    } else if (a[i].startsWith('--')) {
      throw new Error(`Argument inconnu : ${a[i]}`);
    } else {
      adresses.push(a[i]);
    }
  }
  return { ecole, lister, adresses };
}

function usage() {
  console.error(`
Usage :
  --ecole <slug> --lister            voir les comptes (lecture seule)
  --ecole <slug> <adresse> [...]     émettre un lien pour CHAQUE adresse nommée

⚠ Aucun mot de passe n'est attendu, ni en argument ni dans l'environnement :
  ce script émet un lien à usage unique, et c'est le produit qui écrit le mot
  de passe quand la personne le choisit.
`);
}

async function main() {
  let opts;
  try {
    opts = arguments_();
  } catch (e) {
    echec(e.message);
    usage();
    process.exit(2);
  }

  if (!opts.ecole) {
    echec('`--ecole <slug>` est requis.');
    const ecoles = await listerLesEcoles().catch(() => []);
    if (ecoles.length) info(`écoles en base : ${ecoles.join(', ')}`);
    usage();
    process.exit(2);
  }

  // ⚠ Refus AVANT toute écriture : un script qui demande « quoi faire ? » après
  // avoir déjà agi laisse un état que personne ne peut décrire.
  if (!opts.lister && opts.adresses.length === 0) {
    echec('Aucune adresse nommée, et `--lister` absent : rien à faire.');
    info('Nommez les comptes, ou passez --lister pour les voir d’abord.');
    usage();
    process.exit(2);
  }
  if (opts.lister && opts.adresses.length > 0) {
    echec('`--lister` ne prend pas d’adresses : il montre, il n’écrit pas.');
    process.exit(2);
  }

  const appUrl = process.env.APP_URL;
  if (!opts.lister && !appUrl) {
    echec('APP_URL est absente de l’environnement.');
    info('Le lien à ouvrir en porte le préfixe ; sans elle, il serait inutilisable.');
    process.exit(2);
  }

  const db = await ouvrirEcole(opts.ecole);
  try {
    // ── Mode LECTURE SEULE ───────────────────────────────────────────────
    if (opts.lister) {
      const comptes = await db.user.findMany({
        select: {
          email: true,
          role: true,
          status: true,
          firstName: true,
          lastName: true,
          password: true,
          activatedAt: true,
        },
        orderBy: [{ role: 'asc' }, { email: 'asc' }],
      });
      ok(`${comptes.length} compte(s) dans « ${opts.ecole} » — AUCUNE écriture`);
      console.log('');
      console.log(`  ${'RÔLE'.padEnd(11)} ${'ÉTAT'.padEnd(9)} ${'MDP'.padEnd(5)} ADRESSE`);
      for (const c of comptes) {
        const mdp = c.password ? 'oui' : 'non';
        const nom = [c.firstName, c.lastName].filter(Boolean).join(' ');
        console.log(
          `  ${String(c.role).padEnd(11)} ${String(c.status).padEnd(9)} ${mdp.padEnd(5)} ` +
            `${c.email}${nom ? `   ${GRIS}${nom}${FIN}` : ''}`,
        );
      }
      console.log('');
      info('« MDP non » = le compte n’a jamais défini de mot de passe.');
      return;
    }

    // ── Mode ÉMISSION ────────────────────────────────────────────────────
    //
    // ⚠ On RÉSOUT TOUT avant d'écrire. Le contraire — émettre au fil de la
    // boucle — laisserait, sur une adresse mal orthographiée en troisième
    // position, deux liens émis et un état que le message d'erreur ne décrit
    // pas. « Échoue si l'un n'existe pas » n'a de sens qu'AVANT.
    const voulues = [...new Set(opts.adresses)];
    if (voulues.length !== opts.adresses.length) {
      alerte('Adresse(s) répétée(s) : chaque compte ne reçoit qu’un lien.');
    }

    const trouves = await db.user.findMany({
      where: { email: { in: voulues } },
      select: { id: true, email: true, role: true, status: true },
    });
    const parAdresse = new Map(trouves.map((u) => [u.email, u]));
    const manquantes = voulues.filter((a) => !parAdresse.has(a));

    if (manquantes.length > 0) {
      echec(`${manquantes.length} compte(s) INTROUVABLE(S) dans « ${opts.ecole} » :`);
      for (const a of manquantes) console.error(`    · ${a}`);
      info('RIEN n’a été écrit. Vérifiez les adresses avec --lister, puis relancez.');
      info('⚠ La casse compte : les adresses sont comparées à l’identique.');
      process.exit(1);
    }

    // Un compte SUSPENDU ou en attente peut recevoir un lien — `setPassword`
    // ne regarde que le jeton. On le DIT plutôt que de le taire : reprendre
    // l'accès d'un compte suspendu n'est probablement pas ce qu'on voulait.
    for (const u of trouves) {
      if (u.status !== 'ACTIVE') {
        alerte(`${u.email} est « ${u.status} » — le lien fonctionnera quand même.`);
      }
    }

    const emis = [];
    for (const u of trouves) {
      const { url, expiresAt } = await emettreLienMotDePasse(db, u.id, appUrl);
      emis.push({ ...u, url, expiresAt });
    }

    console.log('');
    ok(`${emis.length} lien(s) émis — valables ${TOKEN_TTL_HOURS} h, À USAGE UNIQUE`);
    console.log('');
    for (const e of emis) {
      console.log(`  ${e.email}   ${GRIS}(${e.role})${FIN}`);
      console.log(`    ${e.url}`);
      console.log(`    ${GRIS}expire le ${e.expiresAt.toISOString()}${FIN}`);
      console.log('');
    }
    alerte('Ces liens ne seront PAS réaffichés : notez-les maintenant.');
    info('Aucun mot de passe n’a été écrit. Chaque personne choisit le sien à');
    info('l’ouverture du lien, et c’est le produit qui l’enregistre.');
    info('Un lien ouvert deux fois échoue : c’est ce qui le rend sûr.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  echec(e?.message ?? String(e));
  process.exit(1);
});
