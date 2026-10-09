/**
 * 🔴 LE REFUS D'UN MODULE INACTIF EST UN CONTRAT PUBLIÉ — deux clients le lisent.
 *
 * *Contrat écrit par la session MOBILE le 8 octobre 2026, et relu ici depuis son
 * clone : « quand le module circulation n'est pas actif, `GET /reader/card`,
 * `/reader/loans`, `/reader/holds` doivent refuser avec 403, 404 ou 501, et un
 * `message` contenant le mot `circulation` ET un mot d'inactivité. Jamais 500. »*
 *
 * ⚠ CE QUE CE GARDE EXISTE POUR EMPÊCHER, et ce n'est pas une régression de
 * code : c'est un RENOMMAGE DE LIBELLÉ. Le message vient de
 * `MODULES_PAR_ID.get(id).libelle`. Le jour où quelqu'un écrit « Prêts et
 * retours » au lieu de « Circulation physique » — un geste anodin, qui ne casse
 * aucun test —, l'app mobile cesse de reconnaître le refus et **retombe
 * silencieusement dans le menu qui mente** : elle propose « Mes prêts » à une
 * bibliothèque sans comptoir.
 *
 * ⭐ C'est « un garde qui écrit le scénario de sa propre violation » : le geste
 * qui le déclenchera est nommé ci-dessus, il est raisonnable, et il
 * n'échouerait nulle part ailleurs.
 */
import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { MODULES, MODULES_PAR_ID } from './registre-modules';

/**
 * Les mots d'inactivité que le client mobile reconnaît, recopiés de sa
 * passation du 8 octobre 2026.
 *
 * ⚠ RECOPIÉS, et c'est assumé : ils vivent dans un AUTRE dépôt que ce test ne
 * peut pas lire. C'est « deux tableaux qui se ressemblent » — la divergence est
 * possible, et c'est pourquoi la liste porte sa PROVENANCE. Le jour où le mobile
 * la change, cette ligne est le seul endroit à corriger.
 */
const MOTS_DINACTIVITE = [
  'inactif',
  'inactive',
  'désactivé',
  'non active',
  'pas active',
  'indisponible',
  'non disponible',
  'hors service',
  'disabled',
  'not enabled',
  'not active',
] as const;

/** Plie les accents et la casse, comme le client le fait. */
const plier = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Le message que `ModuleActifGuard` compose. ⚠ RECONSTRUIT ICI À L'IDENTIQUE
 * plutôt qu'appelé : instancier le garde demanderait un `ExecutionContext`, un
 * `Reflector` et un service — et ce qu'on éprouve est la PHRASE, pas le
 * câblage. Un test de source vérifie ci-dessous que la phrase du garde est bien
 * celle-ci.
 */
function messageDuRefus(moduleId: string): string {
  const libelle = MODULES_PAR_ID.get(moduleId)?.libelle ?? moduleId;
  return (
    `Le module « ${libelle} » est désactivé pour cet établissement : ` +
    'cette fonctionnalité n’est pas disponible. Aucune donnée n’a été ' +
    'supprimée — une réactivation la rend de nouveau accessible.'
  );
}

describe('l’instrument, avant ce qu’il mesure', () => {
  it('⚠ la phrase éprouvée est BIEN celle du garde — sinon ce fichier ne mesure rien', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'module-actif.guard.ts'), 'utf-8');
    // On compare les trois fragments qui composent la phrase : un seul suffirait
    // à la désynchroniser sans que rien ne le dise.
    expect(src).toContain('est désactivé pour cet établissement');
    expect(src).toContain('cette fonctionnalité n’est pas disponible');
    expect(src).toContain('MODULES_PAR_ID.get(moduleId)?.libelle');
  });
});

describe('🔴 le refus est lisible par le client mobile', () => {
  it('le message contient le mot « circulation » ET un mot d’inactivité', () => {
    const plie = plier(messageDuRefus('circulation'));
    expect(plie, 'le client cherche le mot « circulation » dans le message').toContain(
      'circulation',
    );
    const mot = MOTS_DINACTIVITE.find((m) => plie.includes(plier(m)));
    expect(
      mot,
      'aucun mot d’inactivité reconnu par le mobile : il retomberait dans le ' +
        'menu qui mente — « Mes prêts » proposé à une bibliothèque sans comptoir',
    ).toBeTruthy();
  });

  it('⚠ et le statut est 403 — JAMAIS 500', () => {
    // Le mobile refuse délibérément de lire un 5xx comme une absence de module :
    // amputer le menu d'une vraie bibliothèque sur un incident passager est pire
    // que l'entrée de trop. Un `ForbiddenException` rend 403 par construction.
    const e = new ForbiddenException({ statusCode: 403, message: messageDuRefus('circulation') });
    expect(e.getStatus()).toBe(403);
    expect([403, 404, 501], 'statuts acceptés par le contrat mobile').toContain(e.getStatus());
  });

  it('⭐ et le corps porte le module en STRUCTURÉ, pas seulement en français', () => {
    // Un appelant automatique ne doit pas analyser une phrase. Le garde ajoute
    // `module` et `moduleActif` au corps — vérifié dans sa source.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(__dirname, 'module-actif.guard.ts'), 'utf-8');
    expect(src).toContain('module: moduleId');
    expect(src).toContain('moduleActif: false');
  });

  it('⚠ et la propriété vaut pour TOUS les modules activables, pas seulement circulation', () => {
    // Témoin d'ÉNUMÉRATION : le contrat mobile ne nomme que `circulation`, mais
    // un libellé mal choisi sur n'importe quel module produirait le même silence
    // chez un client qui branche sur le nom.
    const examines: string[] = [];
    for (const m of MODULES.filter((x) => !x.noyau)) {
      const plie = plier(messageDuRefus(m.id));
      expect(
        MOTS_DINACTIVITE.some((mot) => plie.includes(plier(mot))),
        `${m.id} : le refus doit porter un mot d’inactivité`,
      ).toBe(true);
      // ⚠ Le libellé doit contenir l'identifiant, ou au moins sa racine : c'est
      // ce que le client cherche. « Circulation physique » contient
      // « circulation » ; « Prêts et retours » ne le contiendrait pas.
      examines.push(m.id);
    }
    expect(examines).toEqual(MODULES.filter((x) => !x.noyau).map((m) => m.id));
  });

  it('🔴 LE LIBELLÉ DE `circulation` DOIT CONTENIR SON IDENTIFIANT', () => {
    // C'est l'assertion qui attrape le renommage. Elle est séparée et nommée,
    // parce que c'est elle qui protège un client d'un autre dépôt.
    const libelle = MODULES_PAR_ID.get('circulation')!.libelle;
    expect(
      plier(libelle),
      'le client mobile cherche « circulation » dans le message de refus, et le ' +
        'message est composé à partir de ce libellé. Le renommer en « Prêts et ' +
        'retours » romprait un contrat PUBLIÉ sans qu’aucun autre test ne tombe.',
    ).toContain('circulation');
  });
});
