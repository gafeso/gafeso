/**
 * TOUT PLANIFICATEUR CONSULTE SON MODULE, OU DÉCLARE POURQUOI IL N'EN A PAS.
 *
 * ## D'où vient ce test — le SECOND inventaire
 *
 * `purge-depots.scheduler` supprimait des objets MinIO chaque nuit, sur TOUTES
 * les écoles actives, sans regarder si le module `depot` était allumé. Une école
 * qui l'éteignait perdait ses fichiers de dépôts refusés, et `deleteObject` ne
 * se reprend pas.
 *
 * ⚠ AUCUN GARDE NE POUVAIT LE VOIR, et pas par oubli. `gardes-de-module` et
 * `routes-plateforme-gardees` inventorient des ROUTES ; un `@Cron` n'en est pas
 * une. Les planificateurs n'étaient dans la population de RIEN.
 *
 * > ⭐ Et le remède n'est pas d'élargir un inventaire existant : c'est d'en
 * > écrire un SECOND, sur la seconde population, avec ses propres témoins. Un
 * > garde qui garde deux populations aux règles différentes finit par n'en garder
 * > aucune correctement.
 *
 * ⚠ CE QUI REND CETTE FAMILLE PIRE QU'UN TROU : l'inventaire des routes était
 * COMPLET sur sa population. Il ne pouvait rien signaler, et son vert était
 * HONNÊTE. Personne n'avait de raison de le soupçonner.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULES_PAR_ID } from './registre-modules';

const SRC = join(__dirname, '..');

/**
 * Pour chaque planificateur : le module dont il dépend, et OÙ la garde vit.
 *
 * · `dans-le-planificateur` — il consulte `estActif` lui-même ;
 * · `en-aval`               — le service qu'il appelle le fait, et c'est MIEUX :
 *                             la garde couvre alors tous les appelants ;
 * · `sans-objet`            — son module est du NOYAU, il ne s'éteint pas.
 *
 * ⚠ `en-aval` porte le FICHIER qui garde, et le test va y voir. Une déclaration
 * qui nomme un fichier sans garde serait « un texte qui décrit une sauvegarde » —
 * c'est-à-dire un test qui n'a pas été écrit.
 */
const PLANIFICATEURS: {
  fichier: string;
  module: string | null;
  garde: 'dans-le-planificateur' | 'en-aval' | 'sans-objet';
  gardePar?: string;
  motif: string;
}[] = [
  {
    fichier: 'moissonnage/moissonnage.scheduler.ts',
    module: 'moissonnage',
    garde: 'dans-le-planificateur',
    motif:
      'le moissonnage n’a qu’un déclencheur automatique ; la garde y suffit et ' +
      'la route manuelle porte la sienne.',
  },
  {
    fichier: 'reminders/reminders.scheduler.ts',
    module: 'rappels',
    garde: 'en-aval',
    gardePar: 'reminders/reminders.service.ts',
    motif:
      'la garde vit là où l’ENVOI se décide — corrigé le 15/09/2026, après qu’une ' +
      'école ayant éteint les rappels en recevait dès qu’on cliquait « run ».',
  },
  {
    fichier: 'depots/purge-depots.scheduler.ts',
    module: 'depot',
    garde: 'en-aval',
    gardePar: 'depots/purge-depots.service.ts',
    motif:
      'la garde vit là où la SUPPRESSION se décide — backlog n° 49. ' +
      '`purgerUneEcole` est publique : la mettre dans le planificateur la ' +
      'laisserait nue pour le premier script d’exploitation.',
  },
  {
    fichier: 'circulation/holds.scheduler.ts',
    module: null,
    garde: 'sans-objet',
    motif:
      'l’expiration des mises de côté est de la CIRCULATION, qui est un module ' +
      'du noyau : il ne s’éteint pas, donc il n’y a rien à consulter.',
  },
];

/** Tous les fichiers portant un `@Cron`, quel qu'en soit le nom. */
function planificateursDuCode(): string[] {
  const trouves: string[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(join(SRC, rel), { withFileTypes: true })) {
      const c = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) parcourir(c);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        if (/@Cron\(/.test(readFileSync(join(SRC, c), 'utf-8'))) trouves.push(c);
      }
    }
  };
  parcourir('');
  return trouves.sort();
}

const DU_CODE = planificateursDuCode();

describe("L'instrument, avant ce qu'il mesure", () => {
  it('⚠ il en trouve — sinon « tous gardés » est vrai sur l’ensemble vide', () => {
    expect(DU_CODE.length).toBeGreaterThan(2);
  });

  it('témoin de PRÉSENCE : il voit celui qui a motivé ce test', () => {
    expect(DU_CODE).toContain('depots/purge-depots.scheduler.ts');
  });

  it('⚠ témoin d’ABSENCE : il ne compte pas un fichier qui PARLE de @Cron', () => {
    // La confusion plausible : un module NestJS qui documente son planificateur
    // en commentaire. `reminders.module.ts` en est un — il écrit
    // « RemindersScheduler : @Cron quotidien » — et il ne planifie rien.
    const module = readFileSync(join(SRC, 'reminders/reminders.module.ts'), 'utf-8');
    expect(module, 'le témoin suppose que ce fichier cite bien @Cron').toMatch(/@Cron/);
    expect(
      DU_CODE,
      'un fichier qui CITE @Cron en commentaire n’est pas un planificateur — ' +
        'l’extracteur doit chercher l’APPEL, pas le mot.',
    ).not.toContain('reminders/reminders.module.ts');
  });
});

describe('⚠ L’OBLIGATION : chaque planificateur est déclaré', () => {
  it('aucun planificateur du code n’est absent de la déclaration', () => {
    const declares = new Set(PLANIFICATEURS.map((p) => p.fichier));
    expect(
      DU_CODE.filter((f) => !declares.has(f)),
      'Planificateur(s) non déclaré(s).\n' +
        'DEUX ISSUES :\n' +
        '  · il dépend d’un module → déclarez-le, et dites OÙ la garde vit ;\n' +
        '  · son module est du noyau → `sans-objet`, avec son motif.\n' +
        '⚠ Ne le laissez pas non déclaré : `purge-depots` a supprimé des objets ' +
        'MinIO chaque nuit sur des écoles qui avaient éteint le module, et aucun ' +
        'inventaire ne pouvait le voir.',
    ).toEqual([]);
  });

  it('⚠ une déclaration PÉRIMÉE est refusée', () => {
    expect(
      PLANIFICATEURS.map((p) => p.fichier).filter((f) => !DU_CODE.includes(f)),
      'Déclaration(s) qui ne correspondent plus : le planificateur a disparu ou ' +
        'ne porte plus de @Cron. Retirez la ligne.',
    ).toEqual([]);
  });

  it('chaque déclaration porte un motif qui dit quelque chose', () => {
    for (const p of PLANIFICATEURS) {
      expect(p.motif.length, p.fichier).toBeGreaterThan(50);
    }
  });
});

describe('⭐ L’INVARIANT : la garde EXISTE là où la déclaration la promet', () => {
  for (const p of PLANIFICATEURS) {
    it(`${p.fichier} → ${p.garde}`, () => {
      const source = readFileSync(join(SRC, p.fichier), 'utf-8');

      if (p.garde === 'sans-objet') {
        expect(p.module, 'un `sans-objet` ne nomme pas de module').toBeNull();
        return;
      }

      const mod = MODULES_PAR_ID.get(p.module!);
      expect(mod, `${p.module} n’est pas un module connu`).toBeDefined();
      expect(mod!.noyau, `${p.module} est du noyau : la déclaration doit être « sans-objet »`).toBe(
        false,
      );

      const motif = new RegExp(`estActif\\([^)]*'${p.module}'`);
      if (p.garde === 'dans-le-planificateur') {
        expect(motif.test(source), `${p.fichier} devrait consulter son module`).toBe(true);
        return;
      }

      // ⚠ `en-aval` : on va VOIR le fichier nommé. Une déclaration qui nomme un
      // fichier sans garde serait un texte qui décrit une sauvegarde.
      expect(p.gardePar, `${p.fichier} : « en-aval » sans fichier nommé`).toBeDefined();
      const aval = readFileSync(join(SRC, p.gardePar!), 'utf-8');
      expect(
        motif.test(aval),
        `${p.gardePar} devrait consulter le module « ${p.module} » — c’est là que ` +
          `${p.fichier} déclare que la garde vit.`,
      ).toBe(true);
    });
  }

  // ⚠ Le COMPTE : un planificateur de plus convoque quelqu'un.
  it('je SAIS combien il y a de planificateurs', () => {
    expect(
      DU_CODE.length,
      'Le nombre de planificateurs a changé. Ce n’est pas un échec : c’est une ' +
        'convocation. Le nouveau dépend-il d’un module activable ?',
    ).toBe(4);
  });
});

/**
 * ⚠ CE QUE CET INVENTAIRE NE COUVRE PAS, écrit plutôt que découvert.
 *
 * Il vérifie qu'un `estActif` du bon module EXISTE dans le fichier nommé. Il ne
 * vérifie pas que cet appel est sur le CHEMIN de l'action — un `estActif` posé
 * dans une méthode voisine le satisferait.
 *
 * ⚠ Et ce n'est pas une borne qu'on déclare sans avoir essayé : la fermer
 * demanderait de suivre le flot d'appel entre deux méthodes, c'est-à-dire une
 * analyse que ce garde ne fait pas. Pour la purge, cette moitié est tenue par
 * `depots/purge-gardee-par-le-module.spec.ts`, qui mesure l'EFFET — aucun
 * `deleteObject`, aucune lecture, aucun écrit — plutôt que la présence.
 *
 * > ⭐ Quand la forme ne se laisse pas énumérer, mesurer l'EFFET est la sortie.
 */
