import { describe, expect, it } from 'vitest';
import { FONCTIONS, ROLES_SYSTEME } from './functions';
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

// ═══════════════════════════════════════════════════════════════════════════
// LE SECOND ARGUMENT — celui qui voyage dans le CORPS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ TROISIÈME OCCURRENCE, ET C'ÉTAIT MA BORNE DÉCLARÉE. La partie ci-dessus
// regarde UN producteur par consommateur : le paramètre de CHEMIN. Or une
// action peut prendre DEUX identifiants — `POST /depots/:id/reattribuer` prend
// le dépôt (chemin) ET le nouveau directeur (corps).
//
// Le dépôt était servi par `GET /depots/soumis` sous `catalogue.gerer` ; le
// directeur, par `GET /depots/directeurs` sous `depot.deposer`, que le
// bibliothécaire n'a pas. La route était donc atteignable à moitié — et la
// moitié manquante ne se voyait qu'à l'usage.
//
// ⚠ CE QUI SE CALCULE ET CE QUI NE SE CALCULE PAS, et c'est la même frontière
// qu'en haut : personne ne peut DEVINER quelle route produit un `directorId`.
// Ce qui se calcule, une fois la réponse DÉCLARÉE, c'est que le producteur
// existe et qu'il soit ATTEIGNABLE sous les fonctions du consommateur. C'est
// précisément la moitié qui a échoué.
//
// La déclaration coûte une ligne par route. C'est le bon coût : la 20ᵉ route
// qui prendra un identifiant dans son corps sera un CHOIX ÉCRIT.

/** D'où vient chaque identifiant transporté par un corps de requête. */
/**
 * ⚠ TROIS NATURES, JAMAIS CONFONDUES — même exigence qu'en haut.
 *
 * · `atteignable` — le titulaire peut appeler le producteur. C'est le cas
 *   normal, et le seul que le garde VÉRIFIE mécaniquement.
 * · `optionnel-garde` — le champ est OPTIONNEL, et le droit de s'en servir est
 *   lui-même gardé. Celui qui ne peut pas atteindre la liste ne peut pas non
 *   plus poser la valeur : rien ne lui manque.
 * · `defaut-connu` — un défaut suivi. Un test refuse qu'il en dorme un sans
 *   être nommé dans le rapport.
 *
 * Si les trois s'écrivaient pareil, cette liste deviendrait l'endroit où l'on
 * enterre les trouvailles.
 */
type NatureArgument = 'atteignable' | 'optionnel-garde' | 'defaut-connu';

const ARGUMENTS_DU_CORPS: Record<
  string,
  { champ: string; producteur: string; nature?: NatureArgument; motif?: string }[]
> = {
  'depots/depots.controller.ts :: Post :id/reattribuer': [
    {
      champ: 'directorId',
      // ⚠ LA TROISIÈME OCCURRENCE, CORRIGÉE : la liste des dépôts soumis porte
      // désormais ELLE-MÊME ses directeurs désignables. `GET /depots/directeurs`
      // reste sous `depot.deposer` pour l'étudiant — élargir cette fonction au
      // bibliothécaire lui aurait donné le droit de DÉPOSER, un droit
      // d'écriture pour un problème de lecture.
      producteur: 'depots/depots.controller.ts :: Get soumis',
    },
  ],
  'depots/depots.controller.ts :: Patch :id/directeur': [
    { champ: 'directorId', producteur: 'depots/depots.controller.ts :: Get directeurs' },
  ],
  'depots/depots.controller.ts :: Post': [
    { champ: 'directorId', producteur: 'depots/depots.controller.ts :: Get directeurs' },
  ],
  'depots/depots.controller.ts :: Post :id/notice': [
    {
      champ: 'recordId',
      producteur: 'cataloging/cataloging.controller.ts :: Get records',
      motif: 'le bibliothécaire choisit dans le catalogue la notice à rattacher',
    },
  ],
  'access-control/access-control.controller.ts :: Patch :id': [
    { champ: 'parentId', producteur: 'access-control/access-control.controller.ts :: Get' },
  ],
  'access-control/access-control.controller.ts :: Post': [
    { champ: 'sourceId', producteur: 'access-control/access-control.controller.ts :: Get' },
  ],
  'access-control/access-control.controller.ts :: Post :id/records': [
    { champ: 'recordId', producteur: 'cataloging/cataloging.controller.ts :: Get records' },
  ],
  'access-control/access-control.controller.ts :: Post :id/titles': [
    { champ: 'titleId', producteur: 'cataloging/cataloging.controller.ts :: Get records' },
  ],
  'accounts/accounts.controller.ts :: Patch :id': [
    { champ: 'roleId', producteur: 'accounts/accounts.controller.ts :: Get assignable-roles' },
  ],
  'accounts/accounts.controller.ts :: Patch :id/role': [
    { champ: 'roleId', producteur: 'accounts/accounts.controller.ts :: Get assignable-roles' },
  ],
  'accounts/accounts.controller.ts :: Post :id/activate': [
    {
      champ: 'roleId',
      producteur: 'accounts/accounts.controller.ts :: Get assignable-roles',
      // ⚠ MESURÉ SUR ROLES_SYSTEME : le Gestionnaire porte `comptes.activer`
      // et PAS `comptes.gerer` — il ne peut donc pas lire la liste des rôles.
      // Ce n'est pas un défaut : c'est l'ANTI-ESCALADE voulue. `roleId` est
      // OPTIONNEL, et poser un rôle exige `comptes.gerer` en plus. Le
      // Gestionnaire active sans poser de rôle ; rien ne lui manque.
      //
      // C'est la borne de la vérification mécanique : un argument optionnel
      // dont l'usage est lui-même gardé n'a pas besoin d'un producteur
      // atteignable.
      nature: 'optionnel-garde',
      motif:
        'roleId est optionnel ; poser un rôle exige comptes.gerer EN PLUS de ' +
        'comptes.activer (anti-escalade). Qui ne voit pas la liste ne peut pas ' +
        'poser la valeur.',
    },
  ],
  'authors/authors-admin.controller.ts :: Patch :id/compte': [
    {
      champ: 'userId',
      producteur: 'patrons/patrons.controller.ts :: Get comptes-a-lier',
      motif: 'la liste des comptes rattachables, faite pour ce geste',
    },
  ],
  'authors/authors-admin.controller.ts :: Post :id/merge': [
    { champ: 'intoId', producteur: 'authors/authors-admin.controller.ts :: Get' },
  ],
  'circulation/circulation.controller.ts :: Post holds': [
    { champ: 'recordId', producteur: 'cataloging/cataloging.controller.ts :: Get records' },
  ],
  'enrollment/enrollment.controller.ts :: Patch classes/:id': [
    {
      champ: 'userId',
      producteur: 'enrollment/enrollment.controller.ts :: Get enrollments',
      motif: 'le responsable d’une classe se choisit parmi les inscrits de l’école',
    },
  ],
  'patrons/patrons.controller.ts :: Patch :id': [
    { champ: 'userId', producteur: 'patrons/patrons.controller.ts :: Get comptes-a-lier' },
  ],
  'patrons/patrons.controller.ts :: Post': [
    { champ: 'userId', producteur: 'patrons/patrons.controller.ts :: Get comptes-a-lier' },
  ],
  'offline-licensing/offline-licensing.controller.ts :: Post licenses': [
    {
      champ: 'docId',
      producteur: 'offline-licensing/offline-licensing.controller.ts :: Get my-documents',
      motif: 'l’application mobile choisit parmi les documents auxquels le lecteur a droit',
    },
    {
      champ: 'deviceId',
      producteur: 'offline-licensing/offline-licensing.controller.ts :: Get my-documents',
      nature: 'atteignable',
      motif:
        '⚠ L’APPAREIL EST ENRÔLÉ PAR L’APPLICATION ELLE-MÊME (POST /devices) : ' +
        'elle détient son identifiant par construction, il ne se liste pas. Le ' +
        'producteur déclaré est donc formel — c’est la borne de ce garde, qui ' +
        'ne sait pas dire « détenu par construction ».',
    },
  ],
  'reader/reader.controller.ts :: Post holds': [
    { champ: 'recordId', producteur: 'opac/opac.controller.ts :: Get search' },
  ],
};

/** Du nom de constante (`CATALOGUE_GERER`) au code (`catalogue.gerer`). */
function codeDe(nom: string): string {
  return (FONCTIONS as Record<string, string>)[nom] ?? nom;
}

/** Les classes de DTO et leurs champs se terminant par `Id`. */
function dtosAvecIdentifiant(): Map<string, string[]> {
  const sortie = new Map<string, string[]>();
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (entree.endsWith('.ts') && chemin.includes('/dto/')) {
        const source = readFileSync(chemin, 'utf-8');
        for (const m of source.matchAll(/export class (\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
          const champs = [...m[2].matchAll(/^ {2}(\w+)[?!]?\s*:/gm)]
            .map((c) => c[1])
            .filter((c) => /Id$/.test(c));
          if (champs.length) sortie.set(m[1], champs);
        }
      }
    }
  };
  parcourir(RACINE);
  return sortie;
}

/** Les routes dont le CORPS transporte au moins un identifiant. */
function consommateursParLeCorps(): { cle: string; champs: string[]; fonctions: string[] }[] {
  const dtos = dtosAvecIdentifiant();
  const sortie: { cle: string; champs: string[]; fonctions: string[] }[] = [];

  for (const fichier of controleurs(RACINE)) {
    const relatif = fichier.replace(RACINE + '/', '');
    const source = readFileSync(fichier, 'utf-8');
    const routes = routesDe(relatif, source);
    // ⚠ ON REMONTE DEPUIS LE `@Body`, jamais l'inverse. Un bloc « du décorateur
    // jusqu'à l'accolade » se coupe mal : la liste des paramètres vient APRÈS
    // le nom de la méthode, et ma première version manquait donc le cas connu.
    // C'est le témoin de population qui l'a dit, pas ma relecture.
    const positions = [...source.matchAll(/^ {2}@(?:Get|Post|Patch|Put|Delete)\(/gm)].map(
      (m) => m.index ?? 0,
    );
    for (const m of source.matchAll(/@Body\(\)\s*\w+\s*:\s*(\w+)/g)) {
      const champs = dtos.get(m[1]);
      if (!champs) continue;
      const precedents = positions.filter((p) => p < (m.index ?? 0));
      if (!precedents.length) continue;
      const rang = positions.indexOf(precedents[precedents.length - 1]);
      const route = routes[rang];
      if (route) sortie.push({ cle: route.cle, champs, fonctions: route.fonctions });
    }
  }
  return sortie;
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

describe('⚠ LE SECOND ARGUMENT — d’où vient CHACUN, pas seulement le premier', () => {
  const consommateurs = consommateursParLeCorps();
  const toutes = new Map(toutesLesRoutes().map((r) => [r.cle, r]));

  it('le relevé voit le cas connu, et il en voit plusieurs (témoins)', () => {
    // ⚠ TÉMOIN DE POPULATION, et il a servi : ma première extraction découpait
    // « du décorateur jusqu'à l'accolade », ce qui coupe AVANT la liste des
    // paramètres — le `@Body` n'y était jamais. Elle rendait zéro route, et
    // seul ce témoin l'a dit.
    expect(consommateurs.length, 'le relevé ne voit aucune route à identifiant de corps').toBeGreaterThan(10);
    const reattribuer = consommateurs.find((c) => c.cle.endsWith('Post :id/reattribuer'));
    expect(reattribuer, 'le cas connu manque au relevé').toBeTruthy();
    expect(reattribuer!.champs).toContain('directorId');
  });

  it('⚠ chaque identifiant de corps DÉCLARE d’où il vient', () => {
    const nouvelles = consommateurs
      .filter((c) => !(c.cle in ARGUMENTS_DU_CORPS))
      .map((c) => `${c.cle} ← ${c.champs.join(', ')}`);
    expect(
      [...new Set(nouvelles)],
      'Cette route prend un identifiant dans son CORPS, et rien ne dit d’où il ' +
        'vient. ' +
        '⚠ « L’appelant le connaît » n’est pas une réponse : personne ne connaît ' +
        'un UUID. ' +
        'Déclarez la route qui le produit dans `ARGUMENTS_DU_CORPS`. Le garde ' +
        'vérifiera alors qu’elle existe ET qu’elle est atteignable sous vos ' +
        'fonctions — c’est cette seconde moitié qui a manqué à ' +
        '`POST /depots/:id/reattribuer`, trois fois en deux jours.',
    ).toEqual([]);
  });

  it('⚠ le producteur déclaré EXISTE — une déclaration ne vaut pas un chemin', () => {
    const fantomes: string[] = [];
    for (const [consommateur, args] of Object.entries(ARGUMENTS_DU_CORPS)) {
      for (const a of args) {
        if (!toutes.has(a.producteur)) fantomes.push(`${consommateur} → ${a.producteur}`);
      }
    }
    expect(fantomes, 'producteur déclaré introuvable dans l’inventaire des routes').toEqual([]);
  });

  it('⚠ ET LE PRODUCTEUR EST ATTEIGNABLE SOUS LES FONCTIONS DU CONSOMMATEUR', () => {
    // ⚠ C'EST LA MOITIÉ QUI SE CALCULE, ET C'EST CELLE QUI A ÉCHOUÉ. Personne
    // ne peut DEVINER quelle route produit un `directorId` — mais une fois la
    // réponse déclarée, l'inclusion des fonctions se vérifie toute seule.
    //
    // `reattribuer` (catalogue.gerer) pointait vers `GET /depots/directeurs`
    // (depot.deposer) : le bibliothécaire pouvait agir sans jamais voir la
    // liste. Ce test l'aurait dit.
    const hors: string[] = [];
    for (const [cle, args] of Object.entries(ARGUMENTS_DU_CORPS)) {
      const consommateur = toutes.get(cle);
      if (!consommateur) continue; // couvert par le test des déclarations périmées
      const besoin = new Set(consommateur.fonctions);
      for (const a of args) {
        // ⚠ SEULE LA NATURE `atteignable` PROMET L'ATTEIGNABILITÉ. Un argument
        // optionnel dont l'usage est gardé ne la promet pas, et l'exiger ferait
        // crier le garde sur une anti-escalade délibérée — un garde qui crie à
        // tort se contourne.
        if ((a.nature ?? 'atteignable') !== 'atteignable') continue;
        const producteur = toutes.get(a.producteur);
        if (!producteur) continue;

        // ⚠ LE BON CRITÈRE N'EST PAS L'INCLUSION DES NOMS DE FONCTIONS, c'est
        // « tout rôle qui peut AGIR peut-il VOIR ? ». Deux fonctions
        // différentes ne sont pas un défaut si elles vivent toujours ensemble :
        // `collections.gerer` et `catalogue.gerer` sont distinctes, et aucun
        // rôle système ne porte la première sans la seconde.
        //
        // La première version comparait les noms et criait sur quatre couples
        // parfaitement sains. Un garde qui crie à tort se contourne.
        const porte = (r: (typeof ROLES_SYSTEME)[number], fs: string[]) =>
          fs.every((f) => r.functions.includes(codeDe(f)));
        const aveugles = ROLES_SYSTEME.filter(
          (r) => porte(r, consommateur.fonctions) && !porte(r, producteur.fonctions),
        );
        if (aveugles.length) {
          hors.push(
            `${cle} [${consommateur.fonctions.join(',') || '—'}] ← ${a.champ} par ` +
              `${a.producteur} [${producteur.fonctions.join(',') || '—'}] — ` +
              `agissent sans voir : ${aveugles.map((r) => r.name).join(', ')}`,
          );
        }
      }
    }
    expect(
      hors,
      'Le titulaire de cette route ne peut PAS atteindre la liste qui lui donne ' +
        'son argument : il peut agir sans jamais voir sur quoi. ' +
        '⚠ Élargir la fonction du producteur n’est presque jamais la réponse — ' +
        'c’est accorder un droit pour en réparer un autre. Faites porter ' +
        'l’information par une route que le titulaire atteint DÉJÀ.',
    ).toEqual([]);
  });

  it('⚠ aucune déclaration PÉRIMÉE — une route disparue sort de la liste', () => {
    const cles = new Set(consommateurs.map((c) => c.cle));
    const perimees = Object.keys(ARGUMENTS_DU_CORPS).filter((c) => !cles.has(c));
    expect(
      perimees,
      'Ces routes sont déclarées et ne prennent plus d’identifiant dans leur ' +
        'corps. Retirez la ligne — une dette qui ne se rappelle pas d’elle-même ' +
        'n’est pas une dette, c’est un oubli en attente.',
    ).toEqual([]);
  });
});

describe('⚠ Les natures du second argument, et leur discipline', () => {
  it('aucun `defaut-connu` ne dort sans être nommé', () => {
    const defauts = Object.entries(ARGUMENTS_DU_CORPS).flatMap(([cle, args]) =>
      args.filter((a) => a.nature === 'defaut-connu').map((a) => `${cle} ← ${a.champ}`),
    );
    expect(defauts).toEqual([]);
  });

  it('⚠ toute nature autre qu’`atteignable` porte un MOTIF', () => {
    // Sans motif, « optionnel-garde » devient la case où l'on range ce qu'on
    // n'a pas voulu regarder.
    const muettes = Object.entries(ARGUMENTS_DU_CORPS).flatMap(([cle, args]) =>
      args
        .filter((a) => (a.nature ?? 'atteignable') !== 'atteignable' && !a.motif)
        .map((a) => `${cle} ← ${a.champ}`),
    );
    expect(muettes, 'une exception sans motif est un oubli déguisé').toEqual([]);
  });

  it('⚠ TÉMOIN : l’exception `optionnel-garde` existe, et elle est unique', () => {
    // Un compte exact : si une seconde apparaît, quelqu'un doit revenir
    // vérifier qu'elle est aussi délibérée que la première.
    const optionnels = Object.entries(ARGUMENTS_DU_CORPS).flatMap(([cle, args]) =>
      args.filter((a) => a.nature === 'optionnel-garde').map((a) => `${cle} ← ${a.champ}`),
    );
    expect(optionnels).toEqual(['accounts/accounts.controller.ts :: Post :id/activate ← roleId']);
  });
});
