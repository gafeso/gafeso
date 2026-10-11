#!/usr/bin/env node
/**
 * REMPLACE LES FICHIERS DU FONDS DE DÉMONSTRATION par des documents réalistes.
 *
 * Le fonds portait des PDF d'UNE page, vides. Devant un client, ou sur une
 * capture du magasin, le lecteur s'ouvre alors sur un cadre blanc.
 *
 * ## ⚠ PAR LA ROUTE DU PRODUIT, JAMAIS PAR PRISMA
 *
 * `POST /cataloging/records/:id/digital-copy` répare le xref, chiffre en AEAD
 * segmenté, enveloppe la CEK et pose `enc_status`. Écrire en base contournerait
 * toute cette chaîne — et « un raccourci non chiffré coûte toujours moins cher
 * qu'on ne croit, et plus cher qu'on ne le voit » : c'est exactement ce qu'avait
 * fait le seed, qui promettait 155 documents hors-ligne pour UN seul.
 *
 * ## ⚠ LE MOT DE PASSE VIENT DE L'ENVIRONNEMENT, et n'est jamais affiché
 *
 *     GAFESO_BIB_EMAIL=… GAFESO_BIB_PASSWORD=… \
 *       node scripts/dev/remplacer-documents-demo.mjs <slug>
 *
 * Il n'est ni journalisé, ni écrit, ni repris dans un message d'erreur.
 *
 * ## ⭐ IDEMPOTENT PAR L'EFFET, pas par une intention
 *
 * Le document engendré est DÉTERMINISTE : même notice, mêmes octets. Une copie
 * dont le nom ET la taille correspondent déjà est donc la bonne, et on passe.
 * « La cible doit être un ÉTAT, jamais une quantité à ajouter. »
 */
import { PrismaClient } from '@prisma/client';
import { ouvrirEcole, listerLesEcoles } from '../lib/base-tenant.mjs';
import { engendrerDocumentDemo } from './engendrer-document-demo.mjs';

const V = '\x1b[32m', J = '\x1b[33m', R = '\x1b[31m', G = '\x1b[90m', Z = '\x1b[0m';
const info = (m) => process.stdout.write(`  ${G}${m}${Z}\n`);
const avert = (m) => process.stdout.write(`${J}⚠${Z} ${m}\n`);
const ok = (m) => process.stdout.write(`${V}✓${Z} ${m}\n`);
function refuse(m, lignes = []) {
  process.stderr.write(`${R}✗ REFUS${Z} — ${m}\n`);
  for (const l of lignes) process.stderr.write(`   ${G}${l}${Z}\n`);
  process.exit(1);
}

/** Le nom sous lequel le produit connaîtra ces documents — clé d'idempotence. */
const NOM = (recordId) => `demonstration-${recordId}.pdf`;

/**
 * 🔴 CE QU'ON A LE DROIT DE REMPLACER, ET RIEN D'AUTRE.
 *
 * ⚠ ÉCRIT APRÈS AVOIR ÉCRASÉ LE GUIDE D'UTILISATION. Ma première version
 * parcourait TOUTES les copies numériques du fonds et les remplaçait. Elle a
 * donc emporté `gafeso-guide-utilisation.pdf`, déposé la veille sur sa propre
 * notice — un document que quelqu'un avait mis là EXPRÈS.
 *
 * ⭐ « On n'ajoute pas, jamais on retire » : un script de peuplement n'a pas à
 * défaire le choix d'un autre. Il ne remplace donc que ce qu'il RECONNAÎT —
 * le talon vide du seed, et ses propres documents.
 *
 * ⚠ Et ce qu'il ne reconnaît pas, il le DIT. S'abstenir en silence laisserait
 * croire que le fonds entier a été traité.
 */
const REMPLACABLES = new Set(['document-d-exemple.pdf']);
const estRemplacable = (copie) =>
  REMPLACABLES.has(copie.originalName) ||
  /^demonstration-.*\.pdf$/.test(copie.originalName ?? '');

/**
 * ⚠ LOCAL SEULEMENT, et la vérification porte sur les DEUX adresses.
 *
 * Ce script RÉÉCRIT les fichiers d'un fonds entier. Le laisser pointer une
 * instance en service effacerait des documents réels par des textes de
 * démonstration — et l'ancien objet est supprimé après le succès du nouveau.
 */
function exigerLocal(apiUrl, databaseUrl) {
  const local = (u) => {
    try {
      const h = new URL(u).hostname;
      return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === 'host.docker.internal';
    } catch {
      return false;
    }
  };
  if (!local(apiUrl)) {
    refuse(`l'API visée n'est pas locale (${apiUrl}).`, [
      'Ce script RÉÉCRIT les fichiers de tout un fonds. Il ne vise jamais une',
      'instance en service — les documents réels seraient remplacés par des',
      'textes de démonstration, et l’ancien objet est supprimé après coup.',
    ]);
  }
  try {
    const h = new URL(databaseUrl.replace(/^postgres(ql)?:/, 'http:')).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(h)) {
      refuse(`la base visée n'est pas locale (${h}).`);
    }
  } catch {
    refuse('DATABASE_URL est illisible.');
  }
}

async function seConnecter(apiUrl, enTetes, email, motDePasse) {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...enTetes },
    body: JSON.stringify({ email, password: motDePasse }),
  }).catch((e) => refuse(`l'API est injoignable sur ${apiUrl} (${e.message}).`));
  if (res.status === 429) {
    refuse('trop de connexions en une minute (HTTP 429).', [
      '`POST /auth/login` est bridée à 10/min — elle protège le produit du',
      'bourrage de mots de passe. Relancez dans une minute ; on ne la desserre pas.',
    ]);
  }
  if (!res.ok) {
    // ⚠ LE CORPS N'EST PAS REPRIS : il pourrait porter la valeur envoyée.
    refuse(`connexion refusée pour « ${email} » (HTTP ${res.status}).`, [
      'Vérifiez GAFESO_BIB_EMAIL et GAFESO_BIB_PASSWORD. Le compte doit porter',
      '`document.televerser` — c’est la fonction qu’exige la route.',
    ]);
  }
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!cookie) refuse('la connexion a réussi mais aucun cookie de session n’a été posé.');
  return cookie;
}

async function principal() {
  const slug = process.argv[2];
  if (!slug) {
    refuse('il manque le slug de l’établissement.', [
      'Usage :',
      '  GAFESO_BIB_EMAIL=… GAFESO_BIB_PASSWORD=… \\',
      '    node scripts/dev/remplacer-documents-demo.mjs <slug>',
      '',
      `Écoles connues : ${(await listerLesEcoles()).join(', ')}`,
    ]);
  }
  const email = process.env.GAFESO_BIB_EMAIL;
  const motDePasse = process.env.GAFESO_BIB_PASSWORD;
  if (!email || !motDePasse) {
    refuse('GAFESO_BIB_EMAIL et GAFESO_BIB_PASSWORD sont obligatoires.', [
      'Le mot de passe passe par l’ENVIRONNEMENT, jamais par la ligne de',
      'commande : une ligne de commande se retrouve dans l’historique du shell.',
    ]);
  }
  const apiUrl = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
  exigerLocal(apiUrl, process.env.DATABASE_URL ?? '');

  const racine = new PrismaClient();
  let db;
  try {
    const tenant = await racine.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, domains: { select: { domain: true, isPrimary: true } } },
    });
    if (!tenant) refuse(`l'établissement « ${slug} » n'existe pas.`);
    const domaine =
      tenant.domains.find((d) => d.isPrimary)?.domain ?? tenant.domains[0]?.domain ?? 'localhost';
    // ⚠ `x-forwarded-host`, pas `Host` : `Host` est un en-tête INTERDIT pour
    // `fetch`, jeté en silence — le tenant ne serait pas résolu, et le défaut
    // ressemblerait à une erreur d'authentification.
    const enTetes = { 'x-forwarded-host': domaine };

    db = await ouvrirEcole(slug);
    const session = await seConnecter(apiUrl, enTetes, email, motDePasse);
    info(`« ${tenant.name} » · ${domaine}`);

    const copies = await db.digitalCopy.findMany({
      select: {
        recordId: true,
        originalName: true,
        fileSizeBytes: true,
        record: {
          select: {
            id: true, title: true, titleComplement: true, author: true,
            recordType: true, category: true, publishYear: true,
          },
        },
      },
      orderBy: { recordId: 'asc' },
    });
    info(`${copies.length} document(s) numérique(s) dans ce fonds`);

    const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    let remplaces = 0;
    let deja = 0;
    const echecs = [];

    const epargnes = [];
    for (const copie of copies) {
      const r = copie.record;
      if (!estRemplacable(copie)) {
        epargnes.push(`${r.title?.slice(0, 44)} — « ${copie.originalName} »`);
        continue;
      }
      const publicUrl = `${new URL(`/opac/${encodeURIComponent(r.id)}`, appUrl.replace(/\/\/[^/]+/, `//${domaine}${new URL(appUrl).port ? ':' + new URL(appUrl).port : ''}`))}`;
      const { octets, pages } = await engendrerDocumentDemo({
        id: r.id,
        title: r.title,
        titleComplement: r.titleComplement,
        author: r.author,
        recordType: r.recordType,
        category: r.category,
        publishYear: r.publishYear,
        establishment: tenant.name,
        publicUrl,
      });

      // ⭐ IDEMPOTENCE PAR L'EFFET : le document est déterministe, donc une
      // copie du bon nom ET de la bonne taille EST celle qu'on allait écrire.
      if (copie.originalName === NOM(r.id) && copie.fileSizeBytes === octets.length) {
        deja += 1;
        continue;
      }

      const formulaire = new FormData();
      // ⚠ PAS de Content-Type imposé : c'est undici qui pose la frontière
      // multipart. L'imposer casse l'envoi, et le produit répond
      // « … is not valid JSON ». Ce dépôt l'a déjà payé une fois.
      formulaire.append('file', new Blob([octets], { type: 'application/pdf' }), NOM(r.id));
      const res = await fetch(`${apiUrl}/cataloging/records/${r.id}/digital-copy`, {
        method: 'POST',
        headers: { cookie: session, ...enTetes },
        body: formulaire,
      });
      if (!res.ok) {
        const corps = await res.text().catch(() => '');
        echecs.push(`${r.id} · ${r.title?.slice(0, 40)} — HTTP ${res.status} ${corps.slice(0, 120)}`);
        continue;
      }
      remplaces += 1;
      if (remplaces % 20 === 0) info(`… ${remplaces} remplacés`);
      void pages;
    }

    ok(
      `${remplaces} remplacé(s), ${deja} déjà à jour, ${epargnes.length} épargné(s), ` +
        `${echecs.length} en échec`,
    );
    if (epargnes.length > 0) {
      avert('Documents ÉPARGNÉS — ils ne portent pas un fichier de démonstration :');
      for (const e of epargnes.slice(0, 10)) info(`  · ${e}`);
      if (epargnes.length > 10) info(`  … et ${epargnes.length - 10} autres`);
      info('Quelqu’un les a déposés exprès. Retirez-les vous-même si c’est voulu.');
    }
    if (echecs.length > 0) {
      avert('Documents NON remplacés :');
      for (const e of echecs.slice(0, 10)) info(`  · ${e}`);
      if (echecs.length > 10) info(`  … et ${echecs.length - 10} autres`);
    }

    // ⚠ ON MESURE L'EFFET, pas le code de réponse : l'ingestion hors-ligne est
    // « best-effort » — un xref irréparable laisse `enc_status: failed` et ne
    // casse PAS la lecture en ligne. Un 201 ne prouve donc rien sur l'étagère.
    const pretes = await db.digitalCopy.count({ where: { encStatus: 'ready' } });
    info(`documents prêts pour le hors-ligne, APRÈS : ${pretes} / ${copies.length}`);
    if (echecs.length > 0) process.exit(1);
  } finally {
    await db?.$disconnect?.();
    await racine.$disconnect();
  }
}

await principal();
