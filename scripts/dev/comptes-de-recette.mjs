#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX COMPTES DÉDIÉS À LA RECETTE, PAR ÉCOLE DE DÉVELOPPEMENT.
 *
 *   RECETTE_PASSWORD='<le vôtre>' npx dotenv -e .env -- \
 *     node scripts/dev/comptes-de-recette.mjs
 *
 * ⚠ POURQUOI CE SCRIPT EXISTE, et c'est une mesure, pas une commodité :
 *
 *   · `seed-demo.mjs` TIRE AU HASARD le mot de passe des comptes de
 *     démonstration. Il n'existe donc AUCUN mot de passe fixe pour `awa@` ou
 *     `admin@`, et personne ne peut s'y connecter deux jours de suite ;
 *   · relancer `seed:demo` RÉÉCRIT tous ces comptes. C'est assez proche d'une
 *     suppression pour relever de la même prudence — et ce n'est donc pas une
 *     porte de secours, c'est une perte.
 *
 * D'où deux comptes À NOUS, qui ne sont pas des comptes de démonstration : les
 * sessions front et mobile s'y connectent pour leurs captures et leurs essais,
 * et **plus personne ne touche à `awa@`, `admin@` ni aux autres**.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠ LE MOT DE PASSE EST ÉCRIT PAR LE PRODUIT, PAS PAR CE SCRIPT.
 *
 * Il émet un jeton à usage unique avec l'aide PARTAGÉE du dépôt
 * (`scripts/lib/lien-mot-de-passe.mjs`), puis appelle
 * `POST /accounts/set-password` — la route PUBLIQUE que le produit expose pour
 * ça. C'est elle qui valide la longueur, qui hache avec ses propres tours, et
 * qui consomme le jeton dans sa transaction.
 *
 * Ce script ne contient donc **aucun bcrypt, aucun hachage, aucune écriture de
 * la colonne `password`** — et un garde le vérifie
 * (`apps/api/src/accounts/comptes-de-recette.spec.ts`). Le jour où la politique
 * de mot de passe change, elle change à UN endroit.
 *
 * ⚠ ET LE MOT DE PASSE N'EST NI AFFICHÉ NI ÉCRIT. Il est lu dans
 * `RECETTE_PASSWORD`, passé au produit, et rien de plus : pas de journal, pas
 * de fichier, pas de sortie. La documentation d'une procédure qui prend un
 * secret montre la VARIABLE, jamais la VALEUR.
 *
 * ⚠ La forme à ne PAS prendre, et elle est à portée de main :
 * `user.update({ data: { password: await bcrypt.hash(...) } })`. Elle marche,
 * elle est plus courte, et elle double la politique du produit à un endroit que
 * personne ne relira. C'est « deux tableaux qui se ressemblent », appliqué à
 * une règle de sécurité.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { emettreLienMotDePasse } from '../lib/lien-mot-de-passe.mjs';
import { listerLesEcoles, ouvrirEcole, regleDuProduit } from '../lib/base-tenant.mjs';
import {
  engendrerGuidePdf,
  NOM_DU_FICHIER,
  TITRE_DE_LA_NOTICE,
} from './engendrer-guide-pdf.mjs';

const ROUGE = '\x1b[0;31m';
const VERT = '\x1b[0;32m';
const ORANGE = '\x1b[0;33m';
const GRIS = '\x1b[0;90m';
const FIN = '\x1b[0m';

const ok = (m) => console.log(`${VERT}✓${FIN} ${m}`);
const info = (m) => console.log(`   ${GRIS}${m}${FIN}`);
const titre = (m) => console.log(`\n${GRIS}── ${m}${FIN}`);
const avert = (m) => console.log(`${ORANGE}⚠${FIN} ${m}`);
function refuse(m, details = []) {
  console.error(`\n${ROUGE}✗ REFUS${FIN} — ${m}`);
  for (const d of details) console.error(`   ${GRIS}${d}${FIN}`);
  process.exit(1);
}

/**
 * ⚠ LA LISTE BLANCHE DES COMPTES, ET ELLE EST LA GARANTIE PRINCIPALE.
 *
 * Ce script n'écrit QUE sur ces deux adresses. C'est ce qui rend mécanique la
 * promesse « plus personne ne touche aux comptes de démonstration » : elle ne
 * dépend pas de la prudence de celui qui lance, elle dépend du code.
 *
 * ⚠ Les adresses portent `recette-` exprès : un compte de recette doit se
 * reconnaître d'un coup d'œil dans une liste d'adhérents, et se retirer sans
 * avoir à le deviner.
 */
const COMPTES = [
  {
    email: 'recette-bib@exemple.bf',
    role: 'LIBRARIAN',
    firstName: 'Recette',
    lastName: 'Bibliothécaire',
    /** Le personnel n'a ni classe ni inscription. */
    etudiant: false,
  },
  {
    /**
     * ⚠ TROISIÈME COMPTE, tranché par Jean le 9 octobre 2026 — et c'est un
     * compte DE PLUS, pas un élargissement du bibliothécaire.
     *
     * Mesuré : `statistiques.voir` n'est portée que par ADMIN (25 fonctions),
     * ni par LIBRARIAN (7) ni par MANAGER (5). Aucun des deux premiers comptes
     * ne pouvait donc atteindre l'écran des statistiques — celui qui, pour un
     * établissement sans rayonnages, remplace le comptoir comme vue de gestion.
     *
     * ⚠ POURQUOI PAS ÉLARGIR `recette-bib@`, et ce n'est pas une préférence :
     * un bibliothécaire qui porterait 25 fonctions ne démontrerait plus un
     * bibliothécaire. Le produit tient une règle métier là-dessus — « le
     * bibliothécaire lit en ligne mais ne télécharge pas » —, et un compte de
     * recette qui la contredit ferait capturer un écran que personne n'aura.
     */
    email: 'recette-admin@exemple.bf',
    role: 'ADMIN',
    firstName: 'Recette',
    lastName: 'Administrateur',
    etudiant: false,
  },
  {
    email: 'recette-etu@exemple.bf',
    role: 'STUDENT',
    firstName: 'Recette',
    lastName: 'Étudiante',
    /**
     * ⚠ UNE CLASSE **ET** SON INSCRIPTION, jamais l'une sans l'autre.
     *
     * Le contrôle d'accès lit `class_name` ; l'écran des classes compte les
     * INSCRIPTIONS. Un compte qui porte une classe sans inscription s'affiche
     * « 0 étudiant » pendant que l'accès fonctionne — deux écrans, deux
     * vérités. Le tamis (`fonds-conforme-en-base.spec.ts`) le refuse, et il a
     * raison : écrire la classe seule FABRIQUERAIT la violation qu'il cherche.
     */
    etudiant: true,
  },
];

/** Les hôtes qui sont, sans ambiguïté, cette machine. */
/** La racine du dépôt : `scripts/dev` → deux crans. */
const RACINE_DEPOT = join(import.meta.dirname, '..', '..');

const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * ⚠ LE GARDE, ET IL EST LE PREMIER À S'EXÉCUTER.
 *
 * Ce script réinitialise des mots de passe. Pointé par accident sur une
 * instance en service — un `.env` mal chargé, un `DATABASE_URL` exporté la
 * veille, un tunnel resté ouvert —, il ouvrirait deux comptes au mot de passe
 * d'un fichier de développement, sur une base de clients.
 *
 * ⚠ ET IL VÉRIFIE LES **DEUX** ADRESSES, pas une. Une base locale avec une API
 * distante est le mélange le plus dangereux des trois : on croit mesurer chez
 * soi, et c'est le produit d'en face qui écrit. C'est « deux sources qui
 * s'accordent par coïncidence » — elles s'accordent presque toujours, donc
 * personne ne les regarde séparément.
 */
function exigerLocal(databaseUrl, apiUrl) {
  const hote = (brut, nom) => {
    try {
      return new URL(brut).hostname;
    } catch {
      return refuse(`${nom} n'est pas une URL analysable.`, [
        "Ce script ne devine pas : une adresse qu'il ne peut pas lire est une",
        "adresse qu'il ne peut pas juger locale.",
      ]);
    }
  };
  const hBase = hote(databaseUrl, 'DATABASE_URL');
  const hApi = hote(apiUrl, "l'URL de l'API (RECETTE_API)");
  const distants = [
    ...(HOTES_LOCAUX.has(hBase) ? [] : [`DATABASE_URL pointe sur « ${hBase} »`]),
    ...(HOTES_LOCAUX.has(hApi) ? [] : [`l'API pointe sur « ${hApi} »`]),
  ];
  if (distants.length > 0) {
    refuse('ce script ne tourne que sur une base et une API LOCALES.', [
      ...distants,
      '',
      'Il RÉINITIALISE des mots de passe : pointé sur une instance en service,',
      "il ouvrirait deux comptes au mot de passe d'un fichier de développement.",
      '',
      `hôtes acceptés : ${[...HOTES_LOCAUX].join(', ')}`,
      "Si vous visiez bien le développement, c'est votre environnement qui est",
      'chargé de travers — vérifiez DATABASE_URL et RECETTE_API, pas ce garde.',
    ]);
  }
  return { hBase, hApi };
}

async function principal() {
  titre('Le garde, avant tout le reste');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    refuse('DATABASE_URL est absente.', [
      'En développement, chargez-la depuis le `.env` de la racine :',
      '  npx dotenv -e .env -- node scripts/dev/comptes-de-recette.mjs',
    ]);
  }
  const apiUrl = (process.env.RECETTE_API ?? 'http://localhost:4000').replace(/\/+$/, '');
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const { hBase, hApi } = exigerLocal(databaseUrl, apiUrl);
  ok(`base « ${hBase} » et API « ${hApi} » sont locales`);

  // ⚠ LE SECRET EST LU, JAMAIS AFFICHÉ — ni ici, ni plus bas, ni en cas
  // d'échec. Seule sa LONGUEUR est jugée, et le refus cite la politique du
  // produit (`SetPasswordDto`) plutôt qu'un nombre recopié sans sa source.
  const motDePasse = motDePasseDeRecette();
  if (motDePasse.length < 8) {
    refuse('RECETTE_PASSWORD est trop court pour la politique du produit.', [
      'La route `POST /accounts/set-password` exige au moins 8 caractères',
      "(`SetPasswordDto`). Elle refuserait, et c'est elle qui décide — pas ce",
      'script : sa longueur est contrôlée ici seulement pour que le refus soit',
      "lisible avant l'appel.",
    ]);
  }

  titre('Les écoles de développement');
  const ecoles = await listerLesEcoles();
  if (ecoles.length === 0) {
    refuse('aucune école provisionnée dans cette base.', [
      "Rien à faire — et ce n'est probablement pas la base que vous visiez.",
    ]);
  }
  ok(`${ecoles.length} école(s) : ${ecoles.join(', ')}`);

  let poses = 0;
  for (const slug of ecoles) {
    titre(`École « ${slug} »`);
    const db = await ouvrirEcole(slug);
    try {
      const annee = await anneeDeLEcole(db, slug);
      const enTetesDeLEcole = await enTetesPour(slug, apiUrl);
      // ⚠ `slug` PORTÉ PAR LE CONTEXTE, et ce n'est pas une commodité : la carte
      // des sessions est clé par école ET par adresse. Les deux écoles de
      // développement portent LES MÊMES adresses (`recette-bib@exemple.bf`…) —
      // une clé sans école aurait servi la session de `zinda` sur `horizon`,
      // c'est-à-dire une session d'un autre établissement.
      const ctx = { slug, apiUrl, appUrl, motDePasse, annee, enTetesDeLEcole };
      for (const compte of COMPTES) {
        await poserLeCompte(db, slug, compte, ctx);
        poses += 1;
      }
      // ⚠ LA DOTATION PASSE PAR LES ROUTES, et elle ne le pouvait pas AVANT :
      // il fallait un bibliothécaire au mot de passe connu pour obtenir une
      // session. C'est exactement ce que les deux comptes ci-dessus viennent
      // de rendre possible — on se connecte par `POST /auth/login`, avec un
      // mot de passe, comme n'importe qui. Aucun jeton n'est fabriqué.
      await doterLEtudiante(db, slug, ctx);

      // ⑥ UNE CONSULTATION ET UN BAIL — et l'appel est ICI, pas à la fin de
      // `doterLEtudiante`, pour une raison mesurée.
      //
      // 🔴 Je l'y avais mis. Les trois `return;` de l'étape ⑤ — « le guide est
      // déjà en place », « la notice porte un autre document », « aucune notice
      // où le poser » — sautaient donc la dotation. Ils veulent dire « CETTE
      // ÉTAPE est finie » ; ils disent « la FONCTION est finie ».
      //
      // ⚠ Et le défaut ne se serait pas vu au premier passage : au premier, ⑤
      // téléverse et ne sort pas tôt. Il n'apparaît qu'à partir du SECOND —
      // c'est-à-dire sur tous les passages suivants, et aucun n'aurait rien
      // signalé. C'est en lançant deux fois que je l'ai vu, une fois de plus.
      //
      // ⚠ L'ordre compte quand même : un bail exige un document `ready`, donc
      // ⑥ vient APRÈS ⑤.
      await doterLaLectrice(ctx, db);
    } finally {
      await db.$disconnect();
    }
  }

  titre('Fait');
  ok(`${poses} compte(s) prêts, sur ${ecoles.length} école(s)`);
  info(`identifiants : ${COMPTES.map((c) => c.email).join(', ')}`);
  info('mot de passe : celui de RECETTE_PASSWORD — NON affiché, et non conservé ici');
  avert("aucun compte de démonstration n'a été touché (awa@, admin@, …).");
}

/** Longueur du mot de passe engendré. 24 caractères, comme demandé. */
const LONGUEUR_ENGENDREE = 24;

/** Le fichier d'environnement local — celui que les trois sessions lisent. */
const FICHIER_ENV = join(RACINE_DEPOT, '.env');

/**
 * ⚠ LA VALEUR VIENT DE TROIS ENDROITS, DANS CET ORDRE, ET ON LE DIT.
 *
 *   ① `process.env.RECETTE_PASSWORD` — ce que l'appelant a imposé ;
 *   ② la ligne `RECETTE_PASSWORD=` de `.env` — ce qu'une exécution précédente
 *      a déposé, et ce que les sessions front et mobile lisent ;
 *   ③ une valeur ENGENDRÉE, déposée dans `.env` après avoir vérifié qu'il est
 *      ignoré par git.
 *
 * ⚠ ET LE ② EST LU EXPLICITEMENT, alors qu'il « marchait » sans. Mesuré le
 * 9 octobre 2026 : `@prisma/client` charge `.env` DANS `process.env` à
 * l'import. La valeur arrivait donc par ① sans que personne l'ait voulu — et
 * mon contrôle négatif du garde `check-ignore` n'a rien mesuré à cause de ça :
 * la branche ③ n'était jamais atteinte, même sous `env -i`.
 *
 * « Quand on découvre qu'une chose marche sans savoir pourquoi, ce n'est pas
 * une bonne nouvelle, c'est une mesure à faire. » Celle-ci a coûté un contrôle
 * négatif faux ; la lecture explicite la rend lisible, et l'ordre devient une
 * décision au lieu d'un effet de bord.
 */
function motDePasseDeRecette() {
  const impose = process.env.RECETTE_PASSWORD;
  if (impose) {
    info('mot de passe : celui de RECETTE_PASSWORD (imposé, non affiché)');
    return impose;
  }
  const dansLeFichier = lireDansEnv();
  if (dansLeFichier) {
    // La valeur n'est ni affichée ni journalisée — seule sa PRÉSENCE est dite.
    info('mot de passe : repris de `.env` (déjà posé, non réaffiché)');
    return dansLeFichier;
  }
  return engendrerEtDeposerDansEnv();
}

/** La valeur de `RECETTE_PASSWORD` dans `.env`, ou `null`. Ne juge rien. */
function lireDansEnv() {
  try {
    const m = /^RECETTE_PASSWORD=(.*)$/m.exec(readFileSync(FICHIER_ENV, 'utf8'));
    const v = m?.[1]?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * ⚠ AUCUN MOT DE PASSE FOURNI → ON EN ENGENDRE UN ET ON LE DÉPOSE DANS `.env`.
 *
 * C'est le remède au vrai problème : trois sessions travaillent sur cette
 * machine et doivent se connecter aux MÊMES comptes. Un mot de passe que
 * chacune choisit dans son terminal n'est connu que d'elle ; déposé dans le
 * `.env` local, il est lisible par les trois, et par personne d'autre.
 *
 * ⚠ ET ON VÉRIFIE QUE `.env` EST IGNORÉ PAR GIT **AVANT** D'ÉCRIRE DEDANS.
 *
 * C'est l'ordre qui compte, pas la vérification : écrire puis vérifier laisse
 * un secret dans un fichier suivi pendant l'intervalle, et le prochain
 * `git add -A` l'emporte. Le dépôt en porte déjà cinq, et à chaque fois « la
 * règle est arrivée après le geste ».
 *
 * `git check-ignore` est la seule réponse qui vaille : il interroge GIT, avec
 * toutes ses règles — `.gitignore` de la racine, ceux des sous-dossiers, les
 * exclusions locales, les négations. Lire `.gitignore` à la main ne verrait
 * aucun des quatre.
 *
 * ⚠ Mesuré : `git check-ignore -v .env` rend 0 et cite `.gitignore:17`, et il
 * rend 1 sur un fichier suivi (témoin d'absence : `package.json`). Le code de
 * sortie discrimine donc vraiment, et ce n'est pas une supposition.
 */
function engendrerEtDeposerDansEnv() {
  const env = FICHIER_ENV;

  // ① GIT D'ABORD. Un refus ici laisse le fichier intact.
  try {
    execFileSync('git', ['check-ignore', '-q', '--', env], {
      cwd: RACINE_DEPOT,
      stdio: 'ignore',
    });
  } catch (e) {
    // ⚠ On distingue « non ignoré » (code 1) de « git absent / autre panne ».
    // Les confondre refuserait pour la bonne raison avec le mauvais message, et
    // enverrait chercher dans `.gitignore` un problème qui n'y est pas.
    const code = typeof e.status === 'number' ? e.status : null;
    if (code === 1) {
      refuse("`.env` n'est PAS ignoré par git — rien n'a été écrit.", [
        `fichier visé : ${env}`,
        '',
        '⚠ Ce script allait y déposer un mot de passe. Dans un fichier SUIVI,',
        'le prochain `git add -A` l’emporte — et le dépôt de ce projet en porte',
        'déjà cinq, versionnés exactement comme ça.',
        '',
        'Ajoutez `.env` à votre `.gitignore`, puis relancez. Ou passez la valeur',
        "par l'environnement, et ce script n'écrira nulle part :",
        "  RECETTE_PASSWORD='<le vôtre>' npm run comptes:recette",
      ]);
    }
    refuse(`impossible de demander à git si \`.env\` est ignoré (${e.message}).`, [
      "Ce script n'écrit pas un secret dans un fichier dont il ne peut pas",
      'établir qu’il est ignoré. L’ordre n’est pas négociable : git d’abord.',
      '',
      "Si vous n'êtes pas dans un dépôt git, passez la valeur par",
      "l'environnement : RECETTE_PASSWORD='<le vôtre>' npm run comptes:recette",
    ]);
  }

  // ② On engendre, et on dépose.
  //
  // ⚠ On n'arrive ici QUE si `lireDansEnv()` n'a rien trouvé : la reprise est
  // décidée en amont, par `motDePasseDeRecette`. Sans cette séparation, chaque
  // exécution poserait une ligne de plus et réinitialiserait les comptes avec
  // une valeur neuve — les sessions d'en face perdraient l'accès à chaque fois
  // que quelqu'un relance. « Idempotent » est une promesse sur l'ÉTAT. `base64url` : rien à échapper dans un `.env`.
  const valeur = randomBytes(32).toString('base64url').slice(0, LONGUEUR_ENGENDREE);
  const bloc =
    `\n# Mot de passe des deux comptes de recette (recette-bib@, recette-etu@).\n` +
    `# Posé par scripts/dev/comptes-de-recette.mjs — les sessions front et mobile\n` +
    `# le lisent ICI. Il n'a jamais été affiché ni journalisé.\n` +
    `# ⚠ Ce fichier est ignoré par git, et ce script l'a VÉRIFIÉ avant d'écrire.\n` +
    `RECETTE_PASSWORD=${valeur}\n`;
  appendFileSync(env, bloc, { mode: 0o600 });
  ok(`mot de passe engendré (${LONGUEUR_ENGENDREE} caractères) et déposé dans \`.env\``);
  info('il n’est PAS affiché ici : les sessions front et mobile le lisent dans `.env`');
  return valeur;
}

/**
 * ⚠ L'ANNÉE QUE L'ÉCOLE EMPLOIE, pas celle que le calendrier calcule.
 *
 * Ce qu'on veut n'est pas « l'année courante » : c'est que l'étudiante de
 * recette apparaisse dans la MÊME année que les autres, sinon l'écran des
 * classes la compte à part et elle est invisible là où on vient la chercher.
 *
 * ⚠ Mesuré le 9 octobre 2026, et les deux sources s'accordaient : zinda et
 * horizon emploient toutes deux `2026-2027`, et le calendrier du produit rend
 * `2026-2027`. **C'est donc un accord PAR COÏNCIDENCE** — il se rompt en août,
 * ou sur un fonds semé pour une année passée, et ce jour-là c'est la donnée de
 * l'école qui a raison, pas le calendrier.
 *
 * L'année MAJORITAIRE est lue en base. Le repli — une école sans aucune
 * inscription — demande la règle au PRODUIT (`dist/`), jamais une copie.
 *
 * ⚠ Et si les deux manquent, on REFUSE en nommant les deux : une année
 * inventée rattacherait l'étudiante à un millésime que personne ne regarde.
 */
async function anneeDeLEcole(db, slug) {
  const parAnnee = await db.enrollment.groupBy({
    by: ['academicYear'],
    _count: { _all: true },
    orderBy: { _count: { academicYear: 'desc' } },
    take: 1,
  });
  if (parAnnee.length > 0) {
    const annee = parAnnee[0].academicYear;
    info(`année académique : ${annee} (celle que « ${slug} » emploie, lue en base)`);
    return annee;
  }
  try {
    const mod = await regleDuProduit('enrollment/academic-year.js');
    const annee = mod.currentAcademicYear();
    avert(
      `« ${slug} » n'a aucune inscription : repli sur la règle du produit (${annee}).`,
    );
    return annee;
  } catch (e) {
    return refuse(
      `impossible de déterminer l'année académique de « ${slug} ».`,
      [
        "L'école n'a aucune inscription, et la règle du produit n'est pas",
        'compilée :',
        `  ${e.message.split('\n')[0]}`,
        '',
        "⚠ Ce script ne l'invente pas. Une année inventée rattacherait",
        "l'étudiante à un millésime que personne ne regarde — elle serait",
        "créée, connectable, et absente de l'écran des classes.",
        '',
        'Deux sorties : provisionner des inscriptions par le produit, ou',
        '  npm run build -w @gafeso/api',
        "⚠ mais `dist/` est un état PARTAGÉ : si un `start:dev` tourne pour une",
        'autre session, ce build fait tomber son API. Demandez avant.',
      ],
    );
  }
}

/**
 * Crée ou réinitialise UN compte, et fait écrire son mot de passe par le
 * produit.
 *
 * ⚠ LA LIGNE DU COMPTE EST ÉCRITE DIRECTEMENT, et c'est la seule part qui ne
 * passe pas par une route. Le motif, mesuré : la création publique
 * (`POST /accounts/register`) laisse un compte **PENDING**, et son activation
 * (`POST /accounts/:id/activate`) exige une SESSION de gestionnaire. Or il
 * n'existe aucun mot de passe fixe pour en obtenir une — c'est exactement le
 * problème que ce script résout —, et fabriquer un jeton depuis `JWT_SECRET`
 * est interdit. Le précédent du dépôt est le même (`provision-production.mjs`,
 * compte administrateur de l'école).
 *
 * ⚠ Ce qui passe par le produit est ce qui COMPTE : la politique de mot de
 * passe, le hachage, et la consommation du jeton.
 */
async function poserLeCompte(db, slug, compte, ctx) {
  const existant = await db.user.findUnique({
    where: { email: compte.email },
    select: { id: true },
  });

  const classe = compte.etudiant ? await premiereClasse(db, slug) : null;

  const id = await db.$transaction(async (tx) => {
    const champs = {
      firstName: compte.firstName,
      lastName: compte.lastName,
      role: compte.role,
      status: 'ACTIVE',
      activatedAt: new Date(),
      className: classe?.name ?? null,
    };
    const user = existant
      ? await tx.user.update({ where: { id: existant.id }, data: champs })
      : await tx.user.create({ data: { email: compte.email, ...champs } });

    if (classe) {
      // L'inscription VA AVEC la classe — voir le commentaire de `COMPTES`.
      await tx.enrollment.upsert({
        where: { userId_academicYear: { userId: user.id, academicYear: ctx.annee } },
        create: { userId: user.id, classId: classe.id, academicYear: ctx.annee },
        update: { classId: classe.id },
      });
    }
    return user.id;
  });

  info(
    `${existant ? 'réinitialisé' : 'créé'} · ${compte.email} · ${compte.role}` +
      (classe ? ` · classe ${classe.name}` : ''),
  );

  // ⭐ ON NE RÉÉCRIT PAS UN MOT DE PASSE DÉJÀ BON — et ce n'est pas une
  // économie, c'est la condition pour que ce script reste relançable.
  //
  // ⚠ Mesuré en le lançant DEUX FOIS, comme « idempotent » l'exige :
  // `POST /accounts/set-password` est une route PUBLIQUE, donc BRIDÉE — à bon
  // droit, c'est elle qui protège le produit du bourrage de jetons. Deux
  // passages rapprochés rendaient donc **HTTP 429**, et le script sortait en 1
  // sur une base pourtant dans l'état voulu.
  //
  // ⚠ La cible est un ÉTAT, jamais une écriture : « ce compte peut se connecter
  // avec le mot de passe de recette ». On le DEMANDE au produit, par la route
  // de connexion — la seule qui réponde vraiment à cette question.
  if (await peutDejaSeConnecter(ctx, compte.email)) {
    info(`${compte.email} · mot de passe déjà en place — rien à réécrire`);
    return;
  }
  await definirLeMotDePasseParLeProduit(db, id, slug, ctx);
}

/**
 * Le compte ouvre-t-il une session avec le mot de passe de recette ?
 *
 * ⚠ RÉPOND `false` SUR TOUT CE QUI N'EST PAS UN SUCCÈS FRANC — y compris sur un
 * 429 ou une panne réseau. Le pire que ça produise est une tentative d'écriture
 * de plus, qui refusera proprement ; l'inverse — croire la connexion possible
 * sans l'avoir obtenue — laisserait un compte sans mot de passe utilisable, et
 * personne ne le saurait avant d'essayer de s'en servir.
 */
async function peutDejaSeConnecter(ctx, email) {
  const res = await fetch(`${ctx.apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ctx.enTetesDeLEcole },
    body: JSON.stringify({ email, password: ctx.motDePasse }),
  }).catch(() => null);
  // ⭐ ON GARDE LA SESSION OBTENUE. Sans ça, ce contrôle COÛTE une connexion au
  // lieu d'en économiser une — et c'est exactement ce qui a déplacé le 429.
  if (res?.ok) {
    const cookie = (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    if (cookie) sessions.set(`${ctx.slug}|${email}`, cookie);
  }
  // ⚠ `res.ok`, PAS `status === 200` : NestJS rend **201** sur un `@Post`, et
  // j'avais supposé 200. Le contrôle renvoyait donc `false` sur une connexion
  // RÉUSSIE — le script réécrivait le mot de passe à chaque passage, et
  // retombait sur le 429 qu'on venait de corriger.
  //
  // ⭐ Mesuré, pas déduit : les trois comptes rendent 201. « Une doublure est
  // une hypothèse » vaut aussi pour un code de réponse qu'on n'a pas appelé.
  return res?.ok === true;
}

/**
 * ⚠ LA PREMIÈRE CLASSE DE L'ÉCOLE, ET ON NE LA CRÉE PAS.
 *
 * Créer une classe « RECETTE » ajouterait une ligne au fonds de démonstration,
 * visible à l'écran des classes, qu'il faudrait ensuite expliquer à un client.
 * On rattache donc l'étudiante à une classe qui EXISTE — et si l'école n'en a
 * aucune, on le DIT plutôt que d'en fabriquer une.
 */
async function premiereClasse(db, slug) {
  const classe = await db.schoolClass.findFirst({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  if (!classe) {
    refuse(`l'école « ${slug} » n'a aucune classe.`, [
      "Le compte étudiant a besoin d'une classe ET de son inscription : sans",
      "classe, le contrôle d'accès ne peut rien lui accorder.",
      '',
      "Ce script n'en crée pas : une classe « RECETTE » apparaîtrait à l'écran",
      "des classes, et il faudrait l'expliquer. Provisionnez l'école",
      'normalement, ou créez une classe par le produit.',
    ]);
  }
  return classe;
}

/**
 * ⚠ DOTER L'ÉTUDIANTE — UN PRÊT, UNE RÉSERVATION, UN DOCUMENT HORS-LIGNE.
 *
 * Sans ces trois choses, les écrans que les sessions front et mobile viennent
 * capturer sont VIDES : « Mes prêts » ne montre rien, « Mes réservations » non
 * plus, et l'étagère hors-ligne reste une promesse. Un compte qui se connecte
 * mais ne montre rien ne sert à personne.
 *
 * ⚠ TOUT PASSE PAR LES ROUTES DU PRODUIT — carte d'adhérent, prêt,
 * réservation. C'est ce qui garantit que les états produits sont des états que
 * le produit SAIT produire : un `createMany` fabriquerait des prêts dont
 * l'exemplaire reste `AVAILABLE`, et c'est la trouvaille de 820 lignes que le
 * tamis a faite sur le fonds d'échelle.
 *
 * ⚠ ET C'EST IDEMPOTENT PAR L'ÉTAT, pas par l'absence de doublon : on vise
 * « un prêt en cours » et « une réservation active », et on ne fait rien quand
 * ils sont déjà là. Un script qui ajoute N éléments en évitant les doublons
 * n'est pas idempotent — il est non-destructeur, ce qui est autre chose.
 */
async function doterLEtudiante(db, slug, ctx) {
  const etu = COMPTES.find((c) => c.etudiant);
  const user = await db.user.findUnique({ where: { email: etu.email }, select: { id: true } });

  // ① Une session de BIBLIOTHÉCAIRE, par la route de connexion.
  const session = await seConnecter(ctx, COMPTES.find((c) => !c.etudiant).email);

  // ② Sa carte d'adhérent — sans elle, ni prêt ni réservation.
  const carte = await carteDAdherent(db, slug, user.id, session, ctx);

  // ③ Un prêt EN COURS, si elle n'en a pas.
  // ⚠ `returnDate`, pas `returnedAt` : j'avais SUPPOSÉ le nom et Prisma l'a
  // refusé. Un nom de colonne se LIT dans le schéma — « un prêt en cours » se
  // dit `returnDate: null`.
  const dejaPrete = await db.checkout.count({
    where: { patronId: carte.id, returnDate: null },
  });
  if (dejaPrete > 0) {
    info(`prêt en cours : ${dejaPrete} déjà présent(s) — rien à faire`);
  } else {
    const ex = await db.item.findFirst({
      where: { status: 'AVAILABLE' },
      select: { barcode: true },
      orderBy: { barcode: 'asc' },
    });
    if (!ex) {
      avert(`« ${slug} » n'a aucun exemplaire DISPONIBLE : pas de prêt posé.`);
    } else {
      await appeler(ctx, session, 'POST', '/circulation/checkout', {
        itemBarcode: ex.barcode,
        patronBarcode: carte.barcode,
      });
      info(`prêt posé · exemplaire ${ex.barcode}`);
    }
  }

  // ④ Une réservation ACTIVE, si elle n'en a pas.
  // ⚠ LE VOCABULAIRE VIENT DE L'ÉNUMÉRATION, pas de ce que j'imaginais :
  // `HoldStatus` porte PENDING / AVAILABLE / FULFILLED / CANCELLED / EXPIRED.
  // « WAITING » et « READY » n'existent pas — et une valeur inconnue aurait
  // rendu zéro en silence, donc une réservation de plus à chaque exécution.
  const dejaReserve = await db.hold.count({
    where: { patronId: carte.id, status: { in: ['PENDING', 'AVAILABLE'] } },
  });
  if (dejaReserve > 0) {
    info(`réservation : ${dejaReserve} déjà active(s) — rien à faire`);
  } else {
    // ⚠ Une notice qui porte au moins un exemplaire : réserver un document
    // sans exemplaire met l'adhérente dans une file que RIEN ne sert — le
    // produit ne promeut une réservation qu'au RETOUR d'un exemplaire.
    const notice = await db.biblioRecord.findFirst({
      where: { items: { some: {} } },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!notice) {
      avert(`« ${slug} » n'a aucune notice avec exemplaire : pas de réservation posée.`);
    } else {
      await appeler(ctx, session, 'POST', '/circulation/holds', {
        recordId: notice.id,
        patronBarcode: carte.barcode,
      });
      info(`réservation posée · « ${notice.title} »`);
    }
  }

  // ⑤ Un document NUMÉRIQUE prêt pour le hors-ligne, et ACCESSIBLE à elle.
  //
  // ⚠ ON MESURE, ON NE FABRIQUE PAS. Le chiffrement est fait à l'ingestion par
  // `DigitalCopyService.upload` : le reproduire ici doublerait la crypto de
  // contenu. S'il n'y en a aucun, on le DIT — un compte qui promet une étagère
  // vide est le « plein qui invite à agir » que ce produit corrige partout.
  // ⭐ L'IDEMPOTENCE PORTE SUR *LE GUIDE*, PAS SUR « UN DOCUMENT QUELCONQUE ».
  //
  // ⚠ Elle disait avant : « s'il existe au moins une copie `ready`, il n'y a
  // rien à faire ». C'était juste tant qu'on voulait UN document hors-ligne
  // n'importe lequel. Ça ne l'est plus : `zinda` en porte 155, donc le guide
  // n'aurait JAMAIS été déposé — le script aurait annoncé « rien à téléverser »
  // sur une école où le document attendu est absent.
  //
  // « La cible doit être un ÉTAT, jamais une quantité à ajouter. » L'état visé
  // est ici nommé : la notice du guide porte le guide.
  const { id: idDuGuide, raison } = await assurerLaNoticeDuGuide(ctx, db, session);
  if (!idDuGuide) {
    avert(raison);
    return;
  }
  const dejaLa = await db.digitalCopy.findUnique({
    where: { recordId: idDuGuide },
    select: { originalName: true, encStatus: true, fileSizeBytes: true },
  });
  if (dejaLa?.originalName === NOM_DU_FICHIER && dejaLa.encStatus === 'ready') {
    info(
      `le guide est déjà en place · ${dejaLa.fileSizeBytes} octets, chiffré — rien à téléverser`,
    );
    return;
  }
  if (dejaLa) {
    // ⚠ ON NE REMPLACE PAS LE FICHIER DE QUELQU'UN. « On n'ajoute pas, jamais
    // on retire » : si cette notice porte autre chose, c'est que quelqu'un l'y
    // a mis, et le défaire serait décider à sa place.
    avert(
      `la notice « ${TITRE_DE_LA_NOTICE} » porte déjà un AUTRE document ` +
        `(« ${dejaLa.originalName} », ${dejaLa.encStatus ?? 'non chiffré'}). ` +
        'Il n’est pas remplacé. Retirez-le vous-même si c’est voulu.',
    );
    return;
  }
  // Aucun : on en POSE un, par la route de téléversement du produit.
  //
  // ⚠ C'EST LA ROUTE QUI CHIFFRE. `POST /cataloging/records/:id/digital-copy`
  // appelle `DigitalCopyService.upload`, qui répare le xref (pdf-lib), chiffre
  // en AEAD segmenté 16 Ko, enveloppe la CEK par la KEK et pose
  // `enc_status: 'ready'`. Reproduire cette chaîne ici doublerait la crypto de
  // contenu du produit — et un raccourci non chiffré « coûte toujours moins
  // cher qu'on ne croit, et plus cher qu'on ne le voit » : c'est exactement ce
  // qu'avait fait le seed, qui promettait 155 documents hors-ligne pour UN seul.
  //
  // ⚠ CE BLOC NE CHOISIT PLUS DE NOTICE AU HASARD. Il en visait « la plus
  // récente sans document », et le commentaire qui vivait ici racontait un
  // `items: { none: {} }` ajouté sans motif, qui vidait la population sur
  // `horizon`. La leçon reste vraie et n'a plus de code à décrire ici : le
  // guide a SA notice, nommée, et c'est `assurerLaNoticeDuGuide` qui la pose.
  const { octets, pages } = await engendrerGuidePdf();
  const pdf = Buffer.from(octets);
  const notice = { id: idDuGuide, title: TITRE_DE_LA_NOTICE };
  const formulaire = new FormData();
  // ⚠ PAS de Content-Type imposé : c'est le navigateur — ici undici — qui pose
  // la frontière multipart. L'imposer casse l'envoi, et le produit répond
  // « … is not valid JSON ». Ce dépôt l'a déjà payé une fois.
  formulaire.append('file', new Blob([pdf], { type: 'application/pdf' }), NOM_DU_FICHIER);
  const res = await fetch(`${ctx.apiUrl}/cataloging/records/${notice.id}/digital-copy`, {
    method: 'POST',
    headers: { cookie: session, ...ctx.enTetesDeLEcole },
    body: formulaire,
  });
  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    refuse(`le téléversement du document a été refusé (HTTP ${res.status}).`, [
      corps.slice(0, 400),
      '',
      'MinIO répond-il ? Et `OFFLINE_CONTENT_KEK` est-elle posée ? Sans elle,',
      "l'ingestion hors-ligne ne peut pas chiffrer — et ce script ne chiffre",
      'rien lui-même, par décision.',
    ]);
  }
  // ⚠ ON VÉRIFIE L'EFFET, pas le code de réponse : l'ingestion est
  // « best-effort » dans le produit — un échec de xref laisse `encStatus:
  // 'failed'` et NE casse PAS la lecture en ligne. Un 201 ne prouve donc pas
  // que le document est lisible HORS LIGNE.
  const copie = await db.digitalCopy.findFirst({
    where: { recordId: notice.id },
    select: { encStatus: true, encError: true },
  });
  if (copie?.encStatus === 'ready') {
    info(
      `guide déposé · « ${notice.title} » · ${pages} pages, ${pdf.length} octets ` +
        '(chiffré par le produit)',
    );
  } else {
    avert(
      `le fichier est en ligne mais PAS préparé pour le hors-ligne ` +
        `(enc_status ${copie?.encStatus ?? 'nul'}${copie?.encError ? ' — ' + copie.encError : ''}). ` +
        "La lecture en ligne marche ; l'étagère mobile restera vide.",
    );
  }

}

/**
 * ⭐ DE QUOI RECETTER LES DEUX ÉCRANS DU LECTEUR.
 *
 * ⚠ Signalé par le FRONT le 11 octobre 2026, et signalé comme une LIMITE de sa
 * mesure plutôt que comme un défaut : « `/reader/consultations` et
 * `/reader/hors-ligne` rendent 200 avec une population VIDE pour
 * `recette-etu@` ; mes relevés sur ces routes ne mesurent donc rien, et les
 * deux écrans que j'ai livrés n'ont aucune donnée à montrer ».
 *
 * C'était exact, et c'est à ce script de le combler : il existe pour que les
 * comptes de recette portent ce qu'une recette doit voir. **Un écran qu'on ne
 * peut pas recetter est un écran qu'on livre sans l'avoir regardé.**
 *
 * ## ⚠ TOUT PASSE PAR LES ROUTES DU PRODUIT, y compris la clé d'appareil
 *
 * · la CONSULTATION s'écrit en demandant l'URL de lecture — c'est
 *   `OpacService.getReadUrl` qui journalise, et rien d'autre ne le fait ;
 * · le BAIL exige un APPAREIL, donc une vraie clé publique EC P-256. On en
 *   engendre une ici, comme un téléphone le ferait. ⚠ La clé PRIVÉE ne quitte
 *   pas ce processus et n'est jamais écrite : on n'en a pas besoin — le script
 *   ne déchiffre rien, il vérifie seulement que le bail est délivré.
 *
 * ⚠ ET ON NE FABRIQUE NI L'UN NI L'AUTRE EN BASE. Écrire un `UsageEvent` ou un
 * `OfflineLicense` par Prisma produirait exactement ce que le tamis traque : un
 * état que le produit n'aurait pas accepté de créer.
 */
async function doterLaLectrice(ctx, db) {
  const etu = COMPTES.find((c) => c.etudiant);

  // La session de L'ÉTUDIANTE — c'est son étagère et ses consultations.
  const session = await seConnecter(ctx, etu.email);

  // Un document qu'elle a le droit de lire ET qui est prêt pour le hors-ligne.
  const copie = await db.digitalCopy.findFirst({
    where: { encStatus: 'ready' },
    select: { recordId: true, record: { select: { title: true } } },
    orderBy: { uploadedAt: 'desc' },
  });
  if (!copie) {
    avert(
      'aucun document prêt pour le hors-ligne : ni consultation ni bail ne ' +
        'peuvent être posés. Les deux écrans du lecteur resteront vides en recette.',
    );
    return;
  }

  // ── ① LA CONSULTATION, par la route qui la journalise.
  const dejaVues = await db.usageEvent.count({ where: { userId: (await db.user.findUnique({ where: { email: etu.email }, select: { id: true } }))?.id ?? '' } });
  if (dejaVues > 0) {
    info(`consultations de la lectrice : ${dejaVues} déjà présente(s) — rien à faire`);
  } else {
    const res = await fetch(`${ctx.apiUrl}/opac/records/${copie.recordId}/read-url`, {
      headers: { cookie: session, ...ctx.enTetesDeLEcole },
    });
    if (res.ok) {
      info(`consultation posée · « ${copie.record.title} » (par la route de lecture)`);
    } else {
      avert(
        `l'URL de lecture a été refusée (HTTP ${res.status}) : aucune ` +
          "consultation n'est journalisée. L'écran « Mes consultations » restera vide.",
      );
    }
  }

  // ── ② LE BAIL : un appareil, puis une licence.
  const baux = await db.offlineLicense.count({ where: { expiresAt: { gt: new Date() } } });
  if (baux > 0) {
    info(`baux hors-ligne en cours : ${baux} déjà présent(s) — rien à faire`);
    return;
  }

  // ⚠ Une VRAIE clé EC P-256, SPKI DER en base64 — ce que le DTO exige, et ce
  // qu'un téléphone enverrait. La privée reste dans ce processus.
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

  const appareil = await fetch(`${ctx.apiUrl}/offline/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: session, ...ctx.enTetesDeLEcole },
    body: JSON.stringify({ publicKey: spki, label: 'Appareil de recette', platform: 'android' }),
  });
  if (!appareil.ok) {
    avert(
      `l'enregistrement de l'appareil a été refusé (HTTP ${appareil.status}) : ` +
        "aucun bail ne peut être émis. L'écran « Mes documents hors ligne » restera vide.",
    );
    return;
  }
  const { id: deviceId } = await appareil.json();

  const licence = await fetch(`${ctx.apiUrl}/offline/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: session, ...ctx.enTetesDeLEcole },
    body: JSON.stringify({ docId: copie.recordId, deviceId }),
  });
  if (!licence.ok) {
    const corps = await licence.text().catch(() => '');
    avert(
      `l'émission du bail a été refusée (HTTP ${licence.status}) : ${corps.slice(0, 200)}`,
    );
    return;
  }
  info(`bail hors-ligne émis · « ${copie.record.title} » (par les routes du produit)`);
}

/**
 * ⭐ LA NOTICE DU GUIDE — idempotente par son TITRE.
 *
 * ## Pourquoi une notice À ELLE, et pas la première venue
 *
 * Le script posait son document sur « la notice la plus récente sans
 * document ». Pour une recette qui voulait UN fichier hors-ligne, c'était
 * assez. Pour les captures du magasin, non : on ne sait pas sur quelle œuvre on
 * tombe, le titre affiché change d'une école à l'autre, et la capture montre
 * une thèse dont nous ne sommes pas l'éditeur.
 *
 * ⚠ ET C'EST LE POINT QUI COMPTE : une capture publiée sur une boutique
 * d'applications est une PUBLICATION. Y montrer la couverture et le texte d'un
 * ouvrage sous droits est une republication sans licence, quelle que soit la
 * bonne foi — et l'écran de lecture en montre plusieurs pages. Le guide, lui,
 * est à nous, sous AGPL-3.0, et il décrit le produit qu'on démontre.
 *
 * ## ⚠ CRÉÉE PAR LA ROUTE, JAMAIS PAR PRISMA
 *
 * « Un seed qui écrit DIRECTEMENT en base contourne les règles d'écriture du
 * produit » — et ce produit en a trois qui mordent ici : un `AUTEUR_PRINCIPAL`
 * exigé, au moins trois mots-clés, et un domaine qui doit EXISTER au
 * vocabulaire de l'école. Les trois sont respectées parce que c'est la route
 * qui les applique, pas parce que je les ai recopiées.
 *
 * ⚠ `informatique` est choisi pour une raison mesurée : c'est l'un des deux
 * domaines du fonds de développement qui figure AUSSI dans la table
 * `categories`. Un domaine hors vocabulaire ferait lever `resolveCategory`.
 */
async function assurerLaNoticeDuGuide(ctx, db, session) {
  const existante = await db.biblioRecord.findFirst({
    where: { title: TITRE_DE_LA_NOTICE },
    select: { id: true },
  });
  if (existante) return { id: existante.id, raison: '' };

  const res = await fetch(`${ctx.apiUrl}/cataloging/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: session,
      ...ctx.enTetesDeLEcole,
    },
    body: JSON.stringify({
      title: TITRE_DE_LA_NOTICE,
      contributors: [{ name: 'ResurgiTech SARL', role: 'AUTEUR_PRINCIPAL' }],
      recordType: 'ouvrage',
      category: 'informatique',
      keywords: ['gafeso', 'bibliothèque', 'mode d’emploi'],
      publishYear: 2026,
      summary:
        'Le guide d’utilisation de Gafeso : catalogue, prêts, lecteurs et ' +
        'bibliothèque numérique. Publié avec le logiciel sous licence AGPL-3.0.',
    }),
  });
  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    return {
      id: null,
      raison:
        `la notice du guide n'a pas pu être créée (HTTP ${res.status}) : ` +
        `${corps.slice(0, 300)}`,
    };
  }
  const cree = await res.json();
  info(`notice du guide créée · « ${TITRE_DE_LA_NOTICE} »`);
  return { id: cree.id, raison: '' };
}


/**
 * ⭐ LES SESSIONS DÉJÀ OUVERTES, PAR ÉCOLE ET PAR COMPTE.
 *
 * ⚠ MESURÉ EN RELANÇANT : `POST /auth/login` est BRIDÉE, à bon droit — c'est
 * elle qui protège le produit du bourrage de mots de passe. Mon contrôle « ce
 * compte peut-il déjà se connecter ? » ajoutait UN login par compte, soit six
 * par passage, et le script épuisait le quota avant d'arriver à ses propres
 * connexions. Le 429 s'était simplement DÉPLACÉ.
 *
 * ⭐ Et le remède n'est pas de desserrer la bride, ni d'attendre entre deux
 * appels : c'est de ne pas jeter ce qu'on vient d'obtenir. Un contrôle qui
 * REUSSIT a, par définition, une session en main.
 */
const sessions = new Map();

/** Ouvre une session par `POST /auth/login` — avec un mot de passe, comme tout le monde. */
async function seConnecter(ctx, email) {
  // ⚠ TÉMOIN : une clé sans école mélangerait deux établissements. Le défaut
  // s'écrit `undefined|recette-bib@exemple.bf` et ne lève nulle part.
  if (!ctx.slug) {
    refuse('le contexte ne porte pas de `slug` : la carte des sessions mélangerait les écoles.', [
      'Ajoutez `slug` au `ctx` construit dans `principal()`.',
    ]);
  }
  const cle = `${ctx.slug}|${email}`;
  const dejaOuverte = sessions.get(cle);
  if (dejaOuverte) return dejaOuverte;
  const res = await fetch(`${ctx.apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ctx.enTetesDeLEcole },
    body: JSON.stringify({ email, password: ctx.motDePasse }),
  });
  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    // ⭐ UN 429 N'EST PAS UNE PROPRIÉTÉ VIOLÉE : C'EST UNE MESURE IMPOSSIBLE.
    //
    // La même distinction que pour les gardes vivants — « la propriété est
    // violée » contre « la base est injoignable ». Ici le compte va
    // probablement très bien ; c'est le quota qui est épuisé. Dire « connexion
    // refusée » tout court envoie chercher un défaut de mot de passe qui
    // n'existe pas.
    //
    // ⚠ MESURÉ : `POST /auth/login` est bridée à **10 par minute**
    // (`@Throttle` dans `auth.controller.ts`), et ce script consomme UNE
    // connexion par compte et par école — six au total. Deux passages dans la
    // même minute dépassent donc, et c'est la bride qui fait son travail.
    if (res.status === 429) {
      refuse(`trop de connexions en une minute pour « ${email} » (HTTP 429).`, [
        'Ce n’est PAS un défaut de ce compte : `POST /auth/login` est bridée à',
        '10 par minute, et ce script en consomme six (trois comptes, deux écoles).',
        '',
        'Relancez dans une minute. La bride protège le produit du bourrage de',
        'mots de passe — on ne la desserre pas pour un script de recette.',
      ]);
    }
    refuse(`connexion de « ${email} » refusée (HTTP ${res.status}).`, [
      corps.slice(0, 300),
      '',
      'Ce compte vient d’être posé par ce même script : si sa connexion échoue,',
      'c’est que `POST /accounts/set-password` n’a pas écrit ce qu’on croit.',
    ]);
  }
  // ⚠ Le cookie reste dans CE processus : il n'est ni imprimé ni écrit, et la
  // carte qui le retient meurt avec le processus. C'est la même exigence que
  // pour un jeton fabriqué — sauf qu'ici il vient d'une vraie connexion.
  const cookies = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!cookies) {
    refuse(`la connexion de « ${email} » n'a posé aucun cookie.`, [
      'Sans session, la dotation par les routes du produit est impossible.',
    ]);
  }
  return cookies;
}

/** Un appel authentifié, qui REFUSE bruyamment plutôt que de continuer à moitié. */
async function appeler(ctx, session, methode, chemin, corps) {
  const res = await fetch(`${ctx.apiUrl}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', cookie: session, ...ctx.enTetesDeLEcole },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!res.ok) {
    const texte = await res.text().catch(() => '');
    refuse(`${methode} ${chemin} a refusé (HTTP ${res.status}).`, [
      texte.slice(0, 400),
      '',
      '⚠ La dotation passe par les ROUTES : un refus ici est une information sur',
      'le produit, pas un obstacle à contourner par une écriture directe.',
    ]);
  }
  return res.status === 204 ? null : await res.json().catch(() => null);
}

/**
 * La carte d'adhérent de l'étudiante — créée par `POST /patrons` si absente.
 *
 * ⚠ Le code-barres est DÉRIVÉ du slug, pas tiré au hasard : il doit être le
 * même d'une exécution à l'autre, sinon chaque passage créerait une carte de
 * plus. Et il porte `RECETTE-` pour se reconnaître dans une liste d'adhérents.
 */
async function carteDAdherent(db, slug, userId, session, ctx) {
  const existante = await db.patron.findFirst({
    where: { userId },
    select: { id: true, barcode: true },
  });
  if (existante) {
    info(`carte d'adhérent : ${existante.barcode} (déjà présente)`);
    return existante;
  }
  const barcode = `RECETTE-ETU-${slug.toUpperCase()}`;
  await appeler(ctx, session, 'POST', '/patrons', {
    barcode,
    category: 'etudiant',
    userId,
    firstName: 'Recette',
    lastName: 'Étudiante',
  });
  const posee = await db.patron.findFirst({
    where: { barcode },
    select: { id: true, barcode: true },
  });
  if (!posee) {
    refuse("la carte d'adhérent a été acceptée par la route mais reste introuvable.", [
      `code-barres attendu : ${barcode}`,
      "C'est un écart entre ce que la route rend et ce que la base porte : ne",
      'continuez pas sur cette base sans comprendre pourquoi.',
    ]);
  }
  info(`carte d'adhérent créée · ${barcode}`);
  return posee;
}

/**
 * ⚠ LES EN-TÊTES QUI DÉSIGNENT L'ÉCOLE À L'API — et `X-Tenant` NE SUFFIT PAS.
 *
 * Mesuré le 9 octobre 2026, après un premier essai refusé en `400 Lien invalide
 * ou expiré` : **le HOST gagne sur `X-Tenant`**. Le middleware le dit —
 * « si le domaine résout, c'est lui, point » —, et en développement `localhost`
 * résout sur `zinda`. Un appel à `http://localhost:4000` portant
 * `X-Tenant: horizon` écrit donc le jeton dans horizon et le cherche dans
 * zinda. L'erreur accuse le JETON ; la cause est l'adressage.
 *
 * ⚠ Et `Host` ne se pose pas depuis `fetch` : undici l'ignore en SILENCE (c'est
 * un en-tête interdit). Mesuré aussi — `Host: horizon.localhost` rend `zinda`.
 * Le middleware lit `x-forwarded-host` EN PREMIER, et celui-là passe.
 *
 * Le domaine est donc LU EN BASE, jamais deviné : c'est la même table que le
 * produit interroge pour résoudre.
 *
 * ⚠ Et pour une école SANS domaine, on envoie un hôte qui ne résout PAS, afin
 * que le repli `X-Tenant` prenne la main. Les deux chemins sont mesurés :
 *   · `x-forwarded-host: horizon.localhost`            → horizon
 *   · `x-forwarded-host: 127.0.0.1` + `X-Tenant`        → horizon
 */
async function enTetesPour(slug, apiUrl) {
  // Le schéma `public` est celui de `DATABASE_URL` : un client ordinaire suffit,
  // et `ouvrirEcole` n'a rien à faire ici — elle valide un slug d'école.
  const racine = new PrismaClient();
  try {
    const domaine = await racine.domain.findFirst({
      where: { tenant: { slug } },
      orderBy: { isPrimary: 'desc' },
      select: { domain: true },
    });
    if (domaine) {
      info(`adressage : x-forwarded-host ${domaine.domain} (domaine de l'école, lu en base)`);
      return { 'x-forwarded-host': domaine.domain, 'X-Tenant': slug };
    }
    // ⚠ Un hôte qui NE RÉSOUT PAS, pour que le repli `X-Tenant` prenne la main.
    const hote = new URL(apiUrl).hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    avert(
      `« ${slug} » n'a aucun domaine : repli sur X-Tenant, avec un hôte qui ne ` +
        `résout pas (${hote}).`,
    );
    return { 'x-forwarded-host': hote, 'X-Tenant': slug };
  } finally {
    await racine.$disconnect();
  }
}

/**
 * Émet le jeton du produit, puis laisse le PRODUIT écrire le mot de passe.
 *
 * ⚠ Le jeton ne sort pas de ce processus : il est émis, consommé par l'appel
 * qui suit, et jamais imprimé. Un jeton laissé dans une sortie que quelqu'un
 * colle ailleurs est un accès de 24 h qui survit à la session qui l'a créé.
 */
async function definirLeMotDePasseParLeProduit(db, userId, slug, ctx) {
  const { url } = await emettreLienMotDePasse(db, userId, ctx.appUrl);
  const token = new URL(url).searchParams.get('token');

  const res = await fetch(`${ctx.apiUrl}/accounts/set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ctx.enTetesDeLEcole },
    body: JSON.stringify({ token, password: ctx.motDePasse }),
  }).catch((e) => {
    refuse(`l'API est injoignable sur ${ctx.apiUrl} (${e.message}).`, [
      'Ce script fait écrire le mot de passe par la ROUTE du produit : sans API,',
      "il ne peut pas aboutir — et il ne va pas l'écrire lui-même.",
      '',
      '  npm run dev     (tout)   ou   npm run start:dev -w @gafeso/api',
    ]);
  });

  if (!res.ok) {
    // ⚠ ON DIT LE CODE ET LE CORPS, SANS LE MOT DE PASSE.
    const corps = await res.text().catch(() => '');
    refuse(`la route du produit a refusé d'écrire le mot de passe (HTTP ${res.status}).`, [
      corps.slice(0, 400),
      '',
      "Le jeton émis pour ce compte reste valable 24 h et n'a pas été consommé :",
      'relancer ce script en émettra un autre, ce qui est sans conséquence.',
    ]);
  }
}

await principal();
