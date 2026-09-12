/**
 * CE QUI EST RÉELLEMENT ARRIVÉ À UN ENVOI D'EMAIL.
 *
 * ⚠ DÉPLACÉ ICI LE 12 SEPTEMBRE 2026, depuis `accounts.service.ts`. Le type
 * décrit désormais le contrat de `MailService` lui-même, et `MailService` ne
 * peut pas importer depuis `accounts.service` — qui l'importe. Le type vit donc
 * à côté du service qui le produit, et `accounts.service` le ré-exporte pour ne
 * casser aucun import existant.
 *
 * ## Pourquoi ce type est obligatoire partout, et pas seulement utile
 *
 * `MailService.send()` traitait « SMTP absent » comme un envoi RÉUSSI : pas de
 * transporteur, une ligne de journal, et un retour normal. C'était un no-op
 * délibéré, pour que le développement n'exige pas de serveur de courriel — et
 * chaque appelant rapportait ensuite ce silence comme un succès.
 *
 * Trois mensonges en découlaient, tous mesurés le 12 septembre 2026 :
 *
 * | Où | Ce qui était affirmé | La vérité quand SMTP est absent |
 * |---|---|---|
 * | `POST /auth/login/2fa/email` | `{ sent: true }` | rien n'est parti, et c'est le REPLI de double authentification : quelqu'un qui a perdu son appareil TOTP est enfermé dehors par un faux « envoyé » |
 * | moteur de rappels | `reminderLog.status = 'SENT'` | rien n'est parti, et le mensonge est PERSISTÉ puis affiché dans les statistiques |
 * | notification de réservation | `sent += 1`, `notifiedAt` conservé | le lecteur n'est jamais prévenu que son document l'attend |
 *
 * Le plus grave des trois est le premier, parce qu'il ferme la seule porte qui
 * reste à quelqu'un déjà enfermé dehors.
 */
export type MailOutcome =
  | { sent: true }
  | {
      sent: false;
      /**
       * `smtp_absent` — aucun transporteur configuré : rien n'est PARTI, et
       *   rien ne partira tant que la configuration ne change pas.
       * `smtp_error` — le serveur a refusé : un nouvel essai a du sens.
       * `aucun_destinataire` — il n'y avait personne à qui écrire.
       *
       * ⚠ `aucun_destinataire` A ÉTÉ AJOUTÉ LE 12 SEPTEMBRE 2026, et c'est le
       * COMPILATEUR qui l'a exigé. `notifyManagerPendingAccount` rendait
       * silencieusement `undefined` quand l'école n'a aucun gestionnaire actif :
       * un étudiant s'inscrivait hors liste, son compte passait en attente, et
       * personne n'était prévenu — le compte attendait indéfiniment, avec pour
       * seule trace un avertissement dans le journal du serveur.
       *
       * Le front branche sur `smtp_absent` puis retombe sur une phrase générique
       * d'échec : ce troisième motif y est donc déjà dit honnêtement (vérifié
       * dans `admin/comptes/page.tsx` et `inscription/page.tsx`).
       */
      reason: 'smtp_absent' | 'smtp_error' | 'aucun_destinataire';
      detail?: string;
    };

/**
 * ⚠ `detail` NE SORT PAS SUR UNE SURFACE PRÉ-AUTHENTIFIÉE.
 *
 * Il porte le message d'erreur du serveur SMTP — utile à un gestionnaire qui
 * diagnostique, mais c'est de la configuration d'infrastructure. Sur
 * `POST /auth/login/2fa/email`, l'appelant n'a franchi que l'étape du mot de
 * passe : il n'est pas authentifié. Le motif lui suffit pour savoir quoi faire
 * (« réessayez » ou « contactez votre bibliothèque ») ; le détail va au journal.
 */
export function sansDetail(resultat: MailOutcome): MailOutcome {
  return resultat.sent ? { sent: true } : { sent: false, reason: resultat.reason };
}
