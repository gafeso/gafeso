/**
 * CE QU'IL FAUT POUR POSER DU TEXTE FRANÇAIS DANS UN PDF `pdf-lib`.
 *
 * ## Pourquoi ce module existe
 *
 * Deux générateurs en ont besoin — le guide d'utilisation et les documents de
 * démonstration — et ces deux fonctions-là sont exactement celles qu'on
 * recopie : un découpage de mots et un assainissement d'encodage. « Deux
 * tableaux qui se ressemblent ne sont pas le même tableau » dit de vérifier
 * qu'ils décrivent la même chose avant de fondre ; ici c'est le cas, et la
 * preuve en est le PIÈGE qu'ils partagent.
 *
 * ## 🔴 LE PIÈGE : `pdf-lib` LÈVE sur ce que WinAnsi ne sait pas encoder
 *
 * Les polices standard d'un PDF emploient WinAnsi. Il porte les accents
 * français, les guillemets, le tiret cadratin, l'œ — mais pas les flèches, ni
 * les pictogrammes. Un `→` dans un texte fait échouer la génération ENTIÈRE,
 * pas la ligne. Et c'est la bonne manière d'échouer : `pdf-lib` ne remplace
 * rien en silence.
 */

/**
 * Ce que WinAnsi ne porte pas, et par quoi on le remplace EN TEXTE.
 *
 * ⚠ CETTE LISTE A ÉTÉ MESURÉE, PAS DEVINÉE — et ma première rédaction
 * DÉGRADAIT la typographie française pour rien. J'y avais mis `’`, `“ ”`, `–`,
 * `—`, `•` et `·`, en supposant qu'un codage d'il y a trente ans ne les
 * porterait pas. Soumis à la police : **tous ACCEPTÉS**. Les remplacer aurait
 * transformé « l’auteur » en « l'auteur » dans un document montré à un client.
 *
 * Ce qui est réellement REFUSÉ, vérifié caractère par caractère :
 * `′` (U+2032), les flèches, les pictogrammes, le semi-graphique.
 */
const HORS_WINANSI = [
  [/→/g, '->'],
  [/←/g, '<-'],
  [/[↓↑]/g, '|'],
  [/[─━│┃┌┐└┘├┤┬┴┼]/g, '-'],
  // ⚠ `―` (U+2015, barre horizontale) N'EST PAS `—` (U+2014, tiret cadratin).
  // Deux caractères qui s'affichent à l'identique, et un seul est encodable.
  // Trouvé en soumettant le CORPUS ENTIER, ligne par ligne, à la police : une
  // seule ligne sur 256 le portait — et elle aurait fait échouer la génération
  // d'un document entier, pas la ligne.
  [/[―⸺⸻]/g, '—'],
  [/″/g, '"'],
  [/′/g, "'"],
];

/** Emoji et pictogrammes : retirés, pas remplacés — ils ne DISENT rien ici. */
const PICTOGRAMMES = /[←-➿⬀-⯿️\u{1F000}-\u{1FAFF}]/gu;

/**
 * Rend une chaîne encodable en WinAnsi.
 *
 * ⚠ L'ordre compte : on traduit D'ABORD ce qui a un équivalent lisible, on
 * retire ENSUITE ce qui n'en a pas. L'inverse effacerait les flèches avant de
 * les traduire.
 */
export function pourWinAnsi(texte) {
  let t = String(texte ?? '');
  for (const [motif, remplacement] of HORS_WINANSI) t = t.replace(motif, remplacement);
  t = t.replace(PICTOGRAMMES, '');
  // L'espace fine insécable n'est pas dans WinAnsi ; l'insécable ordinaire si.
  return t.replace(/[  ]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Découpe un texte en lignes qui tiennent dans `largeur`.
 *
 * ⚠ Un mot plus long que la colonne est COUPÉ plutôt que laissé déborder : une
 * URL ou un mot composé déborderait de la page, et un débordement ne se voit
 * que sur le PDF fini.
 */
export function decouper(texte, font, taille, largeur) {
  const lignes = [];
  let courante = '';
  for (const mot of String(texte).split(' ')) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (font.widthOfTextAtSize(essai, taille) <= largeur) {
      courante = essai;
      continue;
    }
    if (courante) lignes.push(courante);
    if (font.widthOfTextAtSize(mot, taille) > largeur) {
      let reste = mot;
      while (font.widthOfTextAtSize(reste, taille) > largeur) {
        let i = reste.length;
        while (i > 1 && font.widthOfTextAtSize(reste.slice(0, i), taille) > largeur) i -= 1;
        lignes.push(reste.slice(0, i));
        reste = reste.slice(i);
      }
      courante = reste;
    } else {
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}
