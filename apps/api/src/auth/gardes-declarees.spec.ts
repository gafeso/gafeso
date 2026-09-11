import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { FONCTIONS, ROLES_SYSTEME, TOUTES_LES_FONCTIONS } from './functions';
import { join } from 'node:path';

/**
 * AUCUNE ROUTE SOUS `FunctionsGuard` NE RESTE SANS FONCTION DÉCLARÉE.
 *
 * ⚠ LE DÉFAUT QUE CE TEST FERME, ET IL A DÉJÀ FUI. `FunctionsGuard` rend
 * `true` quand rien n'est exigé :
 *
 *     if (!required || required.length === 0) return true;
 *
 * C'est le comportement normal d'un garde composable. Mais combiné à un
 * `@UseGuards` posé sur la CLASSE, il produit une route qui PARAÎT gardée et ne
 * l'est pas — et rien ne la distingue, à la lecture, d'une route protégée.
 *
 * Constaté le 11 septembre 2026 : trois routes de lecture du catalogue
 * professionnel (`records`, `records/:id`, `keywords`) étaient ainsi ouvertes à
 * tout compte authentifié, étudiants compris, en contournant access-control.
 * Ce n'était pas une élévation de droit : c'était une fuite de données.
 *
 * ⚠ CE QUE CE TEST COÛTE, ET POURQUOI LE COÛT EST LE BON. Une route
 * volontairement ouverte doit désormais être DÉCLARÉE ci-dessous, avec son
 * motif. C'est plus verbeux — et c'est précisément l'objet : une route publique
 * doit être un choix écrit, pas un oubli. Un oubli ressemble aujourd'hui, à
 * l'octet près, à une décision.
 */

/**
 * Les routes qui n'exigent AUCUNE fonction, avec leur motif.
 *
 * ⚠ CETTE LISTE EST LE COÛT DU GARDE-FOU, ET C'EST LE BON COÛT. Elle est
 * longue — 55 entrées — parce que le produit a réellement 55 routes joignables
 * sans fonction. Chacune devait donc être regardée une fois. Ce qu'on achète :
 * la 56e sera un CHOIX ÉCRIT, alors que les trois routes du catalogue
 * professionnel étaient un oubli que rien ne distinguait d'une décision.
 *
 * Trois motifs seulement, et c'est ce qui rend la liste relisable.
 */

/**
 * PUBLIC PAR CONSTRUCTION — joignable sans être connecté, et c'est l'objet.
 *
 * ⚠ Ces routes ne sont PAS sous `FunctionsGuard` : elles n'ont aucun garde. Si
 * elles sont listées, c'est parce qu'elles vivent dans un contrôleur qui, lui,
 * en porte un ailleurs — et c'est exactement la configuration où un oubli se
 * déguise en décision.
 */
const PUBLIC_PAR_CONSTRUCTION: Record<string, string> = {
  // L'OPAC est le catalogue PUBLIC : son ouverture est la fonctionnalité.
  'opac/opac.controller.ts :: Get search': 'catalogue public',
  'opac/opac.controller.ts :: Get chiffres': 'chiffres du fonds, page d’accueil publique',
  'opac/opac.controller.ts :: Get nouveautes': 'nouveautés, page d’accueil publique',
  'opac/opac.controller.ts :: Get parcourir': 'navigation publique par domaine',
  'opac/opac.controller.ts :: Get constellation': 'constellation publique des domaines',
  'opac/opac.controller.ts :: Get authors': 'index public des auteurs',
  'opac/opac.controller.ts :: Get authors/:id': 'fiche auteur publique',
  // ⚠ Le contrôle d'accès de CETTE route est DANS le service (membersOnly,
  // règles de collection) : c'est la différence avec les trois routes de
  // `/cataloging` qui ont fui. Là-bas, aucune couche ne filtrait.
  'opac/opac.controller.ts :: Get records/:id': 'notice publique — access-control appliqué dans OpacService',

  // Connexion et inscription : on ne peut pas exiger d'être connecté pour se
  // connecter.
  'auth/auth.controller.ts :: Post login': 'connexion',
  'auth/auth.controller.ts :: Post login/2fa': 'second facteur de la connexion',
  'auth/auth.controller.ts :: Post login/2fa/email': 'envoi du code par courriel',
  'auth/auth.controller.ts :: Post logout': 'déconnexion — efface le cookie, rien d’autre',
  // ⚠ Ces deux-là portent un jeton d'enrôlement à usage unique, pas une
  // session : leur garde est le jeton lui-même, vérifié dans le service.
  'auth/auth.controller.ts :: Post 2fa/setup': 'enrôlement 2FA — jeton d’enrôlement vérifié dans le service',
  'auth/auth.controller.ts :: Post 2fa/enable': 'enrôlement 2FA — idem',
  'accounts/accounts.controller.ts :: Post register': 'inscription publique (§ logique métier)',
  'accounts/accounts.controller.ts :: Post set-password': 'lien de définition de mot de passe — jeton à usage unique, expirable',

  // Identité de l'établissement : lue par la page publique avant toute session.
  'tenancy/tenancy.controller.ts :: Get descriptor': 'résolution du domaine, avant connexion',
  'tenancy/tenancy.controller.ts :: Get current': 'identité visuelle de l’école, page publique',
  'tenancy/tenancy.controller.ts :: Get home': 'contenu de la vitrine publique',

  'admin/admin.controller.ts :: Post login': 'connexion du super-admin',

  // ⚠ P4-3 : L'ENTREPÔT OAI ENTRE DANS CE CHAMP SANS AVOIR CHANGÉ DE NATURE.
  // Il est public par construction — un moissonneur extérieur n'a pas de
  // compte. Il n'apparaissait pas ici parce que son contrôleur ne portait
  // AUCUN garde ; il en porte un désormais (`ModuleActifGuard`), et le relevé
  // le voit donc. La garde de MODULE n'est pas une garde de DROIT : elle dit si
  // la fonctionnalité existe pour cet établissement, pas qui peut l'appeler.
  'oai/oai.controller.ts :: Get': 'entrepôt OAI-PMH — public, gardé par module',
  'oai/oai.controller.ts :: Post': 'entrepôt OAI-PMH (POST) — public, gardé par module',

  // ⚠ P4-1, ET LE MOTIF EST CONTRE-INTUITIF. Lire l'état des modules est
  // ouvert à tout compte authentifié. Exiger `modules.gerer` pour LIRE
  // reviendrait à n'autoriser le filtrage du menu qu'à l'administrateur : tous
  // les autres verraient des entrées menant à des routes refusées, c'est-à-dire
  // « refuser sans cacher », que la règle d'activation interdit explicitement.
  // Ce qui sort n'est pas sensible — la liste des modules du produit et un
  // booléen. Le POUVOIR de les changer exige `modules.gerer` (PATCH).
  'modules/modules.controller.ts :: Get': 'état des modules — le front filtre son menu dessus',
};

/**
 * LIBRE-SERVICE — sous `JwtAuthGuard`, et n'agit QUE sur l'appelant.
 *
 * ⚠ Le critère est strict, et c'est lui qui distingue ces routes de la fuite
 * corrigée : le sujet de l'action est l'utilisateur du jeton, jamais un tiers
 * ni un registre. Une route de cette liste qui se mettrait à accepter un
 * identifiant d'autrui en paramètre cesserait d'y appartenir.
 */
const LIBRE_SERVICE: Record<string, string> = {
  'auth/auth.controller.ts :: Get me': 'son propre compte',
  'auth/auth.controller.ts :: Get me/functions': 'ses propres fonctions',
  'auth/auth.controller.ts :: Post password': 'son propre mot de passe',
  'auth/auth.controller.ts :: Get 2fa/status': 'sa propre 2FA',
  'auth/auth.controller.ts :: Post 2fa/backup-codes': 'ses propres codes de secours',
  'auth/auth.controller.ts :: Post 2fa/disable': 'sa propre 2FA — la POLITIQUE de l’école est ailleurs (Patch policy)',
  'auth/auth.controller.ts :: Get me/activity': 'sa propre activité',

  'access-control/access-control.controller.ts :: Get me': 'ses propres collections',
  'access-control/access-control.controller.ts :: Get me/titles/:titleId/access': 'son propre droit sur un titre',
  'access-control/access-control.controller.ts :: Get me/records/:recordId/access': 'son propre droit sur une notice',

  'reader/reader.controller.ts :: Get card': 'sa propre carte',
  'reader/reader.controller.ts :: Get loans': 'ses propres prêts',
  'reader/reader.controller.ts :: Post loans/:id/renew': 'son propre prêt — la propriété est vérifiée dans le service',
  'reader/reader.controller.ts :: Get holds': 'ses propres réservations',
  'reader/reader.controller.ts :: Post holds': 'sa propre réservation',
  'reader/reader.controller.ts :: Post holds/:id/cancel': 'sa propre réservation — propriété vérifiée dans le service',

  'offline-licensing/offline-licensing.controller.ts :: Post devices': 'son propre appareil',
  'offline-licensing/offline-licensing.controller.ts :: Post licenses': 'sa propre licence — le droit est rejoué (getRecordAccessStatus)',
  'offline-licensing/offline-licensing.controller.ts :: Get licenses/:id/status': 'sa propre licence',
  'offline-licensing/offline-licensing.controller.ts :: Get licenses/:id/blob-url': 'sa propre licence',
  'offline-licensing/offline-licensing.controller.ts :: Post entitlements': 'ses propres droits',
  'offline-licensing/offline-licensing.controller.ts :: Get my-documents': 'ses propres documents',

  // Lecture en ligne : le droit est vérifié dans OpacService.getReadUrl
  // (classe, abonnement, membersOnly) avant toute URL signée.
  'opac/opac.controller.ts :: Get records/:id/read': 'lecture en ligne — droit vérifié dans OpacService.getReadUrl',
};

/**
 * AUTRE MÉCANISME — gardé, mais pas par les fonctions.
 *
 * ⚠ Le super-admin n'est pas un utilisateur de l'école : il n'a ni rôle tenant
 * ni fonctions. `ApiKeyGuard` est son garde, et il est d'une autre nature —
 * une clé d'infrastructure, hors de la base. Ces routes sont donc listées, non
 * parce qu'elles sont ouvertes, mais parce que le relevé ne sait pas lire leur
 * garde.
 */
const AUTRE_MECANISME: Record<string, string> = {
  'admin/admin.controller.ts :: Post tenants': 'ApiKeyGuard — provisionnement',
  'admin/admin.controller.ts :: Get tenants': 'ApiKeyGuard',
  'admin/admin.controller.ts :: Get tenants/:slug': 'ApiKeyGuard',
  'admin/admin.controller.ts :: Get tenants/:slug/socle': 'ApiKeyGuard',
  'admin/admin.controller.ts :: Post tenants/:slug/sync-schema': 'ApiKeyGuard — rattrapage de schéma (I5)',
  'admin/admin.controller.ts :: Post tenants/:slug/migrate-authors': 'ApiKeyGuard',
  'admin/admin.controller.ts :: Post tenants/:slug/domaines-orphelins': 'ApiKeyGuard',
  'admin/admin.controller.ts :: Post tenants/:slug/dedupe-authors': 'ApiKeyGuard',
  'admin/admin.controller.ts :: Post tenants/:slug/seed-categories': 'ApiKeyGuard',
  'admin/admin.controller.ts :: Post tenants/:slug/seed-homepage': 'ApiKeyGuard',
  'admin/admin.controller.ts :: Post tenants/:slug/reindex': 'ApiKeyGuard',
  'admin/admin.controller.ts :: Delete tenants/:slug': 'ApiKeyGuard — suppression d’école',
};

const ROUTES_SANS_FONCTION: Record<string, string> = {
  ...PUBLIC_PAR_CONSTRUCTION,
  ...LIBRE_SERVICE,
  ...AUTRE_MECANISME,
};

const RACINE = join(__dirname, '..');
const VERBES = ['Get', 'Post', 'Patch', 'Put', 'Delete'] as const;

function controleurs(dossier: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...controleurs(chemin));
    else if (entree.endsWith('.controller.ts')) sortie.push(chemin);
  }
  return sortie;
}

interface Route {
  cle: string;
  /**
   * Le CONTRÔLEUR porte-t-il un garde, où que ce soit ?
   *
   * ⚠ C'est volontairement plus large que « cette route est sous
   * FunctionsGuard ». Un garde-fou qui ne regarde que les routes DÉJÀ gardées
   * laisse ouvert exactement le cas qui a produit la fuite : une route oubliée
   * dans un contrôleur qui, lui, protège ses voisines. C'est aussi ce qui fait
   * entrer `ApiKeyGuard` dans le champ.
   */
  dansControleurGarde: boolean;
  declareDesFonctions: boolean;
}

function routes(): Route[] {
  const trouvees: Route[] = [];
  for (const fichier of controleurs(RACINE)) {
    const source = readFileSync(fichier, 'utf-8');
    const lignes = source.split('\n');
    const relatif = fichier.replace(RACINE + '/', '');

    // Décorateurs de CLASSE : tout ce qui précède `export class`.
    const enTete = source.split('export class')[0] ?? '';
    const fonctionsDeClasse = /@RequiresFunctions\(/.test(enTete);
    const controleurGarde = /@UseGuards\(/.test(source);

    lignes.forEach((ligne, i) => {
      const m = new RegExp(`^  @(${VERBES.join('|')})\\(`).exec(ligne);
      if (!m) return;
      const chemin = /@\w+\('?([^')]*)'?\)/.exec(ligne.trim());

      // Le bloc de décorateurs de la méthode : lignes contiguës en `  @…`,
      // commentaires compris, de part et d'autre du verbe HTTP.
      let debut = i;
      while (debut > 0) {
        const t = lignes[debut - 1].trim();
        if (t.startsWith('@') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t === '') debut--;
        else break;
      }
      let fin = i;
      while (fin + 1 < lignes.length && lignes[fin + 1].trim().startsWith('@')) fin++;
      const bloc = lignes.slice(debut, fin + 1).join('\n');

      trouvees.push({
        cle: `${relatif} :: ${m[1]} ${chemin?.[1] ?? ''}`.trim(),
        dansControleurGarde: controleurGarde,
        declareDesFonctions: fonctionsDeClasse || /@RequiresFunctions\(/.test(bloc),
      });
    });
  }
  return trouvees;
}

describe('gardes déclarées — une route publique est un choix écrit', () => {
  const toutes = routes();
  const sousGarde = toutes.filter((r) => r.dansControleurGarde);

  it('le relevé voit les routes, et sait lesquelles portent le garde (témoins)', () => {
    // ⚠ Un témoin COMPTE plutôt que constater une présence : c'est ce qui a
    // trahi, sur un relevé voisin, une forme d'écriture que le motif ne voyait
    // pas. Ici le nombre total est un plancher sûr, et les trois routes
    // nommées sont celles dont je connais déjà la réponse.
    expect(toutes.length).toBeGreaterThanOrEqual(160);
    expect(sousGarde.length).toBeGreaterThanOrEqual(100);

    const nommees = [
      'cataloging/cataloging.controller.ts :: Get records',
      'cataloging/cataloging.controller.ts :: Get records/:id',
      'cataloging/cataloging.controller.ts :: Get keywords',
    ];
    for (const cle of nommees) {
      const r = toutes.find((x) => x.cle === cle);
      expect(r, cle).toBeDefined();
      expect(r!.dansControleurGarde, cle).toBe(true);
      expect(r!.declareDesFonctions, `${cle} — la fuite corrigée le 11/09/2026`).toBe(true);
    }
  });

  it('⚠ TOUTE route d’un contrôleur gardé déclare une fonction, OU son ouverture', () => {
    const muettes = sousGarde
      .filter((r) => !r.declareDesFonctions)
      .filter((r) => !(r.cle in ROUTES_SANS_FONCTION))
      .map((r) => r.cle);
    expect(muettes, 'routes ni gardées par une fonction ni déclarées ouvertes').toEqual([]);
  });

  it('⚠ aucune route n’est déclarée ouverte pour DEUX motifs différents', () => {
    // Un motif ambigu est un motif qu'on ne peut pas réviser : « public » et
    // « libre-service » n'appellent pas la même relecture le jour où la route
    // change. Même forme que la permission cible à deux origines.
    const doubles: string[] = [];
    const vus = new Map<string, string>();
    const categories: [string, Record<string, string>][] = [
      ['public par construction', PUBLIC_PAR_CONSTRUCTION],
      ['libre-service', LIBRE_SERVICE],
      ['autre mécanisme', AUTRE_MECANISME],
    ];
    for (const [nom, table] of categories) {
      for (const cle of Object.keys(table)) {
        const deja = vus.get(cle);
        if (deja) doubles.push(`${cle} : ${deja} + ${nom}`);
        else vus.set(cle, nom);
      }
    }
    expect(doubles, 'routes déclarées dans deux catégories').toEqual([]);
  });

  it('chaque route déclarée ouverte porte un motif NON VIDE', () => {
    const sansMotif = Object.entries(ROUTES_SANS_FONCTION)
      .filter(([, motif]) => !motif || motif.trim().length < 5)
      .map(([cle]) => cle);
    expect(sansMotif, 'routes déclarées ouvertes sans motif lisible').toEqual([]);
  });

  it('la liste des routes ouvertes ne contient pas d’entrée périmée', () => {
    // Une exception qui ne correspond plus à aucune route est une exception
    // qu'on croit active et qui ne protège rien — le début d'une liste où l'on
    // enterre les trouvailles.
    const clesConnues = new Set(toutes.map((r) => r.cle));
    const perimees = Object.keys(ROUTES_SANS_FONCTION).filter((c) => !clesConnues.has(c));
    expect(perimees, 'exceptions périmées').toEqual([]);
  });

  it('⚠ l’inventaire COMPTE juste — 55 routes sans fonction, pas « au moins une »', () => {
    // Un témoin qui COMPTE, et non qui constate : c'est la forme qui signale ce
    // à quoi on n'a pas pensé. Si ce nombre bouge, quelqu'un a ajouté ou retiré
    // une route joignable sans fonction — et doit le dire.
    const sansFonction = sousGarde.filter((r) => !r.declareDesFonctions);
    expect(sansFonction.length).toBe(58);
    expect(Object.keys(ROUTES_SANS_FONCTION).length).toBe(58);
  });
});

/**
 * LA MIGRATION QUI ACCORDE LA FONCTION DIT LA MÊME CHOSE QUE LE CODE.
 *
 * ⚠ Le SQL ne peut importer ni `FONCTIONS` ni `ROLES_SYSTEME` : il recopie le
 * code de la fonction et le nom du rôle. Troisième occurrence de cette classe
 * de défaut dans la phase — un vocabulaire en plusieurs endroits qui ne se
 * parlent pas — et sa divergence serait silencieuse : un code mal orthographié
 * dans le SQL accorderait une fonction qui n'existe pas, et la route resterait
 * en 403 sans que rien ne le signale.
 */
describe('securite.authentification — la migration et le code s’accordent', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20260911160000_securite_authentification/migration.sql',
    ),
    'utf-8',
  );

  it('la migration existe et nomme bien une fonction (témoin positif)', () => {
    expect(sql).toContain('array_append(functions,');
    expect(sql).toContain("is_system = true");
  });

  it('⚠ le code de fonction du SQL est EXACTEMENT celui du catalogue', () => {
    const cites = [...sql.matchAll(/'(securite\.[a-z]+)'/g)].map((m) => m[1]);
    expect(cites.length).toBeGreaterThan(0); // témoin : on a bien lu des codes
    for (const code of new Set(cites)) {
      expect(TOUTES_LES_FONCTIONS, `${code} inconnu du catalogue`).toContain(code);
    }
    expect(new Set(cites)).toEqual(new Set([FONCTIONS.SECURITE_AUTHENTIFICATION]));
  });

  it('⚠ le nom de rôle du SQL est EXACTEMENT un rôle système', () => {
    // ⚠ La lookbehind n'est pas une coquetterie : `/name = '…'/` attrapait
    // aussi `nspname = 'public'`, la boucle sur les schémas. Le motif était
    // juste, l'objet ne l'était pas — et le test signalait « public n'est pas
    // un rôle système », ce qui est vrai et hors sujet.
    const noms = [...sql.matchAll(/(?<![a-z])name = '([^']+)'/g)].map((m) => m[1]);
    expect(noms.length).toBeGreaterThan(0); // témoin
    expect(noms, 'la boucle sur les schémas ne doit pas être lue comme un rôle')
      .not.toContain('public');
    for (const nom of noms) {
      expect(
        ROLES_SYSTEME.map((r) => r.name),
        `« ${nom} » n’est pas un rôle système`,
      ).toContain(nom);
    }
  });

  it('la fonction est bien accordée à l’Administrateur dans le CODE aussi', () => {
    // Sinon la migration l'accorderait puis `ensureSystemRoles` la retirerait
    // au premier passage — un aller-retour que personne ne verrait.
    const admin = ROLES_SYSTEME.find((r) => r.name === 'Administrateur');
    expect(admin, 'rôle Administrateur introuvable').toBeDefined();
    expect(admin!.functions).toContain(FONCTIONS.SECURITE_AUTHENTIFICATION);
  });

  it('⚠ elle n’est accordée à AUCUN autre rôle système', () => {
    // Décision du 11 septembre 2026 : Administrateur SEUL.
    const porteurs = ROLES_SYSTEME.filter((r) =>
      r.functions.includes(FONCTIONS.SECURITE_AUTHENTIFICATION),
    ).map((r) => r.name);
    expect(porteurs).toEqual(['Administrateur']);
  });
});
