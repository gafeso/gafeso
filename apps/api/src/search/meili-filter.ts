/**
 * Traduction du PETIT sous-ensemble de syntaxe de filtre Meilisearch réellement
 * produit par l'OPAC (opac.service) vers une forme structurée, pour l'adaptateur
 * Elasticsearch. Formes gérées (les seules émises) :
 *   - `field = "valeur"`      (égalité chaîne, valeur en JSON échappé)
 *   - `field = 2020`          (égalité numérique)
 *   - `(a = "x" OR a = "y")`  (groupe OR d'égalités — filtre catégories)
 * Tableau de filtres = combinés en ET. Toute autre syntaxe lève une erreur
 * explicite (plutôt que de filtrer silencieusement de travers).
 */

export interface EqualityClause {
  field: string;
  value: string | number;
}
export type FilterClause = EqualityClause | { or: EqualityClause[] };

const EQUALITY = /^(\w+)\s*=\s*(.+)$/;

function parseEquality(expr: string): EqualityClause {
  const m = expr.trim().match(EQUALITY);
  if (!m) throw new Error(`Filtre non supporté (attendu « champ = valeur ») : ${expr}`);
  const [, field, raw] = m;
  const v = raw.trim();
  if (v.startsWith('"')) {
    // Chaîne JSON échappée telle que produite par JSON.stringify côté OPAC.
    return { field, value: JSON.parse(v) as string };
  }
  const num = Number(v);
  if (Number.isNaN(num)) throw new Error(`Valeur de filtre non supportée : ${expr}`);
  return { field, value: num };
}

function parseOne(expr: string): FilterClause {
  const trimmed = expr.trim();
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1);
    // Split top-level sur « OR » (les valeurs catégorie ne contiennent pas « OR »).
    return { or: inner.split(/\s+OR\s+/i).map(parseEquality) };
  }
  return parseEquality(trimmed);
}

export function parseMeiliFilters(filters: string[] | undefined): FilterClause[] {
  return (filters ?? []).map(parseOne);
}
