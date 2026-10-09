/**
 * 🔴 DEUX ÉCRITURES CONCURRENTES SUR LES PAGES LÉGALES — garde vivant.
 *
 * ## Pourquoi ce test exige une VRAIE base, et ne peut pas être unitaire
 *
 * La propriété défendue est une propriété du MOTEUR : un `UPDATE … WHERE
 * version = $n` n'a de fenêtre nulle part parce que PostgreSQL verrouille la
 * ligne et RÉÉVALUE le `WHERE` contre la version nouvellement validée. Une
 * doublure ne peut pas l'éprouver — elle n'a ni verrou, ni niveau d'isolation,
 * ni réévaluation. **« Un test unitaire monte ce qu'on lui donne »**, et ce
 * qu'on lui donnerait ici serait précisément l'hypothèse à vérifier.
 *
 * ## ⚠ ET C'EST LA FORME FAUTIVE QUE CE FICHIER EXISTE POUR BARRER
 *
 * Le lire-vérifier-écrire dans une transaction est un FAUX DISPOSITIF : la
 * transaction est là, le contrôle est là, le `throw` est là — et en
 * `READ COMMITTED`, deux transactions lisent la même version, la trouvent
 * égale, et écrivent toutes deux. Le contrôle passe pour les DEUX. Une
 * relecture voit un mécanisme complet ; seul ce test le démentirait.
 *
 * Discipline de recette : `nettoyage-recense`.
 */
import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';
import { appliquerSiVersion, PagesLegales, versionDesPagesLegales } from './pages-legales';
import { TenancyService } from './tenancy.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * ⚠ GATÉ : il exige une base joignable. Et quand elle ne répond pas il sort
 * ROUGE, jamais vert — un test qui ne peut pas mesurer n'est pas un test qui
 * passe. C'est au crochet de pré-publication de distinguer « la propriété est
 * violée » de « la base est injoignable ».
 */
const VIVANT = process.env.PG_LIVE === '1';

const prisma = new PrismaClient();

/** Une page PUBLIÉE, qu'une écriture concurrente ne doit jamais emporter. */
const PUBLIEE: PagesLegales = {
  mentions: {
    blocs: { fr: 'MENTIONS PUBLIÉES — TÉMOIN DE CONCURRENCE' },
    publieeLe: '2026-10-01T08:00:00.000Z',
  },
  confidentialite: { blocs: {}, publieeLe: null },
};

function brouillon(marque: string): PagesLegales {
  return {
    mentions: { blocs: { fr: `BROUILLON ${marque}` }, publieeLe: null },
    confidentialite: { blocs: {}, publieeLe: null },
  };
}

describe.runIf(VIVANT)('🔴 Le contrôle de version des pages légales', () => {
  let joignable = false;
  let service: TenancyService;
  let tenantId = '';
  /** Ce que la colonne portait AVANT — on restaure par différence, pas par oubli. */
  let avant: unknown = null;
  let lignePreexistante = false;

  beforeAll(async () => {
    try {
      const tenant = await prisma.tenant.findFirst({ orderBy: { slug: 'asc' } });
      if (!tenant) return;
      tenantId = tenant.id;
      const ligne = await prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { pagesLegales: true },
      });
      lignePreexistante = ligne !== null;
      avant = ligne?.pagesLegales ?? null;
      service = new TenancyService(prisma as unknown as PrismaService);
      joignable = true;
    } catch {
      joignable = false;
    }
  });

  afterAll(async () => {
    // ⚠ NETTOYAGE PAR L'ÉTAT D'AVANT, jamais « je supprime ce que j'ai créé » :
    // la ligne pouvait exister avec un contenu, ou ne pas exister du tout.
    if (joignable && tenantId) {
      if (lignePreexistante) {
        await prisma.$executeRaw`
          UPDATE public.tenant_settings
             SET pages_legales = ${avant === null ? null : JSON.stringify(avant)}::jsonb
           WHERE tenant_id = ${tenantId}`;
      } else {
        await prisma.tenantSettings.deleteMany({ where: { tenantId } });
      }
    }
    await prisma.$disconnect();
  });

  it('⚠ le garde voit une école — sinon il ne mesure rien', () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(tenantId.length).toBeGreaterThan(0);
  });

  it('🔴 DEUX ÉCRITURES CONCURRENTES : la seconde est REFUSÉE, la publiée INTACTE', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);

    // ── Mise en place : une page PUBLIÉE, à la version N.
    await service.updateSettings(tenantId, {
      pagesLegales: PUBLIEE as unknown as Record<string, unknown>,
      pagesLegalesVersion: versionDesPagesLegales(avant),
    });
    const lu = await prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { pagesLegales: true },
    });
    const versionLue = versionDesPagesLegales(lu.pagesLegales);
    expect(versionLue, 'la version doit avoir avancé').toBeGreaterThan(0);

    // ── DEUX éditeurs ont lu la MÊME version. Lancés ENSEMBLE, sans attendre
    //    l'un l'autre : c'est la seule façon d'éprouver la fenêtre.
    const resultats = await Promise.allSettled([
      service.updateSettings(tenantId, {
        pagesLegales: brouillon('A') as unknown as Record<string, unknown>,
        pagesLegalesVersion: versionLue,
      }),
      service.updateSettings(tenantId, {
        pagesLegales: brouillon('B') as unknown as Record<string, unknown>,
        pagesLegalesVersion: versionLue,
      }),
    ]);

    const tenus = resultats.filter((r) => r.status === 'fulfilled');
    const refuses = resultats.filter((r) => r.status === 'rejected');

    // ⭐ EXACTEMENT UN, et c'est le cœur. « Deux » veut dire que le contrôle est
    // un faux dispositif ; « zéro » qu'il refuse une écriture légitime.
    expect(
      tenus.length,
      'une seule des deux écritures concurrentes doit aboutir — deux signifie ' +
        'que le contrôle de version ne mesure rien (lire-vérifier-écrire en ' +
        'READ COMMITTED laisse passer les deux)',
    ).toBe(1);
    expect(refuses.length).toBe(1);

    // ⚠ Le refus est un 409 QUI DIT DE RELIRE, pas une erreur quelconque.
    const motif = (refuses[0] as PromiseRejectedResult).reason as Error;
    expect(motif).toBeInstanceOf(ConflictException);
    expect(motif.message).toMatch(/modifi[ée]es entre-temps/i);
    expect(motif.message, 'le refus doit dire de RELIRE').toMatch(/RELISEZ/);
    expect(motif.message, 'et dire que rien n’a été écrit').toMatch(/[Rr]ien n’a été enregistré/);

    // ── ET L'EFFET, qui est la seule preuve : la version n'a avancé QUE D'UN.
    const apres = await prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { pagesLegales: true },
    });
    expect(
      versionDesPagesLegales(apres.pagesLegales),
      'la version doit avoir avancé d’UN SEUL cran : deux écritures acceptées ' +
        'en feraient deux, et l’une aurait écrasé l’autre',
    ).toBe(versionLue + 1);

    // ── Et UN SEUL des deux brouillons est là.
    const contenu = JSON.stringify(apres.pagesLegales);
    const presents = ['BROUILLON A', 'BROUILLON B'].filter((m) => contenu.includes(m));
    expect(presents.length, 'un seul brouillon, jamais un mélange des deux').toBe(1);
  }, 60_000);

  it('🔴 LA PAGE PUBLIÉE SURVIT À UNE ÉCRITURE PÉRIMÉE', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);

    // Une page PUBLIÉE à la version courante.
    const base = await prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { pagesLegales: true },
    });
    await service.updateSettings(tenantId, {
      pagesLegales: PUBLIEE as unknown as Record<string, unknown>,
      pagesLegalesVersion: versionDesPagesLegales(base.pagesLegales),
    });
    const vPubliee = versionDesPagesLegales(
      (
        await prisma.tenantSettings.findUniqueOrThrow({
          where: { tenantId },
          select: { pagesLegales: true },
        })
      ).pagesLegales,
    );

    // ⚠ UNE ÉCRITURE FONDÉE SUR UNE VERSION PÉRIMÉE — celle d'avant.
    await expect(
      service.updateSettings(tenantId, {
        pagesLegales: brouillon('PÉRIMÉ') as unknown as Record<string, unknown>,
        pagesLegalesVersion: vPubliee - 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // ⭐ L'EFFET : la page publiée est là, MOT POUR MOT, et sa date aussi.
    const apres = await prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { pagesLegales: true },
    });
    const contenu = JSON.stringify(apres.pagesLegales);
    expect(
      contenu,
      'une écriture refusée ne doit RIEN avoir changé — c’est la différence ' +
        'entre « 409 » et « 409 après avoir écrit »',
    ).toContain('MENTIONS PUBLIÉES — TÉMOIN DE CONCURRENCE');
    expect(contenu).toContain('2026-10-01T08:00:00.000Z');
    expect(contenu, 'le brouillon périmé ne doit pas être entré').not.toContain('BROUILLON PÉRIMÉ');
    expect(
      versionDesPagesLegales(apres.pagesLegales),
      'un refus n’incrémente pas la version',
    ).toBe(vPubliee);
  }, 60_000);

  it('⭐ TÉMOIN D’ABSENCE : avec la BONNE version, l’écriture PASSE', async () => {
    // Sans ce cas, un contrôle qui refuserait TOUT serait indiscernable d'un
    // contrôle juste — et plus rassurant, puisqu'il ne laisserait jamais rien
    // s'écraser.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const base = await prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { pagesLegales: true },
    });
    const v = versionDesPagesLegales(base.pagesLegales);
    await service.updateSettings(tenantId, {
      pagesLegales: brouillon('ACCEPTÉ') as unknown as Record<string, unknown>,
      pagesLegalesVersion: v,
    });
    const apres = await prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { pagesLegales: true },
    });
    expect(JSON.stringify(apres.pagesLegales)).toContain('BROUILLON ACCEPTÉ');
    expect(versionDesPagesLegales(apres.pagesLegales)).toBe(v + 1);
  }, 60_000);

  it('🔴 LA COURSE RÉELLE : deux transactions TENUES OUVERTES, une seule écrit', async () => {
    // ⭐ C'EST LE SEUL CAS QUI DISCRIMINE, et mon premier test ne le contenait
    // pas. Deux appels lancés par `Promise.allSettled` sur le même client ne se
    // chevauchent pas forcément : exécutés en séquence, un lire-vérifier-écrire
    // refuse AUSSI la seconde écriture. Le cas séquentiel ne mesure donc que le
    // contrat, jamais le mécanisme.
    //
    // Ici les deux transactions sont TENUES OUVERTES par une barrière : la
    // seconde atteint son écriture AVANT que la première ait validé. C'est
    // exactement la situation où un lire-vérifier-écrire perd une écriture.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);

    const base = await prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { pagesLegales: true },
    });
    const v = versionDesPagesLegales(base.pagesLegales);

    // ⚠ DEUX CLIENTS : deux connexions distinctes. Sur un seul, les deux
    // transactions se disputeraient le même socle et se sérialiseraient.
    const clientA = new PrismaClient();
    const clientB = new PrismaClient();

    let ouvreB: () => void = () => {};
    const bPeutCommencer = new Promise<void>((r) => {
      ouvreB = r;
    });
    let laisseACommiter: () => void = () => {};
    const aPeutCommiter = new Promise<void>((r) => {
      laisseACommiter = r;
    });

    try {
      const toucheesA: number[] = [];
      const toucheesB: number[] = [];

      const courseA = clientA.$transaction(async (tx) => {
        const n = await appliquerSiVersion(tx, tenantId, brouillon('COURSE A'), v);
        toucheesA.push(n);
        // A a écrit et NE VALIDE PAS encore : B va se présenter maintenant.
        ouvreB();
        await aPeutCommiter;
      });

      const courseB = clientB.$transaction(async (tx) => {
        await bPeutCommencer;
        // ⚠ B démarre son écriture pendant que A tient le verrou. Elle BLOQUE.
        //    On libère A juste après, pour que le blocage se dénoue.
        const promesse = appliquerSiVersion(tx, tenantId, brouillon('COURSE B'), v);
        setTimeout(laisseACommiter, 250);
        toucheesB.push(await promesse);
      });

      await Promise.all([courseA, courseB]);

      // ⭐ EXACTEMENT UNE des deux a touché une ligne. « Deux » signifie que le
      // prédicat n'a pas été réévalué — c'est-à-dire qu'il n'est pas dans
      // l'`UPDATE`, et que l'une des deux écritures a été PERDUE.
      expect(
        toucheesA[0] + toucheesB[0],
        'une seule écriture doit toucher une ligne : la somme vaut 2 quand le ' +
          'contrôle est un lire-vérifier-écrire, et une écriture est alors perdue',
      ).toBe(1);

      // ── Et l'EFFET : un seul des deux contenus est en base, et la version
      //    n'a avancé que d'un cran.
      const apres = await prisma.tenantSettings.findUniqueOrThrow({
        where: { tenantId },
        select: { pagesLegales: true },
      });
      const contenu = JSON.stringify(apres.pagesLegales);
      const presents = ['COURSE A', 'COURSE B'].filter((m) => contenu.includes(m));
      expect(presents.length, 'un seul des deux contenus, jamais un mélange').toBe(1);
      expect(versionDesPagesLegales(apres.pagesLegales), 'un seul cran').toBe(v + 1);
    } finally {
      laisseACommiter();
      ouvreB();
      await clientA.$disconnect();
      await clientB.$disconnect();
    }
  }, 60_000);

  it('⚠ une version NON NUMÉRIQUE en base vaut ZÉRO — des deux côtés', async () => {
    // Le prédicat SQL et `versionDesPagesLegales` doivent faire la MÊME
    // discrimination. S'ils divergeaient, l'écart ne se verrait qu'au premier
    // conflit réel — et il rendrait le contrôle inopérant en silence.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    await prisma.$executeRaw`
      UPDATE public.tenant_settings
         SET pages_legales = ${JSON.stringify({ ...PUBLIEE, version: 'pas-un-nombre' })}::jsonb
       WHERE tenant_id = ${tenantId}`;

    const lu = await prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { pagesLegales: true },
    });
    expect(versionDesPagesLegales(lu.pagesLegales), 'le code dit zéro').toBe(0);

    // Et le SQL aussi : une écriture à la version 0 doit PASSER.
    await service.updateSettings(tenantId, {
      pagesLegales: brouillon('APRÈS-NON-NUMÉRIQUE') as unknown as Record<string, unknown>,
      pagesLegalesVersion: 0,
    });
    const apres = await prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { pagesLegales: true },
    });
    expect(JSON.stringify(apres.pagesLegales)).toContain('APRÈS-NON-NUMÉRIQUE');
    expect(versionDesPagesLegales(apres.pagesLegales)).toBe(1);
  }, 60_000);
});
