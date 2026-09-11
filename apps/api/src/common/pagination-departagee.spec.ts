import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  construireOrderBy,
  TRIS_DISPONIBLES,
} from '../cataloging/tri-du-catalogue';

/**
 * TOUTE LISTE PAGINÉE A UN DÉPARTAGE — vérifié sur le code source.
 *
 * LE MOTIF, APPARU TROIS FOIS. Une requête paginée triée sur une clé NON UNIQUE
 * rend un ordre indéfini d'une page à l'autre : les lignes qui partagent la clé
 * peuvent sortir deux fois, ou jamais. Mesuré sur le catalogue : 339 collisions
 * sur 352 notices — 20 doublons et 20 notices invisibles sur 18 pages, 5,7 % du
 * fonds, en silence.
 *
 * Corrigé une première fois sur `/opac/parcourir`, puis noté au backlog pour
 * être relu au moment où quelqu'un paginerait. La note a fonctionné : le défaut
 * a été retrouvé sur `/cataloging/records`. Mais une note se lit une fois, et
 * c'était la troisième occurrence — d'où ce test, qui le tient pour toutes les
 * routes, présentes et futures.
 *
 * ⚠ POURQUOI IL LIT LE `orderBy` FRÈRE DU `skip`, et pas le plus proche. Ma
 * première version de ce relevé remontait au `orderBy` le plus proche, et
 * tombait donc sur celui d'une RELATION IMBRIQUÉE
 * (`contributors: { orderBy: { position } }`) — elle déclarait `/cataloging/records`
 * conforme alors qu'il portait le défaut. L'outil de mesure reproduisait
 * exactement la faute qu'il cherchait. Il ne retient désormais que le `orderBy`
 * de MÊME INDENTATION que le `skip` : son frère dans le même objet.
 */
/**
 * LES CONSTRUCTEURS DE TRI RECONNUS — ET CHACUN PORTE SA PREUVE.
 *
 * Une requête peut déléguer son `orderBy` à une fonction plutôt que l'écrire en
 * littéral. Le relevé ne peut pas lire un appel de fonction ; il accepte donc
 * les noms déclarés ici.
 *
 * ⚠ CE QUI EMPÊCHE CETTE LISTE D'ÊTRE UNE PORTE DE SORTIE : la clé est le nom
 * reconnu dans le code source, et la VALEUR est la preuve exécutable que ce
 * constructeur départage — sur TOUTES ses entrées, pas sur un échantillon. Un
 * nom ajouté sans preuve ne compile pas. C'est la même exigence que pour les
 * sept littéraux, exprimée une fois.
 */
const CONSTRUCTEURS_DEPARTAGES: Record<string, () => void> = {
  construireOrderBy: () => {
    // Le domaine d'entrée est fini et déclaré : on l'épuise.
    for (const tri of TRIS_DISPONIBLES) {
      for (const sens of ['asc', 'desc'] as const) {
        const clauses = construireOrderBy(tri, sens);
        expect(clauses.at(-1), `${tri} ${sens}`).toEqual({ id: sens });
        expect(clauses.length, `${tri} ${sens}`).toBe(2);
      }
    }
    // Et sans argument : la route qui ne passe pas de tri doit départager aussi.
    expect(construireOrderBy().at(-1)).toEqual({ id: 'desc' });
  },
};

const RACINE = join(__dirname, '..');

function fichiersSources(dossier: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSources(chemin));
    else if (entree.endsWith('.ts') && !entree.endsWith('.spec.ts')) sortie.push(chemin);
  }
  return sortie;
}

interface RequetePaginee {
  fichier: string;
  ligne: number;
  orderBy: string;
}

function requetesPaginees(): RequetePaginee[] {
  const trouvees: RequetePaginee[] = [];
  for (const fichier of fichiersSources(RACINE)) {
    const lignes = readFileSync(fichier, 'utf-8').split('\n');
    lignes.forEach((ligne, i) => {
      if (!ligne.includes('skip:')) return;
      const indentation = ligne.length - ligne.trimStart().length;
      let orderBy = '(aucun orderBy frère)';
      for (let j = i - 1; j >= 0 && j > i - 30; j--) {
        const candidate = lignes[j];
        if (!candidate.trim()) continue;
        const ind = candidate.length - candidate.trimStart().length;
        if (candidate.includes('orderBy:') && ind === indentation) {
          orderBy = candidate.trim();
          break;
        }
        if (ind < indentation - 2 && /findMany|await/.test(candidate)) break;
      }
      trouvees.push({ fichier: fichier.replace(RACINE, ''), ligne: i + 1, orderBy });
    });
  }
  return trouvees;
}

describe('pagination — aucune liste paginée sans départage', () => {
  const requetes = requetesPaginees();

  it('le relevé voit bien les requêtes paginées (témoin positif)', () => {
    // Sans ce témoin, un scanner cassé rendrait une liste vide et TOUS les
    // tests ci-dessous passeraient au vert en ne vérifiant rien.
    expect(requetes.length).toBeGreaterThanOrEqual(7);
    expect(requetes.some((r) => r.fichier.includes('cataloging'))).toBe(true);
  });

  it('⚠ CHAQUE requête paginée trie sur une clé qui départage (`id`)', () => {
    // `id` est la seule colonne dont l'unicité est garantie. Un second critère
    // non unique — `[status, createdAt]` par exemple — ne départage pas : deux
    // lignes peuvent partager les deux.
    const delegue = (orderBy: string) =>
      Object.keys(CONSTRUCTEURS_DEPARTAGES).some((nom) => orderBy.includes(`${nom}(`));
    const sansDepartage = requetes
      .filter((r) => !/\bid\b/.test(r.orderBy) && !delegue(r.orderBy))
      .map((r) => `${r.fichier}:${r.ligne} → ${r.orderBy}`);
    expect(sansDepartage, 'requêtes paginées sans départage').toEqual([]);
  });

  it.each(Object.keys(CONSTRUCTEURS_DEPARTAGES))(
    'le constructeur `%s` départage sur TOUTES ses entrées',
    (nom) => {
      CONSTRUCTEURS_DEPARTAGES[nom]();
    },
  );

  it('au moins une requête délègue son tri (témoin : la liste blanche sert)', () => {
    // Sans ce témoin, la liste blanche pourrait couvrir zéro requête et le test
    // ci-dessus vérifierait une fonction que personne n'appelle.
    const delegantes = requetes.filter((r) =>
      Object.keys(CONSTRUCTEURS_DEPARTAGES).some((nom) => r.orderBy.includes(`${nom}(`)),
    );
    expect(delegantes.length).toBeGreaterThanOrEqual(1);
  });

  it('aucune requête paginée n’est dépourvue de tri', () => {
    const sansTri = requetes
      .filter((r) => r.orderBy.startsWith('(aucun'))
      .map((r) => `${r.fichier}:${r.ligne}`);
    expect(sansTri, 'requêtes paginées sans aucun tri').toEqual([]);
  });
});
