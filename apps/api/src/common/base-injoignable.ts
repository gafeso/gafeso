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
