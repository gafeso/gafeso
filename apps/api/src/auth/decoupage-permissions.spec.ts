import { describe, expect, it } from 'vitest';
import {
  CATALOGUE_FONCTIONS,
  FONCTIONS,
  FONCTIONS_RESERVEES_ADMIN,
  ROLES_SYSTEME,
  TOUTES_LES_FONCTIONS,
} from './functions';
import {
  DECOUPAGE,
  FONCTIONS_SYSTEME_AVANT_DECOUPAGE,
  fonctionsApresDecoupage,
  ELARGISSEMENTS_ACCORDES,
} from './decoupage-permissions';

const ANCIENNES = Object.keys(DECOUPAGE);

describe('découpage — personne ne perd, personne ne gagne', () => {
  it('⚠ INVARIANT : une nouvelle permission n’est l’image que d’UNE SEULE ancienne', () => {
    // C'est la condition qui rend le transfert possible, et elle a coûté deux
    // corrections de la table cible. Si deux anciennes permissions détenues par
    // des populations DIFFÉRENTES visaient la même nouvelle, poser cette
    // nouvelle ferait forcément gagner l'une ou perdre l'autre.
    // Cas rencontrés : `outils.utiliser` (catalogue.gerer + etudiants.importer)
    // et `lecteurs.gerer` s'il avait aussi absorbé `adherents.gerer`.
    const origines = new Map<string, string[]>();
    for (const [ancienne, nouvelles] of Object.entries(DECOUPAGE)) {
      for (const n of nouvelles) {
        origines.set(n, [...(origines.get(n) ?? []), ancienne]);
      }
    }
    const collisions = [...origines.entries()].filter(([, o]) => o.length > 1);
    expect(collisions, 'une permission cible reçoit deux populations').toEqual([]);
  });

  it('chaque rôle système reçoit l’image de ses anciennes fonctions, PLUS les élargissements DÉCLARÉS', () => {
    // ⚠ CE TEST A FAIT SON OFFICE LE 12 SEPTEMBRE 2026 : le premier
    // élargissement accordé depuis le découpage l'a fait tomber. On ne
    // l'affaiblit pas — on DÉCLARE ce qui a été accordé, dans
    // `ELARGISSEMENTS_ACCORDES`, avec sa date et son motif. Tout AUTRE ajout
    // continue de le faire tomber, et c'est tout l'objet de la manœuvre : une
    // ligne d'apparence anodine ne peut plus élargir en silence.
    for (const [nom, avant] of Object.entries(FONCTIONS_SYSTEME_AVANT_DECOUPAGE)) {
      const role = ROLES_SYSTEME.find((r) => r.name === nom);
      expect(role, `rôle ${nom} disparu`).toBeDefined();
      const attendu = [
        ...fonctionsApresDecoupage(avant),
        ...(ELARGISSEMENTS_ACCORDES[nom]?.fonctions ?? []),
      ].sort();
      expect([...role!.functions].sort(), nom).toEqual(attendu);
    }
  });

  it('⚠ chaque élargissement déclaré porte son MOTIF, et vise un rôle qui existe', () => {
    // Une déclaration sans motif est une permission qu'on ne sait plus
    // justifier — donc une qu'on ne saura pas retirer.
    for (const [nom, { fonctions, motif }] of Object.entries(ELARGISSEMENTS_ACCORDES)) {
      expect(ROLES_SYSTEME.map((r) => r.name), nom).toContain(nom);
      expect(fonctions.length, nom).toBeGreaterThan(0);
      expect(motif.length, `${nom} : le motif doit être écrit, pas symbolique`)
        .toBeGreaterThan(40);
    }
  });

  it('l’Administrateur garde TOUTES les fonctions, dont les nouvelles', () => {
    const admin = ROLES_SYSTEME.find((r) => r.name === 'Administrateur');
    expect(admin!.functions).toEqual(TOUTES_LES_FONCTIONS);
    expect(admin!.functions).toContain(FONCTIONS.SECURITE_AUDIT);
  });

  it('⚠ le Gestionnaire et Acquisitions existent toujours — le repli est fail-closed', () => {
    // Les supprimer ici retirerait TOUTES leurs fonctions aux comptes dont
    // users.role_id est null : functionsForLegacyRole renvoie [] pour un rôle
    // inconnu. Leur sort est une décision produit, pas un effet de bord.
    const noms = ROLES_SYSTEME.map((r) => r.name);
    expect(noms).toContain('Gestionnaire');
    expect(noms).toContain('Acquisitions');
  });

  it('la transformation est idempotente : rejouable sans dommage', () => {
    for (const avant of Object.values(FONCTIONS_SYSTEME_AVANT_DECOUPAGE)) {
      const une = fonctionsApresDecoupage(avant);
      expect([...fonctionsApresDecoupage(une)].sort()).toEqual([...une].sort());
    }
  });
});

describe('découpage — cas 1 : le compte qui portait etablissement.gerer', () => {
  it('reçoit les six permissions prévues, et rien d’autre', () => {
    expect([...fonctionsApresDecoupage(['etablissement.gerer'])].sort()).toEqual(
      [
        'circulation.retards',
        'diffusion.gerer',
        'etablissement.apparence',
        'etablissement.regles',
        'securite.audit',
        'statistiques.voir',
      ].sort(),
    );
  });

  it('le journal d’audit n’est plus derrière le libellé de l’identité visuelle', () => {
    // Le défaut, en une ligne : la case « Modifier l'identité visuelle de
    // l'école » ouvrait le journal d'audit.
    const apparence = CATALOGUE_FONCTIONS.find(
      (f) => f.code === FONCTIONS.ETABLISSEMENT_APPARENCE,
    )!;
    expect(apparence.libelle).not.toMatch(/audit/i);
    const audit = CATALOGUE_FONCTIONS.find((f) => f.code === FONCTIONS.SECURITE_AUDIT)!;
    expect(audit.libelle).toMatch(/audit/i);
  });
});

describe('découpage — cas 2 : chaque permission dit les écrans qu’elle ouvre', () => {
  it('toute fonction du catalogue est connue, et toute fonction connue est au catalogue', () => {
    // Une fonction absente du catalogue est invisible à l'écran des rôles ;
    // une entrée de catalogue sans fonction est une case inerte.
    expect([...CATALOGUE_FONCTIONS.map((f) => f.code)].sort()).toEqual(
      [...TOUTES_LES_FONCTIONS].sort(),
    );
  });

  it('les permissions issues du découpage NOMMENT leurs écrans', () => {
    const issues = Object.values(DECOUPAGE).flat();
    for (const code of issues) {
      const entree = CATALOGUE_FONCTIONS.find((f) => f.code === code)!;
      expect(entree, code).toBeDefined();
      expect(entree.libelle, `${code} ne dit pas quel écran il ouvre`).toContain('ouvre :');
    }
  });

  it('aucune ancienne permission ne subsiste : pas de case morte à l’écran des rôles', () => {
    for (const ancienne of ANCIENNES) {
      // `catalogue.gerer` survit volontairement : il reste sa propre cible.
      if (DECOUPAGE[ancienne].includes(ancienne)) continue;
      expect(TOUTES_LES_FONCTIONS, `${ancienne} traîne encore`).not.toContain(ancienne);
    }
  });
});

describe('découpage — cas 3 : securite.roles est réservée', () => {
  /**
   * ⚠ LE CRITÈRE, ÉCRIT, parce que c'est lui qui décide des ajouts futurs : est
   * réservée toute fonction qui commande CE QUE LES AUTRES PEUVENT FAIRE OU
   * VOIR à l'échelle de l'école.
   *
   * · `securite.roles` distribue toutes les autres fonctions — escalade de
   *   DROITS par composition.
   * · `modules.gerer` éteint des modules pour l'établissement entier — donc
   *   retire des écrans à des gens dont son porteur ne gère pas les droits.
   *   Escalade de PÉRIMÈTRE, aussi large.
   */
  it('⚠ la liste réservée est EXACTEMENT celle-là — pas « contient au moins »', () => {
    // La version précédente affirmait `toContain(SECURITE_ROLES)`. C'est un
    // témoin de PRÉSENCE : il confirme que la liste existe, et il a laissé
    // passer `modules.gerer`, créée sans y être inscrite — donc attribuable à
    // un rôle personnalisé. Un témoin qui COMPTE est le seul qui signale ce à
    // quoi on n'a pas pensé.
    expect([...FONCTIONS_RESERVEES_ADMIN].sort()).toEqual(
      [FONCTIONS.SECURITE_ROLES, FONCTIONS.MODULES_GERER].sort(),
    );
  });

  it('chaque fonction réservée existe au catalogue', () => {
    for (const f of FONCTIONS_RESERVEES_ADMIN) {
      expect(TOUTES_LES_FONCTIONS, `${f} inconnue du catalogue`).toContain(f);
    }
  });

  it('⚠ chaque fonction réservée n’est portée QUE par l’Administrateur', () => {
    // Sans quoi la réserve serait contournée par le repli historique : un
    // compte sans rôle dynamique hérite des fonctions de son rôle système.
    for (const f of FONCTIONS_RESERVEES_ADMIN) {
      const porteurs = ROLES_SYSTEME.filter((r) => r.functions.includes(f)).map((r) => r.name);
      expect(porteurs, f).toEqual(['Administrateur']);
    }
  });

  it('n’est portée que par le rôle Administrateur parmi les rôles système', () => {
    const porteurs = ROLES_SYSTEME.filter((r) =>
      r.functions.includes(FONCTIONS.SECURITE_ROLES),
    ).map((r) => r.name);
    expect(porteurs).toEqual(['Administrateur']);
  });
});
