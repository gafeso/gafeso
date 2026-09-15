import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ModuleActifGuard } from './module-actif.guard';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES_ACTIVABLES, ROUTES_PAR_MODULE } from './registre-modules';

/**
 * TOUTE ROUTE D'UN MODULE PORTE SON GARDE.
 *
 * ⚠ MÊME MÉCANIQUE QUE `gardes-declarees.spec.ts`, et pour la même raison : la
 * règle d'activation exige les DEUX effets ensemble — l'interface ne montre plus
 * rien qui y mène, ET l'API refuse en nommant le module. Le second est tenu par
 * `@ModuleRequis` + `ModuleActifGuard`. Oublier le décorateur sur une route
 * laisse une PORTE OUVERTE : l'écran ne la montre plus, elle répond quand même,
 * et rien ne le signale — c'est la forme exacte de la fuite du registre
 * professionnel, transposée aux modules.
 */
const RACINE = join(__dirname, '..');

/**
 * La garde déclarée AU NIVEAU DE LA CLASSE, s'il y en a une.
 *
 * ⚠ ELLE COMPTE AUTANT QU'UNE GARDE DE ROUTE, et le refuser serait un garde qui
 * impose la forme la MOINS sûre. `ModuleActifGuard` lit la métadonnée par
 * `reflector.getAllAndOverride([handler, class])` : une déclaration de classe
 * couvre donc toutes les routes, y compris la treizième écrite demain par
 * quelqu'un qui n'aura pas lu ce fichier. Route par route, il suffit d'une
 * distraction pour laisser une porte ouverte.
 *
 * C'est le contrôleur des dépôts qui l'a montré : douze routes, une seule
 * déclaration, et la treizième héritera.
 */
function gardeDeClasse(fichier: string): string {
  const source = readFileSync(join(RACINE, fichier), 'utf-8');
  const i = source.indexOf('export class');
  return i === -1 ? '' : source.slice(0, i);
}

function blocDeRoute(fichier: string, verbe: string, chemin: string): string | null {
  const source = readFileSync(join(RACINE, fichier), 'utf-8');
  const lignes = source.split('\n');
  const attendu = chemin ? `  @${verbe}('${chemin}')` : `  @${verbe}()`;
  const i = lignes.findIndex((l) => l.trimEnd() === attendu);
  if (i === -1) return null;
  // Le bloc de décorateurs contigus de la méthode.
  let fin = i;
  while (fin + 1 < lignes.length && lignes[fin + 1].trim().startsWith('@')) fin++;
  return lignes.slice(i, fin + 1).join('\n');
}

describe('gardes de module — aucune route de module sans son garde', () => {
  const declarees = Object.entries(ROUTES_PAR_MODULE).flatMap(([m, routes]) =>
    routes.map((cle) => ({ module: m, cle })),
  );

  it('le relevé retrouve CHAQUE route déclarée dans le code (témoin de compte)', () => {
    // ⚠ Un témoin qui COMPTE : si une route déclarée ici a été renommée ou
    // supprimée, la liste ne le dirait pas — elle se contenterait de ne rien
    // vérifier, en silence.
    // ⚠ 7 → 19 le 12 septembre 2026 : les douze routes du module `depot`. Le
    // compte a fait son office — il a fallu revenir ici, et constater au
    // passage que le relevé ne savait pas lire une garde posée au niveau de la
    // CLASSE, c'est-à-dire la forme la plus sûre.
    // ⚠ 19 → 29 le 14 septembre 2026, et le compte a convoqué deux fois : les
    // sept routes du moissonnage, et TROIS routes de dépôt qui étaient gardées
    // depuis des jours sans être déclarées — le balayage inverse ne voyait pas
    // les `@ModuleRequis` posés sur une CLASSE.
    // 29 → 32 le 15 septembre 2026 : les trois routes de `statistiques`.
    // 32 → 33 le 15 septembre 2026 : `GET /stats/rapport-annuel` (P8-2). Le
    // garde l'a attrapée seul — elle hérite du décorateur de CLASSE, et c'est
    // exactement le cas auquel il était aveugle il y a deux jours.
    // 33 → 38 le 15 septembre 2026 : les cinq routes de `rappels`, qui
    // n'étaient gardées par aucun module.
    expect(declarees.length).toBe(38);
    for (const { cle } of declarees) {
      const [fichier, reste] = cle.split(' :: ');
      const [verbe, ...ch] = reste.split(' ');
      expect(blocDeRoute(fichier, verbe, ch.join(' ')), `route introuvable : ${cle}`).not.toBeNull();
    }
  });

  it('⚠ CHAQUE route déclarée porte `@ModuleRequis` de SON module, et le garde', () => {
    const fautives: string[] = [];
    for (const { module, cle } of declarees) {
      const [fichier, reste] = cle.split(' :: ');
      const [verbe, ...ch] = reste.split(' ');
      const bloc = (blocDeRoute(fichier, verbe, ch.join(' ')) ?? '') + gardeDeClasse(fichier);
      if (!bloc.includes(`@ModuleRequis('${module}')`)) fautives.push(`${cle} → @ModuleRequis manquant`);
      if (!bloc.includes('ModuleActifGuard')) fautives.push(`${cle} → ModuleActifGuard manquant`);
    }
    expect(fautives, 'routes de module sans garde').toEqual([]);
  });

  it('⚠ AUCUNE route ne porte `@ModuleRequis` sans être déclarée ici', () => {
    // Le sens inverse, et il compte autant : un décorateur posé sur une route
    // que la déclaration ignore rend le module partiellement éteint — certaines
    // routes refusent, d'autres répondent, et personne ne sait lesquelles.
    const declareesSet = new Set(declarees.map((d) => d.cle));
    const orphelines: string[] = [];
    const fichiers = new Set(declarees.map((d) => d.cle.split(' :: ')[0]));
    // On balaie TOUS les contrôleurs, pas seulement ceux déjà connus.
    const parcourir = (dossier: string): string[] => {
      const fs = require('node:fs') as typeof import('node:fs');
      return fs.readdirSync(join(RACINE, dossier), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? parcourir(`${dossier}/${e.name}`)
          : e.name.endsWith('.controller.ts')
            ? [`${dossier}/${e.name}`.replace(/^\//, '')]
            : [],
      );
    };
    for (const fichier of parcourir('')) {
      const source = readFileSync(join(RACINE, fichier), 'utf-8');
      const lignes = source.split('\n');

      // ⚠ UNE GARDE POSÉE SUR LA CLASSE COUVRE TOUTES SES ROUTES — et ce
      // balayage ne la voyait pas. *Mesuré le 14 septembre 2026.*
      //
      // Il remontait d'un `@ModuleRequis` vers le verbe HTTP le plus proche,
      // donc il ne voyait que les décorateurs posés sur une MÉTHODE. Le
      // circuit de dépôt porte le sien sur la CLASSE : ses quinze routes
      // étaient gardées, la déclaration n'en listait que douze, et ce test
      // passait au vert. Trois routes ajoutées après coup — `soumis`,
      // `reattribuer`, `directeurs` — refusaient donc correctement sans que
      // rien ne l'atteste.
      //
      // Le sens de ce test est « aucune route gardée n'échappe à la
      // déclaration » : il doit donc énumérer les routes d'un contrôleur
      // gardé EN ENTIER, exactement comme Nest le fait.
      const classe = /export class/.exec(source);
      const decorateurDeClasse =
        classe && source.slice(0, classe.index).includes('@ModuleRequis(');
      if (decorateurDeClasse) {
        lignes.forEach((l) => {
          const m = /^  @(Get|Post|Patch|Put|Delete)\('?([^')]*)'?\)/.exec(l);
          if (!m) return;
          const cle = `${fichier} :: ${m[1]} ${m[2] ?? ''}`.trim();
          if (!declareesSet.has(cle)) orphelines.push(cle);
        });
      }

      lignes.forEach((l, i) => {
        if (!l.includes('@ModuleRequis(')) return;
        // Remonter au verbe HTTP de ce bloc de décorateurs.
        let j = i;
        while (j >= 0 && lignes[j].trim().startsWith('@')) {
          const m = /^  @(Get|Post|Patch|Put|Delete)\('?([^')]*)'?\)/.exec(lignes[j]);
          if (m) {
            const cle = `${fichier} :: ${m[1]} ${m[2] ?? ''}`.trim();
            if (!declareesSet.has(cle)) orphelines.push(cle);
            return;
          }
          j--;
        }
      });
    }
    expect(orphelines, 'routes gardées par module mais non déclarées').toEqual([]);
    expect(fichiers.size).toBeGreaterThan(0); // témoin
  });

  it('un module activable sans aucune route l’assume explicitement', () => {
    // ⚠ CE TEST A AFFIRMÉ LE CONTRAIRE PENDANT DES SEMAINES. Il disait que
    // « `rappels` n'a pas de route à lui : son extinction agit sur le
    // PLANIFICATEUR ». Le contrôleur en porte CINQ, dont `POST run`, qui envoie
    // des courriels à tous les adhérents en retard — et il n'était gardé par
    // aucun module. Une liste vide DÉCLARÉE est un choix écrit ; elle était ici
    // un constat faux, et le test le figeait.
    for (const id of MODULES_ACTIVABLES) {
      expect(ROUTES_PAR_MODULE, `${id} doit être déclaré, même vide`).toHaveProperty(id);
      expect(
        ROUTES_PAR_MODULE[id].length,
        `${id} : une liste VIDE se déclare, elle ne se constate pas — ` +
          'vérifiez qu’aucune route du module n’échappe au garde.',
      ).toBeGreaterThan(0);
    }
  });
});

/**
 * L'EFFET DU MODULE `amendes` DANS LA CIRCULATION — une branche, pas un refus.
 */
describe('amendes éteintes — elles cessent de s’accumuler, elles ne s’effacent pas', () => {
  const service = readFileSync(join(RACINE, 'circulation/circulation.service.ts'), 'utf-8');

  it('⚠ LES QUATRE sites de calcul passent par `tarifApplicable` (témoin de COMPTE)', () => {
    // Un premier relevé n'avait vu que DEUX sites : le troisième aurait
    // continué d'accumuler des amendes dans une école qui les a éteintes, sans
    // que rien ne le signale. Le compte exact est ce qui l'attrape.
    //
    // ⚠ PASSÉ DE 3 À 4 le 12 septembre 2026 : `cloreVersPerte` calcule l'amende
    // qu'elle FIGE en clôturant un prêt pour perte. Le compte a fait son office
    // — il a fallu revenir ici et vérifier que le quatrième site passe bien par
    // le réglage du module, donc qu'une école qui a éteint les amendes fige
    // ZÉRO. Il y passe.
    expect((service.match(/computeFine\(/g) ?? []).length).toBe(4);
    expect((service.match(/tarifApplicable\(rule\.finePerDay, settings\)/g) ?? []).length).toBe(4);
  });

  it('le tarif tombe à zéro quand le module est éteint, et pas autrement', async () => {
    const { tarifApplicable } = await import('../circulation/circulation.service');
    expect(tarifApplicable(100, { amendesActives: false })).toBe(0);
    expect(tarifApplicable(100, { amendesActives: true })).toBe(100);
    // ⚠ `undefined` VAUT ACTIF : un appelant qui omet le réglage garde le
    // comportement d'avant. Le sens inverse éteindrait les amendes de toutes
    // les écoles sur un oubli de câblage, en silence.
    expect(tarifApplicable(100, {})).toBe(100);
    expect(tarifApplicable(100, undefined)).toBe(100);
  });

  it('⚠ le RETOUR n’est PAS gardé par le module', () => {
    // Rendre un document appartient à la circulation, qui est du noyau. Le
    // garder par `@ModuleRequis('amendes')` empêcherait de rendre un livre dans
    // une école ayant éteint les amendes — refuser les routes DU module ne veut
    // pas dire éteindre le noyau qui s'en sert.
    const controleur = readFileSync(join(RACINE, 'circulation/circulation.controller.ts'), 'utf-8');
    const i = controleur.indexOf("@Post('return')");
    expect(i, 'route de retour introuvable').toBeGreaterThan(-1); // témoin
    expect(controleur.slice(i, i + 300)).not.toContain('@ModuleRequis');
  });

  it('l’état du module entre par le SEUL constructeur du sac de réglages', () => {
    const controleur = readFileSync(join(RACINE, 'circulation/circulation.controller.ts'), 'utf-8');
    expect(controleur).toContain("estActif(t.id, 'amendes')");
    // Une seule occurrence : six appelants passent par `dueSettings`.
    expect((controleur.match(/estActif\(/g) ?? []).length).toBe(1);
  });
});

/**
 * LE GARDE LUI-MÊME — et non seulement sa présence sur les routes.
 *
 * ⚠ CE BLOC EXISTE PARCE QU'UNE MUTATION N'A RIEN CASSÉ. Rendre le garde
 * FAIL-OPEN quand l'établissement n'est pas résolu n'a fait tomber aucun test :
 * le garde-fou vérifiait que le décorateur est POSÉ, jamais que le garde
 * REFUSE. Un inventaire de décorateurs ne remplace pas un test de
 * comportement — c'est la même leçon que « un inventaire de routes ne voit pas
 * une intention », d'un cran plus bas.
 */
describe('ModuleActifGuard — ce qu’il refuse', () => {
  const contexte = (moduleId: string | undefined, tenant: unknown) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ tenant }) }),
    }) as never;

  const garde = (moduleId: string | undefined, actif: boolean) =>
    new ModuleActifGuard(
      { getAllAndOverride: () => moduleId } as never,
      { estActif: vi.fn().mockResolvedValue(actif) } as never,
    );

  it('laisse passer une route SANS `@ModuleRequis`', async () => {
    await expect(garde(undefined, false).canActivate(contexte(undefined, { id: 't1' }))).resolves.toBe(
      true,
    );
  });

  it('laisse passer quand le module est actif', async () => {
    await expect(garde('amendes', true).canActivate(contexte('amendes', { id: 't1' }))).resolves.toBe(
      true,
    );
  });

  it('⚠ REFUSE quand le module est éteint, et NOMME le module dans le corps', async () => {
    // « Jamais une liste vide en guise de refus » : un moissonneur qui reçoit
    // un jeu vide conclut que le fonds est vide et l'enregistre ainsi. Le refus
    // doit être lisible par un appelant automatique, donc nommé dans le corps
    // et pas seulement dans la phrase française.
    const g = garde('interoperabilite', false);
    await expect(g.canActivate(contexte('interoperabilite', { id: 't1' }))).rejects.toThrow(
      ForbiddenException,
    );
    try {
      await g.canActivate(contexte('interoperabilite', { id: 't1' }));
    } catch (e) {
      const corps = (e as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(corps.module).toBe('interoperabilite');
      expect(corps.moduleActif).toBe(false);
      expect(String(corps.message)).toContain('Interopérabilité');
      expect(String(corps.message)).toMatch(/aucune donnée/i);
    }
  });

  it('⚠ est FAIL-CLOSED quand l’établissement n’est pas résolu', async () => {
    // Sans établissement, on ne PEUT pas savoir si le module est actif. Laisser
    // passer ferait d'un domaine inconnu un contournement du registre.
    await expect(garde('amendes', true).canActivate(contexte('amendes', null))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
