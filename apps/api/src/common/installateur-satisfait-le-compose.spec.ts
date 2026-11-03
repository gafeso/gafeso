import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 CE QUE LE COMPOSE EXIGE, L'INSTALLATEUR L'ÉCRIT — population DÉRIVÉE.
 *
 * *Posé le 3 novembre 2026, après qu'une installation NEUVE ne démarrait aucun
 * conteneur.*
 *
 * ## Ce que ça a coûté, mesuré PAR L'EFFET
 *
 * En donnant à `docker compose config` l'environnement exact qu'`install.sh`
 * produisait :
 *
 *     error while interpolating services.garage.environment.GARAGE_RPC_SECRET:
 *     required variable GARAGE_RPC_SECRET is missing a value
 *
 * `GARAGE_RPC_SECRET` et `GARAGE_ADMIN_TOKEN` sont déclarés `${VAR:?message}` :
 * **docker compose REFUSE** sans eux. La bascule vers Garage avait mis à jour
 * le compose, `garage.toml`, `DEPLOY.md` et l'auto-contrôle — pas
 * l'installateur, qui ne contenait pas une fois le mot « garage » sur ses
 * 962 lignes.
 *
 * ## ⭐ POURQUOI UNE OBLIGATION DÉRIVÉE, ET PAS UNE LISTE
 *
 * Une liste écrite à la main reproduirait la faute : une variable obligatoire
 * ajoutée demain au compose n'y serait pas, et son absence serait SILENCIEUSE
 * — « une liste blanche échoue en silence, et son garde ne peut pas le voir ».
 * Ici la population est **lue dans le compose** : une variable neuve en
 * `${VAR:?}` entre d'elle-même dans la propriété.
 *
 * ## ⚠ CE QU'IL NE GARDE PAS, et c'est une borne MESURÉE
 *
 * Les variables à DÉFAUT (`${VAR:-valeur}`) sont hors population : le compose
 * les fournit lui-même, et les exiger de l'installateur crierait sur du sain.
 * Les arguments de BUILD (`GAFESO_VERSION`, `GAFESO_COMMIT`) ne viennent pas
 * de `.env.prod` non plus — ils sont gardés à part, plus bas.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const INSTALL = readFileSync(join(RACINE, 'install.sh'), 'utf-8');
const COMPOSE = readFileSync(
  join(RACINE, 'docker', 'docker-compose.prod.yml'),
  'utf-8',
);

/** Les variables que le compose REFUSE de substituer : `${VAR:?message}`. */
function obligatoires(): string[] {
  const trouvees = new Set<string>();
  for (const m of COMPOSE.matchAll(/\$\{([A-Z_][A-Z0-9_]*):\?/g)) trouvees.add(m[1]);
  return [...trouvees].sort();
}

/** Les variables que `install.sh` écrit dans son heredoc `.env.prod`. */
function ecritesParInstall(): string[] {
  const lignes = INSTALL.split('\n');
  const debut = lignes.findIndex((l) => /^\s*cat > "\$ENV_FILE" <</.test(l));
  if (debut < 0) throw new Error("le heredoc d'écriture de .env.prod est introuvable");
  const fin = lignes.findIndex((l, i) => i > debut && /^EOF$/.test(l));
  if (fin < 0) throw new Error("le heredoc d'écriture de .env.prod n'est pas refermé");
  const dedans = lignes.slice(debut + 1, fin);
  return [
    ...new Set(
      dedans
        .map((l) => l.match(/^([A-Z_][A-Z0-9_]*)=/)?.[1])
        .filter((v): v is string => Boolean(v)),
    ),
  ].sort();
}

describe('⚠ TÉMOINS — les deux populations sont LUES, et non vides', () => {
  it('⭐ le compose déclare des variables obligatoires, et install.sh en écrit', () => {
    // Une population vide rendrait ce garde VERT sans rien mesurer : c'est la
    // première espèce de garde fautif de ce dépôt.
    expect(obligatoires().length, 'aucune ${VAR:?} trouvée — le relevé ne lit pas').toBeGreaterThan(0);
    expect(ecritesParInstall().length, "aucune variable écrite trouvée").toBeGreaterThan(20);
  });

  it('⭐ TÉMOIN DE PRÉSENCE — le relevé voit les deux secrets de Garage', () => {
    // Le cas dont je connais la réponse : c'est lui qui a motivé ce garde.
    expect(obligatoires()).toContain('GARAGE_RPC_SECRET');
    expect(obligatoires()).toContain('GARAGE_ADMIN_TOKEN');
  });

  it('🔴 TÉMOIN D’ABSENCE — une variable à DÉFAUT n’entre PAS dans la population', () => {
    // La confusion plausible : `${GAFESO_VERSION:-non étiquetée}` est réclamée
    // par le compose et n'a rien à faire dans .env.prod. Si elle entrait, ce
    // garde crierait sur du code sain — et un détecteur qui accuse se
    // désactive.
    expect(COMPOSE, 'le cas témoin a disparu du compose').toContain('${GAFESO_VERSION:-');
    expect(obligatoires()).not.toContain('GAFESO_VERSION');
  });
});

describe('🔴 L’OBLIGATION — chaque variable sans défaut est écrite par install.sh', () => {
  it('⭐ aucune variable exigée par le compose ne manque à .env.prod', () => {
    const ecrites = new Set(ecritesParInstall());
    const manquantes = obligatoires().filter((v) => !ecrites.has(v));
    expect(
      manquantes,
      `docker compose REFUSERA de démarrer : ${manquantes.join(', ')} — ` +
        'écrivez-les dans le heredoc .env.prod de install.sh, ou donnez-leur un ' +
        'défaut dans le compose si elles sont facultatives',
    ).toEqual([]);
  });
});

describe('🔴 LA VERSION — posée AVANT le build, par la dérivation PARTAGÉE', () => {
  /**
   * ⚠ Pourquoi ce cas vit ici alors que `GAFESO_VERSION` est hors population :
   * c'est la même cause — l'installateur ne fournissait pas ce que le build
   * attend —, et séparer les deux ferait deux fichiers qu'on relirait l'un pour
   * l'autre (« deux documents qui s'accordent ne prouvent rien »).
   */
  /**
   * ⚠ LE GARDE PORTE SUR L'APPEL QUI **AFFECTE**, pas sur n'importe lequel.
   *
   * *Mon premier jet cherchait `scripts/version-du-depot.sh --exporter` n'importe
   * où. Le contrôle négatif n'a PAS mordu : le fichier appelle ce script DEUX
   * fois — une pour poser la version, une pour relayer son message de refus — et
   * la seconde suffisait à satisfaire le garde.* C'est « un grep sur un nom ne
   * prouve pas qu'on lit la chose qui le porte », appliqué à un APPEL : seule
   * la forme `V="$(…)"` pose quelque chose.
   */
  it('⭐ install.sh EMPLOIE scripts/version-du-depot.sh, il n’en écrit pas une seconde', () => {
    const affectations = [
      ...INSTALL.matchAll(/^\s*(?:if\s+|local\s+)?V="\$\(scripts\/version-du-depot\.sh --exporter/gm),
    ];
    expect(
      affectations.length,
      "install.sh construit sans poser la version : /health dira « non étiquetée » pour toujours",
    ).toBe(1);
  });

  /**
   * ⚠ CE CAS MESURAIT UN SUBSTITUT, et le substitut a lâché.
   *
   * *Il comparait les POSITIONS DANS LE TEXTE de `version-du-depot.sh` et de
   * `dc up`.* Le 3 novembre 2026, extraire le bloc de version dans sa propre
   * fonction — posée plus bas dans le fichier que `compose_up` — l'a fait
   * tomber sur du code CORRECT : l'ordre d'exécution était intact, seul
   * l'ordre des octets avait changé.
   *
   * La position dans le fichier n'est pas l'ordre d'exécution. C'est l'ordre
   * des appels dans `main()` qui l'est, et c'est lui qu'on lit désormais.
   */
  it('🔴 et il la pose AVANT `dc up`, sinon elle n’entre pas dans l’image', () => {
    const lignes = INSTALL.split('\n');
    const d = lignes.findIndex((l) => l.startsWith('main()'));
    const f = lignes.findIndex((l, i) => i > d && l === '}');
    expect(d, 'main() introuvable').toBeGreaterThan(0);
    const appels = lignes
      .slice(d + 1, f)
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean);
    const iVersion = appels.indexOf('poser_version');
    const iUp = appels.indexOf('compose_up');
    expect(iVersion, 'poser_version n’est pas appelée par main()').toBeGreaterThan(-1);
    expect(iUp, 'compose_up n’est pas appelée par main()').toBeGreaterThan(-1);
    expect(
      iVersion,
      "la version est posée APRÈS le démarrage : l'image ne la portera pas",
    ).toBeLessThan(iUp);
    // ⚠ Et la fonction appelée pose bien la version : sinon on ordonne un nom.
    const corpsVersion = INSTALL.slice(INSTALL.indexOf('poser_version() {'));
    expect(corpsVersion.slice(0, corpsVersion.indexOf('\n}'))).toContain(
      'scripts/version-du-depot.sh --exporter',
    );
  });

  it('⚠ et il ne RECOPIE pas « non étiquetée » — le compose en est la seule source', () => {
    // Une chaîne recopiée se désynchronise le jour où le défaut du compose
    // change. Sur le chemin de refus, install.sh ne pose PAS la variable.
    const bloc = INSTALL.slice(
      INSTALL.indexOf('scripts/version-du-depot.sh --exporter'),
      INSTALL.indexOf('dc up -d $build_flag'),
    );
    expect(bloc).not.toMatch(/GAFESO_VERSION=['"]?non étiquetée/);
  });
});
