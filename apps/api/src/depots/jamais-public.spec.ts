import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLES_JAMAIS_PUBLIQUES } from './etats';

/**
 * ⚠ UN DÉPÔT N'EST JAMAIS PUBLIC, QUEL QUE SOIT SON ÉTAT.
 *
 * C'est la propriété la plus coûteuse de la phase si elle se perd. Un dépôt non
 * validé qui sort dans l'entrepôt OAI est ARCHIVÉ PAR UN TIERS : il survit à la
 * correction, et il faut ensuite demander une désindexation pour le défaire.
 * L'OPAC se corrige au rechargement suivant ; un moissonneur, non.
 *
 * ## Elle est garantie par CONSTRUCTION, et c'est mieux qu'un filtre
 *
 * `deposits` est une table DISTINCTE de `biblio_records`, et ni l'OPAC ni
 * l'entrepôt OAI ne la lisent. Il n'y a donc rien à filtrer — il n'y a rien à
 * voir. Ce qui devient public est la NOTICE créée au catalogage, et elle seule.
 *
 * C'est exactement pourquoi la table est distincte plutôt qu'un état sur la
 * notice : avec un état, la propriété aurait dépendu de 14 filtres publics
 * écrits à la main, et un seul oublié la perdait.
 *
 * ## Ce que ce test ajoute
 *
 * Un garde NÉGATIF : aucun fichier des surfaces publiques ne mentionne les
 * dépôts. Il tombe le jour où quelqu'un « enrichit » l'OPAC des dépôts en
 * cours — avec les meilleures intentions, et sans relire ce fichier.
 *
 * ⚠ Il ne PROUVE pas l'absence à l'exécution, et il ne le prétend pas : il
 * constate qu'aucun code des surfaces publiques ne nomme la table. C'est une
 * borne de relevé, pas de comportement, et elle est écrite ici plutôt que tue.
 */

/** Les répertoires qui servent une surface PUBLIQUE (sans session requise). */
const SURFACES_PUBLIQUES = ['opac', 'oai', 'tenancy', 'sru'] as const;

/**
 * Fichiers de ces répertoires qui NE servent pas une surface publique —
 * exceptions par CHEMIN EXACT, avec leur motif.
 *
 * ⚠ Trouvées par le garde lui-même à sa première exécution, et l'exception est
 * juste : `tenant-schema.ts` nomme `deposits` dans la DDL de PROVISIONNEMENT
 * (la liste des tables à créer par école). Ce n'est pas une lecture, c'est la
 * création du schéma — et l'y interdire empêcherait la table d'exister.
 *
 * ⚠ Par chemin exact et non par répertoire : excepter tout `tenancy/` aurait
 * couvert `tenancy.service.ts`, qui sert bel et bien `/tenancy/home` au public.
 */
const HORS_SURFACE: Record<string, string> = {
  'tenancy/tenant-schema.ts': 'DDL de provisionnement : crée la table, ne la lit pas',
};

function fichiersDe(repertoire: string): { chemin: string; source: string }[] {
  const racine = join(__dirname, '..', repertoire);
  const sortie: { chemin: string; source: string }[] = [];
  const parcourir = (dossier: string, prefixe: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin, `${prefixe}${e.name}/`);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        sortie.push({ chemin: prefixe + e.name, source: readFileSync(chemin, 'utf8') });
      }
    }
  };
  try {
    parcourir(racine, `${repertoire}/`);
  } catch {
    // Répertoire absent (ex. `sru` un jour retiré) : rien à contrôler.
  }
  return sortie;
}

describe("L'instrument : le relevé des surfaces publiques", () => {
  it('⚠ il trouve bien du code à contrôler dans CHAQUE surface', () => {
    // ⚠ TÉMOIN. Un relevé qui ne lirait aucun fichier rendrait « aucune
    // mention » — le vert le plus rassurant et le plus vide. Trois des quatre
    // surfaces doivent au minimum exister.
    const compte = SURFACES_PUBLIQUES.map((s) => ({ s, n: fichiersDe(s).length }));
    expect(compte.filter((c) => c.n > 0).length).toBeGreaterThanOrEqual(3);
    for (const { s, n } of compte.filter((c) => c.n > 0)) {
      expect(n, s).toBeGreaterThan(0);
    }
  });

  it('⚠ chaque exception désigne un fichier qui EXISTE — aucune ne se périme', () => {
    // Une exception qui ne correspond plus à rien couvre silencieusement autre
    // chose : c'est la mécanique de tous les garde-fous de ce dépôt.
    const tous = SURFACES_PUBLIQUES.flatMap((s) => fichiersDe(s)).map((f) => f.chemin);
    for (const chemin of Object.keys(HORS_SURFACE)) {
      expect(tous, `exception périmée : ${chemin}`).toContain(chemin);
    }
  });

  it('⚠ et l’exception ne masque QUE ce fichier — la surface reste contrôlée', () => {
    // Contrôle de la portée : `tenancy` compte plus d'un fichier, donc excepter
    // le sien ne désarme pas la surface.
    expect(fichiersDe('tenancy').length).toBeGreaterThan(
      Object.keys(HORS_SURFACE).filter((c) => c.startsWith('tenancy/')).length,
    );
  });

  it('et il VOIT ce qu’il doit voir : l’OPAC nomme bien `biblioRecord`', () => {
    // Témoin positif nommé : si le relevé ne trouvait pas la table que l'OPAC
    // lit RÉELLEMENT, il ne trouverait pas non plus celle qu'il ne doit pas.
    const opac = fichiersDe('opac').map((f) => f.source).join('\n');
    expect(opac).toContain('biblioRecord');
  });
});

describe('⚠ AUCUNE surface publique ne nomme les dépôts', () => {
  for (const surface of SURFACES_PUBLIQUES) {
    it(`${surface} : aucune mention`, () => {
      const fautifs: string[] = [];
      for (const { chemin, source } of fichiersDe(surface)) {
        if (HORS_SURFACE[chemin]) continue;
        // On retire les commentaires : une mention qui EXPLIQUE pourquoi les
        // dépôts ne sortent pas est légitime, et l'interdire ferait taire la
        // raison. (Leçon payée sur le relevé de `redis` le 12 septembre.)
        const code = source
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|\s)\/\/.*$/gm, '$1');
        for (const table of TABLES_JAMAIS_PUBLIQUES) {
          // `deposit` couvre `deposits`, `db.deposit`, `Deposit`.
          if (/\bdeposit/i.test(code)) fautifs.push(`${chemin} (${table})`);
        }
      }
      expect(fautifs, `surfaces publiques mentionnant un dépôt : ${fautifs.join(', ')}`)
        .toEqual([]);
    });
  }

  it('⚠ et la table n’est pas dans le contrat de la notice publique', () => {
    // `contrat-notice-publique.ts` énumère ce que l'OPAC sert. Un dépôt n'y a
    // rien à faire, et cette assertion tombe si quelqu'un l'y ajoute.
    const contrat = readFileSync(
      join(__dirname, '..', 'opac', 'contrat-notice-publique.ts'),
      'utf8',
    );
    expect(/\bdeposit/i.test(contrat)).toBe(false);
  });
});
