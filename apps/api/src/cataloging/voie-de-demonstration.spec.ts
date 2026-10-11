/**
 * 🔴 LA VOIE DE DÉMONSTRATION RESTE ÉTROITE.
 *
 * `remplacer-documents-demo.mjs` réécrit les fichiers d'un fonds entier, et
 * l'ancien objet est supprimé APRÈS le succès du nouveau. Son garde de
 * localité est juste — et il interdit par construction l'usage voulu, puisque
 * dans le conteneur de production `DATABASE_URL` vise `db`.
 *
 * ⭐ La voie ouverte le 11 octobre 2026 ne relâche donc PAS le garde : elle
 * exige TROIS conditions cumulatives. Ce fichier vérifie qu'elles y sont
 * toutes les trois, et que la quatrième — la confirmation tapée — précède
 * la première écriture.
 *
 * ## ⚠ CE QUE CE GARDE NE PEUT PAS FAIRE, et c'est écrit plutôt que tu
 *
 * Il lit la SOURCE. Il ne peut donc pas prouver que les conditions sont
 * évaluées dans le bon ordre, ni qu'aucune écriture n'a lieu avant la
 * confirmation : cela demanderait de suivre le flot d'exécution, c'est-à-dire
 * de réécrire un interpréteur dans un test.
 *
 * ⭐ Ce qui mesure l'EFFET, ce sont les six contrôles négatifs joués à la main
 * et rapportés en passation — école non marquée, domaine différent, hôte qui
 * ressemble, option sans valeur, pas de terminal, confirmation fausse. Les six
 * refusent, et le dernier affiche « RIEN n'a été écrit ».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = readFileSync(
  join(__dirname, '../../../../scripts/dev/remplacer-documents-demo.mjs'),
  'utf-8',
);

describe('🔴 La voie de démonstration reste étroite', () => {
  it('⭐ le garde de LOCALITÉ existe toujours, et s’applique sans l’option', () => {
    expect(SCRIPT, '`exigerLocal` a disparu').toMatch(/function exigerLocal\(/);
    // ⚠ L'appel doit être CONDITIONNÉ à l'absence d'option — jamais retiré.
    expect(
      SCRIPT,
      'le garde de localité ne doit s’appliquer que lorsque la voie de ' +
        'démonstration n’est PAS demandée — et s’appliquer alors toujours',
    ).toMatch(/if \(!domaineDemande\) exigerLocal\(/);
  });

  it('🔴 LES TROIS CONDITIONS sont là, et chacune REFUSE', () => {
    for (const [quoi, motif] of [
      [/--instance-de-demonstration/, 'l’option nommée'],
      [/domaineDemande !== domaine\.toLowerCase\(\)/, 'le domaine comparé EXACTEMENT'],
      [/estInstanceDeDemonstration !== true/, 'le marqueur en base'],
    ] as const) {
      expect(SCRIPT, `condition manquante : ${motif}`).toMatch(quoi);
    }
    // ⚠ Et chacune doit mener à un `refuse(` — une condition qui se contente
    // d'avertir serait « un garde qui DÉTECTE et laisse passer », pire qu'un
    // garde absent.
    const refus = SCRIPT.match(/refuse\(/g) ?? [];
    expect(refus.length, 'les refus ont disparu du script').toBeGreaterThanOrEqual(6);
  });

  it('🔴 la comparaison de domaine est EXACTE — jamais `includes` ni `endsWith`', () => {
    // `demo.gafeso.org.exemple.net` est un AUTRE hôte. Un `endsWith` le
    // prendrait pour le nôtre, et c’est la forme exacte d’un hameçonnage.
    const bloc = SCRIPT.slice(
      SCRIPT.indexOf('if (domaineDemande) {'),
      SCRIPT.indexOf('VOIE DE DÉMONSTRATION ouverte'),
    );
    expect(bloc.length, 'le bloc des trois conditions est introuvable').toBeGreaterThan(200);
    expect(bloc).not.toMatch(/\.endsWith\(|\.includes\(|\.startsWith\(/);
  });

  it('⭐ la CONFIRMATION se TAPE, et c’est le slug — pas une touche', () => {
    // Une touche se frappe par réflexe après un récapitulatif lu en diagonale.
    // Taper le slug oblige à le LIRE — et c’est l’erreur qu’on veut rendre
    // impossible : lancer sur la mauvaise école.
    expect(SCRIPT).toMatch(/reponse !== slug/);
    expect(SCRIPT, 'un `o/N` ne protège de rien ici').not.toMatch(/\[o\/N\]|\(o\/n\)/i);
    // Et sans terminal, on REFUSE plutôt que de supposer un accord.
    expect(SCRIPT).toMatch(/process\.stdin\.isTTY/);
  });

  it('⭐ le RÉCAPITULATIF précède la confirmation, qui précède l’écriture', () => {
    const iRecap = SCRIPT.indexOf('ÉPARGNÉS (fichier déposé par quelqu');
    const iConfirm = SCRIPT.indexOf('await confirmer(slug)');
    // ⚠ ON ANCRE SUR L'APPEL, PAS SUR LE CHEMIN. Ma première écriture
    // cherchait « /digital-copy` » et trouvait le COMMENTAIRE d'en-tête, en
    // position 340 — donc « une écriture précède la confirmation », sur un
    // script parfaitement ordonné. C'est « un grep sur un nom ne prouve pas
    // qu'on lit la chose qui le porte », appliqué à une position.
    const iEcriture = SCRIPT.indexOf('method: \'POST\',\n        headers: { cookie: session');
    expect(iRecap, 'récapitulatif introuvable').toBeGreaterThan(0);
    expect(iConfirm, 'confirmation introuvable').toBeGreaterThan(iRecap);
    expect(
      iEcriture,
      'une écriture précède la confirmation — « un récapitulatif affiché ' +
        'pendant qu’on écrit n’est pas un récapitulatif, c’est un compte rendu »',
    ).toBeGreaterThan(iConfirm);
  });

  it('⚠ le PÉRIMÈTRE ne change pas : la voie ouvre un HÔTE, jamais plus', () => {
    // Même voie ouverte, le script ne touche QUE ce qu'il reconnaît.
    expect(SCRIPT).toMatch(/const estRemplacable = /);
    expect(SCRIPT).toMatch(/if \(!estRemplacable\(copie\)\)/);
  });

  it('⚠ TÉMOIN : le script est bien LU — sinon tout ce qui précède est vert sur rien', () => {
    expect(SCRIPT.length).toBeGreaterThan(4000);
  });
});
