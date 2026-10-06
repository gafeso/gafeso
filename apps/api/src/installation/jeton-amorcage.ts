/**
 * LE JETON D'AMORÇAGE — le seul secret qui protège une instance neuve.
 *
 * ## ⚠ CE QU'IL NE DOIT JAMAIS FAIRE : apparaître dans une sortie qu'on colle
 *
 * Question posée par Jean le 6 octobre 2026 : « un journal partagé sur un forum
 * le publierait ». Elle est juste, et elle ne se règle pas par une consigne —
 * l'installateur qui demande de l'aide colle ce qu'il a sous la main. Cinq
 * mécanismes, et le troisième est celui qui compte :
 *
 * ① **Il ne sort JAMAIS sur la sortie standard, ni dans le journal.** Ce
 *    fichier n'a aucun chemin qui passe le clair à un `Logger`, et
 *    `jeton-jamais-divulgue.spec.ts` le mesure par l'EFFET : il engendre un
 *    jeton, fait tourner le flux, et vérifie que le clair n'est dans AUCUNE
 *    ligne de journal, AUCUN corps de réponse, AUCUNE colonne de la base.
 *    Ce qui s'imprime est le CHEMIN du fichier — et un chemin se colle sans
 *    danger.
 *
 * ② **Il n'est jamais dans une URL.** Les routes de l'assistant le prennent en
 *    CORPS de requête. Une URL voyage dans l'historique du navigateur, dans
 *    l'en-tête `Referer`, et dans le journal d'accès de Caddy — trois endroits
 *    que personne ne pense à nettoyer, et dont deux sont des fichiers que
 *    l'exploitant partage pour demander de l'aide.
 *
 * ③ ⭐ **IL EST À USAGE UNIQUE, ET CONSOMMÉ DANS LA TRANSACTION QUI INSTALLE.**
 *    C'est le seul mécanisme qui résiste à une divulgation : une fois
 *    l'installation terminée, le jeton ne vaut plus rien. **La fenêtre de fuite
 *    est donc exactement la fenêtre d'installation** — et un installateur qui
 *    demande de l'aide sur un forum a, par construction, déjà fini ou pas
 *    commencé.
 *
 *    ⚠ Le risque RÉSIDUEL est nommé et il est réel : un jeton divulgué PENDANT
 *    l'installation, avant son premier usage, est une course perdue. C'est
 *    pourquoi ⑤ existe.
 *
 * ④ **Le fichier est effacé par l'API** quand l'installation se termine. Un
 *    secret périmé qui traîne est le défaut mesuré du 9 septembre — un jeton
 *    fabriqué « pour deux heures » retrouvé deux jours plus tard dans un profil
 *    de navigateur.
 *
 * ⑤ **Et le fichier DIT, en première ligne, de ne pas coller son contenu.**
 *    C'est une promesse et pas un mécanisme — elle est donc placée là où le
 *    risque vit vraiment : sous les yeux de celui qui va chercher de l'aide, au
 *    moment où il ouvre le fichier. Les quatre mécanismes au-dessus la rendent
 *    presque inutile ; « presque » est la raison de l'écrire.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Où le clair est déposé. Surchargeable pour les recettes. */
export function cheminDuJeton(): string {
  return process.env.GAFESO_JETON_INSTALLATION_FICHIER?.trim() ||
    join(process.env.GAFESO_ETAT_DIR?.trim() || '/app/etat', 'jeton-installation.txt');
}

export function hacher(jetonClair: string): string {
  return createHash('sha256').update(jetonClair, 'utf-8').digest('hex');
}

/**
 * Compare deux empreintes en temps CONSTANT.
 *
 * ⚠ Un `===` sur des empreintes fuit, par son temps de retour, la longueur du
 * préfixe commun. Sur un SHA-256 l'exploitation est théorique ; la forme juste
 * ne coûte rien, et c'est la forme qu'on relira ailleurs.
 */
export function empreintesEgales(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf-8');
  const bb = Buffer.from(b, 'utf-8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Engendre un jeton, écrit le CLAIR dans un fichier 0600, et ne rend que son
 * empreinte et le chemin.
 *
 * ⚠ Le clair n'est PAS rendu : l'appelant ne peut donc pas le journaliser même
 * par distraction. C'est « changez le TYPE pour que la faute soit impossible »
 * appliqué à un secret — le compilateur n'a rien à offrir ici, mais la signature
 * si.
 */
export function engendrerJeton(): { empreinte: string; chemin: string } {
  const clair = randomBytes(32).toString('base64url');
  const chemin = cheminDuJeton();
  writeFileSync(
    chemin,
    [
      '# JETON D’INSTALLATION DE CETTE INSTANCE GAFESO',
      '#',
      '# ⚠ NE COLLEZ JAMAIS LE CONTENU DE CE FICHIER ailleurs — ni sur un forum,',
      '#   ni dans un ticket, ni dans une conversation. Pour demander de l’aide,',
      '#   donnez le CHEMIN de ce fichier, jamais sa valeur.',
      '#',
      '# Il ouvre l’assistant d’installation, UNE SEULE FOIS. Il est effacé',
      '# automatiquement dès que l’installation est terminée.',
      '',
      clair,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  // ⚠ `writeFileSync(mode)` n'abaisse PAS les droits d'un fichier qui existait
  // déjà — il n'applique le mode qu'à la création. Un `chmod` explicite suit.
  chmodSync(chemin, 0o600);
  return { empreinte: hacher(clair), chemin };
}

/** Efface le clair. Appelé quand l'installation se termine. */
export function effacerLeJeton(): void {
  const chemin = cheminDuJeton();
  if (existsSync(chemin)) rmSync(chemin, { force: true });
}
