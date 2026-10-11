/**
 * 🔴 L'ADRESSE ET L'IDENTIFIANT SONT SERVIS POUR TOUJOURS — tous les deux.
 *
 * ## ⚠ LE GESTE QUI VIOLERA CE GARDE, ET POURQUOI IL SERA RAISONNABLE
 *
 * Quelqu'un reprendra la fiche publique et verra deux champs qui désignent la
 * même notice. Il en retirera un — « l'adresse suffit, l'identifiant est
 * redondant », ou l'inverse. Ce geste est naturel, il paraît être un nettoyage,
 * et **il n'échouerait nulle part** : mesuré le 11 octobre 2026, un retrait
 * COHÉRENT (le contrat, le service, le relevé d'ordre) laisse les 137 cas de
 * l'OPAC au vert.
 *
 * ## 🔴 CE QUE ÇA CASSERAIT, ET QUI NE SE REPREND PAS
 *
 * Ces deux valeurs sont **publiées HORS du produit** :
 *
 * · `publicUrl` est encodée dans les QR **imprimés sur les étiquettes collées
 *   dans les livres**. Un fonds entier d'étiquettes ne se réimprime pas ;
 * · `identifiantPerenne` est publié depuis P4-3 dans les en-têtes OAI et dans
 *   `dc:identifier` — **des moissonneurs extérieurs l'ont peut-être stocké**.
 *
 * ⚠ Et elles ne sont PAS redondantes, c'est tout l'objet de les servir toutes
 * les deux : « une URL dit OÙ trouver, aujourd'hui ; un identifiant dit QUOI,
 * pour toujours ». L'URL meurt au prochain déménagement de serveur ;
 * l'identifiant ne porte aucun domaine et y survit. Les confondre est ce qui
 * fait mourir la moitié des liens d'un catalogue après une migration.
 *
 * ## ⭐ CE QUE CE GARDE FAIT QUE LE CONTRAT GELÉ NE FAIT PAS
 *
 * `COLONNES_SERVIES` garantit la COHÉRENCE — que la réponse porte exactement
 * ce qui est déclaré. Elle ne garantit pas la PERMANENCE : retirer une clé des
 * deux côtés reste cohérent. Ce fichier NOMME les deux champs, et c'est la
 * seule chose qui les rende impossibles à retirer en silence.
 */
import { describe, expect, it } from 'vitest';
import { CLES_DU_CONTRAT } from './contrat-notice-publique';

/**
 * ⚠ NOMMÉS ICI, EN DUR, et ce n'est pas une duplication : les dériver du
 * contrat ferait SUIVRE ce garde à n'importe quelle dérive du code qu'il
 * mesure. « C'est un relevé, pas un miroir. »
 */
const SERVIS_POUR_TOUJOURS = ['publicUrl', 'identifiantPerenne'] as const;

const MOTIF =
  'Ce champ est publié HORS du produit — `publicUrl` est encodée dans les QR ' +
  'IMPRIMÉS sur les étiquettes des livres, `identifiantPerenne` est publié ' +
    'depuis P4-3 aux moissonneurs OAI, et `shortUrl` est celle que les ' +
    '\u00c9TIQUETTES encodent r\u00e9ellement. Aucun des trois ne se reprend\u00a0: un ' +
    'fonds d\u2019\u00e9tiquettes ne se r\u00e9imprime pas, et un identifiant stock\u00e9 ' +
    'chez un tiers ne s\u2019efface pas.\\n' +
  '⚠ Et ils ne sont PAS redondants : une URL dit OÙ trouver aujourd’hui, un ' +
  'identifiant dit QUOI pour toujours. L’URL meurt au prochain déménagement de ' +
  'serveur ; l’identifiant n’y survit que parce qu’il ne porte aucun domaine.';

describe('🔴 Les deux formes d’adressage restent servies', () => {
  for (const champ of SERVIS_POUR_TOUJOURS) {
    it(`🔴 \`${champ}\` est au contrat de la fiche publique`, () => {
      expect(CLES_DU_CONTRAT, `${champ} a disparu du contrat.\n${MOTIF}`).toContain(
        champ,
      );
    });
  }

  it('⚠ et ils sont les TROIS DERNIERS — une clé neuve s’ajoute après eux', () => {
    // Le filet qui compare des octets doit lire un AJOUT, jamais une
    // permutation. Si quelqu'un insère un champ au milieu, ce test le dit.
    const n = CLES_DU_CONTRAT.length;
    expect(
      [CLES_DU_CONTRAT[n - 3], CLES_DU_CONTRAT[n - 2], CLES_DU_CONTRAT[n - 1]],
      'les trois formes d\u2019adressage doivent rester en fin de contrat',
    ).toEqual(['publicUrl', 'identifiantPerenne', 'shortUrl']);
  });

  it('⚠ TÉMOIN : le contrat n’est pas vide — sinon ce garde ne mesure rien', () => {
    // ⚠ ET LE NOM DE LA LISTE A ÉTÉ MESURÉ, PAS DEVINÉ. J'avais écrit
    // `COLONNES_SERVIES` — le premier export plausible — qui liste les
    // COLONNES lues en base (21), pas les clés de la RÉPONSE (30). Le garde
    // était rouge sur un code sain, et il accusait le produit.
    expect(CLES_DU_CONTRAT.length).toBeGreaterThan(25);
  });
});
