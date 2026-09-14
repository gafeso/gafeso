import { describe, expect, it, vi } from 'vitest';
import { DepotsService } from './depots.service';

/**
 * ⚠ ON NE PRÉVIENT LE DIRECTEUR QU'À LA PREMIÈRE SOUMISSION.
 *
 * *Mesuré par la session frontend le 12 septembre 2026 : trois tentatives
 * d'envoi vers le même directeur en deux minutes — soumission, retrait,
 * resoumission.* Muet en développement ; en production, un étudiant qui hésite
 * inonde son directeur, et un directeur inondé cesse de lire. Le coût n'est pas
 * le courriel de trop : c'est celui qu'il ne lira plus le jour où il compte.
 *
 * La règle tient en une comparaison — `notifiedDirectorId !== directorId` — et
 * les trois cas en découlent sans condition supplémentaire.
 *
 * ⚠ DEUX CHOSES QUE CES TESTS TIENNENT ET QU'UNE RELECTURE NE VOIT PAS :
 *  · le SILENCE omet `notification` au lieu de rendre `{ sent: false }` —
 *    « déjà prévenu » n'est pas « pas pu être prévenu » ;
 *  · le RETRAIT prévient toujours : il est le seul des trois qui RETIRE
 *    quelque chose de la liste du directeur.
 */

const DIRECTEUR = 'dir-1';
const AUTRE_DIRECTEUR = 'dir-2';

function service(depot: Record<string, unknown>, envoiAboutit = true) {
  const etat = { ...depot };
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(etat, data);
    return { ...etat };
  });
  const sendDepositSubmitted = vi.fn(async () =>
    envoiAboutit ? { sent: true } : { sent: false, reason: 'smtp_error' },
  );
  const db = {
    deposit: { findUnique: vi.fn(async () => ({ ...etat })), update },
    user: { findUnique: vi.fn(async () => ({ id: DIRECTEUR, email: 'dir@exemple.bf' })) },
  } as never;
  const svc = new DepotsService(
    { sendDepositSubmitted, sendDepositWithdrawn: vi.fn(async () => ({ sent: true })) } as never,
    { putObject: vi.fn(), deleteObject: vi.fn() } as never,
    { ingestPdf: vi.fn() } as never,
  );
  return { svc, db, sendDepositSubmitted, etat };
}

const BROUILLON = {
  id: 'd1',
  status: 'brouillon',
  depositorId: 'etu',
  directorId: DIRECTEUR,
  fileKey: 'k',
  title: 'T',
  authorName: 'A',
};

describe('⚠ Première soumission : le directeur est prévenu', () => {
  it('il reçoit le courriel, et la notification est rendue', async () => {
    const { svc, db, sendDepositSubmitted } = service({ ...BROUILLON, notifiedDirectorId: null });
    const r = await svc.soumettre(db, 'd1', 'etu');

    expect(sendDepositSubmitted).toHaveBeenCalledTimes(1);
    expect(r.notification).toEqual({ sent: true });
  });

  it('et l’envoi abouti est INSCRIT — sans quoi la deuxième fois recommencerait', async () => {
    const { svc, db, etat } = service({ ...BROUILLON, notifiedDirectorId: null });
    await svc.soumettre(db, 'd1', 'etu');
    expect(etat.notifiedDirectorId).toBe(DIRECTEUR);
  });
});

describe('⚠ Resoumission au MÊME directeur : silence', () => {
  it('aucun envoi', async () => {
    const { svc, db, sendDepositSubmitted } = service({
      ...BROUILLON,
      notifiedDirectorId: DIRECTEUR,
    });
    await svc.soumettre(db, 'd1', 'etu');
    expect(sendDepositSubmitted).not.toHaveBeenCalled();
  });

  it('⚠ et `notification` est OMISE, pas rendue à `{ sent: false }`', async () => {
    // « Déjà prévenu » n'est pas « pas pu être prévenu ». Un échec appelle un
    // recours — proposer de relancer, afficher une adresse ; un silence
    // délibéré n'appelle rien. Les confondre ferait dire à l'écran qu'un envoi
    // a échoué alors que tout va bien.
    const { svc, db } = service({ ...BROUILLON, notifiedDirectorId: DIRECTEUR });
    const r = await svc.soumettre(db, 'd1', 'etu');
    expect('notification' in r).toBe(false);
  });
});

describe('⚠ Resoumission à un AUTRE directeur : il est prévenu', () => {
  it('le nouveau n’a jamais rien reçu — c’est le seul cas où la seconde est due', async () => {
    const { svc, db, sendDepositSubmitted, etat } = service({
      ...BROUILLON,
      directorId: AUTRE_DIRECTEUR,
      notifiedDirectorId: DIRECTEUR,
    });
    const r = await svc.soumettre(db, 'd1', 'etu');

    expect(sendDepositSubmitted).toHaveBeenCalledTimes(1);
    expect(r.notification).toEqual({ sent: true });
    expect(etat.notifiedDirectorId).toBe(AUTRE_DIRECTEUR);
  });
});

describe('⚠ Un envoi qui ÉCHOUE ne s’inscrit pas', () => {
  it('le directeur reste « non prévenu », donc la prochaine soumission retentera', async () => {
    // Marquer « prévenu » sur un échec le rendrait muet pour toujours : la
    // soumission suivante le croirait informé. Une école sans SMTP produit des
    // TENTATIVES, pas des courriels — aucune inondation.
    const { svc, db, etat } = service({ ...BROUILLON, notifiedDirectorId: null }, false);
    const r = await svc.soumettre(db, 'd1', 'etu');

    expect(r.notification).toMatchObject({ sent: false });
    expect(etat.notifiedDirectorId).toBeNull();
  });
});

describe('⚠ LE RETRAIT PRÉVIENT TOUJOURS — et l’asymétrie est délibérée', () => {
  /**
   * ⚠ LA RÈGLE DE SILENCE PORTE SUR LES NOTIFICATIONS DE SOUMISSION, PAS SUR
   * LES TROIS. Le retrait est le seul des trois qui RETIRE quelque chose de la
   * liste du directeur : quelqu'un qui a commencé à lire un mémoire retiré perd
   * son temps sans le savoir, et rien d'autre ne le lui dira.
   *
   * ⚠ Sans ce test, la première « simplification » qui unifie les trois chemins
   * rendra ce retrait muet — et l'unification se lira comme du rangement.
   */
  it('un retrait prévient, même quand le directeur avait DÉJÀ été prévenu', async () => {
    const { svc, db } = service({
      ...BROUILLON,
      status: 'soumis',
      notifiedDirectorId: DIRECTEUR,
    });
    const r = await svc.retirer(db, 'd1', 'etu');
    expect(r.notification).toEqual({ sent: true });
  });

  it('⚠ et il n’EFFACE PAS `notifiedDirectorId` — sinon la resoumission redeviendrait bruyante', async () => {
    // C'est le piège symétrique : remettre la colonne à null au retrait paraît
    // « propre » et annule exactement la règle qu'on vient de poser.
    const { svc, db, etat } = service({
      ...BROUILLON,
      status: 'soumis',
      notifiedDirectorId: DIRECTEUR,
    });
    await svc.retirer(db, 'd1', 'etu');
    expect(etat.notifiedDirectorId).toBe(DIRECTEUR);
  });
});
