/**
 * ⭐⭐ LE TROISIÈME INVENTAIRE — la population que les deux autres ne voient pas.
 *
 * Ce dépôt a appris le 26 septembre 2026 que « deux familles de gardes, un seul
 * inventaire » laisse la seconde famille INVISIBLE PAR CONSTRUCTION : une route
 * de plateforme gardée par `ApiKeyGuard` n'était dans la population d'aucun
 * relevé, et `GET /admin/tenants/:slug/socle` répondait 200 sans clé.
 *
 * Les routes de l'assistant d'installation sont une TROISIÈME famille :
 *
 * | La famille      | Son dispositif          | Son inventaire |
 * |---|---|---|
 * | tenant          | `@RequiresFunctions`    | `gardes-declarees.spec.ts` |
 * | plateforme      | `ApiKeyGuard`           | `routes-plateforme-gardees.spec.ts` |
 * | ⭐ installation | `SessionAssistantGuard` | **ce fichier** |
 *
 * ⚠ ON N'ÉLARGIT PAS UN INVENTAIRE EXISTANT : il mélangerait des populations
 * dont les règles diffèrent — ici une route doit être PUBLIQUE (`etat`), ce
 * qu'aucun des deux autres n'admettrait. Un garde qui garde deux choses finit
 * par n'en garder aucune correctement.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, 'installation.controller.ts'),
  'utf-8',
);

/**
 * LA POPULATION, DÉCLARÉE — et chaque route est gardée, ou PUBLIQUE AVEC SON
 * MOTIF. Une route neuve n'est dans aucune des deux listes, et le test échoue
 * en disant les deux issues. C'est la forme de `LIGNES_PARTAGEES` et de
 * `colonnes-ecrivables` : une obligation, jamais un balayage.
 */
const ROUTES = [
  { verbe: 'Get', chemin: 'etat', gardee: false, throttle: 30,
    motif:
      'PUBLIQUE par dessein : le front doit choisir entre l’assistant et l’écran ' +
      'de connexion avant d’avoir le moindre jeton. Elle ne rend QUE le booléen.' },
  { verbe: 'Post', chemin: 'jeton', gardee: false, throttle: 5,
    motif:
      'PUBLIQUE par nécessité : c’est elle qui VÉRIFIE le jeton. Sa protection ' +
      'est le jeton lui-même, plus un throttle sévère et un verrou à 20 essais.' },
  { verbe: 'Get', chemin: 'constat', gardee: true, throttle: null, motif: null },
  { verbe: 'Get', chemin: 'modules', gardee: true, throttle: null, motif: null },
  { verbe: 'Post', chemin: 'test-courriel', gardee: true, throttle: 3, motif: null },
  { verbe: 'Post', chemin: 'terminer', gardee: true, throttle: 5, motif: null },
] as const;

/** Le bloc de décorateurs + signature qui précède une route. */
function blocDe(verbe: string, chemin: string): string {
  const ancre = `@${verbe}('${chemin}')`;
  const i = SOURCE.indexOf(ancre);
  expect(i, `route @${verbe}('${chemin}') introuvable dans le contrôleur`).toBeGreaterThan(-1);
  // jusqu'au prochain décorateur de route, ou la fin
  const suite = SOURCE.slice(i + ancre.length);
  const prochaine = suite.search(/\n  @(Get|Post|Patch|Put|Delete)\(/);
  return prochaine === -1 ? suite : suite.slice(0, prochaine);
}

describe('les routes de l’assistant d’installation', () => {
  it('⭐ l’inventaire est COMPLET : aucune route du contrôleur n’est hors liste', () => {
    const trouvees = [...SOURCE.matchAll(/@(Get|Post|Patch|Put|Delete)\('([^']*)'\)/g)]
      .map((m) => `${m[1]} ${m[2]}`)
      .sort();
    const declarees = ROUTES.map((r) => `${r.verbe} ${r.chemin}`).sort();
    // ⚠ On compare les ÉLÉMENTS, pas les comptes : une erreur symétrique — une
    // route ajoutée, une autre renommée — laisserait un compte juste. Mesuré le
    // 16 septembre sur CHEMINS_DU_RENDU_SERVEUR, où six déclarés valaient six
    // trouvés et où deux étaient faux.
    expect(trouvees).toEqual(declarees);
  });

  it('chaque route gardée porte SessionAssistantGuard', () => {
    const verifiees: string[] = [];
    for (const r of ROUTES.filter((x) => x.gardee)) {
      const bloc = blocDe(r.verbe, r.chemin);
      expect(bloc, `@${r.verbe}('${r.chemin}') doit porter @UseGuards(SessionAssistantGuard)`)
        .toContain('@UseGuards(SessionAssistantGuard)');
      verifiees.push(r.chemin);
    }
    // ⚠ Témoin de COUVERTURE, et il ÉNUMÈRE au lieu d'agréger : un compte global
    // prouve que l'instrument tourne, jamais qu'il tourne sur chaque élément.
    expect(verifiees).toEqual(['constat', 'modules', 'test-courriel', 'terminer']);
  });

  it('⚠ et chaque route PUBLIQUE porte son motif ÉCRIT dans ce fichier', () => {
    for (const r of ROUTES.filter((x) => !x.gardee)) {
      expect(r.motif, `${r.chemin} est publique : son motif doit être écrit`).toBeTruthy();
      expect(r.motif!.length, `le motif de ${r.chemin} est trop court pour être un motif`)
        .toBeGreaterThan(60);
      const bloc = blocDe(r.verbe, r.chemin);
      expect(bloc, `@${r.verbe}('${r.chemin}') ne doit PAS porter de garde`)
        .not.toContain('@UseGuards(');
    }
  });

  it('les throttles déclarés sont ceux du code — un secret protégé par un essai illimité ne l’est pas', () => {
    for (const r of ROUTES.filter((x) => x.throttle !== null)) {
      const bloc = blocDe(r.verbe, r.chemin);
      expect(bloc, `@${r.verbe}('${r.chemin}') doit limiter à ${r.throttle}/min`)
        .toContain(`@Throttle({ default: { limit: ${r.throttle}, ttl: 60_000 } })`);
    }
    // ⚠ Témoin d'ABSENCE sur la confusion plausible : `jeton` est la route qui
    // garde le seul secret de l'instance. Un throttle large y serait pire
    // qu'ailleurs, et c'est exactement celui qu'on relâcherait pour déboguer.
    expect(blocDe('Post', 'jeton')).toContain('limit: 5');
  });

  it('les deux routes qui n’écrivent rien rendent 200, pas 201', () => {
    for (const chemin of ['jeton', 'test-courriel', 'terminer']) {
      expect(blocDe('Post', chemin), `POST ${chemin} doit rendre 200`)
        .toContain('@HttpCode(HttpStatus.OK)');
    }
    // et les imports existent VRAIMENT — un grep sur le nom ne prouve pas qu'on
    // importe la chose qui le porte (leçon du 22 septembre, payée par `tsc`).
    expect(SOURCE).toMatch(/import \{[^}]*\bHttpCode\b[^}]*\} from '@nestjs\/common'/s);
    expect(SOURCE).toMatch(/import \{[^}]*\bHttpStatus\b[^}]*\} from '@nestjs\/common'/s);
  });
});
