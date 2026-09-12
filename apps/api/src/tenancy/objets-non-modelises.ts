/**
 * LES OBJETS DE BASE QUE PRISMA NE MODÉLISE PAS — et le refus de démarrer sans
 * eux. Backlog n° 23.
 *
 * ## Le défaut que ce fichier ferme
 *
 * Prisma ne modélise ni **trigger**, ni **fonction**, ni **collation**, ni
 * **index partiel**. Le développement tient son schéma de `prisma db push`, la
 * production de `prisma migrate deploy` : ces objets n'existent donc QUE dans
 * le second chemin, et les deux divergent EN SILENCE.
 *
 * ⚠ ET LE SENS DE L'ERREUR EST LE PIRE DES DEUX. Un développeur qui relance
 * `db push` obtient un schéma qui a l'air complet — toutes les colonnes, tous
 * les index ordinaires. Rien ne signale l'absence du trigger, jusqu'à ce qu'une
 * écriture que la production refuserait soit ACCEPTÉE en développement. Ce qui
 * passe en dev casse en production, et non l'inverse.
 *
 * ## Pourquoi au DÉMARRAGE et pas dans un test
 *
 * Un test verrait l'absence en développement, où l'objet existe peut-être. Un
 * démarrage la voit là où elle compte : en production, sur l'instance qui vient
 * d'être déployée. C'est le seul moment où l'absence est CERTAINE de se voir.
 *
 * Le précédent existe : `OfflineKeysService` refuse de démarrer sans ses trois
 * clés. Et l'ordre de démarrage le permet — `docker-entrypoint.sh` applique
 * `prisma migrate deploy` AVANT de lancer le serveur, donc un objet manquant au
 * boot est un vrai défaut de déploiement, pas une course.
 *
 * ## Trois états, pas deux
 *
 * ⚠ « L'objet manque » et « je n'ai pas pu vérifier » ne sont PAS la même
 * chose, et les confondre ferait refuser de démarrer une API dont la base est
 * seulement lente à répondre — transformant une coupure d'une minute en boucle
 * de redémarrage. Une base injoignable est signalée BRUYAMMENT et laisse
 * démarrer : l'API ne servira rien de toute façon, et elle se rétablira seule.
 * Seule l'absence AVÉRÉE refuse.
 */

export type TypeObjet = 'trigger' | 'fonction';

export interface ObjetNonModelise {
  type: TypeObjet;
  /** Nom exact dans le catalogue PostgreSQL. */
  nom: string;
  /** Ce qu'il garantit — pour que le message de refus soit actionnable. */
  garantit: string;
  /** Où il est créé, pour que le lecteur sache quoi rejouer. */
  migration: string;
}

/**
 * ⚠ CETTE LISTE EST LA SEULE CHOSE QUI SÉPARE UNE GARANTIE D'UNE CROYANCE.
 *
 * Elle ne couvre QUE les objets que rien d'autre ne répare. Délibérément
 * ABSENTE : la collation `fr-x-icu`, qui a déjà son rattrapage automatique dans
 * `sync-schema` (`rattraperCollations`, backlog n° 14) — l'y ajouter ferait
 * refuser de démarrer pour un défaut qui se répare tout seul au prochain
 * `sync-schema`.
 *
 * ⚠ BORNE ASSUMÉE ET ÉCRITE : le contrôle porte sur l'EXISTENCE, pas sur le
 * contenu. Un trigger présent mais réécrit pour ne rien faire passerait. C'est
 * `hierarchie-en-base.spec.ts` qui éprouve son COMPORTEMENT, dans les deux
 * sens — les deux sont nécessaires, et aucun ne remplace l'autre.
 */
export const OBJETS_NON_MODELISES: ObjetNonModelise[] = [
  {
    type: 'trigger',
    nom: 'collections_hierarchie_valide_trigger',
    garantit:
      'la hiérarchie des collections ne dépasse pas 3 niveaux et ne contient ' +
      'aucun cycle — y compris pour le seed, une reprise de données ou un import',
    migration: '20260912100000_collections_hierarchie',
  },
  {
    type: 'fonction',
    nom: 'collections_hierarchie_valide',
    garantit: 'le corps du trigger ci-dessus',
    migration: '20260912100000_collections_hierarchie',
  },
];

/** La requête qui demande à la BASE quels objets déclarés existent. */
export function requeteDExistence(): string {
  return `
    SELECT tgname AS nom, 'trigger' AS type FROM pg_trigger WHERE NOT tgisinternal
    UNION ALL
    SELECT proname AS nom, 'fonction' AS type FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
  `;
}

/**
 * Confronte la liste déclarée à ce que la base contient.
 *
 * ⚠ REND TROIS ÉTATS, et c'est tout le propos : `manquants` n'est pas le
 * complément de `presents`. Une base injoignable rend `verifie: false`, et
 * l'appelant ne doit PAS en conclure que les objets manquent.
 */
export function comparerAuxObjetsPresents(
  lignes: { nom: string; type: string }[],
): { manquants: ObjetNonModelise[] } {
  const presents = new Set(lignes.map((l) => `${l.type}:${l.nom}`));
  return {
    manquants: OBJETS_NON_MODELISES.filter((o) => !presents.has(`${o.type}:${o.nom}`)),
  };
}

/** Le message de refus — il nomme l'objet, ce qu'il garantit, et quoi rejouer. */
export function messageDeRefus(manquants: ObjetNonModelise[]): string {
  const details = manquants
    .map((o) => `  · ${o.type} « ${o.nom} » — garantit ${o.garantit}\n    (migration ${o.migration})`)
    .join('\n');
  return (
    `${manquants.length} objet(s) de base absent(s) — l'API refuse de démarrer.\n` +
    `${details}\n` +
    `Ces objets ne sont pas modélisés par Prisma : ` +
    `« prisma db push » NE LES CRÉE PAS. Rejouer le SQL de la ou des migrations ` +
    `nommées ci-dessus (il est idempotent), ou lancer « prisma migrate deploy ».`
  );
}
