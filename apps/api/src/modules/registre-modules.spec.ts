import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MODULES,
  MODULES_ACTIVABLES,
  MODULES_NOYAU,
  MODULES_PAR_ID,
  dependantsDe,
} from './registre-modules';
import { ModulesService } from './modules.service';
import { FONCTIONS, ROLES_SYSTEME, TOUTES_LES_FONCTIONS } from '../auth/functions';

const TENANT = 'tenant-1';

function service(desactives: string[] = []) {
  // Typée : c'est l'ARGUMENT qu'on inspecte, pas le retour.
  const upsert = vi.fn(async (_args: { update: Record<string, unknown> }) => ({}));
  const prisma = {
    tenantSettings: {
      findUnique: vi.fn(async () => ({ modulesDesactives: desactives })),
      upsert,
    },
  };
  return { svc: new ModulesService(prisma as never), upsert };
}

describe('registre — la déclaration', () => {
  it('le noyau est celui du §5, et il n’est pas vide (témoin)', () => {
    expect(MODULES_NOYAU).toEqual([
      'authentification',
      'usagers',
      'catalogue',
      'circulation',
      'administration',
    ]);
  });

  it('⚠ AUCUN module inerte : les activables sont ceux que P4 rend réellement désactivables', () => {
    // Déclarer `identifiants`, `statistiques` ou
    // `lecture-hors-ligne` afficherait dans l'écran d'activation des
    // interrupteurs qui n'éteignent rien. Le front affiche CE QUE L'API
    // DÉCLARE : la déclaration est donc la source unique, et une case de plus
    // ici est une case inerte de plus à l'écran.
    //
    // ⚠ `depot` A REJOINT LA LISTE le 12 septembre 2026, et il en était cité
    // comme CONTRE-EXEMPLE : le circuit existe depuis P6 — douze routes, un
    // écran « Mon dépôt », un chiffrement à l'ingestion. Il n'était donc plus
    // inerte, et son absence avait un coût mesuré par la session front :
    // `depot.deposer` est sur le rôle SYSTÈME Étudiant, donc seedé dans CHAQUE
    // école, quand `depot.valider` n'est sur aucun. Aucune école n'était « sans
    // dépôt » — toutes étaient à moitié ouvertes, et aucune ne pouvait
    // l'éteindre. Un circuit qu'on ne peut pas éteindre est un droit imposé.
    // ⚠ L'ORDRE EST CELUI DU REGISTRE, pas alphabétique : c'est la déclaration
    // qui fait foi, et l'écran d'activation les affiche dans cet ordre.
    expect(MODULES_ACTIVABLES).toEqual([
      'amendes',
      'interoperabilite',
      'depot',
      // ⚠ `statistiques` a rejoint la liste le 15 septembre 2026 (P8-1), et
      // c'est la TROISIÈME fois que cette liste cite comme inerte un module
      // livré entre-temps. L'écran existait, ses routes répondaient, et la
      // navigation le portait sous `modulePrevu` — « prévu » depuis P4.
      'statistiques',
      'moissonnage',
      'rappels',
    ]);
  });

  it('toute dépendance déclarée existe', () => {
    for (const m of MODULES) {
      for (const d of m.dependances) {
        expect(MODULES_PAR_ID.has(d), `${m.id} → ${d}`).toBe(true);
      }
    }
  });

  it('⚠ aucun cycle de dépendances', () => {
    // Un cycle rendrait deux modules mutuellement inactivables, et l'écran
    // afficherait deux lignes verrouillées l'une par l'autre — sans issue.
    const visite = new Map<string, number>(); // 0 = en cours, 1 = fini
    const parcourir = (id: string, chemin: string[]): void => {
      if (visite.get(id) === 1) return;
      expect(visite.get(id), `cycle : ${[...chemin, id].join(' → ')}`).not.toBe(0);
      visite.set(id, 0);
      for (const d of MODULES_PAR_ID.get(id)?.dependances ?? []) parcourir(d, [...chemin, id]);
      visite.set(id, 1);
    };
    for (const m of MODULES) parcourir(m.id, []);
  });

  it('un module activable annonce les écrans qui disparaissent', () => {
    // La confirmation de désactivation les LISTE (P4-2) : sans eux, elle
    // demanderait de confirmer une conséquence qu'elle ne sait pas dire.
    for (const id of MODULES_ACTIVABLES) {
      expect(MODULES_PAR_ID.get(id)!.ecrans.length, id).toBeGreaterThan(0);
    }
  });

  it('`dependantsDe` trouve bien les dépendants (témoin)', () => {
    // ⚠ `statistiques` dépend aussi de la circulation — elle en agrège les
    // prêts. Le compte exact oblige à revenir le constater.
    expect(dependantsDe('circulation').sort()).toEqual(['amendes', 'rappels', 'statistiques']);
    expect(dependantsDe('amendes')).toEqual([]);
  });
});

describe('registre — l’état par établissement', () => {
  it('tout est actif quand rien n’est désactivé', async () => {
    const { svc } = service([]);
    const etat = await svc.etat(TENANT);
    expect(etat.every((m) => m.actif)).toBe(true);
  });

  it('⚠ une valeur malmenée en base rend « tout actif », pas « tout éteint »', async () => {
    // Le défaut sûr d'un registre est l'OUVERTURE : un module éteint par
    // accident retire des écrans sans que personne comprenne pourquoi.
    for (const brut of [null, undefined, 'rappels', 42, { rappels: true }]) {
      const prisma = {
        tenantSettings: { findUnique: vi.fn(async () => ({ modulesDesactives: brut })), upsert: vi.fn() },
      };
      const svc = new ModulesService(prisma as never);
      expect(await svc.desactives(TENANT), JSON.stringify(brut)).toEqual([]);
    }
  });

  it('ignore un identifiant inconnu stocké en base', async () => {
    const { svc } = service(['module-qui-nexiste-plus']);
    expect(await svc.desactives(TENANT)).toEqual([]);
  });

  it('le noyau est actif et VERROUILLÉ, pas caché', async () => {
    const { svc } = service([]);
    const etat = await svc.etat(TENANT);
    for (const id of MODULES_NOYAU) {
      const m = etat.find((x) => x.id === id)!;
      expect(m.actif, id).toBe(true);
      expect(m.verrouille, id).toBe(true);
      expect(m.motifVerrouillage, id).toMatch(/Requis/);
    }
  });

  it('un module éteint est rendu inactif, et les autres ne bougent pas', async () => {
    const { svc } = service(['amendes']);
    const etat = await svc.etat(TENANT);
    expect(etat.find((m) => m.id === 'amendes')!.actif).toBe(false);
    expect(etat.find((m) => m.id === 'rappels')!.actif).toBe(true);
  });

  it('`estActif` est FAIL-CLOSED sur un module inconnu', async () => {
    // Un garde qui interroge un module mal orthographié doit REFUSER, pas
    // ouvrir. C'est la même exigence que `functionsForLegacyRole`.
    const { svc } = service([]);
    expect(await svc.estActif(TENANT, 'inconnu')).toBe(false);
    expect(await svc.estActif(TENANT, 'catalogue')).toBe(true);
  });
});

describe('registre — les refus, côté API et pas seulement côté écran', () => {
  it('⚠ refuse de désactiver CHAQUE module du NOYAU, en nommant le noyau', async () => {
    // ⚠ EXHAUSTIF, ET SUR LE MESSAGE — pas sur le type d'exception.
    //
    // La première version de ce test éprouvait `catalogue` et vérifiait
    // seulement `BadRequestException`. Neutraliser la garde du noyau n'a RIEN
    // cassé : `catalogue` a un dépendant (`interoperabilite`), donc la règle
    // des DÉPENDANCES levait la même exception et le test passait pour la
    // mauvaise raison. Or trois modules du noyau — `administration`,
    // `authentification`, `usagers` — n'ont aucun dépendant : ils auraient été
    // désactivables EN SILENCE.
    //
    // Le domaine est fini et déclaré : on l'épuise, et on affirme sur ce que le
    // message DIT.
    for (const id of MODULES_NOYAU) {
      const { svc, upsert } = service([]);
      await expect(
        svc.changerActivation(TENANT, id, false),
        `${id} doit être refusé comme NOYAU`,
      ).rejects.toThrow(/noyau/i);
      expect(upsert, `${id} : rien ne doit être écrit`).not.toHaveBeenCalled();
    }
  });

  it('refuse un module inconnu, et dit lesquels existent', async () => {
    const { svc } = service([]);
    await expect(svc.changerActivation(TENANT, 'inconnu', false)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('⚠ refuse d’ALLUMER un module dont la dépendance est éteinte', async () => {
    // Le noyau est toujours actif, donc on éprouve la règle sur une dépendance
    // activable en la simulant éteinte.
    const { svc } = service(['circulation']); // ignoré : `circulation` est noyau
    // `circulation` étant noyau, elle reste active : l'activation passe.
    await expect(svc.changerActivation(TENANT, 'amendes', true)).resolves.toBeDefined();
  });

  it('n’écrit qu’une liste d’identifiants — AUCUNE donnée supprimée', async () => {
    const { svc, upsert } = service([]);
    await svc.changerActivation(TENANT, 'amendes', false);
    const ecrit = upsert.mock.calls[0][0];
    expect(Object.keys(ecrit.update)).toEqual(['modulesDesactives']);
    expect(ecrit.update.modulesDesactives).toEqual(['amendes']);
  });

  it('réactiver retire l’identifiant, et rien d’autre', async () => {
    const { svc, upsert } = service(['amendes', 'rappels']);
    await svc.changerActivation(TENANT, 'amendes', true);
    const ecrit = upsert.mock.calls[0][0] as unknown as { update: { modulesDesactives: string[] } };
    expect(ecrit.update.modulesDesactives).toEqual(['rappels']);
  });
});

describe('registre — `modules.gerer`', () => {
  it('existe au catalogue et n’est accordée qu’à l’Administrateur', () => {
    expect(TOUTES_LES_FONCTIONS).toContain(FONCTIONS.MODULES_GERER);
    const porteurs = ROLES_SYSTEME.filter((r) =>
      r.functions.includes(FONCTIONS.MODULES_GERER),
    ).map((r) => r.name);
    expect(porteurs).toEqual(['Administrateur']);
  });

  it('⚠ la migration qui l’accorde nomme la MÊME fonction que le code', () => {
    const sql = readFileSync(
      join(__dirname, '../../prisma/migrations/20260911210000_modules_gerer/migration.sql'),
      'utf-8',
    );
    const cites = [...sql.matchAll(/'(modules\.[a-z]+)'/g)].map((m) => m[1]);
    expect(cites.length).toBeGreaterThan(0); // témoin
    expect(new Set(cites)).toEqual(new Set([FONCTIONS.MODULES_GERER]));
  });
});

/**
 * ⚠ LE PIÈGE DU LOT, NOMMÉ PAR LE BRIEF : « deux endroits où l'on éteint la
 * même chose ». Après l'absorption, `remindersEnabled` ne doit plus être un
 * chemin — ni en lecture, ni en écriture.
 */
describe('absorption de `remindersEnabled` — un seul endroit où l’on éteint', () => {
  /**
   * ⚠ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE AFFIRMATION. Un commentaire qui
   * EXPLIQUE l'absorption mentionne forcément l'ancien nom — le test échouerait
   * sur le texte qui documente précisément ce qu'il vérifie. Même exigence que
   * le garde des écritures d'audit.
   */
  const sansCommentaires = (source: string) =>
    source
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
  const service_rappels = sansCommentaires(
    readFileSync(join(__dirname, '../reminders/reminders.service.ts'), 'utf-8'),
  );
  const dto = readFileSync(
    join(__dirname, '../reminders/dto/update-reminder-settings.dto.ts'),
    'utf-8',
  );

  it('le fichier lu est bien celui des rappels (témoin positif)', () => {
    expect(service_rappels).toContain('class RemindersService');
  });

  it('⚠ le planificateur n’interroge PLUS `remindersEnabled`', () => {
    expect(service_rappels).not.toContain('remindersEnabled');
    expect(service_rappels).toContain("estActif(tenant.id, 'rappels')");
  });

  it('⚠ le DTO REFUSE `enabled`, et le refus nomme la route du module', () => {
    expect(dto).toContain('ReglageDeplaceVersModule');
    const validateur = readFileSync(
      join(__dirname, 'reglage-deplace-vers-module.validator.ts'),
      'utf-8',
    );
    expect(validateur).toContain('PATCH /modules/rappels');
    expect(validateur).toContain('modules.gerer');
  });

  it('⚠ la migration PRÉSERVE l’état effectif au lieu d’allumer', () => {
    // Les rappels étaient éteints par défaut (`remindersEnabled ?? false`).
    // Allumer tout le monde aurait fait PARTIR DES COURRIELS à des adhérents
    // réels — une migration qui n'enlève rien mais qui AJOUTE un effet sortant.
    const sql = readFileSync(
      join(__dirname, '../../prisma/migrations/20260911200000_registre_modules/migration.sql'),
      'utf-8',
    );
    expect(sql).toContain('COALESCE("reminders_enabled", false) = false');
    expect(sql).toContain('["rappels"]');
    // Idempotence : ne rallume jamais ce qu'un administrateur aurait éteint.
    expect(sql).toContain('NOT ("modules_desactives" @> ');
  });
});

/**
 * LE MOTIF DE VERROUILLAGE, SOUS FORME EXPLOITABLE.
 *
 * ⚠ Signalé par la session frontend avant moi : `motifVerrouillage` est un
 * TEXTE VISIBLE rendu par l'API, contraire à la convention du dépôt (« tout
 * texte affiché passe par un fichier de libellés »). Pire qu'une chaîne dans un
 * composant : une phrase venue du serveur n'est traduisible par personne.
 *
 * `motif` porte la même information en ÉLÉMENTS. Les deux coexistent — la
 * phrase pour ne pas casser l'écran livré, la structure pour que le jour d'une
 * seconde langue le front compose avec SES libellés.
 */
describe('registre — le motif de verrouillage est exploitable, pas seulement lisible', () => {
  it('le noyau porte le code `noyau`', async () => {
    const { svc } = service([]);
    const etat = await svc.etat(TENANT);
    for (const id of MODULES_NOYAU) {
      expect(etat.find((m) => m.id === id)!.motif, id).toEqual({ code: 'noyau', modules: [] });
    }
  });

  it('⚠ « requis par » NOMME les modules, avec leurs identifiants', async () => {
    // Le front ne connaît pas les libellés des autres modules autrement : sans
    // les identifiants, il ne peut que réafficher la phrase de l'API.
    const { svc } = service([]);
    const etat = await svc.etat(TENANT);
    const circulation = etat.find((m) => m.id === 'circulation')!;
    // `circulation` est noyau : son motif est `noyau`, pas `requis_par`.
    expect(circulation.motif!.code).toBe('noyau');
    // `catalogue` aussi — le cas `requis_par` ne concerne que des activables.
    const activableRequis = etat.filter(
      (m) => !m.noyau && m.motif?.code === 'requis_par',
    );
    // Aucun aujourd'hui : aucun activable ne dépend d'un autre activable.
    expect(activableRequis).toEqual([]);
  });

  it('« nécessite » nomme la dépendance manquante', async () => {
    // On ne peut pas éteindre un module noyau ; on éprouve donc la forme du
    // motif sur une dépendance activable simulée éteinte.
    const { svc } = service(['amendes']);
    const etat = await svc.etat(TENANT);
    const amendes = etat.find((m) => m.id === 'amendes')!;
    expect(amendes.actif).toBe(false);
    // Ses dépendances (circulation, noyau) sont actives : il n'est pas
    // verrouillé, il est simplement éteint — et donc rallumable.
    expect(amendes.verrouille).toBe(false);
    expect(amendes.motif).toBeNull();
  });

  it('⚠ la phrase et la structure disent la MÊME chose', async () => {
    // Deux sources qui divergeraient un jour : le test est ce qui l'empêche.
    const { svc } = service([]);
    for (const m of await svc.etat(TENANT)) {
      expect(Boolean(m.motif), `${m.id} : structure`).toBe(Boolean(m.motifVerrouillage));
      expect(m.verrouille, `${m.id} : verrouillé`).toBe(m.motif !== null);
    }
  });

  it('⚠ ce qui disparaît ne PROMET pas un écran qui n’existe pas', async () => {
    // Deux fois cette déclaration a promis faux : un « écran Amendes » qui n'a
    // jamais existé, puis « Administration · Tarifs d'amendes » qui n'existe
    // pas non plus — pendant que la fiche d'adhérent, qui perd réellement sa
    // section, n'était pas déclarée. D'où des CHEMINS vérifiables, et le
    // garde-fou `ecrans-declares.spec.ts` qui les confronte à `apps/web`.
    const amendes = MODULES_PAR_ID.get('amendes')!;
    const quoi = amendes.ecrans.map((e) => e.quoi).join(' ');
    expect(quoi).toContain('section');
    expect(quoi).toContain('le guichet, lui, reste');
    // ⚠ TROISIÈME CHEMIN LE 22 SEPTEMBRE 2026, et c'est le premier écran ENTIER
    // que ce module gouverne — les deux autres sont des SECTIONS dans des
    // écrans du noyau. Ajouté par la session front avec son lot (dette n° 15),
    // et signalé en passation : `/admin/regles-de-circulation` appelle les
    // quatre routes `/circulation/rules`, toutes sous `@ModuleRequis('amendes')`.
    //
    // ⚠ Le couplage est discutable — une règle porte aussi la durée du prêt et
    // les plafonds — et le jour où il tombe, cette ligne, la déclaration du
    // registre et le `module` de l'entrée de menu changent ENSEMBLE.
    expect(amendes.ecrans.map((e) => e.chemin)).toEqual([
      'guichet',
      'admin/adherents/[id]',
      'admin/regles-de-circulation',
    ]);
  });
});
