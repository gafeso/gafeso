import { describe, expect, it, vi } from 'vitest';
import { PatronsService } from './patrons.service';
import { joursDeRetard } from './jours-de-retard';

const service = new PatronsService();
const MAINTENANT = new Date('2026-09-10T12:00:00Z');

function fauxDb(ouverts: unknown[], histoire: unknown[], totalHistoire = histoire.length) {
  // Le type du faux appel décrit ce que le service passe RÉELLEMENT à Prisma :
  // `orderBy` en fait partie, sinon l'assertion qui le vérifie ne compile pas.
  type AppelFindMany = {
    where?: { returnDate?: unknown };
    skip?: number;
    take?: number;
    orderBy?: unknown;
  };
  const findMany = vi.fn(async (args: AppelFindMany) => {
    const rendu = args.where?.returnDate === null;
    return rendu ? ouverts : histoire.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? 20));
  });
  const count = vi.fn(async () => totalHistoire);
  return { db: { checkout: { findMany, count } } as never, findMany, count };
}

const pret = (id: string, opts: { rendu?: boolean; du?: string } = {}) => ({
  id,
  item: { barcode: `EX-${id}`, record: { id: `rec-${id}`, title: `Titre ${id}` } },
  checkoutDate: new Date('2026-08-01T00:00:00Z'),
  dueDate: new Date(opts.du ?? '2026-09-20T00:00:00Z'),
  returnDate: opts.rendu ? new Date('2026-09-05T00:00:00Z') : null,
  renewals: 0,
});

describe('prêts d’un adhérent — l’historique était inatteignable', () => {
  it('rend les prêts EN COURS et l’HISTORIQUE, séparément', async () => {
    const { db } = fauxDb([pret('a')], [pret('h1', { rendu: true }), pret('h2', { rendu: true })]);
    const r = await service.loansOfPatron(db, 'p1', {}, MAINTENANT);
    expect(r.current).toHaveLength(1);
    expect(r.history.entries).toHaveLength(2);
    expect(r.history.total).toBe(2);
  });

  it('⚠ chaque ligne porte recordId — sans lui, aucun lien n’est constructible', async () => {
    // Le défaut remonté : l'écran affichait un titre sur lequel on ne pouvait
    // pas cliquer.
    const { db } = fauxDb([pret('a')], [pret('h1', { rendu: true })]);
    const r = await service.loansOfPatron(db, 'p1', {}, MAINTENANT);
    expect(r.current[0].recordId).toBe('rec-a');
    expect(r.history.entries[0].recordId).toBe('rec-h1');
  });

  it('l’historique est paginé et trié par retour décroissant', async () => {
    const { db, findMany } = fauxDb([], Array.from({ length: 5 }, (_, i) => pret(`h${i}`, { rendu: true })), 42);
    const r = await service.loansOfPatron(db, 'p1', { historyPage: 3, historyLimit: 5 }, MAINTENANT);
    const appelHistoire = findMany.mock.calls.find((c) => c[0].where?.returnDate !== null)![0];
    expect(appelHistoire.skip).toBe(10);
    expect(appelHistoire.take).toBe(5);
    // Le départage par `id` fait partie du contrat de la requête : sans lui,
    // deux retours enregistrés dans la même transaction sortent dans un ordre
    // indéfini d'une page à l'autre de l'historique.
    expect(appelHistoire.orderBy).toEqual([{ returnDate: 'desc' }, { id: 'desc' }]);
    expect(r.history.totalPages).toBe(9); // 42 / 5 arrondi au-dessus
  });

  it('le retard et les compteurs sont justes', async () => {
    const { db } = fauxDb([pret('tard', { du: '2026-09-01T00:00:00Z' }), pret('ok')], []);
    const r = await service.loansOfPatron(db, 'p1', {}, MAINTENANT);
    expect(r.counters).toEqual({ current: 2, overdue: 1 });
    expect(r.current.find((c) => c.checkoutId === 'tard')!.overdueDays).toBe(10);
  });

  it('un adhérent sans aucun prêt rend des listes vides, pas une erreur', async () => {
    const { db } = fauxDb([], [], 0);
    await expect(service.loansOfPatron(db, 'p1', {}, MAINTENANT)).resolves.toMatchObject({
      current: [],
      history: { entries: [], total: 0, totalPages: 1 },
      counters: { current: 0, overdue: 0 },
    });
  });

  it('la limite est bornée à 100 et le minimum à 1', async () => {
    const { db, findMany } = fauxDb([], [], 0);
    await service.loansOfPatron(db, 'p1', { historyLimit: 5000, historyPage: -3 }, MAINTENANT);
    const appel = findMany.mock.calls.find((c) => c[0].where?.returnDate !== null)![0];
    expect(appel.take).toBe(100);
    expect(appel.skip).toBe(0);
  });
});

describe('jours de retard — extrait sans changer le calcul', () => {
  it('rend 0 avant l’échéance et arrondit au jour au-dessus après', () => {
    expect(joursDeRetard(new Date('2026-09-20T00:00:00Z'), MAINTENANT)).toBe(0);
    expect(joursDeRetard(new Date('2026-09-09T00:00:00Z'), MAINTENANT)).toBe(2); // 36 h
    expect(joursDeRetard(new Date('2026-09-01T00:00:00Z'), MAINTENANT)).toBe(10); // 9 j 12 h
  });
});

describe('recherche d’adhérents — par nom, et insensible à la casse', () => {
  function fauxListe() {
    const count = vi.fn(async () => 0);
    // Typé pour la même raison : c'est l'ARGUMENT qu'on inspecte, pas le retour.
    const findMany = vi.fn(async (_args: { where?: unknown }) => [] as unknown[]);
    return { db: { patron: { count, findMany } } as never, count, findMany };
  }
  const clause = async (q?: string) => {
    const { db, findMany } = fauxListe();
    await service.listPatrons(db, { q } as never);
    return findMany.mock.calls[0][0].where as Record<string, unknown>;
  };

  it('⚠ cherche le NOM, pas seulement le code-barres', async () => {
    // Le défaut remonté : « Traoré » était introuvable, le nom n'étant pas
    // cherché du tout.
    const w = await clause('Traoré');
    const ou = w.OR as Record<string, never>[];
    const champs = ou.map((c) => Object.keys(c)[0]);
    expect(champs).toContain('barcode');
    expect(champs.filter((c) => c === 'user')).toHaveLength(3); // prénom, nom, email
  });

  it('⚠ insensible à la casse — « barry » doit trouver « BARRY »', async () => {
    const w = await clause('barry');
    const ou = JSON.stringify(w.OR);
    expect(ou).toContain('insensitive');
    // Chacune des quatre branches, pas seulement la première.
    expect((ou.match(/insensitive/g) ?? []).length).toBe(4);
  });

  it('sans terme de recherche, aucune clause OR n’est posée', async () => {
    expect(await clause(undefined)).not.toHaveProperty('OR');
    expect(await clause('   ')).not.toHaveProperty('OR');
  });

  it('⚠ LIMITE ASSUMÉE : les accents restent significatifs', async () => {
    // `mode: 'insensitive'` traite la casse, PAS les diacritiques. Ce test ne
    // vérifie pas un bon comportement, il FIXE une limite connue : le jour où
    // quelqu'un rend la recherche insensible aux accents, ce test tombe et lui
    // dit que la limite est levée — au lieu de la découvrir en production.
    const w = await clause('traore');
    expect(JSON.stringify(w.OR)).toContain('traore');
    expect(JSON.stringify(w.OR)).not.toContain('unaccent');
  });
});
