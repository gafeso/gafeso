/**
 * LES SCRIPTS D'EXPLOITATION RECOPIENT LA POLITIQUE DU JETON — ce test la garde.
 *
 * `scripts/lib/lien-mot-de-passe.mjs` émet un jeton de définition de mot de
 * passe, comme `AccountsService`. Il RECOPIE deux constantes — la durée de vie
 * et la taille — parce qu'un script `.mjs` ne peut pas importer le TypeScript
 * du service.
 *
 * ⚠ C'est une chaîne recopiée, avec toutes les fautes de la copie : le jour où
 * le service passe le jeton à 2 h ou à 48 h, le script continuera d'en émettre
 * à 24 h, et RIEN ne le dira. Le lien marcherait — il aurait simplement une
 * autre durée de vie que celle que le produit annonce.
 *
 * ⚠ Et la forme de l'URL compte autant : `/definir-mot-de-passe?token=…` est
 * l'écran du front. Un script qui imprimerait un autre chemin donnerait un lien
 * qui mène à un 404, et la personne conclurait que son compte est cassé.
 *
 * On ne peut pas supprimer la copie ; on peut la faire ÉCHOUER quand elle
 * divergera. C'est le seul remède disponible, et il est bon marché.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = join(__dirname, '..', '..', '..', '..');
const AIDE = join(RACINE, 'scripts', 'lib', 'lien-mot-de-passe.mjs');
const SERVICE = join(__dirname, 'accounts.service.ts');

const aide = readFileSync(AIDE, 'utf8');
const service = readFileSync(SERVICE, 'utf8');

/** La valeur d'une constante `const NOM = <nombre>;`, dans une source donnée. */
function constante(source: string, nom: string): number | null {
  const m = new RegExp(`\\b${nom}\\s*=\\s*(\\d+)`).exec(source);
  return m ? Number(m[1]) : null;
}

describe("L'instrument, avant ce qu'il mesure", () => {
  it('⚠ il LIT les deux sources — sinon sa comparaison est vide', () => {
    // Un relevé qui ne trouve rien rendrait `null === null`, donc VRAI, sur
    // deux fichiers qu'il n'aurait jamais ouverts.
    expect(aide.length).toBeGreaterThan(200);
    expect(service.length).toBeGreaterThan(200);
  });

  it('témoin d’ABSENCE : une constante inexistante rend `null`, pas 0', () => {
    // La confusion plausible : une regex trop permissive qui attraperait
    // n'importe quel nombre et ferait passer la comparaison par hasard.
    expect(constante(service, 'CONSTANTE_QUI_NEXISTE_PAS')).toBeNull();
  });
});

describe('⚠ la politique du jeton est la MÊME des deux côtés', () => {
  it('la durée de vie (heures)', () => {
    const duService = constante(service, 'TOKEN_TTL_HOURS');
    const duScript = constante(aide, 'TOKEN_TTL_HOURS');
    expect(duService, 'TOKEN_TTL_HOURS introuvable dans accounts.service.ts').not.toBeNull();
    expect(duScript, 'TOKEN_TTL_HOURS introuvable dans lien-mot-de-passe.mjs').not.toBeNull();
    expect(
      duScript,
      'La durée de vie du jeton a changé dans le service et PAS dans ' +
        'scripts/lib/lien-mot-de-passe.mjs. Les liens émis par les scripts ' +
        'd’exploitation auraient une autre durée de vie que ceux du produit, ' +
        'sans que rien ne le signale.',
    ).toBe(duService);
  });

  it('la taille du jeton (octets)', () => {
    const duService = constante(service, 'TOKEN_BYTES');
    const duScript = constante(aide, 'TOKEN_BYTES');
    expect(duService).not.toBeNull();
    expect(
      duScript,
      'La taille du jeton diverge : un jeton plus court chez les scripts serait ' +
        'plus facile à devigner, et la route est limitée à 10 essais par minute ' +
        'précisément parce que ce jeton est le seul secret en jeu.',
    ).toBe(duService);
  });

  it('⚠ le CHEMIN de l’écran de définition', () => {
    // Le service construit l'URL ; le script doit produire la MÊME.
    const cheminDuService = /\/definir-mot-de-passe\?token=/.test(service);
    const cheminDuScript = /\/definir-mot-de-passe\?token=/.test(aide);
    expect(cheminDuService, 'le service ne compose plus cette URL — relisez les deux').toBe(true);
    expect(
      cheminDuScript,
      'Le script n’imprime plus le chemin de l’écran de définition. Le lien ' +
        'mènerait à un 404, et la personne conclurait que son compte est cassé.',
    ).toBe(true);
  });
});

describe('⚠ le script de reprise n’écrit JAMAIS dans la colonne `password`', () => {
  const REPRISE = join(RACINE, 'scripts', 'reprendre-acces-comptes.mjs');
  const reprise = readFileSync(REPRISE, 'utf8');

  it('il ne contient ni bcrypt, ni écriture de mot de passe', () => {
    // C'est la garantie qui fait tout l'intérêt de ce script : il ne manipule
    // aucun secret, donc il n'y a rien à protéger, rien à nettoyer, et rien à
    // retrouver dans un historique de shell.
    expect(reprise, 'bcrypt dans un script d’exploitation').not.toMatch(/bcrypt/i);
    // ⚠ `password:` SEUL NE DÉSIGNE PAS UNE ÉCRITURE. Le script en porte un —
    // `select: { password: true }` — pour DIRE si un compte a déjà un mot de
    // passe. C'est une LECTURE, et confondre les deux est la faute qu'un relevé
    // de ce dépôt a déjà commise : il comptait un `select` comme une écriture et
    // déclarait saine la colonne qu'il devait trouver.
    //
    // Ce qui désigne une écriture est la VALEUR : `password: <autre que true>`.
    const ecrituresDuMotDePasse = (reprise.match(/password\s*:\s*([^\s,}]+)/g) ?? []).filter(
      (m) => !/:\s*true$/.test(m),
    );
    expect(
      ecrituresDuMotDePasse,
      'Ce script ne doit JAMAIS écrire la colonne `password` : c’est le produit ' +
        'qui l’écrit, après avoir validé la longueur et consommé le jeton.',
    ).toEqual([]);
    expect(reprise, 'lecture d’un mot de passe dans l’environnement').not.toMatch(
      /process\.env\.[A-Z_]*(MOT_DE_PASSE|PASSWORD)/,
    );
  });

  it('⚠ TÉMOIN : la distinction lecture / écriture discrimine vraiment', () => {
    // Sans ce cas, l'assertion ci-dessus pourrait être vide de sens — un motif
    // qui ne correspond à rien rend une liste vide, donc VRAI.
    const lecture = 'select: { password: true }';
    const ecriture = 'data: { password: hash }';
    const relever = (t: string) =>
      (t.match(/password\s*:\s*([^\s,}]+)/g) ?? []).filter((m) => !/:\s*true$/.test(m));
    expect(relever(lecture), 'un select ne doit PAS être compté').toEqual([]);
    expect(relever(ecriture), 'une écriture DOIT être comptée').toHaveLength(1);
    // Et le script réel porte bien la forme de LECTURE : sinon le témoin
    // ci-dessus passerait sur un fichier qui ne mentionne jamais la colonne.
    expect(reprise).toMatch(/password:\s*true/);
  });

  it('il lit `user` et `passwordToken`, et rien d’autre en écriture', () => {
    // Témoin de PRÉSENCE : il doit bien faire ce qu'on attend de lui.
    expect(reprise).toMatch(/emettreLienMotDePasse/);
    // Et aucune autre écriture : ni update, ni delete, ni createMany.
    const ecritures = reprise.match(/\.(update|updateMany|delete|deleteMany|createMany|create)\(/g) ?? [];
    expect(
      ecritures,
      'Ce script ne doit écrire QUE le jeton, et le jeton est écrit par l’aide ' +
        `partagée. Écritures trouvées : ${ecritures.join(', ')}`,
    ).toEqual([]);
  });
});
