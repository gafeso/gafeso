import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ⚠ TOUT TEST QUI TOUCHE UNE VRAIE BASE DÉCLARE SA DISCIPLINE.
 *
 * *Posé le 13 septembre 2026, après TROIS faux dispositifs dans la même
 * journée.* Un faux dispositif, c'est un mécanisme qui EXISTE, qui s'EXÉCUTE,
 * et qui ne fait pas ce que son nom annonce — et les trois passaient VERTS :
 *
 * | Le dispositif | Ce qui manquait | Ce que ça a coûté |
 * |---|---|---|
 * | Une transaction « annulée » | le `throw` | deux dépôts restés en base |
 * | Un nettoyage « complet » | la bonne PORTÉE | 36 lignes `SENT` mensongères |
 * | Une parité de moteurs | l'assertion d'attente | 12 réussites sur zéro mesure |
 *
 * ⚠ **ON NE LES ATTRAPE PAS EN LISANT** : chaque pièce est là, le commentaire
 * explique l'intention, et le test est vert. On ne les attrape qu'en mesurant
 * leur EFFET.
 *
 * Ce garde ne mesure pas l'effet — il ne peut pas. Il fait l'autre moitié :
 * il OBLIGE chaque recette à dire ce qu'elle fait de ses écritures, et il
 * vérifie mécaniquement ce qui est vérifiable. C'est la forme
 * `couverture-des-roles` : un message qui dit quoi faire, des natures qui ne
 * se confondent pas, la valeur RÉELLE lue sur le disque, et une déclaration
 * périmée refusée.
 */

const RACINE = join(__dirname, '..');

type Discipline = 'lecture-seule' | 'transaction-annulee' | 'nettoyage-recense';

/**
 * Chaque spec qui construit un vrai `PrismaClient`, et ce qu'elle promet.
 *
 * ⚠ `lecture-seule` est la seule nature VÉRIFIABLE À COUP SÛR : aucune écriture
 * dans le fichier. Les deux autres sont vérifiées partiellement — la borne est
 * écrite plus bas, mesurée plutôt que supposée.
 */
const DISCIPLINES: Record<string, { discipline: Discipline; motif: string }> = {
  'cataloging/vocabulaire-des-types-en-base.spec.ts': {
    discipline: 'lecture-seule',
    motif: 'interroge le vocabulaire que la base PORTE ; ne l’écrit jamais',
  },
  'roles/roles-systeme-en-base.spec.ts': {
    discipline: 'lecture-seule',
    motif: 'compare ROLES_SYSTEME à ce que chaque schéma porte — réparer serait une mutation',
  },
  'tenancy/derive-des-schemas-en-base.spec.ts': {
    discipline: 'lecture-seule',
    motif: 'compare les schémas d’école au gabarit `public`',
  },
  'moissonnage/recette-entrepots-reels.spec.ts': {
    discipline: 'transaction-annulee',
    motif: 'moissonne un vrai entrepôt et écrit par les services ; tout est annulé',
  },
  'depots/recette-circuit-reel.spec.ts': {
    discipline: 'transaction-annulee',
    motif:
      '⚠ C’EST ELLE QUI A MANQUÉ SON `throw` et laissé deux dépôts en base. ' +
      'Elle porte désormais l’annulation ET le compte de ce qui reste.',
  },
  'collections/hierarchie-en-base.spec.ts': {
    discipline: 'transaction-annulee',
    motif: 'éprouve le trigger de hiérarchie dans des transactions systématiquement annulées',
  },
  'reminders/recette-rappels-reels.spec.ts': {
    discipline: 'nettoyage-recense',
    motif:
      '⚠ `reminder_logs` vit dans `public`, les prêts dans l’école : deux clients ' +
      'Prisma, donc pas de transaction commune. Elle retient les IDENTIFIANTS ' +
      'préexistants, nettoie par DIFFÉRENCE et confronte le compte final au ' +
      'recensement — après avoir laissé 36 lignes en ne nettoyant que son empreinte.',
  },
  'offline-licensing/offline-licensing.e2e.spec.ts': {
    discipline: 'nettoyage-recense',
    motif:
      'boote l’API dans un processus enfant et parle en HTTP réel : rien n’est ' +
      'annulable. Son `afterAll` supprime nommément ce qu’elle a créé.',
  },
};

/** Les verbes par lesquels une écriture entre en base. */
const ECRITURES = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;

function specs(dossier: string): string[] {
  const sortie: string[] = [];
  for (const e of readdirSync(dossier)) {
    const chemin = join(dossier, e);
    if (statSync(chemin).isDirectory()) sortie.push(...specs(chemin));
    else if (e.endsWith('.spec.ts') && chemin !== __filename) sortie.push(chemin);
  }
  return sortie;
}

/** Les specs qui construisent un VRAI client Prisma — pas une doublure. */
function recettes(): { cle: string; source: string }[] {
  return specs(RACINE)
    .map((f) => ({ cle: f.replace(RACINE + '/', ''), source: readFileSync(f, 'utf-8') }))
    .filter((f) => /new PrismaClient\s*\(/.test(f.source));
}

describe('L’instrument : le relevé des recettes qui touchent une vraie base', () => {
  it('⚠ il en trouve EXACTEMENT huit — une neuvième force à relire ceci', () => {
    // ⚠ TÉMOIN QUI COMPTE. « Au moins une » confirmerait que le relevé tourne ;
    // seul un compte exact signale la recette écrite demain par quelqu'un qui
    // n'aura pas entendu parler des trois faux dispositifs d'aujourd'hui.
    expect(recettes().map((r) => r.cle).sort()).toEqual(Object.keys(DISCIPLINES).sort());
  });
});

describe('⚠ Chaque recette DIT ce qu’elle fait de ses écritures', () => {
  it('aucune recette sans discipline déclarée', () => {
    const nouvelles = recettes()
      .map((r) => r.cle)
      .filter((c) => !(c in DISCIPLINES));
    expect(
      nouvelles,
      'Cette spec construit un vrai `PrismaClient`. Déclarez sa discipline :\n' +
        ' · `lecture-seule` — elle n’écrit rien (vérifié mécaniquement) ;\n' +
        ' · `transaction-annulee` — tout se passe dans une transaction qui LÈVE ' +
        'pour annuler (le `throw` est vérifié) ;\n' +
        ' · `nettoyage-recense` — elle écrit vraiment, retient l’état AVANT, et ' +
        'confronte le compte final au recensement.\n' +
        '⚠ Trois faux dispositifs le 13 septembre 2026 : une transaction sans ' +
        '`throw`, un nettoyage mal porté, une attente sans assertion. Les trois ' +
        'passaient VERTS.',
    ).toEqual([]);
  });

  it('⚠ aucune déclaration PÉRIMÉE — une spec qui ne touche plus la base sort de la liste', () => {
    const vues = new Set(recettes().map((r) => r.cle));
    const perimees = Object.keys(DISCIPLINES).filter((c) => !vues.has(c));
    expect(perimees, 'ces specs sont déclarées et ne construisent plus de client réel').toEqual([]);
  });

  it('toute discipline porte un MOTIF', () => {
    const muettes = Object.entries(DISCIPLINES)
      .filter(([, d]) => !d.motif || d.motif.length < 20)
      .map(([c]) => c);
    expect(muettes, 'une discipline sans motif est une case cochée').toEqual([]);
  });
});

describe('⚠ Et ce qui se VÉRIFIE, est vérifié', () => {
  it('`lecture-seule` n’écrit RIEN — c’est la nature la plus forte', () => {
    const fautives: string[] = [];
    for (const { cle, source } of recettes()) {
      if (DISCIPLINES[cle]?.discipline !== 'lecture-seule') continue;
      // Les commentaires parlent d'écritures sans en faire.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (ECRITURES.test(code)) fautives.push(cle);
    }
    expect(
      fautives,
      'déclarée `lecture-seule` et elle écrit : changez la nature, ou retirez l’écriture',
    ).toEqual([]);
  });

  it('⚠ `transaction-annulee` LÈVE dans sa transaction — c’est le `throw` qui a manqué', () => {
    // ⚠ LE DÉFAUT EXACT DU 13 SEPTEMBRE. La transaction était ouverte, le
    // `catch` l'attendait, le commentaire l'expliquait — et rien ne levait.
    // Une transaction sans `throw` COMMITE, et la suite reste verte.
    const fautives: string[] = [];
    for (const { cle, source } of recettes()) {
      if (DISCIPLINES[cle]?.discipline !== 'transaction-annulee') continue;
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (!/\$transaction/.test(code)) fautives.push(`${cle} — aucune transaction`);
      // ⚠ LE MARQUEUR, PAS N'IMPORTE QUEL `throw`. Ma première version cherchait
      // `throw new Error(` dans tout le fichier — et une recette dont j'avais
      // RETIRÉ l'annulation passait quand même, parce qu'une fonction utilitaire
      // en contenait un. Le contrôle négatif l'a dit ; ma relecture, non.
      //
      // `ROLLBACK_VOULU` est une convention partagée par les trois recettes, au
      // même titre que `MESSAGE_BASE_INJOIGNABLE` pour les gardes vivants : elle
      // est ce que l'on CHERCHE, donc elle ne se reformule pas sans bruit.
      else if (!/throw new Error\('ROLLBACK_VOULU'\)/.test(code))
        fautives.push(`${cle} — aucun \`throw new Error('ROLLBACK_VOULU')\` pour annuler`);
    }
    expect(
      fautives,
      'Une transaction qui ne LÈVE pas est une transaction qui COMMITE. ' +
        'C’est le faux dispositif qui a laissé deux dépôts dans la base le ' +
        '13 septembre 2026 : toutes les pièces étaient là sauf une ligne.',
    ).toEqual([]);
  });

  it('⚠ `nettoyage-recense` confronte un état AVANT — pas sa propre empreinte', () => {
    // La borne : ce test vérifie qu'un état antérieur est CAPTURÉ et RELU, pas
    // que la comparaison soit juste. C'est ce qui manquait à la recette des
    // rappels — elle prenait le recensement et ne le comparait jamais.
    const fautives: string[] = [];
    for (const { cle, source } of recettes()) {
      if (DISCIPLINES[cle]?.discipline !== 'nettoyage-recense') continue;
      const aUnAvant = /avant|Avant|AVANT|initial|existant/.test(source);
      const aUnAfterAll = /afterAll\s*\(/.test(source);
      if (!aUnAvant || !aUnAfterAll) fautives.push(cle);
    }
    expect(
      fautives,
      'une recette qui écrit doit capturer l’état AVANT et nettoyer dans un `afterAll`',
    ).toEqual([]);
  });
});

/**
 * ⚠ LA BORNE, ÉCRITE PARCE QU'ELLE A ÉTÉ MESURÉE — pas parce qu'elle est commode.
 *
 * Ce garde ne prouve PAS qu'une recette ne laisse rien : cela se mesure à
 * l'exécution, contre une vraie base, et un test de source ne le peut pas. Il
 * prouve trois choses plus modestes, et chacune a déjà manqué une fois :
 *
 * · une recette qui touche une vraie base est DÉCLARÉE (sinon personne ne sait
 *   qu'elle écrit) ;
 * · `lecture-seule` est tenue, entièrement ;
 * · `transaction-annulee` porte le `throw` sans lequel elle commite.
 *
 * ⚠ Ce qu'il ne sait pas dire : si la PORTÉE d'un nettoyage est la bonne. C'est
 * le second faux dispositif du jour, et il est hors d'atteinte d'un motif —
 * « nettoyer ce que l'action a produit » suppose de savoir ce qu'elle a produit.
 * Chaque recette de cette nature porte donc l'assertion dans son propre
 * `afterAll`, et le motif ci-dessus dit pourquoi.
 */
