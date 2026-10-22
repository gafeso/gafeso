import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ⭐⭐ UN RÉSULTAT ATTENDU NE PORTE JAMAIS UN NUMÉRO DE VERSION EN DUR
 *
 * *Posé le 22 octobre 2026, après la CINQUIÈME occurrence de la même famille —
 * « un document qui publie une VALEUR meurt à la première mutation ».*
 *
 * ## Ce que ça a failli coûter, et c'est pour ça que c'est un REFUS
 *
 * L'étape ⑧ de la bascule de stockage portait :
 *
 * > **Attendu** : `{"status":"ok","version":"v1.0.0-rc14",…}`
 *
 * Or la même procédure dit en tête : *« si une vérification ne rend pas ce qui
 * est écrit, ARRÊTEZ-VOUS et ne passez pas à la suivante »*. Un exploitant qui
 * déploie rc19 lit `v1.0.0-rc19`, ne reconnaît pas la valeur écrite, et
 * s'arrête — **à la DERNIÈRE étape, donc APRÈS que le stockage a déjà
 * basculé**. Le faux ne trompe pas : il déclenche un arrêt au pire moment.
 *
 * ## ⚠ POURQUOI CE GARDE EST ÉTROIT, ET MESURÉ AVANT D'ÊTRE ÉCRIT
 *
 * `DEPLOY.md` porte 4 littéraux de version, et les QUATRE sont légitimes :
 * trois sont des notes de correction qui RACONTENT une valeur périmée, le
 * quatrième est un titre de section propre à une montée de version
 * (« MONTÉE VERS v1.0.0-rc6 »). Un garde sur « un littéral de version dans ce
 * fichier » crierait donc au loup quatre fois — et un détecteur qui signale du
 * code correct se fait désactiver.
 *
 * La population exacte est donc les **RÉGIONS DE RÉSULTAT ATTENDU** : la ligne
 * `**Attendu**`, plus le bloc clôturé qu'elle introduit quand elle se termine
 * par deux points. Une version citée AILLEURS — dans un récit, un titre, une
 * correction — n'y est pas, et n'a pas à l'être.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');

/** Les documents OPÉRATOIRES : ceux qu'un exploitant suit étape par étape. */
const DOCUMENTS = ['DEPLOY.md', join('docs', 'INSTALLATION.md')];

/** `v1.0.0-rc14`, `v2.1.0`, `rc14` collé à une version — la forme qui périme. */
const VERSION_FIGEE = /v\d+\.\d+\.\d+(?:-rc\d+)?/;

/**
 * Les régions où une valeur est AFFIRMÉE comme attendue.
 *
 * ⚠ Le bloc clôturé qui SUIT un `**Attendu** :` en fait partie — sans lui, le
 * garde aurait un angle mort déclaré, et c'est exactement là que la prochaine
 * version figée se poserait (trois des quatorze `**Attendu**` de `DEPLOY.md`
 * introduisent leur valeur par un bloc plutôt qu'en ligne).
 */
export function regionsDeResultatAttendu(
  source: string,
): { ligne: number; texte: string }[] {
  const lignes = source.split('\n');
  const regions: { ligne: number; texte: string }[] = [];
  for (let i = 0; i < lignes.length; i += 1) {
    if (!/^\*\*Attendu\*\*/.test(lignes[i])) continue;
    regions.push({ ligne: i + 1, texte: lignes[i] });
    // Une ligne qui se termine par « : » (éventuellement suivie d'espaces)
    // introduit son attendu dans un bloc. On absorbe ce bloc entier.
    if (!/:\s*$/.test(lignes[i])) continue;
    let j = i + 1;
    while (j < lignes.length && lignes[j].trim() === '') j += 1;
    if (j >= lignes.length || !lignes[j].trimStart().startsWith('```')) continue;
    for (let k = j + 1; k < lignes.length; k += 1) {
      if (lignes[k].trimStart().startsWith('```')) break;
      regions.push({ ligne: k + 1, texte: lignes[k] });
    }
  }
  return regions;
}

describe('⭐⭐ un résultat ATTENDU ne porte pas de version figée', () => {
  /**
   * ⚠ LE TÉMOIN DE LECTURE PORTE SUR LA SOURCE, JAMAIS SUR LES TROUVAILLES.
   *
   * « Il a trouvé des régions » n'est PAS « il a lu le fichier » : le jour où
   * un document n'aurait plus aucune ligne `**Attendu**`, un témoin posé sur
   * les trouvailles rendrait vert sur une population vide. C'est la faute que
   * ce dépôt a mesurée le 8 octobre 2026 — un témoin dont la condition de
   * succès est l'existence d'une forme fautive punit celui qui fait bien.
   */
  it('⚠ TÉMOIN DE LECTURE : les deux documents sont lus, et non vides', () => {
    for (const doc of DOCUMENTS) {
      const source = readFileSync(join(RACINE, doc), 'utf-8');
      expect(source.length, `${doc} est vide ou introuvable`).toBeGreaterThan(1000);
    }
  });

  it('⚠ TÉMOIN DE COMPTE : la population ne s’est pas effondrée en silence', () => {
    // Un relevé qui tombe à zéro passerait toute assertion « aucune violation ».
    // Ce compte CONVOQUE quand il bouge — il ne juge pas, il oblige à revenir
    // regarder pourquoi une étape a perdu son attendu.
    const total = DOCUMENTS.reduce(
      (n, doc) => n + regionsDeResultatAttendu(readFileSync(join(RACINE, doc), 'utf-8')).length,
      0,
    );
    expect(
      total,
      'le nombre de régions de résultat attendu a changé. Ce n’est pas un échec : ' +
        'c’est une convocation. Une étape a-t-elle perdu son « Attendu » ?',
    ).toBeGreaterThanOrEqual(20);
  });

  it('⭐ TÉMOIN DE PRÉSENCE — une version figée dans un attendu EST vue', () => {
    // ⚠ Le témoin traverse TOUT l'instrument (un bloc d'entrée synthétique),
    // il n'éprouve pas le motif seul : « un témoin sur une expression
    // régulière RESSEMBLE à un témoin sur l'instrument » (15 septembre 2026).
    const bloc = [
      '#### ⑧ DÉMARRER',
      '',
      '**Attendu** : `{"status":"ok","version":"v1.0.0-rc14"}`.',
      '',
    ].join('\n');
    const fautives = regionsDeResultatAttendu(bloc).filter((r) => VERSION_FIGEE.test(r.texte));
    expect(fautives).toHaveLength(1);
    expect(fautives[0].texte).toContain('v1.0.0-rc14');
  });

  it('⭐ TÉMOIN DE PRÉSENCE — y compris dans le BLOC qu’un attendu introduit', () => {
    // C'est l'angle mort qu'un garde posé sur la seule LIGNE aurait eu.
    const bloc = ['**Attendu** :', '```', 'version: v1.0.0-rc14', '```', ''].join('\n');
    const fautives = regionsDeResultatAttendu(bloc).filter((r) => VERSION_FIGEE.test(r.texte));
    expect(fautives, 'un attendu en BLOC doit être inspecté aussi').toHaveLength(1);
  });

  it('⭐ TÉMOIN D’ABSENCE — une version CITÉE ailleurs n’est pas accusée', () => {
    // Les confusions PLAUSIBLES, pas des cas inventés : ce sont les quatre
    // formes réellement présentes dans DEPLOY.md aujourd'hui.
    const bloc = [
      '## 🔴 MONTÉE VERS `v1.0.0-rc6` — les deux migrations',
      '',
      '⚠ Cette ligne portait `v1.0.0-rc14` en dur jusqu’au 22 octobre 2026.',
      '',
      '**Attendu** : `200` pour la couverture.',
      '',
    ].join('\n');
    const fautives = regionsDeResultatAttendu(bloc).filter((r) => VERSION_FIGEE.test(r.texte));
    expect(
      fautives,
      'un titre de montée de version et une note de correction CITENT une ' +
        'version sans l’affirmer comme attendue — les accuser ferait désactiver ce garde',
    ).toHaveLength(0);
  });

  it('🔴 LA PROPRIÉTÉ : aucun résultat attendu ne porte de version figée', () => {
    const violations: string[] = [];
    for (const doc of DOCUMENTS) {
      const source = readFileSync(join(RACINE, doc), 'utf-8');
      for (const region of regionsDeResultatAttendu(source)) {
        if (VERSION_FIGEE.test(region.texte)) {
          violations.push(`${doc}:${region.ligne} — ${region.texte.trim().slice(0, 80)}`);
        }
      }
    }
    expect(
      violations,
      'Un résultat attendu porte un numéro de version EN DUR. Il sera faux à la ' +
        'version suivante, et cette procédure dit « si une vérification ne rend pas ' +
        'ce qui est écrit, ARRÊTEZ-VOUS » — donc il déclenchera un arrêt au pire ' +
        'moment.\n' +
        'Deux issues :\n' +
        '· nommez la SOURCE plutôt que la valeur (`echo "$GAFESO_VERSION"`, puis ' +
        'comparez la réponse à cette variable) ;\n' +
        '· ou, si la valeur est VRAIMENT propre à une version (une procédure de ' +
        'montée vers une version précise), sortez-la d’une ligne « **Attendu** » et ' +
        'dites dans le texte à quelle version elle s’applique.',
    ).toEqual([]);
  });
});
