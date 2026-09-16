/**
 * OUVRIR LA BASE D'UNE ÉCOLE — la même façon que le produit, pas une autre.
 *
 * ⚠ POURQUOI CE FICHIER EXISTE. Mes deux scripts d'opération construisaient
 * l'URL d'école par CONCATÉNATION :
 *
 *     `${url}${url.includes('?') ? '&' : '?'}schema=tenant_${slug}`
 *
 * Or `DATABASE_URL` porte DÉJÀ `?schema=public`, en développement comme en
 * production. La concaténation produisait donc DEUX paramètres `schema`, et
 * Prisma prenait le dernier. **Ça marchait par accident, pas par
 * construction** — et rien ne garantit que le prochain client fasse le même
 * choix.
 *
 * Le produit, lui, RÉÉCRIT le paramètre (`PrismaService.buildUrlForSchema`),
 * et le seed aussi. C'est cette forme-là qui est ici, une fois.
 *
 * ⚠ LE SLUG EST VALIDÉ PAR LA RÈGLE DU PRODUIT, importée de `dist/` et jamais
 * recopiée : les tirets sont légaux (`gafeso-univ`), le schéma est créé entre
 * guillemets, et un slug invalide doit être refusé ICI plutôt que produire un
 * schéma introuvable trois requêtes plus loin.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ICI = dirname(fileURLToPath(import.meta.url));
/** Racine du dépôt (dev) ou `/app` (conteneur) : `scripts/lib` → deux crans. */
export const RACINE = join(ICI, '..', '..');

/** Charge un module compilé du produit, ou explique comment l'obtenir. */
export async function regleDuProduit(cheminRelatif) {
  const p = join(RACINE, 'apps', 'api', 'dist', cheminRelatif);
  if (!existsSync(p)) {
    throw new Error(
      `${p} est absent.\n` +
        '  Cette règle appartient au PRODUIT et n’est pas recopiée ici.\n' +
        '  En développement :  npm run build -w @gafeso/api\n' +
        '  (dans le conteneur `api`, elle est présente par construction)',
    );
  }
  return import(pathToFileURL(p).href);
}

/** URL de connexion pointant le schéma d'une école — le paramètre est RÉÉCRIT. */
export function urlDeLEcole(databaseUrl, slug) {
  const u = new URL(databaseUrl);
  u.searchParams.set('schema', `tenant_${slug}`);
  return u.toString();
}

/**
 * Client Prisma sur l'école `slug`, après avoir vérifié :
 *  · que `DATABASE_URL` existe ;
 *  · que le slug respecte la règle du produit ;
 *  · que le schéma EXISTE RÉELLEMENT en base.
 *
 * ⚠ Le troisième contrôle est le plus important, et c'est celui qui manquait :
 * un slug inconnu produisait une sortie VIDE et un « rien à faire » rassurant.
 * Une école nommée qui n'existe pas est une ERREUR, jamais un silence.
 */
export async function ouvrirEcole(slug) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant (le conteneur `api` la porte ; en dev, votre .env).');

  const { isValidSlug } = await regleDuProduit(join('tenancy', 'tenant-schema.js'));
  if (!isValidSlug(slug)) {
    throw new Error(`Slug invalide : « ${slug} » (minuscule initiale, puis minuscules, chiffres et tirets).`);
  }

  const publique = new PrismaClient({ datasources: { db: { url } } });
  try {
    const trouve = await publique.$queryRawUnsafe(
      `SELECT nspname FROM pg_namespace WHERE nspname = $1`,
      `tenant_${slug}`,
    );
    if (!trouve.length) {
      const autres = await publique.$queryRawUnsafe(
        `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\\_%' ORDER BY nspname`,
      );
      throw new Error(
        `L’école « ${slug} » n’existe pas dans cette base.\n` +
          `  Écoles présentes : ${autres.map((r) => r.nspname.replace(/^tenant_/, '')).join(', ') || '(aucune)'}`,
      );
    }
  } finally {
    await publique.$disconnect();
  }

  return new PrismaClient({ datasources: { db: { url: urlDeLEcole(url, slug) } } });
}

/** Liste les écoles réellement provisionnées, dans l'ordre. */
export async function listerLesEcoles() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant.');
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const r = await db.$queryRawUnsafe(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\\_%' ORDER BY nspname`,
    );
    return r.map((x) => x.nspname.replace(/^tenant_/, ''));
  } finally {
    await db.$disconnect();
  }
}
