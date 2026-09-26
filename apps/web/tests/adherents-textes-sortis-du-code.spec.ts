/**
 * AUCUN ÉCRAN NEUF NE CONTIENT DE TEXTE VISIBLE EN DUR.
 *
 * ⚠ CE GARDE PARTAIT D'UNE LISTE TENUE À LA MAIN — deux fichiers, ceux de
 * l'écran des adhérents. Mesuré le 22 septembre 2026 : **49 écrans, dont 16
 * créés depuis la convention du 10 septembre, et 2 couverts.** Les quatorze
 * autres n'échappaient pas au garde par décision : personne n'avait allongé la
 * liste.
 *
 * ⭐ LA POPULATION EST DÉSORMAIS ÉNUMÉRÉE, et « neuf » se MESURE — la date de
 * création du fichier, lue dans git — au lieu de se juger. Une liste écrite à
 * la main est une déclaration en prose sur un artefact qu'on ne compile pas :
 * elle SERA fausse, et celle-ci l'était de quatorze quinzièmes.
 *
 * ⚠ ET LE GARDE A MORDU EN NAISSANT, sur l'écran que je venais d'écrire le jour
 * même : deux replis (« Enregistrement impossible. », « Suppression
 * impossible. ») écrits en dur quelques heures après avoir versé deux leçons
 * sur les textes sortis du code. Connaître la règle n'empêche pas de commettre
 * la faute ; l'énumérer, si.
 *
 * ── L'énoncé d'origine ──────────────────────────────────────────────────────
 * L'écran des adhérents ne contient AUCUN texte visible en dur.
 *
 * ⚠ La convention (CLAUDE.md, 10 septembre 2026) ne s'applique qu'au NEUF, et
 * cet écran est neuf : il y est donc soumis entièrement. Mais une convention
 * énoncée se contourne — la première chaîne écrite « juste pour aller vite »
 * passera à la relecture, et la suivante s'appuiera dessus.
 *
 * Le test lit les fichiers de l'écran et refuse toute chaîne de caractères qui
 * ressemble à une phrase destinée à un humain. Il tolère ce qui n'en est pas :
 * chemins, classes CSS, identifiants d'API, valeurs de formulaire.
 *
 * ⚠ Il ne remplace pas la relecture, il attrape ce qu'elle laisse passer.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * La convention date du 10 septembre 2026 et ne vaut que pour le NEUF : on ne
 * reprend pas l'existant pour ça (CLAUDE.md). « Neuf » se MESURE donc — la date
 * à laquelle git a vu le fichier apparaître — et ne se juge pas.
 */
const CONVENTION = '2026-09-10';

/** Tous les écrans de `app/`, énumérés par le disque. */
function ecransSurLeDisque(): string[] {
  const trouves: string[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(join(process.cwd(), rel), { withFileTypes: true })) {
      if (e.isDirectory()) parcourir(join(rel, e.name));
      else if (e.name === 'page.tsx' || e.name.endsWith('-notice.tsx')) trouves.push(join(rel, e.name));
    }
  };
  parcourir('app');
  return trouves.sort();
}

/** La date d'APPARITION du fichier, vue par git. Vide si git ne la connaît pas. */
function dateDeCreation(chemin: string): string {
  const sortie = execFileSync(
    'git',
    ['log', '--diff-filter=A', '--format=%ad', '--date=short', '--', chemin],
    { cwd: process.cwd(), encoding: 'utf-8' },
  ).trim();
  const lignes = sortie.split('\n').filter(Boolean);
  return lignes[lignes.length - 1] ?? '';
}

/**
 * ⚠ DETTE DÉCLARÉE, DATÉE, ET REFUSÉE DANS LES DEUX SENS — 22/09/2026.
 *
 * Quatre écrans créés après la convention portent encore des textes en dur.
 * Ils ne sont pas exemptés : ils sont NOMMÉS, avec ce qu'ils portent. Un
 * cinquième qui apparaîtrait ferait échouer le test ; l'un de ces quatre
 * corrigé le ferait aussi, et c'est voulu — une dette qui ne se rappelle qu'en
 * s'aggravant laisserait passer sa propre résolution.
 *
 * ⚠ Ils ne sont pas corrigés ici parce que ce lot en a déjà un : celui que je
 * venais d'écrire. Les reprendre dans le même tour mêlerait une correction
 * mesurée à quatre reprises non mesurées.
 */
const DETTE_TEXTES_EN_DUR: string[] = [
  // ✅ VIDÉE LE 22 SEPTEMBRE 2026, le jour même où elle a été déclarée.
  //
  // Les quatre écrans portaient 18 chaînes, dont 14 étaient des REPLIS
  // (« Chargement impossible. », « Soumission impossible. »…) : les seuls
  // textes que l'utilisateur lit quand tout va mal, et ceux que personne ne
  // relit jamais puisqu'ils ne s'affichent qu'au pire moment.
  //
  // ⚠ Et l'une des quatre n'était PAS une chaîne oubliée : `mes-encadrements`
  // portait la table du vocabulaire de `recordType`, DISTINCTE de
  // `typesDeDepot` — cinq valeurs académiques d'un côté, tout le catalogue de
  // l'autre. Les fondre ferait apparaître « Ouvrage » dans un menu de dépôt de
  // thèse. Elle est sortie de l'écran SANS être fondue, et les deux tables
  // voisinent désormais dans `libelles.ts`, chacune avec sa note : le
  // rapprochement est visible, ce qui est exactement ce qui manquait pour
  // qu'on ne les confonde pas.
];

const FICHIERS = ecransSurLeDisque()
  .filter((f) => dateDeCreation(f) >= CONVENTION)
  .filter((f) => !DETTE_TEXTES_EN_DUR.includes(f));

/** Une chaîne littérale du source, avec sa ligne, hors imports et commentaires. */
function chainesLitterales(chemin: string): { ligne: number; valeur: string }[] {
  const source = readFileSync(join(process.cwd(), chemin), 'utf-8');
  const out: { ligne: number; valeur: string }[] = [];
  // ⚠ On suit l'ÉTAT « dans un commentaire » au lieu de juger chaque ligne pour
  // elle-même. Un commentaire JSX `{/* … */}` s'étale sur plusieurs lignes dont
  // les suivantes ne commencent par aucun marqueur : le détecteur y lisait de la
  // prose française, appariait les apostrophes de travers, et signalait
  // « était affiché plutôt qu » comme une phrase écrite en dur. Troisième fois
  // que cet instrument se trompe sur ce qu'il mesure.
  let dansCommentaire = false;
  source.split('\n').forEach((ligne, i) => {
    const nette = ligne.trim();
    if (dansCommentaire) {
      if (nette.includes('*/')) dansCommentaire = false;
      return;
    }
    if (nette.startsWith('{/*') || nette.startsWith('/*')) {
      if (!nette.includes('*/')) dansCommentaire = true;
      return;
    }
    if (nette.startsWith('//') || nette.startsWith('*')) return;
    if (nette.startsWith('import ')) return;
    // ⚠ Un balayage qui APPARIE les guillemets dans l'ordre, pas une expression
    // régulière. Sur `{ barcode: '', category: 'etudiant' }`, un motif
    // `'([^']+)'` repart du SECOND guillemet de la chaîne vide et invente une
    // chaîne « , category:  » qui n'existe pas. Le détecteur signalait alors du
    // code comme s'il s'agissait d'une phrase — un instrument qui fabrique ses
    // propres trouvailles est pire qu'un instrument aveugle.
    let j = 0;
    while (j < ligne.length) {
      const q = ligne[j];
      if (q !== "'" && q !== '"' && q !== '`') {
        j += 1;
        continue;
      }
      const fin = ligne.indexOf(q, j + 1);
      if (fin === -1) break;
      const valeur = ligne.slice(j + 1, fin);
      if (valeur.length >= 4) out.push({ ligne: i + 1, valeur });
      j = fin + 1;
    }
  });
  return out;
}

/**
 * Ce qui n'est PAS un texte destiné à un humain. La borne est la même que
 * celle de la convention : ce qui double un texte déjà visible, un chemin, un
 * identifiant technique, une classe CSS — jamais une phrase.
 */
function estTechnique(v: string): boolean {
  return (
    v.startsWith('/') || // chemins d'API et de routes
    v.startsWith('@/') ||
    /^[a-z-]+(\s+[a-z0-9:./[\]!-]+)*$/.test(v) === false // classes CSS : minuscules, tirets, deux-points
      ? /^[a-z]+\.[a-z]+$/.test(v) || // identifiants de fonctions (adherents.gerer)
        /^[A-Z0-9-]+$/.test(v) || // constantes, codes-barres d'exemple
        v === 'etudiant' ||
        /^(use client|POST|PATCH|DELETE|GET|date|button|submit|ghost|warning|error|success|ocre|text)$/.test(v)
      : true
  );
}

describe('l’instrument, avant ce qu’il mesure', () => {
  it('⚠ la population est ÉNUMÉRÉE, et elle n’est pas vide', () => {
    // Un relevé tombé à zéro rendrait toutes les assertions vraies sur rien.
    // 12 écrans neufs hors dette au 22 septembre 2026, sur 49 au total.
    expect(FICHIERS.length).toBeGreaterThan(8);
    // Témoin de PRÉSENCE : les deux écrans d'origine du garde y sont toujours.
    expect(FICHIERS).toContain('app/admin/adherents/page.tsx');
    // Témoin d'ABSENCE sur la confusion PLAUSIBLE : un écran ANTÉRIEUR à la
    // convention ne doit pas y entrer — la convention ne vaut que pour le neuf.
    expect(FICHIERS).not.toContain('app/login/page.tsx');
    // Et la dette déclarée est bien retirée de la population.
    for (const d of DETTE_TEXTES_EN_DUR) expect(FICHIERS).not.toContain(d);
  });

  it('⚠ la dette déclarée porte ENCORE ce qu’elle déclare', () => {
    // Refusée dans les DEUX sens : un écran corrigé doit sortir de la liste,
    // sinon on croit garder ce qui n'a plus lieu d'être gardé.
    const resolus = DETTE_TEXTES_EN_DUR.filter(
      (f) => chainesLitterales(f).filter(({ valeur }) => !estTechnique(valeur)).length === 0,
    );
    expect(
      resolus,
      'Ces écrans n’ont plus de texte en dur : retirez-les de DETTE_TEXTES_EN_DUR.',
    ).toEqual([]);
  });

  it('⚠ et git sait dater ce qu’il a vu apparaître', () => {
    // Si `dateDeCreation` rendait '' partout, le filtre garderait TOUT et le
    // garde crierait sur trente-trois écrans antérieurs à la convention.
    expect(dateDeCreation('app/admin/adherents/page.tsx')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('aucun écran neuf ne porte de texte visible en dur', () => {
  for (const fichier of FICHIERS) {
    it(`${fichier} : le fichier est bien lu`, () => {
      // Témoin : un chemin erroné rendrait une liste vide et l'assertion
      // suivante serait vraie sans rien avoir regardé.
      //
      // ⚠ LE SEUIL ÉTAIT À 10, calibré sur les deux grands écrans d'adhérents.
      // Appliqué à la population entière, il a crié sur `regles-de-pret`, qui
      // fait quarante lignes et six littéraux — un faux positif né d'un chiffre
      // juste ailleurs. Ce qu'on veut savoir est « ce fichier a-t-il été LU »,
      // pas « est-il gros » ; le volume se garde une fois, plus bas, sur la
      // population entière.
      expect(chainesLitterales(fichier).length).toBeGreaterThan(0);
    });

    it(`${fichier} : aucune phrase écrite en dur`, () => {
      const suspectes = chainesLitterales(fichier)
        .filter(({ valeur }) => !estTechnique(valeur))
        // Une phrase destinée à un humain contient une espace et une majuscule
        // ou un accent — le critère est grossier, et c'est voulu : il ne doit
        // pas manquer une phrase, quitte à demander une exception explicite.
        // ⚠ On juge le texte HORS interpolation. `` ` · ${T.validiteJusquau(d)}` ``
        // ne contient qu'un séparateur ; c'est le `T` de l'appel que le
        // détecteur prenait pour une majuscule de phrase. Un détecteur qui
        // signale du code correct finit par être désactivé, et c'est alors
        // qu'il ne sert plus à rien.
        .map(({ ligne, valeur }) => ({ ligne, valeur: valeur.replace(/\$\{[^}]*\}/g, '') }))
        .filter(({ valeur }) => / /.test(valeur) && /[A-ZÀ-Ÿéèêàùç]/.test(valeur));
      expect(suspectes.map((s) => `L${s.ligne} « ${s.valeur} »`)).toEqual([]);
    });
  }
  it('⚠ témoin de VOLUME sur la population entière — l’extracteur lit vraiment', () => {
    // Ce que le seuil par fichier prétendait garantir, gardé là où c'est vrai :
    // 12 écrans, plus de cent littéraux au total au 22 septembre 2026.
    const total = FICHIERS.reduce((n, f) => n + chainesLitterales(f).length, 0);
    expect(total).toBeGreaterThan(100);
  });
});
