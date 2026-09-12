/**
 * LE RECOURS D'UN COMPTE EN ATTENTE — `/inscription`, 12 septembre 2026.
 *
 * ⚠ Trouvé en appliquant la question de recherche des états d'attente : « qui
 * est prévenu, par quel canal, et que voit la personne si ce canal se tait ? »
 *
 * `register` notifie les gestionnaires, et l'issue de cet envoi est JOURNALISÉE
 * PUIS AVALÉE côté API — le cas `aucun_destinataire` (une école sans
 * gestionnaire actif) est explicitement reconnu dans le code, et n'atteint
 * jamais la réponse. L'écran ne peut donc pas savoir.
 *
 * ⚠ DEUX SILENCES QUI SE CUMULENT. Que personne ne soit prévenu est rattrapable
 * si l'écran le dit ; que l'écran l'ignore est rattrapable si quelqu'un est
 * prévenu. Ensemble, l'inscrit attend indéfiniment une activation que personne
 * n'a été invité à faire — et il n'a AUCUN autre canal : il n'a pas de compte.
 *
 * On ne peut pas rendre la phrase vraie. On lui donne une SORTIE.
 */

import { describe, expect, it } from 'vitest';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.inscription;

describe('Compte en attente · le texte donne une SORTIE', () => {
  it('⚠ il NOMME où aller si rien ne vient', () => {
    // Sa propriété, pas sa valeur. « Votre compte est en attente. » serait exact
    // et sans issue — c'est précisément ce qu'on refuse depuis l'épisode du
    // lien de mot de passe.
    expect(LIBELLES.inscription.enAttenteSuite).toMatch(/bibliothèque/i);
    expect(LIBELLES.inscription.enAttenteSuite).toMatch(/présentez|rendez-vous/i);
  });

  it('⚠ il dit qu’il NE PEUT PAS confirmer que la demande a été signalée', () => {
    // C'est la moitié qui coûte le plus cher à écrire et qui vaut le plus :
    // avouer l'ignorance plutôt que d'affirmer un effet qu'on ne mesure pas.
    expect(LIBELLES.inscription.enAttenteSuite).toMatch(/ne pouvons pas|pas vous confirmer/i);
  });

  it('⚠ il nomme le délai au-delà duquel il faut bouger', () => {
    // Sans borne, « si rien ne vient » n'est pas actionnable : on attend
    // toujours un jour de plus.
    expect(LIBELLES.inscription.enAttenteSuite).toMatch(/jours|semaine/i);
  });

  it('l’acteur qui doit agir est nommé, dans les deux profils', () => {
    expect(T.enAttenteEtudiant).toMatch(/gestionnaire/i);
    expect(T.enAttentePersonnel).toMatch(/gestionnaire/i);
  });
});
