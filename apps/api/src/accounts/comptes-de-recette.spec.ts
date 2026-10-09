/**
 * LE SCRIPT DES COMPTES DE RECETTE — ce qu'il ne doit JAMAIS faire.
 *
 * `scripts/dev/comptes-de-recette.mjs` crée ou réinitialise deux comptes dédiés
 * par école de développement, pour que les sessions front et mobile aient des
 * identifiants stables — et que personne ne relance `seed:demo`, qui RÉÉCRIT
 * tous les comptes de démonstration.
 *
 * ⚠ CE FICHIER GARDE DEUX PROPRIÉTÉS, et ni l'une ni l'autre ne se vérifie en
 * relisant le script : elles se vérifient en le lisant depuis ICI, parce qu'un
 * `.mjs` hors de `src/` n'est couvert par aucune suite.
 *
 *   ① **LE PRODUIT ÉCRIT LE MOT DE PASSE, PAS LE SCRIPT.** La forme fautive est
 *      à portée de main — `user.update({ data: { password: await bcrypt.hash(…) } })`
 *      — elle marche, elle est plus courte, et elle DOUBLE la politique du
 *      produit (longueur, tours de hachage, consommation du jeton) à un endroit
 *      que personne ne relira. Le jour où le produit durcit sa politique, le
 *      script continuerait d'écrire selon l'ancienne, et RIEN ne le dirait.
 *
 *   ② **IL REFUSE DE TOURNER AILLEURS QUE SUR CETTE MACHINE.** Il réinitialise
 *      des mots de passe : pointé par accident sur une instance en service, il
 *      ouvrirait deux comptes au mot de passe d'un fichier de développement.
 *
 * ⚠ ET LA LISTE DES COMPTES EST LA TROISIÈME GARANTIE : le script n'écrit que
 * sur deux adresses nommées. C'est ce qui rend MÉCANIQUE la promesse « plus
 * personne ne touche aux comptes de démonstration » — elle ne dépend pas de la
 * prudence de celui qui lance.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = join(__dirname, '..', '..', '..', '..');
const SCRIPT = join(RACINE, 'scripts', 'dev', 'comptes-de-recette.mjs');
const source = readFileSync(SCRIPT, 'utf8');

/**
 * La source SANS ses commentaires — ce que le script FAIT, pas ce qu'il dit.
 *
 * ⚠ Indispensable ici, et déjà payé deux fois dans ce dépôt : les commentaires
 * du script NOMMENT les formes interdites pour expliquer pourquoi elles le
 * sont. Un garde qui lit l'intérieur des commentaires signalerait donc
 * exactement le texte écrit pour l'en préserver.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

describe("L'instrument, avant ce qu'il mesure", () => {
  it('⚠ il LIT le script — sinon toutes ses assertions portent sur le vide', () => {
    // Témoin de COMPTE : un chemin faux rendrait une chaîne vide, et « aucun
    // bcrypt » serait VRAI sur rien.
    expect(source.length, 'le script est introuvable ou vide').toBeGreaterThan(4000);
    expect(code.length, 'le retrait des commentaires a tout emporté').toBeGreaterThan(1500);
  });

  it('⚠ TÉMOIN D’ABSENCE : le retrait des commentaires DISCRIMINE vraiment', () => {
    // Le script PARLE de bcrypt dans ses commentaires, pour dire de ne pas s'en
    // servir. Sans ce témoin, un garde qui lirait les commentaires signalerait
    // le texte écrit pour l'éviter — et on « corrigerait » une explication.
    expect(source, 'le script doit NOMMER la forme fautive dans sa prose').toMatch(/bcrypt/);
    expect(code, 'et son CODE ne doit pas en contenir').not.toMatch(/bcrypt/);
  });
});

describe('① le PRODUIT écrit le mot de passe, pas le script', () => {
  it('🔴 aucun hachage, aucune écriture de la colonne `password`', () => {
    const interdits: { motif: RegExp; quoi: string }[] = [
      { motif: /\bbcrypt\b/, quoi: 'bcrypt' },
      { motif: /\bargon2\b/i, quoi: 'argon2' },
      { motif: /createHash|scryptSync|pbkdf2/, quoi: 'un hachage maison' },
      { motif: /password\s*:\s*(?!ctx\.motDePasse\b)[A-Za-z_$]/, quoi: 'une écriture de `password`' },
    ];
    const trouves = interdits.filter((i) => i.motif.test(code)).map((i) => i.quoi);
    expect(
      trouves,
      'Ce script ne doit JAMAIS écrire ni hacher un mot de passe. Il émet un ' +
        'jeton (`emettreLienMotDePasse`) et appelle `POST /accounts/set-password` : ' +
        "c'est LA ROUTE qui valide la longueur, hache avec ses tours et consomme " +
        'le jeton.\n' +
        '⚠ Si vous venez d’ajouter un `bcrypt.hash` parce que « c’est plus ' +
        'court » : vous venez de dupliquer la politique de mot de passe du ' +
        'produit à un endroit que personne ne relira.\n' +
        `Trouvé : ${trouves.join(', ')}`,
    ).toEqual([]);
  });

  it('⚠ et il passe BIEN par les deux pièces du produit', () => {
    // Témoin de PRÉSENCE : sans lui, un script qui n'écrit rien du tout
    // satisferait l'assertion ci-dessus.
    expect(code, "il doit émettre le jeton par l'aide PARTAGÉE").toMatch(
      /emettreLienMotDePasse\s*\(/,
    );
    expect(code, 'et appeler la route publique du produit').toMatch(
      /\/accounts\/set-password/,
    );
  });

  it('⚠ le mot de passe n’est jamais IMPRIMÉ', () => {
    // On relève les arguments de tout `console.*` et on refuse la variable qui
    // porte le secret. Un `console.log(motDePasse)` ajouté « pour vérifier »
    // ferait entrer le secret dans un journal de terminal que personne ne nettoie.
    const sorties = code.match(/console\.(log|error|warn|info)\([^\n]*/g) ?? [];
    expect(sorties.length, 'le relevé des sorties ne trouve rien : instrument faux').toBeGreaterThan(
      3,
    );
    const fautives = sorties.filter((s) => /\bmotDePasse\b|RECETTE_PASSWORD['"`]\s*\]/.test(s));
    expect(
      fautives,
      'Le mot de passe de recette ne sort NULLE PART : ni journal, ni fichier, ni ' +
        'message d’erreur. La documentation d’une procédure qui prend un secret ' +
        `montre la VARIABLE, jamais la VALEUR.\nTrouvé : ${fautives.join(' | ')}`,
    ).toEqual([]);
  });
});

describe('② il refuse de tourner ailleurs que sur cette machine', () => {
  it('🔴 le garde existe, et il juge les DEUX adresses', () => {
    expect(code, 'la liste des hôtes locaux doit exister').toMatch(/HOTES_LOCAUX/);
    for (const hote of ['localhost', '127.0.0.1', '::1']) {
      expect(code, `« ${hote} » doit être accepté`).toContain(hote);
    }
    // ⚠ LES DEUX, pas une : une base locale avec une API DISTANTE est le
    // mélange le plus dangereux des trois — on croit mesurer chez soi, et c'est
    // le produit d'en face qui écrit.
    // ⚠ DANS UN GARDE QUI LIT LA SOURCE, UN NOM DE FONCTION TROUVE SA PROPRE
    // DÉFINITION. Mon premier motif était `exigerLocal\([^)]*databaseUrl` : il
    // correspondait à `function exigerLocal(databaseUrl, apiUrl)` — les
    // PARAMÈTRES — et restait donc vert quand je retirais l'APPEL. Le contrôle
    // négatif l'a dit ; ma relecture, non. C'est la deuxième fois dans ce seul
    // fichier, après `listerLesEcoles` trouvé dans sa ligne d'import.
    //
    // Les deux sont donc exigés SÉPARÉMENT, et seul le second prouve que le
    // garde s'exécute : une définition sans appel ne refuse rien.
    expect(code, 'le garde doit être DÉFINI').toMatch(/function exigerLocal\(/);
    expect(
      code,
      'le garde doit être APPELÉ, et son résultat employé. Une définition sans ' +
        'appel ne refuse rien — c’est « un dispositif se vérifie par son EFFET, ' +
        'jamais par sa présence ».',
    ).toMatch(/=\s*exigerLocal\(\s*databaseUrl\s*,\s*apiUrl\s*\)/);
    // Et le garde passe AVANT toute écriture : il est appelé dans `principal`
    // avant la découverte des écoles.
    // ⚠ ON COMPARE DES APPELS, PAS DES IMPORTS. Ma première rédaction cherchait
    // `listerLesEcoles` tout court : elle trouvait la LIGNE D'IMPORT, en tête de
    // fichier, et concluait que le garde passe après. C'est « un grep sur un nom
    // ne prouve pas qu'on lit la chose qui le porte », appliqué à un ordre
    // d'exécution — le nom est là deux fois, et la première n'exécute rien.
    const iGarde = code.search(/=\s*exigerLocal\(/);
    const iEcoles = code.indexOf('await listerLesEcoles()');
    expect(iGarde, 'le garde doit être APPELÉ').toBeGreaterThan(-1);
    expect(iEcoles, 'la découverte doit être APPELÉE').toBeGreaterThan(-1);
    expect(
      iGarde,
      'le garde doit s’exécuter AVANT la découverte des écoles — un refus après ' +
        'la première écriture ne refuse plus rien',
    ).toBeLessThan(iEcoles);
  });

  it('⚠ et il SORT en échec — un garde qui détecte sans refuser est pire qu’absent', () => {
    expect(code, 'le refus doit terminer le processus en échec').toMatch(
      /process\.exit\(1\)/,
    );
  });
});

describe('③ la liste blanche des comptes EST la garantie', () => {
  it('🔴 exactement deux adresses, et elles portent `recette-`', () => {
    const emails = [...source.matchAll(/email:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(
      emails.sort(),
      'Ce script n’écrit que sur ces deux adresses. En ajouter une est une ' +
        'DÉCISION : un compte de plus dans chaque école de développement, qu’il ' +
        'faudra reconnaître et retirer.\n' +
        '⚠ Et n’y mettez JAMAIS une adresse de démonstration (awa@, admin@…) : ' +
        'ce script RÉINITIALISE le mot de passe de ce qu’il touche.',
    ).toEqual(['recette-bib@exemple.bf', 'recette-etu@exemple.bf']);
  });

  it('⚠ aucune adresse de démonstration n’est une CIBLE', () => {
    // ⚠ CE TEST A ACCUSÉ DU CODE CORRECT à sa première écriture : le script DIT,
    // en fin de course, « aucun compte de démonstration n'a été touché (awa@,
    // admin@, …) ». C'est précisément la phrase qui rassure celui qui lance, et
    // mon motif la lisait comme une cible.
    //
    // La question n'était pas « ces adresses apparaissent-elles ? » mais
    // « le script ÉCRIT-il dessus ? ». On retire donc ce qu'il AFFICHE avant de
    // juger — un détecteur qui signale du code correct se fait désactiver.
    // ⚠ ET LE RELEVÉ DES SORTIES A DÛ ÊTRE ÉLARGI UNE FOIS : je ne retirais que
    // `console.*`, et la phrase passe par `avert()`, une aide du script. Un
    // motif ne voit que la forme qu'on a IMAGINÉE — c'est pourquoi la liste des
    // aides de sortie est écrite ici, et pourquoi le témoin ci-dessous vérifie
    // que le retrait a bien mordu.
    const AIDES_DE_SORTIE = ['console\\.(log|error|warn|info)', 'ok', 'info', 'titre', 'avert', 'refuse'];
    const operations = code.replace(
      new RegExp(`\\b(?:${AIDES_DE_SORTIE.join('|')})\\(`, 'g'),
      'SORTIE_RETIREE(',
    ).replace(/SORTIE_RETIREE\([\s\S]*?\n\s*(?:\)|\];)/g, ' ');
    // Témoin : la phrase légitime DOIT avoir été emportée, et le code DOIT
    // rester substantiel — sinon l'assertion porte sur du vide.
    expect(code, 'le script DOIT dire ce qu’il n’a pas touché').toContain('awa@');
    expect(operations.length, 'le retrait a tout emporté : instrument faux').toBeGreaterThan(
      600,
    );
    for (const demo of ['awa@', 'admin@', 'bib@']) {
      expect(
        operations,
        `« ${demo} » n’a rien à faire ailleurs que dans un message : ce script ` +
          'RÉINITIALISE le mot de passe de ce qu’il touche.',
      ).not.toContain(demo);
    }
  });

  it('🔴 la DOTATION passe par les ROUTES, jamais par une écriture directe', () => {
    // ⚠ Un `checkout.create` fabriquerait un prêt dont l'exemplaire reste
    // `AVAILABLE` — c'est la trouvaille de 820 lignes que le tamis a faite sur
    // le fonds d'échelle. Le produit, lui, pose le prêt et le statut dans la
    // MÊME transaction. Même raison pour la réservation et le document.
    for (const route of [
      '/patrons',
      '/circulation/checkout',
      '/circulation/holds',
      '/digital-copy',
    ]) {
      expect(code, `la dotation doit passer par \`${route}\``).toContain(route);
    }
    const ecrituresDirectes = [
      /\bcheckout\.create\(/,
      /\bhold\.create\(/,
      /\bdigitalCopy\.create\(/,
      /\bpatron\.create\(/,
    ].filter((m) => m.test(code));
    expect(
      ecrituresDirectes.map(String),
      'Ces états doivent être produits par le PRODUIT. Une écriture directe ' +
        'fabrique des états que le produit tient pour invalides, et c’est le ' +
        'tamis qui les découvre — plus tard, chez quelqu’un d’autre.',
    ).toEqual([]);
  });

  it('⚠ et il OUVRE une session par le mot de passe, il n’en fabrique pas', () => {
    expect(code, 'la session vient de la route de connexion').toMatch(
      /\/auth\/login/,
    );
    for (const interdit of [/jsonwebtoken/, /jwt\.sign/, /JWT_SECRET/]) {
      expect(
        code,
        'Un jeton fabriqué depuis un secret d’environnement est interdit. Ce ' +
          'script n’en a pas besoin : il vient de poser le mot de passe du ' +
          'bibliothécaire, il se connecte donc comme n’importe qui.',
      ).not.toMatch(interdit);
    }
  });

  it('⚠ le téléversement n’IMPOSE pas de Content-Type', () => {
    // ⚠ Ce dépôt l'a déjà payé : un `Content-Type: application/json` posé à la
    // main empêche la frontière multipart, et l'API répond
    // « ------WebK... is not valid JSON » — sur le seul geste qui compte.
    const envoi = /digital-copy`?,\s*\{[\s\S]*?\}\);/.exec(code)?.[0] ?? '';
    expect(envoi.length, 'le relevé ne trouve pas l’appel : instrument faux').toBeGreaterThan(
      80,
    );
    expect(
      envoi,
      'Le téléversement passe un FormData : laissez undici poser la frontière.',
    ).not.toMatch(/'Content-Type'/);
  });

  it('🔴 `.env` est interrogé à GIT avant toute écriture dedans', () => {
    expect(code, 'le garde doit demander à git').toMatch(/check-ignore/);
    // L'ORDRE est la propriété : vérifier après laisse un secret dans un
    // fichier suivi pendant l'intervalle, et le prochain `git add -A` l'emporte.
    // ⚠ TROISIÈME FOIS DANS CE FICHIER qu'un nom trouve autre chose que son
    // appel : `appendFileSync` seul tombe sur la LIGNE D'IMPORT, index 82. On
    // cible donc l'APPEL, avec son argument.
    const iGit = code.indexOf('check-ignore');
    const iEcriture = code.search(/appendFileSync\(\s*env\b/);
    expect(iEcriture, "l'écriture doit exister").toBeGreaterThan(-1);
    expect(
      iGit,
      'Le contrôle `check-ignore` doit PRÉCÉDER l’écriture. Écrire puis ' +
        'vérifier ne protège de rien : le dépôt de ce projet porte déjà cinq ' +
        'secrets versionnés, et « la règle est arrivée après le geste » à ' +
        'chaque fois.',
    ).toBeLessThan(iEcriture);
  });

  it('⚠ l’étudiante reçoit une classe ET son inscription', () => {
    // Le contrôle d'accès lit `class_name` ; l'écran des classes compte les
    // INSCRIPTIONS. L'une sans l'autre FABRIQUE la violation que le tamis
    // cherche (`fonds-conforme-en-base.spec.ts`), et le compte s'affiche
    // « 0 étudiant » pendant que son accès fonctionne.
    expect(code, 'la classe doit être posée').toMatch(/className:/);
    expect(code, "et l'inscription avec elle").toMatch(/enrollment\.upsert/);
  });
});
