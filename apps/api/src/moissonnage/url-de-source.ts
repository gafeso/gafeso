/**
 * CE QU'ON ACCEPTE COMME URL D'ENTREPÔT — et pourquoi ce n'est pas rien.
 *
 * ⚠ DÉCLARER UNE SOURCE, C'EST FAIRE APPELER UNE ADRESSE PAR LE SERVEUR. C'est
 * la différence avec l'import MARC, qui lit un fichier que l'on téléverse :
 * ici, c'est Gafeso qui émet, depuis l'intérieur du réseau où il est installé.
 * Une adresse pointée sur `http://localhost:9200`, sur `169.254.169.254` ou sur
 * un service interne ferait de la fonction « moissonner » un moyen de lire ce
 * qui n'est pas exposé — sans qu'aucune de nos gardes de droits ne s'en aperçoive,
 * puisque la personne a bien le droit de moissonner.
 *
 * ⚠ CETTE PROTECTION EST RAISONNABLE, PAS ABSOLUE, et c'est assumé comme pour
 * la lecture en ligne des PDF. Un nom de domaine public qui résout vers une
 * adresse privée la contourne — s'en protéger vraiment demanderait de résoudre
 * le DNS puis de vérifier l'adresse AU MOMENT de la connexion, y compris après
 * chaque redirection. Ce qui est fait ici arrête les cas directs, qui sont ceux
 * qu'on écrit sans y penser ; le reste est une dette nommée, pas un oubli.
 */

/** Les seuls schémas d'un entrepôt OAI-PMH. */
const SCHEMAS = new Set(['http:', 'https:']);

/**
 * Hôtes refusés en clair. ⚠ Ce sont des FORMES, pas une résolution DNS : voir
 * la borne ci-dessus.
 */
const LITTERAUX_INTERNES = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^10\./,
  /^192\.168\./,
  // 172.16.0.0 – 172.31.255.255
  /^172\.(1[6-9]|2\d|3[01])\./,
  // Métadonnées des hébergeurs : la cible classique d'une adresse détournée.
  /^169\.254\./,
  // Noms internes d'un réseau Docker ou Kubernetes.
  /\.internal$/i,
  /\.local$/i,
];

export type VerdictUrl =
  | { ok: true; url: string }
  | { ok: false; motif: string };

/**
 * ⚠ REND UN VERDICT, PAS UN BOOLÉEN. Le motif est affiché à la personne qui
 * vient de taper l'adresse : « adresse invalide » l'enverrait chercher ce
 * qu'elle a mal fait alors que la règle n'est écrite nulle part.
 */
export function verifierUrlDeSource(valeur: string): VerdictUrl {
  let url: URL;
  try {
    url = new URL(valeur.trim());
  } catch {
    return { ok: false, motif: 'Adresse illisible : attendu une URL complète, par exemple https://depot.exemple.bf/oai.' };
  }
  if (!SCHEMAS.has(url.protocol)) {
    return { ok: false, motif: `Seules les adresses http:// et https:// sont acceptées (reçu « ${url.protocol} »).` };
  }
  const hote = url.hostname;
  if (LITTERAUX_INTERNES.some((m) => m.test(hote))) {
    return {
      ok: false,
      motif:
        `« ${hote} » désigne une adresse interne au serveur. Un entrepôt OAI-PMH ` +
        'à moissonner est un service public, joignable depuis l’extérieur.',
    };
  }
  // ⚠ L'URL est NORMALISÉE ici, et une seule fois : c'est elle qui entre dans
  // la contrainte d'unicité. Deux écritures de la même adresse
  // (`…/oai` et `…/oai?`) donneraient sinon deux sources pour un seul entrepôt.
  url.search = '';
  url.hash = '';
  return { ok: true, url: url.toString().replace(/\/$/, '') };
}
