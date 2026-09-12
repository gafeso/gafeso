import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECORD_SELECT } from './oai.service';

/**
 * L'INVARIANT : TOUTE COLONNE LUE PAR L'ÉMISSION EST DANS LE `select`.
 *
 * ⚠ POURQUOI CE GARDE EXISTE, ET POURQUOI MAINTENANT. Le contrôle négatif de
 * P5-3 a montré le trou : retirer `marcData: true` du `RECORD_SELECT` cassait
 * la réexposition fidèle en production — la notice ressortait reconstruite,
 * amputée de ses notes et de ses zones locales — et la suite restait VERTE.
 *
 * La panne serait silencieuse par nature : Prisma ne se plaint pas d'une
 * colonne non demandée, elle rend `undefined`, et tout le code d'émission est
 * écrit pour tolérer l'absence (`if (fidele)`, `tag()` qui saute les vides). Un
 * champ qui disparaît de l'entrepôt ne lève rien, ne journalise rien, et ne se
 * voit que chez le moissonneur — c'est-à-dire chez quelqu'un d'autre.
 *
 * Le type `OaiRecord` et `RECORD_SELECT` sont deux listes tenues à la main,
 * côte à côte, sans lien mécanique. Ce test est ce lien.
 *
 * ⚠ IL PORTE L'INVARIANT, PAS LES CAS. Un test « marcData est dans le select »
 * aurait couvert ce qu'on savait déjà ce soir. Celui-ci couvre la colonne que
 * quelqu'un lira demain sans avoir entendu parler de ce défaut.
 */

/**
 * Les lectures de la notice, sous les deux noms qu'elle porte dans l'émission.
 *
 * ⚠ `notice` N'EST PAS DÉCORATIF, ET C'EST L'INSTRUMENT QUI A DÛ ÊTRE CORRIGÉ.
 * Écrit d'abord sur `r.` seul, ce relevé a déclaré `profile` « demandée mais
 * non lue » — un faux. Elle est lue par `exposableEnEtdms(record)`, qui reçoit
 * la notice ENTIÈRE et l'appelle `notice`. Un relevé qui signale du code
 * correct se fait désactiver, et ne sert plus le jour où il a raison.
 */
function colonnesLues(source: string): Set<string> {
  const lues = new Set<string>();
  for (const m of source.matchAll(/\b(?:r|notice)\.([A-Za-z][A-Za-z0-9]*)/g)) lues.add(m[1]);
  return lues;
}

/**
 * Les fichiers à relever : le service, ET ceux à qui il passe la notice
 * ENTIÈRE. Liste explicite pour qu'elle ne grandisse pas en silence — un
 * module de plus qui reçoit la notice est une décision, pas un détail.
 */
const FICHIERS_QUI_LISENT = [
  'oai.service.ts', // l'émission oai_dc et l'aiguillage
  'etdms.ts', // reçoit la notice entière : `versEtdms(r, …)`, `exposableEnEtdms(record)`
];

describe("L'instrument : ce que le relevé des lectures doit trouver", () => {
  it('il compte JUSTE sur une entrée dont je connais la réponse', () => {
    // ⚠ TÉMOIN SUR ENTRÉE CONTRÔLÉE, et il COMPTE. Un témoin de présence
    // (« il trouve bien title ») confirmerait que l'outil tourne ; seul un
    // compte exact signale ce qu'il ne voit pas — les trois formes difficiles
    // sont ici : lecture imbriquée, lecture dans un spread, lecture dans un
    // gabarit de chaîne.
    const faux = [
      'const a = r.title;',
      'const b = r.keywords.map((k) => k.keyword.name);',
      'const c = { ...lireChampsDeProfil(r.profileData) };',
      'const d = `oai:${tenant.slug}:${r.id}`;',
      'const g = notice.profile === PROFIL_ETDMS;', // l'autre nom de la notice
      'const e = autre.title;', // ⚠ ne doit PAS compter : ce n'est pas la notice
      'const f = r.title;', // déjà vu : un ensemble, pas une liste
    ].join('\n');

    const trouvees = colonnesLues(faux);
    expect([...trouvees].sort()).toEqual(['id', 'keywords', 'profile', 'profileData', 'title']);
    expect(trouvees.size).toBe(5);
  });
});

describe("L'invariant sur le service réel", () => {
  const lues = new Set(
    FICHIERS_QUI_LISENT.flatMap((f) => [...colonnesLues(readFileSync(join(__dirname, f), 'utf8'))]),
  );
  const servies = new Set(Object.keys(RECORD_SELECT));

  it('le relevé voit bien les lectures difficiles du service réel', () => {
    // Témoin sur le vrai fichier : trois colonnes dont je SAIS qu'elles sont
    // lues, et dont deux ne se lisent pas d'un simple `r.x` en début de ligne.
    // `profile` est le cas qui a corrigé l'instrument : elle n'est lue QUE par
    // un collaborateur qui reçoit la notice entière.
    for (const attendue of ['marcData', 'marcFormat', 'profileData', 'summary', 'keywords', 'profile']) {
      expect(lues, attendue).toContain(attendue);
    }
  });

  it('⚠ toute colonne LUE est demandée au `select`', () => {
    const manquantes = [...lues].filter((c) => !servies.has(c));
    expect(manquantes, `lues mais non demandées : ${manquantes.join(', ')}`).toEqual([]);
  });

  it('et rien n’est demandé sans être lu — le `select` ne porte pas de mort', () => {
    // L'autre sens, et il a sa valeur propre : une colonne demandée que plus
    // personne ne lit est une lecture de base pour rien, et surtout le signe
    // qu'une émission a été retirée sans qu'on nettoie derrière.
    const inutiles = [...servies].filter((c) => !lues.has(c));
    expect(inutiles, `demandées mais non lues : ${inutiles.join(', ')}`).toEqual([]);
  });
});
