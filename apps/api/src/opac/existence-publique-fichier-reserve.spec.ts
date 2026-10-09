/**
 * L'EXISTENCE D'UN DOCUMENT EST PUBLIQUE ; LE FICHIER NE L'EST PAS.
 *
 * ⚠ CE GARDE ÉCRIT LE SCÉNARIO DE SA PROPRE VIOLATION, parce que le geste qui
 * le violera est NATUREL et paraîtra utile.
 *
 * Depuis le 8 octobre 2026, `GET /opac/records/:id` sert `hasDigital` et
 * `offlineReady` à un visiteur ANONYME : c'est une décision, et son motif est
 * qu'un étudiant à distance qui ne peut pas savoir, avant de créer un compte,
 * si ce catalogue contient quoi que ce soit de lisible n'a aucune raison d'en
 * créer un.
 *
 * Voici donc ce que quelqu'un fera, de bonne foi, dans six mois :
 *
 *   « La fiche dit déjà qu'un document existe. Rendre son URL de lecture
 *     publique ne révèle donc rien de plus — et ça éviterait au visiteur un
 *     aller-retour par l'inscription. »
 *
 * Le raisonnement est faux d'un cran, et le cran est tout : ANNONCER qu'un
 * document existe et LE SERVIR ne sont pas la même divulgation. Entre les deux
 * vivent le contrôle d'accès par classe et par abonnement (brique 4), l'embargo
 * d'une thèse, et la rémunération d'un auteur. Une bibliothèque de thèses doit
 * pouvoir dire « ce mémoire existe » sans le donner.
 *
 * ⚠ Et c'est la raison pour laquelle ce garde ne liste pas des chemins : il
 * CLASSE chaque méthode du contrôleur, et une méthode neuve n'est dans aucune
 * des deux listes. Le test échoue alors en disant les DEUX issues — c'est la
 * forme de `LIGNES_PARTAGEES` et de `colonnes-ecrivables`, la seule qui ne se
 * périme pas toute seule.
 */
import { describe, expect, it } from 'vitest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OpacController } from './opac.controller';
import { OpacService } from './opac.service';

/**
 * Routes PUBLIQUES par décision : elles décrivent le fonds — ce qui existe,
 * combien, de qui, d'où ça vient. Aucune ne sert d'octet de document.
 */
const PUBLIQUES: Record<string, string> = {
  search: 'recherche du catalogue public',
  chiffres: 'les quatre entiers de la vitrine',
  nouveautes: 'liste de notices récentes',
  parcourir: 'pagination du fonds',
  constellation: 'carte des domaines de la page d’accueil',
  authorsIndex: 'index des fiches d’autorité',
  authorDetail: 'une fiche d’autorité — un auteur est public par destination',
  provenances: 'les écoles d’origine du fonds moissonné',
  resoudre: 'un identifiant pérenne vers sa notice',
  record:
    'la DESCRIPTION d’une notice. Sert `hasDigital` / `offlineReady` à l’anonyme, ' +
    'et masque `digitalCopy`, `items`, `availability` (membersOnly).',
};

/**
 * Routes RÉSERVÉES : elles mènent au FICHIER, ou à une URL qui y mène.
 * Chacune DOIT porter `JwtAuthGuard` — et pas seulement un contrôle en aval,
 * parce qu'un anonyme n'a pas d'identité sur laquelle le contrôle d'accès
 * puisse se prononcer.
 */
const RESERVEES: Record<string, string> = {
  read:
    'URL signée de lecture en ligne. Un anonyme n’a ni classe ni abonnement : ' +
    'access-control ne peut rien décider pour lui, donc le refus est en amont.',
};

/** Toutes les méthodes du contrôleur qui portent un décorateur de route. */
function methodesDeRoute(): string[] {
  const proto = OpacController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter(
    (nom) =>
      nom !== 'constructor' &&
      typeof proto[nom] === 'function' &&
      Reflect.hasMetadata('path', proto[nom] as never),
  );
}

function gardes(methode: string): unknown[] {
  const proto = OpacController.prototype as unknown as Record<string, unknown>;
  return (Reflect.getMetadata('__guards__', proto[methode] as never) as unknown[]) ?? [];
}

describe('l’existence d’un document est publique, le fichier est réservé', () => {
  it('⚠ CHAQUE route de l’OPAC est classée — une route neuve fait tomber ce test', () => {
    const trouvees = methodesDeRoute().sort();
    // Témoin de COMPTE : il convoque quand une route apparaît ou disparaît.
    // Un témoin de présence serait resté vert sur une population vide.
    expect(
      trouvees.length,
      'le relevé ne trouve plus aucune route : c’est l’instrument qu’il faut ' +
        'regarder, pas le contrôleur',
    ).toBeGreaterThan(5);
    expect(
      trouvees,
      'Une route de l’OPAC n’est ni PUBLIQUE ni RÉSERVÉE. Deux issues, et il ' +
        'faut choisir : (a) elle DÉCRIT le fonds → ajoutez-la à PUBLIQUES avec ' +
        'son motif ; (b) elle mène au FICHIER ou à une URL qui y mène → ' +
        'ajoutez-la à RESERVEES et posez `@UseGuards(JwtAuthGuard)` dessus.',
    ).toEqual([...Object.keys(PUBLIQUES), ...Object.keys(RESERVEES)].sort());
  });

  it('🔴 toute route qui mène au FICHIER refuse l’anonyme EN AMONT', () => {
    for (const [methode, motif] of Object.entries(RESERVEES)) {
      expect(
        gardes(methode),
        `\`${methode}\` sert le document ou son URL et doit porter JwtAuthGuard. ` +
          `Motif : ${motif}\n` +
          '⚠ Si vous venez de la retirer parce que « la fiche dit déjà qu’un ' +
          'document existe » : annoncer et servir ne sont pas la même ' +
          'divulgation. Entre les deux vivent le contrôle d’accès par classe, ' +
          'l’embargo, et la rémunération d’un auteur.',
      ).toContain(JwtAuthGuard);
    }
  });

  it('⚠ TÉMOIN D’ABSENCE : les routes publiques ne portent PAS cette garde', () => {
    // Sans lui, un garde qui trouverait `JwtAuthGuard` partout serait
    // indiscernable d'un garde juste — et il le serait aussi le jour où
    // quelqu'un poserait la garde au niveau du CONTRÔLEUR, ce qui fermerait
    // tout l'OPAC public sans qu'aucune de nos assertions ne bronche.
    for (const methode of Object.keys(PUBLIQUES)) {
      expect(
        gardes(methode),
        `\`${methode}\` décrit le fonds : elle doit rester atteignable sans jeton. ` +
          'Une garde posée ici (ou sur le contrôleur entier) fermerait le ' +
          'catalogue public — y compris aux moteurs qui l’indexent.',
      ).not.toContain(JwtAuthGuard);
    }
  });

  it('🔴 l’anonyme reçoit l’EXISTENCE et jamais le FORMAT, la taille ou la clé', async () => {
    // L'effet, pas la forme : on appelle la méthode et on compte ce qui sort.
    const ligne = {
      id: 'rec-1',
      title: 'Thèse',
      contributors: [],
      keywords: [],
      items: [{ status: 'AVAILABLE' }],
      digitalCopy: { fileFormat: 'PDF', encStatus: 'ready' },
    };
    const service = new OpacService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { provenance: async () => null } as never,
      { enregistrer: async () => true } as never,
    );
    const db = { biblioRecord: { findUnique: async () => ligne } } as never;
    const r = (await service.recordDetail(db, 'rec-1', false)) as Record<string, unknown>;

    expect(r.hasDigital, 'l’existence est publique par décision').toBe(true);
    expect(r.offlineReady).toBe(true);
    // Et rien de plus : ni le format, ni les exemplaires, ni la disponibilité.
    expect(r.digitalCopy, 'le format est réservé aux membres').toBeNull();
    expect(r.items).toEqual([]);
    expect(r.availability).toBeNull();
    expect(r.membersOnly).toBe(true);
    // Les secrets ne sont même pas lus en base (voir le select), donc ils ne
    // peuvent pas sortir ; on le vérifie quand même ICI, parce que c'est la
    // charge SERVIE qui compte pour un client.
    const serialise = JSON.stringify(r);
    for (const interdit of ['objectKey', 'encObjectKey', 'encWrappedCek', 'fileSize']) {
      expect(serialise, `\`${interdit}\` ne sort jamais de cette route`).not.toContain(interdit);
    }
  });
});
