import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGE_BASE_INJOIGNABLE } from './base-injoignable';

/**
 * LES GARDES VIVANTS — ceux qui interrogent le SERVEUR, gatés `PG_LIVE=1`.
 *
 * ⚠ CE FICHIER EXISTE PARCE QU'UN GARDE QUE PERSONNE NE LANCE NE GARDE RIEN.
 * Les trois gardes vivants passaient tous — et ni `npm test`, ni le crochet de
 * pré-publication ne les exécutaient. Ils dormaient depuis leur écriture.
 *
 * Deux propriétés sont tenues ici, et aucune n'est décorative :
 *
 * **1. Tout garde vivant sort ROUGE si la base ne répond pas.** Un
 * `if (injoignable) return` rendrait vert un test qui n'a rien exercé — la
 * forme la plus répandue du faux positif de suite.
 *
 * **2. Le message de ce cas est une CONSTANTE PARTAGÉE**, parce qu'un script
 * shell le lit. Le crochet de pré-publication distingue « la propriété est
 * violée » (refus) de « il n'y avait pas de base » (avertissement) en
 * cherchant cette chaîne. Reformuler un message casserait ce couplage sans
 * bruit ; le test l'interdit.
 */

const RACINE = join(__dirname, '..');

/** Tous les fichiers de test qui portent un `describe.runIf(PG_LIVE)`. */
function gardesVivants(dir: string): string[] {
  const trouves: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, e.name);
    if (e.isDirectory()) trouves.push(...gardesVivants(chemin));
    else if (e.name.endsWith('.spec.ts') && chemin !== __filename) {
      // ⚠ `chemin !== __filename` N'EST PAS UNE COQUETTERIE. Sans lui, ce
      // fichier se trouve LUI-MÊME : il contient la chaîne qu'il cherche, pour
      // pouvoir la chercher. L'instrument comptait quatre gardes vivants et
      // s'accusait de sortir en silence. C'est la forme la plus commune du
      // relevé qui reproduit ce qu'il traque — et elle s'est manifestée à la
      // PREMIÈRE exécution, parce que le témoin compte au lieu de constater.
      const source = readFileSync(chemin, 'utf8');
      if (source.includes("process.env.PG_LIVE === '1'")) trouves.push(chemin);
    }
  }
  return trouves;
}

/** Tous les fichiers de test, pour la réciproque. */
function tousLesTests(dir: string): string[] {
  const trouves: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, e.name);
    if (e.isDirectory()) trouves.push(...tousLesTests(chemin));
    else if (e.name.endsWith('.spec.ts') && chemin !== __filename) trouves.push(chemin);
  }
  return trouves;
}

const VIVANTS = gardesVivants(RACINE);

describe('⚠ Les gardes vivants, et ce qu’ils promettent', () => {
  it('⚠ TÉMOIN QUI COMPTE : il y en a exactement ONZE', () => {
    // « Au moins un » confirmerait que le relevé tourne. Seul un compte exact
    // signale le suivant, écrit demain par quelqu'un qui n'aura pas lu ceci
    // — et qui pourrait le rendre vert sur une base absente.
    //
    // ⚠ PUIS À DIX le 6 octobre 2026 : la trace d'usage nominative
    // (`stats/usage-nominatif-en-base.spec.ts`). Le compte a fait son office —
    // il a obligé à revenir vérifier les deux promesses de ce fichier, et le
    // garde neuf ne les tenait PAS : il employait `describe.runIf` sans
    // assertion de joignabilité, donc il serait sorti VERT sur une base absente.
    // Six assertions `MESSAGE_BASE_INJOIGNABLE` ont été ajoutées.
    //
    // ⚠ PUIS À NEUF le 26 septembre 2026 : l'unicité du nom de collection entre
    // FRÈRES. Elle n'est pas dans `schema.prisma` — Prisma 5.22 n'exprime ni
    // `NULLS NOT DISTINCT` ni les index partiels — donc `db push` ne la crée pas,
    // et dev pourrait ne pas la porter quand la production la porte. Le compte a
    // fait son office : il a obligé à revenir vérifier que ce garde est ROUGE
    // base absente, et non vert sur rien.
    //
    // ⚠ PASSÉ DE TROIS À QUATRE le 12 septembre 2026, puis à SIX le 14 —
    // l'isolement entre écoles et la déprovision. Le compte a fait son office
    // les deux fois : il a fallu revenir ici et vérifier que les gardes neufs
    // respectent les deux promesses de ce fichier — nom en `-en-base`, et
    // ROUGE quand la base ne répond pas plutôt que vert sur rien.
    expect(VIVANTS.map((f) => f.replace(RACINE + '/', '')).sort()).toEqual([
      'admin/deprovision-en-base.spec.ts',
      'cataloging/fonds-conforme-en-base.spec.ts',
      'cataloging/formes-decomposees-en-base.spec.ts',
      'cataloging/vocabulaire-des-types-en-base.spec.ts',
      'collections/hierarchie-en-base.spec.ts',
      'collections/nom-de-collection-en-base.spec.ts',
      // ⭐ ONZIÈME, le 9 octobre 2026 : le compte filtré par le moteur,
      // confronté au compte en base. Le compte a fait son office — il a obligé
      // à le classer PAR_ECOLE, à déclarer sa discipline de recette, et il a
      // REFUSÉ ma première rédaction qui citait la forme interdite dans un
      // commentaire.
      'opac/compte-filtre-exact-en-base.spec.ts',
      'roles/roles-systeme-en-base.spec.ts',
      'stats/usage-nominatif-en-base.spec.ts',
      'tenancy/derive-des-schemas-en-base.spec.ts',
      'tenancy/isolement-des-ecoles-en-base.spec.ts',
    ]);
  });

  it('⚠ LA CONVENTION DE NOM : tout garde vivant s’appelle `*-en-base.spec.ts`', () => {
    // ⚠ C'EST CE QUI LES REND RAMASSABLES. Le script `npm run test:base` et le
    // crochet de pré-publication les sélectionnent par ce motif — une
    // convention que le NOM porte ne peut pas se périmer comme une liste tenue
    // à la main, et c'est la faute qu'on a payée ailleurs sur les listes
    // d'exceptions.
    //
    // Le versant pur d'un garde vit alors dans un fichier à part : c'est ce qui
    // est arrivé au vocabulaire des types, coupé en deux le 12 septembre 2026.
    for (const f of VIVANTS) {
      expect(f, `${f} : un garde vivant doit finir par -en-base.spec.ts`).toMatch(
        /-en-base\.spec\.ts$/,
      );
    }
  });

  it('⚠ et RIEN d’autre ne porte ce nom — sinon le ramassage serait plus large qu’annoncé', () => {
    // La réciproque compte autant : un fichier nommé `-en-base` sans
    // `describe.runIf` serait lancé par `test:base` dans un contexte où il
    // n'attend rien, et le crochet le compterait comme un garde vivant.
    const nommes = tousLesTests(RACINE).filter((f) => /-en-base\.spec\.ts$/.test(f));
    expect(nommes.sort()).toEqual(VIVANTS.sort());
  });

  it('⚠ aucun ne sort en SILENCE quand la base ne répond pas', () => {
    // La forme interdite est `if (!joignable) return` : elle rend vert un test
    // qui n'a rien mesuré. La forme juste est une assertion.
    for (const f of VIVANTS) {
      const source = readFileSync(f, 'utf8');
      expect(source, f).not.toMatch(/if\s*\(\s*!\s*joignable\s*\)\s*return/);
      expect(source, f).toContain('MESSAGE_BASE_INJOIGNABLE');
    }
  });

  /**
   * ⚠ LE SECOND INVENTAIRE : par-école, ou globale AVEC SON MOTIF.
   *
   * *Posé le 8 octobre 2026, après qu'un garde vivant a mesuré UNE école
   * pendant deux jours en rendant vert sur l'autre.*
   *
   * Le garde fautif portait `const SLUG = 'zinda'`. Il mesurait donc le fonds
   * de 480 notices et ignorait celui de 8 000 : une violation semée sur
   * `horizon` seul ne le faisait pas tomber — et son vert était HONNÊTE, il
   * avait mesuré ce qu'il déclarait. C'est « un garde qui NE LIT PAS ce qu'il
   * déclare » dans sa forme la moins visible, parce qu'il ne déclarait rien.
   *
   * ⚠ ET CE N'EST PAS UN BALAYAGE. On ne cherche pas un motif fautif (`const
   * SLUG =`, `tenant_zinda`, …) : un motif ne voit que la forme qu'on a
   * imaginée, et la onzième façon d'écrire « une seule école » lui échapperait.
   * Chaque garde est CLASSÉ, et un garde neuf n'est dans aucune des deux
   * listes — le test échoue alors en disant les DEUX issues.
   *
   * ⚠ La borne, écrite plutôt que découverte : ce test ne peut pas vérifier
   * qu'un garde classé `par-ecole` parcourt VRAIMENT ses écoles. Il vérifie
   * qu'il appelle la découverte partagée et qu'il NOMME ce qu'il a mesuré —
   * c'est-à-dire que sa sortie est confrontable. Mesurer l'effet demanderait de
   * suivre le flot d'appel, donc de réécrire un compilateur dans un test ; la
   * sortie nommée est la contrepartie, et elle est lisible par un humain.
   */
  const PAR_ECOLE: Record<string, string> = {
    'fonds-conforme-en-base.spec.ts': 'le tamis relit le fonds de chaque école',
    'formes-decomposees-en-base.spec.ts': 'les colonnes qui décident, école par école',
    'vocabulaire-des-types-en-base.spec.ts': 'le vocabulaire tel que chaque base le porte',
    'roles-systeme-en-base.spec.ts': 'la dérive des rôles, école par école',
    'usage-nominatif-en-base.spec.ts': 'le compteur, le seuil et la purge, école par école',
    'compte-filtre-exact-en-base.spec.ts':
      'il confronte le compte du MOTEUR au compte de la BASE, école par école — ' +
      'c’est le garde d’EFFET qui voit l’index dériver, quel qu’en soit l’auteur',
    'isolement-des-ecoles-en-base.spec.ts':
      'il COMPARE deux écoles — la propriété n’existe qu’à plusieurs',
    'derive-des-schemas-en-base.spec.ts': 'il confronte chaque schéma d’école au gabarit',
  };

  /**
   * Gardes dont la propriété ne vit PAS dans un schéma d'école. Les lister
   * n'est pas une dispense : c'est dire pourquoi la question ne se pose pas.
   */
  /**
   * ⚠ TROISIÈME ESPÈCE, et c'est MON INVENTAIRE qui a dû l'apprendre : il a
   * ACCUSÉ `deprovision-en-base` d'ignorer les écoles, alors que ce garde n'en
   * parcourt aucune — il en PROVISIONNE une jetable par les routes du produit,
   * puis la déprovisionne, et confronte le recensement des schémas.
   *
   * Lui demander de dériver la population existante serait faux : la propriété
   * qu'il éprouve est « ce que la déprovision LAISSE », et elle n'existe que
   * sur une école dont on connaît l'état de départ.
   *
   * ⚠ Un détecteur qui signale du code correct se fait désactiver — par une
   * exception, par un « faux positif connu », ou simplement en cessant d'être
   * lu. L'espèce est donc NOMMÉE, pas tolérée.
   */
  const ECOLE_JETABLE: Record<string, string> = {
    'deprovision-en-base.spec.ts':
      'il provisionne une école JETABLE par les routes du produit, puis la ' +
      'déprovisionne — sa population est celle qu’il a créée',
  };

  const GLOBALES: Record<string, string> = {
    'hierarchie-en-base.spec.ts':
      'le trigger de hiérarchie vit dans `public` — il n’y en a qu’un, pas un par école',
    'nom-de-collection-en-base.spec.ts':
      'l’index unique porte sur `public.collections` — les collections sont PARTAGÉES',
  };

  it('⚠ CHAQUE garde vivant est PAR-ÉCOLE ou GLOBAL — un garde neuf fait tomber ce test', () => {
    const noms = VIVANTS.map((f) => basename(f)).sort();
    expect(
      noms,
      'Un garde vivant n’est ni PAR_ECOLE ni GLOBALE. Deux issues, et il faut ' +
        'choisir :\n' +
        '  (a) il interroge les tables d’une ÉCOLE → classez-le dans PAR_ECOLE, ' +
        'dérivez sa population avec `ecolesPortant()` et NOMMEZ-la avec ' +
        '`ecolesMesurees()` ;\n' +
        '  (b) il PROVISIONNE son école par les routes du produit → ' +
        'ECOLE_JETABLE ;\n' +
        '  (c) sa propriété vit dans `public` (trigger, index, fonction) → ' +
        'classez-le dans GLOBALES avec le motif qui dit pourquoi la question ne ' +
        'se pose pas.\n' +
        '⚠ Ne le classez pas en GLOBALE pour vous débloquer : un garde mono-école ' +
        'rend VERT sur une violation semée ailleurs, et son vert est honnête.',
    ).toEqual(
      [
        ...Object.keys(PAR_ECOLE),
        ...Object.keys(ECOLE_JETABLE),
        ...Object.keys(GLOBALES),
      ].sort(),
    );
  });

  it('🔴 un garde PAR-ÉCOLE dérive sa population ET la NOMME dans sa sortie', () => {
    const fautifs: string[] = [];
    let examines = 0;
    for (const f of VIVANTS) {
      const nom = basename(f);
      const parEcole = nom in PAR_ECOLE;
      // Le nommage vaut pour les deux espèces qui touchent une école ; la
      // DÉRIVATION ne vaut que pour celle qui parcourt les écoles existantes.
      if (!parEcole && !(nom in ECOLE_JETABLE)) continue;
      examines++;
      const source = readFileSync(f, 'utf8');
      // La découverte : partagée (`ecolesPortant`) ou propre au garde, mais
      // JAMAIS une liste écrite. Les deux formes légitimes déjà en usage
      // interrogent `information_schema` ou la table `tenants`.
      const derive =
        !parEcole ||
        /ecolesPortant\s*\(/.test(source) ||
        /information_schema\.(tables|schemata)/.test(source) ||
        /pg_namespace/.test(source) ||
        /tenant\.findMany|tenants\b/.test(source);
      if (!derive) {
        fautifs.push(`${nom} : population NON dérivée — d’où vient sa liste d’écoles ?`);
      }
      // Et le nommage : la sortie doit permettre de vérifier CE QU'IL A VU.
      if (!/ecolesMesurees\s*\(|écoles mesurées/.test(source)) {
        fautifs.push(
          `${nom} : ne NOMME pas les écoles mesurées — employez ecolesMesurees(), ` +
            'sinon son lecteur suppose qu’il les a toutes vues',
        );
      }
    }
    // ⚠ TÉMOIN QUI COMPTE, et qui ÉNUMÈRE : un compte global prouverait que
    // l'instrument tourne, jamais qu'il tourne sur CHAQUE garde déclaré.
    expect(
      examines,
      'chaque garde déclaré PAR_ECOLE ou ECOLE_JETABLE doit avoir été LU',
    ).toBe(Object.keys(PAR_ECOLE).length + Object.keys(ECOLE_JETABLE).length);
    expect(fautifs, fautifs.join('\n')).toEqual([]);
  });

  it('⚠ et ils emploient la CONSTANTE, que le crochet de pré-publication lit', () => {
    // Le couplage est réel : un script shell cherche cette chaîne pour
    // distinguer « propriété violée » de « pas de base ». Le déclarer une fois
    // et le vérifier ici est ce qui l'empêche de rompre en silence.
    for (const f of VIVANTS) {
      expect(readFileSync(f, 'utf8'), f).not.toContain(`'${MESSAGE_BASE_INJOIGNABLE}'`);
    }
    expect(MESSAGE_BASE_INJOIGNABLE).toMatch(/injoignable/);
  });
});
