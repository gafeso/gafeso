// Helpers XML pour OAI-PMH 2.0 (http://www.openarchives.org/OAI/2.0/).

/** Échappe le texte destiné à un contenu/attribut XML. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Datestamp OAI : UTC, granularité seconde (YYYY-MM-DDThh:mm:ssZ). */
export function oaiDatestamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Élément simple <tag>texte échappé</tag> (rien si vide). */
export function tag(name: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `<${name}>${xmlEscape(String(value))}</${name}>`;
}

/**
 * Enveloppe standard d'une réponse OAI-PMH. `requestAttrs` = attributs de
 * l'élément <request> (verb + arguments effectivement traités).
 */
export function oaiEnvelope(
  responseDate: Date,
  baseUrl: string,
  requestAttrs: Record<string, string | undefined>,
  body: string,
): string {
  const attrs = Object.entries(requestAttrs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${xmlEscape(String(v))}"`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ ' +
    'http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">\n' +
    `  <responseDate>${oaiDatestamp(responseDate)}</responseDate>\n` +
    `  <request${attrs}>${xmlEscape(baseUrl)}</request>\n` +
    body +
    '\n</OAI-PMH>\n'
  );
}

/** Réponse d'erreur OAI (code + message) — l'élément request reste minimal. */
export function oaiError(
  responseDate: Date,
  baseUrl: string,
  code: string,
  message: string,
  requestAttrs: Record<string, string | undefined> = {},
): string {
  return oaiEnvelope(
    responseDate,
    baseUrl,
    requestAttrs,
    `  <error code="${xmlEscape(code)}">${xmlEscape(message)}</error>`,
  );
}
