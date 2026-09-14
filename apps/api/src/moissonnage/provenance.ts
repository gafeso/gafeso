/**
 * D'OÙ VIENT UNE NOTICE MOISSONNÉE — P7-3, la fédération.
 *
 * ⚠ LA FÉDÉRATION NE SE FAIT PAS À DISTANCE. Décision de Jean : des COPIES
 * moissonnées, jamais une interrogation en direct d'un entrepôt tiers. Les
 * notices d'une autre école sont donc DÉJÀ locales, et la recherche les trouve
 * sans qu'on touche à quoi que ce soit.
 *
 * ⚠ CE QUI MANQUE N'EST DONC PAS LA RECHERCHE, C'EST LA DISTINCTION. Une notice
 * moissonnée qui se présente comme une notice catalloguée est le cas que la
 * décision 1 du brief interdit : « ce qui arrive par moissonnage reste marqué
 * comme tel ». Confondre les deux, c'est l'invariant I3 sous une autre forme.
 *
 * ⚠ ET LA CONSÉQUENCE ÉCRITE PAR JEAN : « une notice fédérée porte un LIEN vers
 * son école d'origine, jamais un fichier. » Nous n'avons jamais moissonné de
 * document — seulement des métadonnées —, donc le fichier n'existe pas
 * localement. Le lien est ce qui rend la notice utile malgré cela.
 *
 * ## Pourquoi la provenance ne se DÉDUIT pas de `marcFormat`
 *
 * `marcFormat === 'DUBLIN_CORE'` désigne aujourd'hui exactement les notices
 * moissonnées — parce que rien d'autre n'écrit cette valeur. **C'est un accord
 * par coïncidence** : le jour où un bibliothécaire importera du Dublin Core
 * déposé à la main, la déduction désignera ses notices comme venant d'une autre
 * école. La provenance est donc lue là où elle est écrite : `harvested_records`.
 */

/** Ce qu'on dit d'une notice venue d'ailleurs. */
export interface Provenance {
  /** La source déclarée, telle que l'école l'a nommée. */
  source: { id: string; name: string };
  /** L'identifiant de la notice CHEZ ELLE — sa clé, jamais la nôtre. */
  oaiIdentifier: string;
  /**
   * Où la consulter à l'origine. ⚠ `null` quand la source ne publie aucune
   * adresse : trois états, et « je ne sais pas où » ne s'écrit pas comme un
   * lien vide. Un écran qui affiche un lien mort est pire qu'un écran qui dit
   * qu'il n'en a pas.
   */
  lien: string | null;
}

/**
 * LE LIEN VERS L'ORIGINE, LU DANS LE DUBLIN CORE MOISSONNÉ.
 *
 * ⚠ IL EST MOISSONNÉ, PAS FABRIQUÉ, et c'est ce qui le rend juste. `dc:identifier`
 * porte, chez la plupart des entrepôts, l'adresse publique de la notice — un
 * handle pour DSpace, la localisation résolvable pour une instance Gafeso
 * (P7-2). Construire nous-mêmes une URL à partir de l'adresse de l'entrepôt OAI
 * supposerait connaître la forme de SON site : on publierait des liens morts
 * chez des tiers, en série.
 *
 * ⚠ Et il n'invente rien quand il n'y a rien : `null`. C'est la donnée de la
 * source, ou rien.
 */
export function lienVersOrigine(marcData: unknown): string | null {
  const dc = (marcData as { dc?: Record<string, unknown> } | null)?.dc;
  if (!dc) return null;
  const brut = dc.identifier;
  const valeurs = (Array.isArray(brut) ? brut : [brut])
    .map((v) =>
      typeof v === 'object' && v !== null
        ? String((v as { '#text'?: unknown })['#text'] ?? '')
        : String(v ?? ''),
    )
    .map((v) => v.trim());

  // ⚠ LE PREMIER QUI EST UNE ADRESSE, et seulement http(s). `dc:identifier`
  // porte aussi des ISBN, des DOI nus, des cotes : les prendre pour des liens
  // produirait un href qui ne mène nulle part.
  for (const v of valeurs) {
    if (/^https?:\/\//i.test(v)) return v;
  }
  return null;
}
