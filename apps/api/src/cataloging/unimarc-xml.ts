/**
 * Identité du format XML que Gafeso produit — SOURCE UNIQUE.
 *
 * Gafeso sérialise ses notices en **UNIMARC** (zones 200, 210, 328, 610,
 * 700/701/702, plus les zones locales 900/995), dans la structure XML des
 * notices ISO 2709.
 *
 * ## Historique des deux corrections
 *
 * 1. Jusqu'au 7 septembre 2026, cette sortie était servie dans l'espace de noms
 *    `http://www.loc.gov/MARC21/slim` et annoncée avec `MARC21slim.xsd`.
 *    C'était faux, et faux vers l'extérieur : un moissonneur qui décode en
 *    MARC21 lit la zone 700 comme une entrée secondaire et reçoit donc l'auteur
 *    principal comme co-auteur.
 * 2. La première correction inventait un espace de noms maison. C'était la
 *    version douce de la même faute — se mettre hors des standards qu'on
 *    revendique. **MarcXchange (ISO 25577)** existe précisément pour ça : c'est
 *    MARCXML généralisé à toute notice ISO 2709, avec un attribut `format` qui
 *    DÉCLARE le dialecte. C'est notre cas exact, et c'est ce que les outils du
 *    domaine savent lire.
 *
 * ## Pourquoi la version 2
 *
 * En marcxchange 1.1, `leader` est OBLIGATOIRE dès qu'une notice porte des
 * zones. En 2.0 il est `minOccurs="0"`. Gafeso ne calcule aucun label ISO 2709 :
 * il émettait une constante de forme MARC21 (`00000nam a2200000 a 4500`).
 * Sous `format="UNIMARC"`, ce label serait une affirmation fausse de plus —
 * la version 2 permet de ne pas l'écrire du tout, ce qui est la vérité.
 * Le label reste produit pour l'export ISO 2709 (.mrc), où la norme l'exige.
 *
 * ⚠ Ces constantes existent parce que la MÊME affirmation fausse était écrite à
 * trois endroits indépendants (entrepôt OAI, export du bibliothécaire, écran
 * d'interopérabilité). Toute sortie XML de notices passe par ici.
 *
 * ⚠ NE CONCERNE PAS le client SRU (`sru/sru-servers.ts`) : `recordSchema:
 * 'marcxml'` y désigne la Library of Congress, qui sert du VRAI MARC21 en
 * entrée. C'est légitime et doit rester.
 */

/**
 * Gabarit du label ISO 2709 (« leader ») EXIGÉ par marcxchange 2.0.
 *
 * Recopié du XSD de la norme (`__fixtures__/marcxchange-2-0.xsd`, type
 * `leaderDataType`), et `reexposition-fidele.spec.ts` vérifie qu'il lui est
 * toujours identique — sinon la vérification dériverait de la norme qu'elle
 * prétend appliquer.
 *
 * ⚠ IL SERT À DÉCIDER DE NE PAS ÉMETTRE. Gafeso n'écrit aucun leader dans ses
 * reconstructions (voir ci-dessus : ce serait une constante, donc une
 * affirmation fausse). Mais une notice IMPORTÉE en porte un vrai, et celui-là
 * doit ressortir — sauf s'il ne respecte pas le gabarit, cas où l'omettre est
 * la seule sortie valide : `leader` est optionnel en 2.0, un leader malformé
 * ne l'est pas.
 */
export const GABARIT_LEADER =
  /^\d{5}[\x00-\x7F][\x00-\x7F]{4}\d\d\d{5}[\x00-\x7F]{3}\d\d\d[\x00-\x7F]$/;

/** Préfixe de métadonnées OAI-PMH et valeur du paramètre `format` de l'export. */
export const MARCXCHANGE_PREFIX = 'marcxchange';

/**
 * Ancien préfixe, réellement exposé jusqu'au 7 septembre 2026. Conservé
 * UNIQUEMENT pour être refusé avec une explication : un moissonneur qui échoue
 * en sachant pourquoi vaut mieux qu'un moissonneur qui réussit dans le faux.
 */
export const ANCIEN_PREFIX_MARCXML = 'marcxml';

/** Espace de noms MarcXchange 2.0 (ISO 25577). Un URI `info:` ne se déréférence pas. */
export const MARCXCHANGE_NAMESPACE = 'info:lc/xmlns/marcxchange-v2';

/**
 * Emplacement canonique du schéma, chez son mainteneur. On ne sert PAS notre
 * propre copie : le schéma d'une norme appartient à la norme. Une copie est
 * gardée en fixture de test (`__fixtures__/marcxchange-2-0.xsd`) pour valider
 * notre sortie sans dépendre du réseau.
 */
export const MARCXCHANGE_SCHEMA_URL =
  'http://www.loc.gov/standards/iso25577/marcxchange-2-0.xsd';

/** Dialecte MARC déclaré par l'attribut `format` de chaque notice. */
export const MARCXCHANGE_FORMAT = 'UNIMARC';

/** Nature de la notice, attribut `type`. */
export const MARCXCHANGE_TYPE = 'Bibliographic';

/** Balise ouvrante d'une notice, avec sa déclaration de dialecte. */
/**
 * ⚠ LE FORMAT EST UN PARAMÈTRE DEPUIS P5, ET C'EST UN POINT D'I4.
 *
 * Il était figé à `UNIMARC` — vrai pour une notice que Gafeso reconstruit, faux
 * pour une notice IMPORTÉE en MARC21 et réexposée telle quelle. Déclarer
 * `format="UNIMARC"` sur du MARC21 natif serait annoncer un dialecte qu'on ne
 * produit pas : exactement ce qu'I4 interdit, et le moissonneur n'aurait aucun
 * moyen de s'en apercevoir — les deux dialectes ont la même forme XML.
 *
 * Le défaut reste `UNIMARC` : c'est ce que Gafeso produit quand il reconstruit.
 */
export function ouvertureRecord(
  avecNamespace: boolean,
  format: string = MARCXCHANGE_FORMAT,
): string {
  const ns = avecNamespace ? ` xmlns="${MARCXCHANGE_NAMESPACE}"` : '';
  return `<record${ns} format="${format}" type="${MARCXCHANGE_TYPE}">`;
}

/**
 * Adapte la sortie marcjs (`<record>` + `<leader>`) à MarcXchange 2.0.
 *
 * Deux transformations, chacune délibérée :
 * 1. la balise ouvrante porte `format`/`type` (et l'espace de noms si la notice
 *    est servie seule, comme en OAI) ;
 * 2. le `<leader>` est RETIRÉ — c'est une constante de forme MARC21 que Gafeso
 *    n'a jamais calculée. La 2.0 le rend facultatif ; l'omettre dit la vérité,
 *    l'écrire mentirait sous `format="UNIMARC"`.
 */
export function versMarcxchange(
  recordMarcjs: string,
  avecNamespace: boolean,
  format: string = MARCXCHANGE_FORMAT,
): string {
  const sansLeader = recordMarcjs.replace(/^[ \t]*<leader>[^<]*<\/leader>\r?\n?/m, '');
  return sansLeader.replace('<record>', ouvertureRecord(avecNamespace, format));
}

/**
 * Message de refus de l'ancien préfixe. Il NOMME le remplaçant : c'est tout
 * l'intérêt de refuser plutôt que de retirer silencieusement le format.
 */
export function messageAncienPrefixe(): string {
  return (
    `Le format « ${ANCIEN_PREFIX_MARCXML} » n'est plus servi : il annonçait du ` +
    `MARC21 alors que les notices sont en UNIMARC. Utiliser ` +
    `« ${MARCXCHANGE_PREFIX} » (MarcXchange ISO 25577, espace de noms ` +
    `${MARCXCHANGE_NAMESPACE}, notices déclarées format="${MARCXCHANGE_FORMAT}").`
  );
}
