/**
 * ⭐ LA CORRESPONDANCE DES ISSUES DE RÉCOLEMENT — cinq côté serveur, trois
 * côté application, et ce n'est PAS une perte d'information.
 *
 * Le service rend cinq issues (`SEEN`, `ALREADY`, `UNKNOWN`, `OUT_OF_SCOPE`,
 * `ON_LOAN`). L'application, elle, n'a que trois gestes à proposer : cocher,
 * signaler ailleurs, signaler inconnu. Elle n'a donc besoin que de trois
 * CLASSES — et de la PHRASE qui dit laquelle des cinq c'était.
 *
 * ⚠ C'est pour cela que `message` existe dans le contrat : sans lui, réduire
 * cinq à trois perdrait vraiment quelque chose. Avec lui, la classe pilote le
 * geste et la phrase dit le fait — la même division que `disponibilite` et
 * `echeance` dans le scan.
 *
 * ⚠ ET LA CLASSE NE SE DEVINE PAS DU NOM. `ON_LOAN` n'est PAS « inconnu » : le
 * livre est sorti, légitimement, et un récolement qui le compterait manquant
 * ferait chercher un exemplaire qui est chez un lecteur. C'est « ailleurs ».
 */
export const CLASSES_DE_RECOLEMENT = ['vu', 'ailleurs', 'inconnu'] as const;
export type ClasseDeRecolement = (typeof CLASSES_DE_RECOLEMENT)[number];

/**
 * ⚠ TOUTES les issues du service sont ici, et le type l'IMPOSE : `Record<…>`
 * sur l'union refuse de compiler s'il en manque une. Une issue ajoutée demain
 * ne peut donc pas tomber silencieusement dans un défaut.
 */
const CLASSE: Record<'SEEN' | 'ALREADY' | 'UNKNOWN' | 'OUT_OF_SCOPE' | 'ON_LOAN', ClasseDeRecolement> =
  {
    SEEN: 'vu',
    // ⚠ Déjà scanné reste « vu » : le récolement est juste, c'est le geste qui
    // est en double. La phrase le dit pour éviter un second passage inutile.
    ALREADY: 'vu',
    // ⚠ Sorti en prêt : ce n'est PAS un manquant. Le compter comme tel ferait
    // chercher un livre qui est chez un lecteur.
    ON_LOAN: 'ailleurs',
    OUT_OF_SCOPE: 'ailleurs',
    UNKNOWN: 'inconnu',
  };

const PHRASE: Record<keyof typeof CLASSE, string> = {
  SEEN: 'Exemplaire vu et coché',
  ALREADY: 'Déjà scanné pendant cette session — rien de plus à faire',
  ON_LOAN: 'Sorti en prêt : il n’est pas censé être sur l’étagère',
  OUT_OF_SCOPE: 'Hors du périmètre de cette session',
  UNKNOWN: 'Code-barres inconnu de ce catalogue',
};

export function blocInventaire(resultat: keyof typeof CLASSE, codeBarre: string) {
  return { resultat: CLASSE[resultat], codeBarre, message: PHRASE[resultat] };
}
