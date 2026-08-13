import { describe, expect, it } from 'vitest';
import { parseSruMarcxml } from './sru-marcxml';
import { extractBiblio } from '../cataloging/marc-mapper';

// Réponse SRU type BnF : préfixes srw:/mxc:, notice UNIMARC imbriquée.
const BNF_SRU = `<?xml version="1.0" encoding="UTF-8"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:numberOfRecords>1</srw:numberOfRecords>
  <srw:records>
    <srw:record>
      <srw:recordSchema>unimarcxml</srw:recordSchema>
      <srw:recordData>
        <mxc:record xmlns:mxc="info:lc/xmlns/marcxchange-v2">
          <mxc:leader>00000nam0 2200000 450 </mxc:leader>
          <mxc:controlfield tag="001">FRBNF123</mxc:controlfield>
          <mxc:datafield tag="010" ind1=" " ind2=" ">
            <mxc:subfield code="a">978-2-07-036002-4</mxc:subfield>
          </mxc:datafield>
          <mxc:datafield tag="101" ind1="0" ind2=" ">
            <mxc:subfield code="a">fre</mxc:subfield>
          </mxc:datafield>
          <mxc:datafield tag="200" ind1="1" ind2=" ">
            <mxc:subfield code="a">L'Étranger</mxc:subfield>
            <mxc:subfield code="f">Albert Camus</mxc:subfield>
          </mxc:datafield>
          <mxc:datafield tag="210" ind1=" " ind2=" ">
            <mxc:subfield code="a">Paris</mxc:subfield>
            <mxc:subfield code="c">Gallimard</mxc:subfield>
            <mxc:subfield code="d">1957</mxc:subfield>
          </mxc:datafield>
          <mxc:datafield tag="700" ind1=" " ind2="1">
            <mxc:subfield code="a">Camus</mxc:subfield>
            <mxc:subfield code="b">Albert</mxc:subfield>
          </mxc:datafield>
        </mxc:record>
      </srw:recordData>
    </srw:record>
  </srw:records>
</srw:searchRetrieveResponse>`;

// Réponse SRU type LoC : namespace MARC21 slim, notice MARC21.
const LOC_SRU = `<?xml version="1.0"?>
<zs:searchRetrieveResponse xmlns:zs="http://docs.oasis-open.org/ns/search-ws/sruResponse">
  <zs:records>
    <zs:record>
      <zs:recordData>
        <record xmlns="http://www.loc.gov/MARC21/slim">
          <leader>00000cam a2200000 a 4500</leader>
          <controlfield tag="001">99123</controlfield>
          <datafield tag="020" ind1=" " ind2=" "><subfield code="a">9780679720201</subfield></datafield>
          <datafield tag="100" ind1="1" ind2=" "><subfield code="a">Camus, Albert,</subfield></datafield>
          <datafield tag="245" ind1="1" ind2="3"><subfield code="a">The stranger</subfield></datafield>
          <datafield tag="264" ind1=" " ind2="1"><subfield code="a">New York</subfield><subfield code="b">Vintage</subfield><subfield code="c">1989</subfield></datafield>
        </record>
      </zs:recordData>
    </zs:record>
  </zs:records>
</zs:searchRetrieveResponse>`;

describe('parseSruMarcxml', () => {
  it('extrait une notice UNIMARC BnF (préfixes srw:/mxc:) exploitable par le mapper', () => {
    const records = parseSruMarcxml(BNF_SRU);
    expect(records).toHaveLength(1);
    const b = extractBiblio(records[0], 'UNIMARC');
    expect(b).toMatchObject({
      title: "L'Étranger",
      isbn: '978-2-07-036002-4',
      language: 'fre',
      publisher: 'Gallimard',
      publicationCity: 'Paris',
      publishYear: 1957,
    });
    expect(b.contributors).toEqual([{ name: 'Camus, Albert', role: 'AUTEUR_PRINCIPAL' }]);
  });

  it('extrait une notice MARC21 LoC (namespace slim par défaut)', () => {
    const records = parseSruMarcxml(LOC_SRU);
    expect(records).toHaveLength(1);
    const b = extractBiblio(records[0], 'MARC21');
    expect(b).toMatchObject({
      title: 'The stranger',
      isbn: '9780679720201',
      publisher: 'Vintage',
      publishYear: 1989,
      author: 'Camus, Albert',
    });
  });

  it('réponse sans notice (0 résultat) → tableau vide, jamais d’exception', () => {
    const empty = `<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:numberOfRecords>0</srw:numberOfRecords><srw:records/></srw:searchRetrieveResponse>`;
    expect(parseSruMarcxml(empty)).toEqual([]);
  });

  it('XML illisible → tableau vide (robustesse)', () => {
    expect(parseSruMarcxml('<not xml')).toEqual([]);
    expect(parseSruMarcxml('')).toEqual([]);
  });
});
