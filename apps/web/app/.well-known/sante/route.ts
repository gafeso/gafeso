/**
 * SONDE DE SANTÉ DU CONTENEUR `web` — et rien d'autre.
 *
 * ⚠ POURQUOI ELLE EXISTE. La sonde interrogeait `/`, c'est-à-dire la page
 * d'accueil complète. Le rendu serveur de cette page transmet le Host à l'API
 * pour résoudre l'école (`lib/server-api.ts`) ; la sonde parle depuis
 * `127.0.0.1:3000`, qui n'est le domaine d'aucun établissement. L'API
 * journalisait donc un avertissement JUSTE — « Aucune école pour le domaine
 * 127.0.0.1 » — toutes les dix secondes, soit 8 640 fois par jour.
 *
 * ⚠ ET CE N'EST PAS UN PROBLÈME DE VERBOSITÉ. Le message doit rester en WARN :
 * c'est la seule trace, en production, du domaine EXACT reçu quand la
 * résolution échoue, et c'est ce qu'on lit le jour où un vrai client est mal
 * configuré. Un avertissement noyé sous 8 640 faux n'est plus lu — on ne l'a
 * donc pas fait taire, on a retiré l'émetteur qui n'avait rien à faire là.
 *
 * ⚠ SECOND MOTIF, indépendant du journal, et il est plus grave : une sonde qui
 * rend la page d'accueil mesure l'API, la base et Meilisearch en plus du
 * serveur web. Si l'API tombe, Docker déclare `web` malsain et REDÉMARRE `web`
 * — le conteneur qui va bien. Une sonde doit mesurer ce que son redémarrage
 * peut réparer.
 *
 * ⚠ SOUS `.well-known/`, DÉLIBÉRÉMENT : ce préfixe est déjà public dans
 * `middleware.ts`. Ouvrir un chemin neuf à l'anonyme aurait été un
 * élargissement de surface publique pour une commodité d'infrastructure.
 *
 * Elle ne lit rien, n'appelle rien, ne résout aucun établissement : sa réponse
 * prouve exactement une chose, que le serveur Next répond.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response('ok', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
