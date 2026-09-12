import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ⚠ CHAQUE COLONNE DE `BiblioRecord` EST ÉCRIVABLE, OU DÉCLARÉE NON-ÉCRIVABLE
 * AVEC SA RAISON.
 *
 * ## D'où vient ce garde, et il vient d'une faute commise DEUX FOIS le même jour
 *
 * `Author.userId` a été posée en P6-1 « pour que Mes encadrements soit
 * calculable » — et rien ne l'écrivait. Trouvé, réparé, leçon versée.
 *
 * **Quatre heures plus tard, `embargoUntil` était dans le même état.** Posée le
 * matin par P6-4 : la colonne existait, la décision d'accès la lisait, le
 * contrat public la servait, quatorze tests la couvraient, la migration était
 * passée sur les deux écoles. **Aucune route ne l'écrivait.** Une thèse sous
 * confidentialité ne pouvait être déclarée telle par personne — le refus était
 * complet et inatteignable.
 *
 * ⚠ Et le balayage écrit entre les deux ne l'avait pas vue : il comptait
 * `select: { embargoUntil: true }` comme une écriture. Un relevé par GREP ne
 * sait pas distinguer une lecture d'une écriture, parce que les deux ont la
 * même forme. Deux classificateurs corrigés, le symptôme s'est déplacé — le
 * signal connu qu'on affine une réponse à une question mal posée.
 *
 * ## Ce que ce garde fait à la place
 *
 * Il ne balaie rien : il porte un INVENTAIRE DÉCLARÉ sur UN modèle, celui dont
 * les colonnes se paient le plus cher. Chaque colonne est dans l'une des deux
 * listes, et une colonne neuve ne l'est dans aucune — le test échoue alors en
 * disant quoi faire. C'est la forme d'`objets-non-modelises` et de
 * `COLONNES_SERVIES`, et c'est la seule qui ne se périme pas toute seule.
 */

const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
const DTO = readFileSync(join(__dirname, 'dto', 'create-record.dto.ts'), 'utf8');
const SERVICE = readFileSync(join(__dirname, 'cataloging.service.ts'), 'utf8');

/**
 * Les champs déclarés par `CreateRecordDto`.
 *
 * ⚠ PAR UNE REGEX DE DÉCLARATION, PAS PAR `includes('champ?:')`. La première
 * écriture cherchait le point d'interrogation — et `title: string;` est
 * OBLIGATOIRE, donc sans lui. L'instrument déclarait orpheline la colonne la
 * plus évidemment saisissable du modèle. Un relevé qui présume une forme ne
 * voit pas ce qui s'en écarte.
 */
const CHAMPS_DU_DTO = new Set(
  [...DTO.matchAll(/^\s{2}(\w+)[!?]?\s*:/gm)].map((m) => m[1]),
);

/** Les colonnes scalaires de `BiblioRecord`, lues dans le schéma RÉEL. */
function colonnesDuModele(modele: string): string[] {
  const bloc = new RegExp(`^model ${modele} \\{(.*?)^\\}`, 'sm').exec(SCHEMA);
  if (!bloc) throw new Error(`modèle ${modele} introuvable`);
  const scalaires = new Set([
    'String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal', 'BigInt', 'Bytes',
  ]);
  const out: string[] = [];
  for (const ligne of bloc[1].split('\n')) {
    const l = ligne.trim();
    if (!l || l.startsWith('//') || l.startsWith('///') || l.startsWith('@@')) continue;
    const [nom, type] = l.split(/\s+/);
    if (!type) continue;
    // Un enum est scalaire du point de vue de l'écriture : `marcFormat` compte.
    const base = type.replace(/[?[\]]/g, '');
    if (!scalaires.has(base) && !/^[A-Z]/.test(base)) continue;
    if (/^[A-Z]/.test(base) && !scalaires.has(base) && !/MarcFormat/.test(base)) continue;
    out.push(nom);
  }
  return out;
}

/**
 * Les colonnes qu'AUCUN chemin de saisie ne pose, avec la raison.
 *
 * ⚠ DEUX NATURES, JAMAIS CONFONDUES — c'est ce qui empêche cette liste de
 * devenir l'endroit où l'on enterre les trouvailles :
 *  · `technique` — la colonne n'a pas à être saisie, et ne l'aura jamais ;
 *  · `derive`    — elle est CALCULÉE par le service à partir d'autre chose.
 *
 * Une colonne qui devrait être saisie et ne l'est pas n'a pas sa place ici :
 * c'est un défaut, pas une exception.
 */
/**
 * ⚠ `marcData` N'EST PAS DANS CETTE LISTE, ET LE GARDE ME L'A APPRIS. Je l'y
 * avais mise — « description d'origine d'un import, jamais saisie à la main ».
 * Faux : `CreateRecordDto` l'accepte, c'est ainsi qu'un client dépose une
 * notice MARC complète. Ce qu'elle a de particulier est ailleurs — l'invariant
 * I3 interdit de l'ÉCRASER à la modification, pas de la poser à la création.
 *
 * Un garde qui corrige la déclaration de celui qui l'écrit vaut mieux qu'un
 * garde qui la recopie.
 */
const NON_ECRIVABLES: Record<string, { nature: 'technique' | 'derive'; motif: string }> = {
  id: { nature: 'technique', motif: 'identifiant — invariant I1, il ne change JAMAIS' },
  createdAt: { nature: 'technique', motif: 'horodatage posé par le SGBD' },
  updatedAt: { nature: 'technique', motif: 'horodatage posé par Prisma' },
  author: {
    nature: 'derive',
    motif:
      'dénormalisation transitoire — la VALEUR stockée suit le premier ' +
      'AUTEUR_PRINCIPAL (P3-3). Le DTO l’accepte encore, déprécié : il est ' +
      'converti en contributeur, il n’atteint pas la colonne directement',
  },
  profile: {
    nature: 'derive',
    motif: 'déduit de `recordType` par `profilPourTypeDeNotice` — le saisir permettrait une thèse bibliographique',
  },
  profileData: {
    nature: 'derive',
    motif: 'recomposé à chaque écriture depuis les champs de profil (P3-3 temps 1)',
  },
  coverUrl: {
    nature: 'derive',
    motif: 'posée par l’enrichissement de métadonnées et le téléversement de couverture',
  },
};

describe('⚠ L’instrument : il lit le schéma RÉEL', () => {
  it('il trouve les colonnes de `BiblioRecord`, dont deux que je SAIS présentes', () => {
    // ⚠ TÉMOIN NOMMÉ. Une regex qui ne correspondrait à rien rendrait une liste
    // vide, et tous les cas ci-dessous passeraient sans rien mesurer.
    const cols = colonnesDuModele('BiblioRecord');
    expect(cols).toContain('title');
    expect(cols).toContain('embargoUntil');
    expect(cols.length).toBeGreaterThan(15);
  });
});

describe('⚠ Chaque colonne est écrivable, ou déclarée non-écrivable', () => {
  const COLONNES = colonnesDuModele('BiblioRecord');

  it('⚠ aucune colonne n’est laissée hors des deux listes', () => {
    const orphelines = COLONNES.filter((c) => !NON_ECRIVABLES[c] && !CHAMPS_DU_DTO.has(c));
    expect(
      orphelines,
      'ces colonnes ne sont posables par AUCUN chemin de saisie, et ne sont pas ' +
        'déclarées non-écrivables. Deux issues : les ajouter à `CreateRecordDto` ' +
        'et à la charge d’écriture du service, ou les déclarer dans ' +
        '`NON_ECRIVABLES` avec leur nature et leur motif. Les laisser ici, c’est ' +
        'garder une colonne que personne ne peut poser — le défaut d’`embargoUntil`.',
    ).toEqual([]);
  });

  it('⚠ une colonne TECHNIQUE qui apparaît au formulaire est refusée', () => {
    // ⚠ C'EST ICI QUE LES DEUX NATURES GAGNENT LEUR PLACE, et je l'ai appris en
    // écrivant ce test : `author` est DÉRIVÉE et pourtant PRÉSENTE au DTO — il
    // l'accepte, déprécié, et le convertit en contributeur. Interdire les deux
    // natures au DTO aurait donc été faux.
    //
    // Une colonne `technique`, elle, n'a rien à faire au formulaire : un `id`
    // ou un `createdAt` saisissable est une porte sur l'invariant I1 ou sur
    // l'horodatage. Une déclaration périmée est refusée le jour où elle ment.
    for (const [colonne, e] of Object.entries(NON_ECRIVABLES)) {
      if (e.nature !== 'technique') continue;
      expect(CHAMPS_DU_DTO.has(colonne), `${colonne} (${e.motif})`).toBe(false);
    }
  });

  it('⚠ toute colonne du DTO atteint vraiment la charge d’écriture', () => {
    // ⚠ LE DÉFAUT SUIVANT DE LA MÊME FAMILLE : un champ présent au DTO que le
    // service n'utilise pas. La saisie serait acceptée, validée, et perdue —
    // « la trace de succès qui précède l'acte », appliquée à un formulaire.
    const auDto = COLONNES.filter((c) => CHAMPS_DU_DTO.has(c));
    expect(auDto.length, 'le relevé du DTO ne trouve rien').toBeGreaterThan(10);
    for (const c of auDto) {
      expect(SERVICE, `${c} est au DTO mais le service ne l’écrit pas`).toMatch(
        new RegExp(`\\b${c}\\s*:`),
      );
    }
  });

  it('les deux natures d’exception restent distinctes et motivées', () => {
    for (const [colonne, e] of Object.entries(NON_ECRIVABLES)) {
      expect(['technique', 'derive'], colonne).toContain(e.nature);
      expect(e.motif.length, colonne).toBeGreaterThan(20);
    }
  });
});
