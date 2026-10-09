import { describe, expect, it, vi } from 'vitest';
import {
  SANS_AUTEUR,
  USAGE_CONSULTATION,
  USAGE_TELECHARGEMENT,
  UsageService,
} from './usage.service';

/**
 * ⚠ CE QU'ON COMPTE, ET CE QU'ON NE COMPTE JAMAIS.
 *
 * *P8-1, 15 septembre 2026.*
 *
 * Deux propriétés sont éprouvées ici, et la seconde est la plus importante :
 * la ligne écrite ne porte AUCUN identifiant d'utilisateur, et l'échec du
 * comptage ne remonte JAMAIS à l'appelant.
 */
describe('UsageService — compter sans jamais gêner', () => {
  const faux = (create = vi.fn().mockResolvedValue({})) => ({
    db: { usageEvent: { create } } as never,
    create,
  });

  it('écrit une ligne, avec le document, le type et l’auteur', async () => {
    const { db, create } = faux();
    expect(
      await new UsageService().enregistrer(db, 'rec-1', USAGE_CONSULTATION, {
        userId: 'u-1',
        className: 'L2_INFO',
      }),
    ).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({
      data: { recordId: 'rec-1', kind: 'CONSULTATION', userId: 'u-1', className: 'L2_INFO' },
    });
  });

  it('⭐ LE TÉMOIN PRÉCÉDENT A ÉCRIT SON PROPRE RETOURNEMENT, et il avait raison', async () => {
    // Ce fichier portait, depuis le 15 septembre 2026 :
    //
    //   « ⚠ AUCUNE DONNÉE PERSONNELLE dans la charge écrite. Une assertion sur
    //     la FORME de la charge, et pas sur l'intention. Le jour où quelqu'un
    //     ajoutera `userId` "pour dédupliquer", ce test tombera — c'est le seul
    //     endroit qui s'en souviendra. »
    //
    // ⭐ IL EST TOMBÉ, EXACTEMENT COMME ÉCRIT, le 6 octobre 2026 — et il a servi :
    // il a obligé à venir ici écrire POURQUOI la décision a changé, au lieu de
    // laisser le champ apparaître dans un diff que personne ne relit.
    //
    // ⚠ Et le motif de l'ajout n'est PAS celui qu'il redoutait (« pour
    // dédupliquer »). C'est une décision de produit, prise par Jean le 6 octobre
    // pour le profil « bibliothèque numérique » : sans auteur, l'étudiant ne peut
    // pas voir SES consultations et l'établissement ne peut pas répartir par
    // filière. Une université virtuelle n'a que cette mesure.
    //
    // ⭐ LE COMPROMIS A DONC CHANGÉ DE PLACE : il n'est plus dans la COLLECTE,
    // il est dans la RÉTENTION — douze mois, puis le nom tombe et la ligne
    // reste. C'est ce que les deux tests suivants gardent.
    const { db, create } = faux();
    await new UsageService().enregistrer(db, 'rec-1', USAGE_TELECHARGEMENT, {
      userId: 'u-1',
      className: 'L2_INFO',
    });
    const charge = create.mock.calls[0][0].data as Record<string, unknown>;
    // La charge porte EXACTEMENT ces quatre champs, et pas un de plus.
    expect(Object.keys(charge).sort()).toEqual(['className', 'kind', 'recordId', 'userId']);
    // ⚠ Témoin d'ABSENCE sur ce que le compromis EXCLUT toujours : ce qui
    // identifierait au-delà du compte, ou suivrait quelqu'un hors de l'école.
    for (const interdit of ['ip', 'email', 'userAgent', 'sessionId', 'patronId']) {
      expect(charge, interdit).not.toHaveProperty(interdit);
    }
  });

  it('⚠ SANS AUTEUR quand il n’y en a pas — et ce n’est pas la même chose qu’une purge', async () => {
    const { db, create } = faux();
    await new UsageService().enregistrer(db, 'rec-1', USAGE_CONSULTATION, SANS_AUTEUR);
    const charge = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(charge.userId).toBeNull();
    expect(charge.className).toBeNull();
    // ⚠ `anonymiseLe` n'est PAS posé : la ligne n'a jamais eu de nom, elle n'a
    // pas été purgée. Confondre les deux ferait croire une purge là où il n'y a
    // jamais eu personne à nommer.
    expect(charge).not.toHaveProperty('anonymiseLe');
  });

  it('⚠ l’auteur est FACULTATIF à l’appel, et l’absence vaut SANS_AUTEUR', async () => {
    const { db, create } = faux();
    await new UsageService().enregistrer(db, 'rec-1', USAGE_CONSULTATION);
    expect(create.mock.calls[0][0].data).toEqual({
      recordId: 'rec-1',
      kind: 'CONSULTATION',
      userId: null,
      className: null,
    });
  });

  it('⚠ un échec d’écriture NE REMONTE PAS — lire passe avant compter', async () => {
    // Perdre une ligne de statistiques ne doit jamais empêcher quelqu'un de
    // lire sa thèse. Le contrôle porte sur ce que l'appelant OBSERVE : pas de
    // rejet, et un `false` qui le dit.
    const { db } = faux(vi.fn().mockRejectedValue(new Error('base injoignable')));
    await expect(new UsageService().enregistrer(db, 'rec-1', USAGE_CONSULTATION)).resolves.toBe(false);
  });

  it('⚠ le vocabulaire est fermé à DEUX valeurs, et la notice n’en fait pas partie', () => {
    // La consultation d'une fiche n'est pas collectée : une écriture par
    // affichage, robots d'indexation compris. Ce témoin de COMPTE oblige à
    // revenir ici le jour où quelqu'un en ajoute une troisième.
    expect([USAGE_CONSULTATION, USAGE_TELECHARGEMENT]).toEqual(['CONSULTATION', 'TELECHARGEMENT']);
    // ⚠ TÉMOIN SUR LE MOT INTERDIT. Jean, 6 octobre 2026 : « Libellés :
    // consultations en ligne, téléchargements. Jamais lectures. » Et le mot
    // était faux au fond : on mesure la délivrance d'une URL, pas qu'un document
    // ait été lu. Ce témoin empêche qu'il revienne par la donnée.
    expect([USAGE_CONSULTATION, USAGE_TELECHARGEMENT]).not.toContain('LECTURE');
  });
});
