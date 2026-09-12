import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ⚠ UNE ROUTE QUI CONSOMME UN IDENTIFIANT DOIT AVOIR UN PRODUCTEUR ATTEIGNABLE
 * PAR SON PROPRE TITULAIRE.
 *
 * *Posé le 12 septembre 2026, après `POST /depots/:id/reattribuer` : une route
 * correcte, gardée, testée — et sans aucun moyen d'obtenir son argument.*
 *
 * ⚠ CE GARDE NE TIENT PAS LA FAMILLE ENTIÈRE, ET LA BORNE EST MESURÉE, PAS
 * SUPPOSÉE. La forme large — « toute route à paramètre a une route qui produit
 * cet identifiant » — a été écrite, exécutée sur l'arbre D'AVANT la correction,
 * et elle a déclaré `POST /depots/:id/reattribuer` CONFORME. C'est-à-dire un
 * vert rassurant sur le cas exact qu'elle existait pour trouver.
 *
 * La cause est structurelle : `GET /depots/a-cataloguer` est bien une liste du
 * même contrôleur sous la même fonction, mais elle rend les dépôts VALIDÉS,
 * quand la réattribution consomme un dépôt SOUMIS. Savoir cela demande de lire
 * le `where` du SERVICE, pas les décorateurs du contrôleur. Un relevé de routes
 * ne peut pas trancher l'ÉTAT.
 *
 * Ce qui reste, et qui se ferme vraiment : **le producteur doit être ATTEIGNABLE
 * par le titulaire du consommateur**. C'est l'autre moitié du défaut, celle que
 * la session frontend a mesurée sur `ROLES_SYSTEME` — sous deux fonctions
 * distinctes, le bibliothécaire agit sans jamais voir la liste, et le
 * gestionnaire voit une liste dont l'action lui sera refusée APRÈS le clic.
 *
 * L'existence d'un producteur reste donc une QUESTION DE RECETTE, écrite dans
 * `CLAUDE.md` : « d'où vient le paramètre, et sous quelle fonction ? ». Le
 * garde ferme la seconde moitié ; la première ne se ferme pas par un relevé.
 */

const RACINE = join(__dirname, '..');
const VERBES = ['Get', 'Post', 'Patch', 'Put', 'Delete'] as const;

interface Route {
  cle: string;
  fichier: string;
  verbe: string;
  chemin: string;
  fonctions: string[];
}

function controleurs(dossier: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...controleurs(chemin));
    else if (entree.endsWith('.controller.ts')) sortie.push(chemin);
  }
  return sortie;
}

/** Extrait les routes d'UNE source — le paramètre `source` sert aux témoins. */
function routesDe(relatif: string, source: string): Route[] {
  const enTete = source.split('export class')[0] ?? '';
  const parClasse = /@RequiresFunctions\(([^)]*)\)/.exec(enTete);
  const fonctionsDeClasse = parClasse
    ? [...parClasse[1].matchAll(/FONCTIONS\.(\w+)/g)].map((m) => m[1])
    : [];

  const lignes = source.split('\n');
  const trouvees: Route[] = [];
  lignes.forEach((ligne, i) => {
    const m = new RegExp(`^  @(${VERBES.join('|')})\\(`).exec(ligne);
    if (!m) return;
    const chemin = /@\w+\('?([^')]*)'?\)/.exec(ligne.trim())?.[1] ?? '';

    let fin = i;
    while (fin + 1 < lignes.length && lignes[fin + 1].trim().startsWith('@')) fin++;
    const bloc = lignes.slice(i, fin + 1).join('\n');
    const propre = /@RequiresFunctions\(([^)]*)\)/.exec(bloc);
    const fonctions = propre
      ? [...propre[1].matchAll(/FONCTIONS\.(\w+)/g)].map((x) => x[1])
      : fonctionsDeClasse;

    trouvees.push({
      cle: `${relatif} :: ${m[1]} ${chemin}`.trim(),
      fichier: relatif,
      verbe: m[1],
      chemin,
      fonctions,
    });
  });
  return trouvees;
}

function toutesLesRoutes(): Route[] {
  return controleurs(RACINE).flatMap((f) =>
    routesDe(f.replace(RACINE + '/', ''), readFileSync(f, 'utf-8')),
  );
}

/**
 * Les routes signalées, avec la NATURE de l'exception et son motif.
 *
 * ⚠ DEUX NATURES, JAMAIS CONFONDUES. `produit-ailleurs` dit « c'est normal, et
 * voici où » ; `defaut-connu` dit « c'est un défaut suivi ». Si les deux
 * s'écrivaient pareil, cette liste deviendrait l'endroit où l'on enterre les
 * trouvailles — une ligne de plus et le garde se tait.
 */
const SIGNALEES: Record<string, { nature: 'produit-ailleurs' | 'defaut-connu'; motif: string }> = {
  'cataloging/cataloging.controller.ts :: Get records/:id/digital-copy/download-url': {
    nature: 'produit-ailleurs',
    motif:
      'L’identifiant de notice vient de `GET /cataloging/records` (catalogue.gerer). ' +
      'Les deux fonctions cohabitent chez l’Administrateur, seul rôle système à ' +
      'porter document.telecharger — vérifié sur ROLES_SYSTEME.',
  },
  'depots/depots.controller.ts :: Get :id/document': {
    nature: 'produit-ailleurs',
    motif:
      'Aucune fonction déclarée : les trois populations sont départagées DANS le ' +
      'service (déposant, directeur désigné, catalogueur). Chacune tient son ' +
      'identifiant de la liste qui lui est propre.',
  },
  'accounts/accounts.controller.ts :: Delete expected-students/:id': {
    nature: 'produit-ailleurs',
    motif:
      'Listés par `GET /enrollment/classes/:name/expected-students` (lecteurs.gerer), ' +
      'dans un autre contrôleur. Tout porteur d’outils.lecteurs porte lecteurs.gerer ' +
      '— vérifié sur ROLES_SYSTEME.',
  },
  'accounts/accounts.controller.ts :: Post :id/activate': {
    nature: 'produit-ailleurs',
    motif:
      'Les comptes en attente viennent de `GET /accounts` (lecteurs.voir). Tout ' +
      'porteur de comptes.activer porte lecteurs.voir — vérifié sur ROLES_SYSTEME. ' +
      '⚠ Un rôle PERSONNALISÉ pourrait rompre ce couple : c’est la limite connue.',
  },
};

/**
 * Les routes à paramètre dont aucun producteur du MÊME contrôleur n'est
 * atteignable sous leurs propres fonctions.
 *
 * Un producteur est une lecture sans paramètre ; il est atteignable si ses
 * fonctions sont incluses dans celles que le consommateur exige déjà —
 * `FunctionsGuard` exigeant TOUTES les fonctions listées, son titulaire les a
 * toutes.
 */
function signalables(routes: Route[]): Route[] {
  const consommateurs = routes.filter((r) => r.chemin.includes(':'));
  const producteurs = routes.filter((r) => r.verbe === 'Get' && !r.chemin.includes(':'));
  return consommateurs.filter((r) => {
    const besoin = new Set(r.fonctions);
    return !producteurs.some(
      (p) => p.fichier === r.fichier && p.fonctions.every((f) => besoin.has(f)),
    );
  });
}

/** Deux contrôleurs fabriqués, dont la réponse est connue PAR CONSTRUCTION. */
const TEMOIN_CONFORME = `
@Controller('temoins')
@RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
export class TemoinController {
  @Get()
  liste() {}
  @Post(':id/agir')
  agir() {}
}
`;
const TEMOIN_ORPHELIN = `
@Controller('orphelins')
export class OrphelinController {
  @Post(':id/agir')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  agir() {}
}
`;
const TEMOIN_HORS_ATTEINTE = `
@Controller('portee')
export class PorteeController {
  @Get()
  @RequiresFunctions(FONCTIONS.COMPTES_GERER)
  liste() {}
  @Post(':id/agir')
  @RequiresFunctions(FONCTIONS.OUTILS_LECTEURS)
  agir() {}
}
`;

/**
 * ⚠ TÉMOIN AJOUTÉ APRÈS UN CONTRÔLE NÉGATIF QUI NE TOMBAIT PAS. Relâcher la
 * décision d'atteignabilité de `every` en `some` ne faisait rien tomber : mes
 * trois témoins avaient tous des producteurs à UNE seule fonction, cas où les
 * deux quantificateurs coïncident. Le code muté s'exécutait, sur un jeu d'essai
 * qui ne contenait pas le cas — la cinquième lecture.
 *
 * Ici le producteur en exige DEUX et le consommateur n'en a qu'une : il est donc
 * hors d'atteinte, et seul `every` le voit.
 */
const TEMOIN_PARTIELLEMENT_ATTEIGNABLE = `
@Controller('partiel')
export class PartielController {
  @Get()
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER, FONCTIONS.COMPTES_GERER)
  liste() {}
  @Post(':id/agir')
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  agir() {}
}
`;

describe('L’instrument : ses deux témoins, et aucun ne vient du code mesuré', () => {
  it('⚠ TÉMOIN DE PRÉSENCE — il signale une route dont le producteur manque', () => {
    const r = signalables(routesDe('<<orphelin>>', TEMOIN_ORPHELIN));
    expect(r.map((x) => x.cle)).toEqual(['<<orphelin>> :: Post :id/agir']);
  });

  it('⚠ TÉMOIN DE PRÉSENCE — et une route dont le producteur est HORS D’ATTEINTE', () => {
    // La confusion plausible : le producteur EXISTE. C'est sa fonction qui le
    // rend inutile au titulaire du consommateur.
    const r = signalables(routesDe('<<portee>>', TEMOIN_HORS_ATTEINTE));
    expect(r.map((x) => x.cle)).toEqual(['<<portee>> :: Post :id/agir']);
  });

  it('⚠ TÉMOIN DE PRÉSENCE — un producteur PARTIELLEMENT atteignable ne l’est pas', () => {
    // Le producteur exige deux fonctions, le consommateur n'en porte qu'une :
    // en partager une ne suffit pas, `FunctionsGuard` les exige TOUTES.
    const r = signalables(routesDe('<<partiel>>', TEMOIN_PARTIELLEMENT_ATTEIGNABLE));
    expect(r.map((x) => x.cle)).toEqual(['<<partiel>> :: Post :id/agir']);
  });

  it('⚠ TÉMOIN D’ABSENCE — il ne signale PAS une route correctement appariée', () => {
    // Sans celui-ci, un instrument qui signale tout serait indiscernable d'un
    // instrument juste — et plus rassurant, puisqu'il trouverait toujours.
    expect(signalables(routesDe('<<conforme>>', TEMOIN_CONFORME))).toEqual([]);
  });

  it('il voit bien la population réelle (témoin de compte, borne basse assumée)', () => {
    // ⚠ Un compte EXACT sur les 91 routes à paramètre ferait échouer ce garde à
    // chaque route neuve, même conforme — un coût sans contrepartie, puisque la
    // liste d'exceptions ci-dessous joue déjà ce rôle pour les cas qui comptent.
    const routes = toutesLesRoutes();
    expect(routes.filter((r) => r.chemin.includes(':')).length).toBeGreaterThan(80);
    expect(routes.some((r) => r.cle.endsWith('Post :id/reattribuer'))).toBe(true);
  });
});

describe('⚠ Le producteur de l’argument est atteignable sous la fonction du consommateur', () => {
  const signalees = signalables(toutesLesRoutes()).map((r) => r.cle).sort();
  const declarees = Object.keys(SIGNALEES).sort();

  it('aucune route signalée qui ne soit déclarée', () => {
    const nouvelles = signalees.filter((c) => !(c in SIGNALEES));
    expect(
      nouvelles,
      'Cette route prend un identifiant qu’aucune lecture de son contrôleur ne ' +
        'produit sous ses propres fonctions.\n' +
        'Deux issues, et une seule est un aveu :\n' +
        ' · le producteur existe ailleurs (autre contrôleur, ou identifiant que ' +
        'l’appelant détient par construction) → déclarez-le `produit-ailleurs` ' +
        'en NOMMANT la route qui le rend ;\n' +
        ' · personne ne peut obtenir cet identifiant → c’est le défaut de ' +
        '`reattribuer`, déclarez-le `defaut-connu` et ouvrez le point de backlog.\n' +
        '⚠ « L’appelant le connaît » n’est pas une réponse : personne ne connaît ' +
        'un UUID.',
    ).toEqual([]);
  });

  it('⚠ et aucune déclaration PÉRIMÉE — une route redevenue conforme sort de la liste', () => {
    // Le jour où la route de liste naît, l'exception devient fausse. Une dette
    // qui ne se rappelle pas d'elle-même n'est pas une dette, c'est un oubli en
    // attente.
    const perimees = declarees.filter((c) => !signalees.includes(c));
    expect(
      perimees,
      'Ces routes sont déclarées comme signalées et ne le sont plus : un ' +
        'producteur atteignable est apparu dans leur contrôleur. Retirez la ligne.',
    ).toEqual([]);
  });

  it('⚠ aucun `defaut-connu` ne dort sans être nommé', () => {
    // Les deux natures ne se valent pas : celle-ci est une trouvaille mise de
    // côté, pas une normalité. Elle doit rester visible dans le rapport.
    const defauts = Object.entries(SIGNALEES).filter(([, v]) => v.nature === 'defaut-connu');
    expect(defauts.map(([c]) => c)).toEqual([]);
  });
});
