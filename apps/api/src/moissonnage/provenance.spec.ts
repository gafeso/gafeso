import { describe, expect, it, vi } from 'vitest';
import { lienVersOrigine } from './provenance';
import { ProvenanceService } from './provenance.service';

/**
 * ⚠ LA FÉDÉRATION NE CHERCHE PAS À DISTANCE — les notices moissonnées sont
 * DÉJÀ locales. Ce qui manque n'est donc pas la recherche, c'est la
 * DISTINCTION : une notice venue d'ailleurs qui se présente comme une notice
 * catalloguée est le faux que la décision 1 du brief interdit.
 */

describe('⚠ Le lien vers l’origine est MOISSONNÉ, jamais fabriqué', () => {
  it('lit la première adresse http(s) de `dc:identifier`', () => {
    expect(
      lienVersOrigine({
        dc: { identifier: ['ISBN:978-2-1234-5678-9', 'https://depot.exemple.bf/handle/123/456'] },
      }),
    ).toBe('https://depot.exemple.bf/handle/123/456');
  });

  it('⚠ NE PREND PAS un ISBN, un DOI nu ou une cote pour un lien', () => {
    // `dc:identifier` porte de tout. Les prendre pour des adresses produirait
    // un href qui ne mène nulle part — affiché à un lecteur, chez un tiers.
    for (const brut of [
      { dc: { identifier: 'ISBN:978-2-1234-5678-9' } },
      { dc: { identifier: '10.1234/abcd' } },
      { dc: { identifier: ['THE-2019-042'] } },
      { dc: {} },
      { dc: { identifier: [] } },
      {},
      null,
    ]) {
      expect(lienVersOrigine(brut), JSON.stringify(brut)).toBeNull();
    }
  });

  it('lit aussi la forme que le parseur XML rend comme objet (`#text`)', () => {
    expect(
      lienVersOrigine({ dc: { identifier: { '#text': 'https://depot.exemple.bf/x' } } }),
    ).toBe('https://depot.exemple.bf/x');
  });
});

describe('⚠ La provenance se lit dans `harvested_records`, pas dans `marcFormat`', () => {
  function base(moissonnees: Record<string, unknown>[], notices: Record<string, unknown>[]) {
    const harvestedRecord = {
      findMany: vi.fn(async ({ where }: { where: { recordId: { in: string[] } } }) =>
        // ⚠ Le `where` est HONORÉ : une doublure qui rend tout ferait passer un
        // contrôle négatif qui devrait tomber.
        moissonnees.filter((m) => where.recordId.in.includes(m.recordId as string)),
      ),
    };
    const biblioRecord = {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        notices.filter((n) => where.id.in.includes(n.id as string)),
      ),
    };
    return { db: { harvestedRecord, biblioRecord } as never, harvestedRecord };
  }

  const MOISSONNEE = {
    recordId: 'rec-1',
    oaiIdentifier: 'oai:autre-ecole:xyz',
    source: { id: 's1', name: 'Dépôt de l’Université d’Exemple' },
  };

  it('rend l’école d’origine, l’identifiant CHEZ ELLE, et le lien', async () => {
    const { db } = base(
      [MOISSONNEE],
      [{ id: 'rec-1', marcData: { dc: { identifier: 'https://depot.exemple.bf/h/1' } } }],
    );
    const r = await new ProvenanceService().provenances(db, ['rec-1']);
    expect(r['rec-1']).toEqual({
      source: { id: 's1', name: 'Dépôt de l’Université d’Exemple' },
      // ⚠ SA clé, jamais la nôtre.
      oaiIdentifier: 'oai:autre-ecole:xyz',
      lien: 'https://depot.exemple.bf/h/1',
    });
  });

  it('⚠ une notice LOCALE est ABSENTE du résultat — son absence EST la réponse', async () => {
    // Rendre « provenance: null » pour chacune ferait porter à l'écran une
    // liste de « rien à dire » aussi longue que ses résultats.
    const { db } = base([MOISSONNEE], []);
    expect(await new ProvenanceService().provenances(db, ['rec-locale'])).toEqual({});
  });

  it('⚠ LA REQUÊTE elle-même est bornée aux identifiants demandés', async () => {
    // ⚠ LA SECONDE PORTE. La propriété « on ne rend que ce qu'on a demandé » est
    // portée par le `where`, pas par le code qui suit : un `findMany` sans
    // filtre rendrait la mémoire de moissonnage de TOUTE l'école, et aucune
    // assertion sur la sortie ne le verrait — la doublure, elle, filtre.
    //
    // C'est la leçon des deux portes : éprouver la décision ET la requête.
    const { db, harvestedRecord } = base([MOISSONNEE], []);
    await new ProvenanceService().provenances(db, ['rec-1', 'rec-2']);
    expect(harvestedRecord.findMany.mock.calls[0][0].where).toEqual({
      recordId: { in: ['rec-1', 'rec-2'] },
    });
  });

  it('⚠ `lien: null` quand la source n’en publie pas — on n’en fabrique pas', async () => {
    const { db } = base([MOISSONNEE], [{ id: 'rec-1', marcData: { dc: { identifier: 'THE-42' } } }]);
    const r = await new ProvenanceService().provenances(db, ['rec-1']);
    expect(r['rec-1'].lien).toBeNull();
    // Et la notice reste signalée comme venue d'ailleurs : c'est le LIEN qui
    // manque, pas la provenance.
    expect(r['rec-1'].source.name).toBe('Dépôt de l’Université d’Exemple');
  });

  it('une liste vide ne touche pas la base', async () => {
    const { db, harvestedRecord } = base([], []);
    expect(await new ProvenanceService().provenances(db, [])).toEqual({});
    expect(harvestedRecord.findMany).not.toHaveBeenCalled();
  });

  it('`provenance` d’une notice locale rend `null`', async () => {
    const { db } = base([], []);
    expect(await new ProvenanceService().provenance(db, 'rec-locale')).toBeNull();
  });
});
