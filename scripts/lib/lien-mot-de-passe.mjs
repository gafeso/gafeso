// ═══════════════════════════════════════════════════════════════════════════
// Le LIEN de définition de mot de passe — une seule implémentation.
//
// Le produit ne « repose » jamais un mot de passe : il émet un JETON à usage
// unique, et c'est `POST /accounts/set-password` qui écrit le mot de passe,
// après avoir validé sa longueur, l'avoir haché avec ses propres tours et
// consommé le jeton dans sa transaction.
//
// ⚠ POURQUOI CE FICHIER EXISTE. `provision-production.mjs` portait ces quatre
// lignes, et le script de reprise de mot de passe en aurait porté une seconde
// copie. Deux tableaux qui se ressemblent ne sont pas le même tableau — et ici
// ils décrivent bien la MÊME chose : la durée de vie du jeton, sa taille, la
// forme de l'URL. Une copie divergerait le jour où l'une des trois change.
//
// ⚠ Les trois constantes sont celles d'`AccountsService`
// (apps/api/src/accounts/accounts.service.ts). Elles sont RECOPIÉES faute de
// pouvoir importer du TypeScript compilé depuis un script `.mjs` — et c'est
// une dette assumée, pas un oubli : un test la garde
// (`apps/api/src/accounts/jeton-des-scripts.spec.ts`).
import { randomBytes } from 'node:crypto';

export const TOKEN_TTL_HOURS = 24;
export const TOKEN_BYTES = 32;

/**
 * Émet un jeton à usage unique et rend l'URL que la personne ouvrira.
 *
 * @param tx      client Prisma (ou transaction) déjà pointé sur le schéma de l'école
 * @param userId  le compte qui recevra le lien
 * @param appUrl  la base publique de l'application (APP_URL)
 */
export async function emettreLienMotDePasse(tx, userId, appUrl) {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000);
  await tx.passwordToken.create({ data: { userId, token, expiresAt } });
  return { url: `${appUrl}/definir-mot-de-passe?token=${token}`, expiresAt };
}
