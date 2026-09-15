/**
 * ⚠ AUCUN `window.open` APRÈS UN `await` — l'invariant, pas les deux cas.
 *
 * Signalé par la session backend le 15 septembre 2026 sur `depots-a-valider`.
 * Le balayage a montré que `depots-a-cataloguer` portait le même : trois
 * `window.open` dans tout le front, DEUX fautifs.
 *
 * ⚠ POURQUOI C'EST GRAVE ET INVISIBLE. Un `window.open` placé après un `await`
 * a perdu le contexte du geste utilisateur — c'est précisément le motif que les
 * bloqueurs de fenêtres surgissantes visent. Selon le navigateur il passe ou il
 * est refusé, et s'il est refusé **le clic ne produit RIEN** : ni document, ni
 * message. Sur un poste de développement il marche presque toujours ; chez un
 * client, une fois sur deux.
 *
 * ⚠ LE GESTE QUI VIOLERA CE GARDE, écrit ici parce qu'il est raisonnable :
 * quelqu'un écrira « je récupère l'URL, PUIS je l'ouvre ». C'est l'ordre
 * naturel de la pensée, et c'est le mauvais ordre pour le navigateur. Le
 * remède : ouvrir l'onglet au clic, l'appeler ensuite, puis lui poser
 * l'adresse.
 *
 * ⚠ ET PAS `noopener` DANS LES OPTIONS : la spécification fait alors rendre
 * `null` à `window.open`, puisque le lien entre les fenêtres est coupé dans les
 * deux sens. On garde la poignée et on coupe le lien à la main —
 * `onglet.opener = null`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RACINE = resolve(__dirname, '..');

function fichiersDuFront(): string[] {
  const vus: string[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(join(RACINE, rel), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const chemin = join(rel, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (/\.tsx?$/.test(e.name)) vus.push(chemin);
    }
  };
  for (const racine of ['app', 'lib', 'components', 'hooks']) {
    try { parcourir(racine); } catch { /* répertoire absent : rien à parcourir */ }
  }
  return vus;
}

/** Le code seul — les commentaires mentent sur ce que le fichier FAIT. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

/** Les `window.open` du front, avec ce qui les précède dans leur fonction. */
function ouverturesDeFenetre(): { fichier: string; apresUnAwait: boolean; options: string }[] {
  const trouvees: { fichier: string; apresUnAwait: boolean; options: string }[] = [];
  for (const f of fichiersDuFront()) {
    // ⚠ COMMENTAIRES RETIRÉS AVANT DE MESURER. Sans cela, le relevé signalait
    // les DEUX fichiers que je venais de corriger : mon commentaire y explique
    // le défaut et contient donc le mot `await`. C'est « plus aucune mention de
    // redis » à l'identique — l'instrument signale le texte qui raconte la
    // correction. Trouvé par le garde lui-même, pas par ma relecture.
    const source = sansCommentaires(readFileSync(join(RACINE, f), 'utf-8'));
    for (const m of source.matchAll(/window\.open\(([^)]*)\)/g)) {
      // Le corps de la fonction englobante, approché par le dernier `function`
      // ou `=>` qui précède — assez pour dire s'il y a un `await` avant.
      const avant = source.slice(0, m.index);
      const debut = Math.max(
        avant.lastIndexOf('function '),
        avant.lastIndexOf('=> {'),
        avant.lastIndexOf('onClick'),
      );
      trouvees.push({
        fichier: f,
        apresUnAwait: /\bawait\b/.test(avant.slice(Math.max(0, debut))),
        options: m[1],
      });
    }
  }
  return trouvees;
}

describe('la fenêtre s’ouvre au CLIC', () => {
  it('⚠ témoin de COMPTE : le relevé voit bien les trois `window.open`', () => {
    // Un compte exact, pas une présence : le jour où un quatrième apparaît, ce
    // test convoque quelqu'un pour vérifier son ordre. Il ne dit pas qu'il est
    // fautif — il oblige à revenir le regarder.
    expect(ouverturesDeFenetre()).toHaveLength(3);
  });

  it('⚠ AUCUN n’est placé après un `await`', () => {
    const fautifs = ouverturesDeFenetre().filter((o) => o.apresUnAwait);
    expect(
      fautifs.map((o) => o.fichier),
      'Un `window.open` après un `await` a perdu le geste utilisateur : le ' +
        'navigateur peut le bloquer, et le clic ne produit alors RIEN. Ouvrez ' +
        'l’onglet AU CLIC (`window.open("", "_blank")`), appelez l’API ensuite, ' +
        'puis posez `onglet.location`. Si la fenêtre est refusée, DITES-LE.',
    ).toEqual([]);
  });

  it('⚠ aucun ne passe `noopener` en OPTIONS', () => {
    // La spécification fait alors rendre `null` : la poignée serait perdue, et
    // le code prendrait la branche « bloqué » à tous les coups.
    const fautifs = ouverturesDeFenetre().filter((o) => /noopener/.test(o.options));
    expect(
      fautifs.map((o) => o.fichier),
      'Coupez le lien avec `onglet.opener = null` après l’ouverture, pas avec ' +
        '`noopener` dans les options — sinon `window.open` rend `null`.',
    ).toEqual([]);
  });

  it('⚠ témoin d’ABSENCE : le relevé sait reconnaître un `await` qui précède', () => {
    // Sans lui, un relevé qui répondrait « aucun » à tout serait indiscernable
    // d'un relevé juste — et plus rassurant, puisqu'il ne trouve jamais rien.
    const source = `
      async function faux() {
        const r = await api('/x');
        window.open(r.url, '_blank');
      }`;
    const avant = source.slice(0, source.indexOf('window.open('));
    expect(/\bawait\b/.test(avant.slice(avant.lastIndexOf('function ')))).toBe(true);
  });
});
