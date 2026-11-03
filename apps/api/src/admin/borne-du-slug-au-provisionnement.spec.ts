import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminService } from './admin.service';
import { longueurSlugMaxPourEtiquette } from '../labels/capacite-qr-etiquette';

/**
 * 🔴 LE REFUS AU PROVISIONNEMENT — là où le slug se choisit encore.
 *
 * *Posé le 3 novembre 2026, avec la borne du slug.*
 *
 * `borne-du-slug.spec.ts` prouve que la borne est la BONNE. Celui-ci prouve
 * qu'elle est OPPOSÉE : une borne juste que personne n'applique ne protège
 * rien, et c'est la moitié qui manquait le plus longtemps.
 *
 * ⚠ POURQUOI ICI ET PAS À L'IMPRESSION : au moment d'imprimer, le slug est déjà
 * gravé dans chaque identifiant pérenne de l'école — dans les QR déjà collés,
 * les pages de titre des PDF, les notices moissonnées. Refuser à ce moment-là
 * ne laisserait aucune issue. Au provisionnement, il suffit de choisir plus
 * court.
 */

const APP_URL = 'https://bib.uo.bf';
const BORNE = longueurSlugMaxPourEtiquette(APP_URL, null)!;

function service(appUrl: string | undefined) {
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
  };
  const svc = new AdminService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { get: () => appUrl } as any,
  );
  return { svc, prisma };
}

describe('🔴 UN SLUG TROP LONG POUR L’ÉTIQUETTE EST REFUSÉ', () => {
  it('⭐ un caractère au-dessus de la borne : refus, et le message NOMME le maximum', async () => {
    const { svc, prisma } = service(APP_URL);
    const trop = 'a' + 'b'.repeat(BORNE); // BORNE + 1 caractères
    await expect(
      svc.provisionTenant({ name: 'École', slug: trop } as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.provisionTenant({ name: 'École', slug: trop } as any),
    ).rejects.toThrow(new RegExp(`maximum ${BORNE}`));
    // ⚠ ET RIEN N'A ÉTÉ CRÉÉ : un refus qui laisse une école à moitié
    // provisionnée serait pire que pas de refus.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('⭐ le message dit QUOI FAIRE — deux issues, pas un reproche', async () => {
    const { svc } = service(APP_URL);
    const trop = 'a' + 'b'.repeat(BORNE);
    const erreur = await svc
      .provisionTenant({ name: 'École', slug: trop } as any)
      .catch((e: Error) => e);
    const message = (erreur as Error).message;
    expect(message).toContain('slug plus court');
    expect(message).toContain('domaine');
    // Et il dit POURQUOI : sans la cause, l'exploitant croit à une limite
    // arbitraire et la contourne au premier moyen trouvé.
    expect(message).toMatch(/illisible|version/);
  });

  it('🔴 TÉMOIN D’ABSENCE — un slug À la borne PASSE la validation de longueur', async () => {
    // ⚠ Sans ce cas, un refus de TOUT slug satisferait le cas précédent. Le
    // garde doit distinguer, pas refuser.
    const { svc, prisma } = service(APP_URL);
    const juste = 'a' + 'b'.repeat(BORNE - 1); // exactement BORNE
    prisma.$transaction = vi.fn().mockRejectedValue(new Error('SENTINELLE'));
    // Il échoue plus loin, sur la sentinelle — donc la borne l'a laissé passer.
    await expect(
      svc.provisionTenant({ name: 'École', slug: juste } as any),
    ).rejects.toThrow('SENTINELLE');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('⭐ LE DOMAINE DEMANDÉ change la borne — il entre dans l’adresse gravée', async () => {
    // Un slug accepté sous `https://bib.uo.bf` doit être REFUSÉ si l'école
    // demande un domaine plus long : c'est la même école, le même slug, et une
    // étiquette qui ne tient plus.
    const domaineLong = 'bibliotheque.universite-exemple.edu.bf';
    const borneAvecDomaine = longueurSlugMaxPourEtiquette(APP_URL, domaineLong)!;
    expect(borneAvecDomaine, 'le domaine doit réduire la borne').toBeLessThan(BORNE);
    const { svc } = service(APP_URL);
    const slug = 'a' + 'b'.repeat(borneAvecDomaine); // trop long POUR CE DOMAINE
    await expect(
      svc.provisionTenant({ name: 'École', slug, domain: domaineLong } as any),
    ).rejects.toThrow(new RegExp(`maximum ${borneAvecDomaine}`));
  });

  it('⚠ SANS APP_URL, aucun refus — il n’y a aucune étiquette à imprimer', async () => {
    // Inventer une borne ici refuserait des slugs pour une raison inexistante.
    const { svc, prisma } = service(undefined);
    prisma.$transaction = vi.fn().mockRejectedValue(new Error('SENTINELLE'));
    const tres_long = 'a' + 'b'.repeat(45);
    await expect(
      svc.provisionTenant({ name: 'École', slug: tres_long } as any),
    ).rejects.toThrow('SENTINELLE');
  });
});
