#!/usr/bin/env node
/**
 * ⭐⭐ ASSURE QUE LE CLIENT PRISMA EST GÉNÉRÉ — et ne régénère QUE s'il le faut.
 *
 * ## Pourquoi ce script existe
 *
 * Sur un clone frais, `npm test` sortait en **2** avec **384 erreurs TS** :
 * `Module '"@prisma/client"' has no exported member 'AccessRule'`… Le message
 * n'accuse aucun fichier fautif — il accuse le code du produit, alors que la
 * seule chose qui manque est une COMMANDE que personne n'a dite à
 * l'auto-hébergeur. Mesuré le 12 octobre 2026 sur un clone du dépôt public.
 *
 * ⚠ **Documenter ne suffisait pas** : une procédure se lit par qui la cherche.
 * D'où un `postinstall` à la racine et un `pretest` ici — c'est « le bon geste
 * rendu moins cher que le mauvais », poussé jusqu'à l'automatisme.
 *
 * ## 🔴 POURQUOI PAS SIMPLEMENT `prisma generate` DANS LE `pretest`
 *
 * `prisma generate` ÉCRIT dans `node_modules/@prisma/client` et
 * `node_modules/.prisma/`, qui sont un **état PARTAGÉ** : deux sessions
 * travaillent sur cette machine, et l'une peut avoir un `nest start --watch` qui
 * importe ces fichiers. Régénérer à chaque `npm test` ferait écrire dans ce que
 * l'autre possède — exactement ce que `CLAUDE.md` interdit — et deux
 * générations concurrentes se disputeraient le même répertoire de sortie, avec
 * un échec mystérieux dans la session d'en face.
 *
 * On ne génère donc que si c'est NÉCESSAIRE.
 *
 * ## 🔴 ET LA CONDITION NE PEUT PAS ÊTRE UNE DATE — mesuré, pas supposé
 *
 * La forme évidente est « le schéma est-il plus récent que le client ? ».
 * **Elle est fausse ici**, et le clone frais le dit :
 *
 * ```
 * mtime du client : 2026-10-12 11:34:20   ← plus RÉCENT
 * mtime du schéma : 2026-10-12 11:34:13
 * nos modèles dans index.d.ts : 0         ← et pourtant inutilisable
 * ```
 *
 * `npm ci` installe un `@prisma/client` **sans types de modèles** — le paquet
 * existe, son horodatage est celui de l'installation, et il ne porte rien. Une
 * condition sur les dates aurait donc SAUTÉ la génération, et on serait revenu
 * aux 384 erreurs. C'est « deux grandeurs voisines ne sont pas la même » : la
 * date dit *quand on a installé*, pas *si c'est généré*.
 *
 * ⭐ La condition porte donc sur le CONTENU : le client déclare-t-il un modèle
 * de CE schéma ? Et la fraîcheur est mesurée en second, par les dates — une
 * fois qu'on sait qu'il y a quelque chose à dater.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const API = join(ICI, '..');
const SCHEMA = join(API, 'prisma', 'schema.prisma');
const CLIENT = join(API, '..', '..', 'node_modules', '.prisma', 'client', 'index.d.ts');

/**
 * ⚠ LE MODÈLE TÉMOIN est lu DANS le schéma, jamais recopié ici. Un nom en dur
 * serait une chaîne recopiée : le jour où le modèle est renommé, ce script
 * régénérerait à chaque appel sans que personne le sache.
 */
export function premierModeleDuSchema(source, ou = SCHEMA) {
  const m = source.match(/^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/m);
  if (!m) {
    throw new Error(
      `Aucun \`model\` trouvé dans ${ou} — ce script ne sait plus sur quoi ` +
        'décider. Corrigez-le plutôt que de le contourner.',
    );
  }
  return m[1];
}

/**
 * ⭐ LA DÉCISION EST PURE ET EXPORTÉE — l'ACTION ne l'est pas.
 *
 * ⚠ C'est ce qui la rend éprouvable : un test peut lui donner un schéma et un
 * client de son choix dans un bac temporaire, et lire son verdict **sans lancer
 * `prisma generate`**. Même forme qu'`appliquerSiVersion` pour la course des
 * pages légales — on extrait ce qui décide pour pouvoir le mettre en difficulté.
 */
export function raisonDeGenerer(schemaPath = SCHEMA, clientPath = CLIENT) {
  if (!existsSync(schemaPath)) return null; // pas d'API ici : rien à faire, et on ne hurle pas
  const modele = premierModeleDuSchema(readFileSync(schemaPath, 'utf8'), schemaPath);

  if (!existsSync(clientPath)) return `le client n’existe pas (${modele} introuvable)`;
  const declare = readFileSync(clientPath, 'utf8');
  if (!declare.includes(modele)) {
    return `le client installé ne déclare pas \`${modele}\` — c’est le paquet ` +
      'par défaut, pas celui de ce schéma';
  }
  if (statSync(schemaPath).mtimeMs > statSync(clientPath).mtimeMs) {
    return 'le schéma a changé depuis la dernière génération';
  }
  return null;
}

/**
 * ⚠ L'ACTION NE S'EXÉCUTE QUE LANCÉ EN CLI, jamais à l'import — sinon un test
 * qui importe la décision lancerait `prisma generate` en écrivant dans
 * `node_modules`, c'est-à-dire dans l'état PARTAGÉ qu'on cherche à épargner.
 */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raison = raisonDeGenerer();
  if (raison === null) {
    // ⚠ ON LE DIT. Un script silencieux qui ne fait rien est indiscernable d'un
    // script qui a échoué sans bruit.
    console.log('✔ client Prisma à jour — rien à générer');
  } else {
    console.log(`… génération du client Prisma : ${raison}`);
    execFileSync('npx', ['prisma', 'generate'], { cwd: API, stdio: 'inherit' });
  }
}
