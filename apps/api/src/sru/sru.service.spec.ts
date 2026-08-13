import { afterEach, describe, expect, it, vi } from 'vitest';
import { SruService } from './sru.service';

// Notice UNIMARC minimale renvoyée par un « faux » serveur BnF.
const BNF_XML = `<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:records><srw:record><srw:recordData>
<record><leader>00000nam</leader>
<datafield tag="010" ind1=" " ind2=" "><subfield code="a">978-2-07-036002-4</subfield></datafield>
<datafield tag="200" ind1="1" ind2=" "><subfield code="a">L'Étranger</subfield></datafield>
<datafield tag="210" ind1=" " ind2=" "><subfield code="c">Gallimard</subfield><subfield code="d">1957</subfield></datafield>
<datafield tag="700" ind1=" " ind2=" "><subfield code="a">Camus</subfield><subfield code="b">Albert</subfield></datafield>
</record></srw:recordData></srw:record></srw:records></srw:searchRetrieveResponse>`;

function okResponse(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('SruService', () => {
  it('sans critère → aucune requête réseau', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await new SruService().search({});
    expect(result).toEqual({ candidates: [], errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recherche ISBN : BnF répond, la notice est proposée en candidat', async () => {
    // BnF (unimarcxml) répond ; LoC échoue (réseau) → listé sans bloquer.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('catalogue.bnf.fr')) return okResponse(BNF_XML);
      throw Object.assign(new Error('fetch failed'), { name: 'TypeError' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { candidates, errors } = await new SruService().search({ isbn: '978-2-07-036002-4' });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      source: 'BnF — Catalogue général',
      title: "L'Étranger",
      publisher: 'Gallimard',
      publishYear: 1957,
      isbn: '978-2-07-036002-4',
    });
    expect(candidates[0].contributors).toEqual([{ name: 'Camus, Albert', role: 'AUTEUR_PRINCIPAL' }]);
    // Le serveur en échec est signalé, pas fatal.
    expect(errors.some((e) => /injoignable/i.test(e.message))).toBe(true);

    // L'URL BnF est bien formée (CQL ISBN encodé).
    const bnfUrl = fetchMock.mock.calls.map((c) => c[0] as string).find((u) => u.includes('bnf'));
    expect(bnfUrl).toContain('operation=searchRetrieve');
    expect(bnfUrl).toContain('recordSchema=unimarcxchange');
    // URLSearchParams encode l'espace en « + » (form-urlencoded).
    expect(decodeURIComponent(bnfUrl!).replace(/\+/g, ' ')).toContain(
      'bib.isbn all "978-2-07-036002-4"',
    );
  });

  it('timeout d’un serveur → message clair « délai dépassé », jamais de gel', async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { candidates, errors } = await new SruService().search({ isbn: '123' });
    expect(candidates).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => /délai dépassé/i.test(e.message))).toBe(true);
  });

  it('réponse HTTP 500 → erreur explicite, pas de candidat', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { candidates, errors } = await new SruService().search({ query: 'droit foncier' });
    expect(candidates).toEqual([]);
    expect(errors.every((e) => /HTTP 500/.test(e.message))).toBe(true);
  });
});
