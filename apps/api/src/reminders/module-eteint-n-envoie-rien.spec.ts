import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { RemindersService } from './reminders.service';

/**
 * ⚠ UNE ÉCOLE QUI A ÉTEINT LES RAPPELS N'EN ENVOIE AUCUN — MÊME MANUELLEMENT.
 *
 * *Posé le 15 septembre 2026, après avoir mesuré le contraire.*
 *
 * `processTenant` avait DEUX appelants : le planificateur, qui vérifiait
 * `estActif(tenant, 'rappels')` et sautait les écoles éteintes — et
 * `runForTenant`, derrière « Déclencher les rappels maintenant », qui ne
 * vérifiait rien. Le contrôleur ne portait aucun `@ModuleRequis`.
 *
 * ⚠ ET LE DOCSTRING DE `runForTenant` AFFIRMAIT LA PROTECTION MANQUANTE :
 * « protégée par le garde de module, qui nomme le module inactif. Sans ce
 * garde, cette méthode serait une porte ouverte ». Le nom d'un dispositif est
 * une affirmation, et rien dans le dispositif ne la vérifiait. Une école qui
 * avait éteint les rappels recevait ses courriels dès qu'on cliquait.
 *
 * ⚠ LA GARDE VIT MAINTENANT AUX DEUX ENDROITS, et ce n'est pas une ceinture de
 * plus : une propriété défendue au seul niveau HTTP a une porte de plus dès
 * qu'un appelant apparaît — une commande, un planificateur, un autre service.
 * Ici l'action ÉMET vers l'extérieur et ne se rattrape pas.
 */
describe('Rappels — le module éteint ferme AUSSI le déclenchement manuel', () => {
  const prisma = () => ({
    tenantSettings: { findUnique: vi.fn().mockResolvedValue({}) },
    forTenant: vi.fn(() => ({ checkout: { findMany: vi.fn().mockResolvedValue([]) } })),
  });

  it('⚠ REFUSE quand le module est éteint, et NOMME le module', async () => {
    const p = prisma();
    const svc = new RemindersService(p as never, {} as never, {
      estActif: async () => false,
    } as never);

    await expect(svc.runForTenant('t1', 'zinda')).rejects.toBeInstanceOf(ForbiddenException);

    // ⚠ LE CORPS PORTE LE MODULE, pas seulement la phrase française : un
    // appelant automatique doit pouvoir le lire sans analyser du texte.
    const erreur = await svc
      .runForTenant('t1', 'zinda')
      .then(() => null)
      .catch((e: unknown) => e as ForbiddenException);
    expect(erreur, 'la seconde tentative n’a pas refusé').not.toBeNull();
    expect((erreur!.getResponse() as { module: string }).module).toBe('rappels');

    // ⚠ ET LE TÉMOIN QUI COMPTE : le traitement n'a MÊME PAS COMMENCÉ. Un refus
    // qui laisserait `forTenant` s'exécuter aurait déjà lu la base, et la
    // prochaine étape aurait envoyé.
    expect(p.forTenant, 'le traitement a démarré malgré le refus').not.toHaveBeenCalled();
  });

  it('laisse passer quand le module est actif', async () => {
    const p = prisma();
    const svc = new RemindersService(p as never, {} as never, {
      estActif: async () => true,
    } as never);
    await expect(svc.runForTenant('t1', 'zinda')).resolves.toBeDefined();
    expect(p.forTenant).toHaveBeenCalled();
  });
});
