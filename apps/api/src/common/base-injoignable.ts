/**
 * LE MESSAGE D'UNE BASE INJOIGNABLE — une seule chaîne, et elle est un CONTRAT.
 *
 * Les gardes « vivants » (gatés `PG_LIVE=1`) interrogent le serveur PostgreSQL.
 * Quand il ne répond pas, ils doivent être **ROUGES** : un test qui ne peut pas
 * mesurer n'est pas un test qui passe, et `if (injoignable) return` rendrait
 * vert un cas qui n'a rien exercé.
 *
 * ⚠ MAIS LE CROCHET DE PRÉ-PUBLICATION, LUI, DOIT SAVOIR FAIRE LA DIFFÉRENCE
 * entre « la propriété est violée » et « il n'y avait pas de base ». Le premier
 * doit refuser le push ; le second doit AVERTIR et laisser passer — sinon
 * quiconque pousse depuis une machine sans base est bloqué par un garde qui
 * n'a rien constaté.
 *
 * Cette chaîne est donc lue par un script shell. La déclarer ici, et la faire
 * vérifier par `gardes-vivants.spec.ts`, évite la seule chose qui casserait ce
 * couplage sans bruit : quelqu'un qui reformule le message d'un garde. Le
 * crochet cesserait alors de reconnaître le cas, et refuserait des pushes pour
 * une base absente — ou, pire, en laisserait passer un sur une vraie violation
 * si la reformulation allait dans l'autre sens.
 */
export const MESSAGE_BASE_INJOIGNABLE = 'base injoignable : ce test ne mesure rien';

/**
 * LES ÉCOLES RÉELLEMENT PROVISIONNÉES, DÉRIVÉES ET JAMAIS LISTÉES.
 *
 * ⚠ POURQUOI UNE FONCTION PLUTÔT QU'UN TABLEAU. Un garde vivant qui porte
 * `const SLUG = 'zinda'` mesure UNE école et rend vert sur toutes les autres :
 * une violation semée sur `horizon` seul ne le fait pas tomber, et son vert est
 * honnête — il a mesuré ce qu'il déclarait. C'est « un garde qui NE LIT PAS ce
 * qu'il déclare », dans sa forme la moins visible, parce qu'il ne déclare rien.
 *
 * Mesuré le 8 octobre 2026 : sur dix gardes vivants, **un seul** était
 * mono-école — celui écrit la veille. Les autres dérivent déjà leur population,
 * de deux façons légitimes et différentes (`information_schema` pour les écoles
 * PROVISIONNÉES, `prisma.tenant` pour les écoles DÉCLARÉES).
 *
 * ⚠ ET LES DEUX NE SONT PAS LA MÊME CHOSE. Une école déclarée dont le schéma
 * n'existe pas encore ferait lever un garde qui interroge ses tables ; une école
 * dont le schéma existe sans ligne dans `tenants` est précisément ce qu'un autre
 * garde (la dérive des schémas) existe pour trouver. On dérive donc du SCHÉMA
 * — « ce que le serveur porte » — parce qu'un garde vivant interroge des tables.
 *
 * ⚠ Le nom de la table sondée est un PARAMÈTRE, et il n'a pas de défaut : une
 * école à demi provisionnée porte `biblio_records` sans porter `usage_events`.
 * Demander « quelles écoles ont LA TABLE QUE JE VAIS LIRE » est la seule
 * question qui ne se trompe pas — et c'est elle qui distingue « école absente »
 * (on passe) de « colonne absente » (on LÈVE).
 */
export async function ecolesPortant(
  prisma: { $queryRawUnsafe<T>(sql: string, ...p: unknown[]): Promise<T> },
  table: string,
): Promise<string[]> {
  const lignes = await prisma.$queryRawUnsafe<{ slug: string }[]>(
    `SELECT replace(table_schema, 'tenant_', '') AS slug
       FROM information_schema.tables
      WHERE table_name = $1 AND table_schema LIKE 'tenant\\_%'
      ORDER BY 1`,
    table,
  );
  return lignes.map((l) => l.slug);
}

/**
 * Le message qu'un garde vivant imprime pour DIRE sur quoi il a mesuré.
 *
 * ⚠ Ce n'est pas de la décoration : un garde par-école qui ne nomme pas ses
 * écoles laisse son lecteur supposer qu'il les a toutes vues. La sortie est le
 * seul endroit où « j'ai mesuré zinda ET horizon » devient vérifiable sans
 * relire le fichier — et `gardes-vivants.spec.ts` EXIGE cette ligne.
 */
export function ecolesMesurees(garde: string, ecoles: string[]): string {
  return `  ⟐ ${garde} — écoles mesurées (${ecoles.length}) : ${ecoles.join(', ') || '—'}`;
}
