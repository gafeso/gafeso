/**
 * L'ESPACE LECTEUR NE DIT PLUS « PAS ENCORE » — et ce garde est RETOURNÉ.
 *
 * ## ⭐ CE QU'IL FAISAIT, ET POURQUOI IL CHANGE DE SENS
 *
 * Écrit le 8 octobre 2026, il gardait deux écrans qui annonçaient honnêtement
 * « l'historique de vos lectures n'est pas encore disponible » — et il ÉCHOUAIT
 * le jour où l'API exposerait la route, avec un message disant quoi construire.
 *
 * **Les routes ont été livrées le 9.** Le garde a fait son office : le texte
 * « pas encore » est devenu FAUX, et il l'a réclamé.
 *
 * > ⭐ Il ne disparaît pas pour autant : il garde désormais **l'inverse**. Ces
 * > écrans ne doivent PLUS JAMAIS dire « pas encore », et c'est une propriété
 * > qui se perd aussi facilement qu'elle s'est gagnée — un `git revert`, une
 * > reprise de libellés, un copier-coller depuis un écran voisin.
 *
 * ⚠ **Effacer le garde aurait emporté la propriété avec la dette.** C'est la
 * même décision que pour l'exception auto-effaçante de `circulation` : on retire
 * le DÉCLENCHEUR, on garde ce qu'il protégeait.
 *
 * ## ⚠ CE QUE CES ÉCRANS NE DOIVENT JAMAIS DIRE
 *
 * · **« lu »** — on observe la délivrance d'une URL, pas une lecture, et la
 *   lecture hors connexion n'est pas tracée. Le dire affirmerait un fait que le
 *   produit ne peut pas connaître, à la personne même qui saurait qu'il est faux.
 * · **« jamais rien emporté »** — la route ne sert que les baux NON EXPIRÉS :
 *   le produit ne peut pas distinguer « jamais » de « plus en cours ».
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBELLES } from '@/lib/libelles';

const C = LIBELLES.espaceLecteur.consultations;
const H = LIBELLES.espaceLecteur.horsLigne;
const ECRANS = ['mes-consultations', 'mes-documents-hors-ligne'];

/** Tous les textes de l'espace lecteur, aplatis — fonctions appelées comprises. */
function tousLesTextes(): string[] {
  const sortie: string[] = [];
  const visiter = (v: unknown) => {
    if (typeof v === 'string') sortie.push(v);
    else if (typeof v === 'function') {
      /*
       * ⚠ DEUX APPELS, ET UN `catch` — mon premier relevé passait `12` à TOUTES
       * les fonctions, et `expireLe` attend une `Date` : il levait
       * « d.toLocaleDateString is not a function » et faisait échouer deux cas
       * en accusant le produit.
       *
       * ⭐ Un relevé qui APPELLE ce qu'il inventorie doit tolérer que les
       * signatures diffèrent — sans quoi il mesure sa propre hypothèse sur
       * elles. Et le `catch` reste étroit : une fonction qu'AUCUN des deux
       * arguments ne satisfait est signalée, pas avalée.
       */
      const f = v as (x: unknown) => string;
      let rendu: string | null = null;
      for (const arg of [12, new Date('2026-11-08T00:00:00.000Z'), ['a']]) {
        try {
          rendu = String(f(arg));
          break;
        } catch {
          /* on essaie l'argument suivant */
        }
      }
      expect(rendu, 'une fonction de libellé qu’aucun argument d’essai ne satisfait').not.toBeNull();
      if (rendu !== null) sortie.push(rendu);
    }
    else if (v && typeof v === 'object') Object.values(v).forEach(visiter);
  };
  visiter(LIBELLES.espaceLecteur);
  return sortie;
}

describe('⚠ LE GARDE RETOURNÉ : plus jamais « pas encore »', () => {
  it('témoin de COMPTE : le relevé a bien vu les textes', () => {
    // Sans lui, un bloc renommé rendrait une population vide et « aucun texte ne
    // dit pas encore » passerait sur rien.
    expect(tousLesTextes().length).toBeGreaterThan(10);
  });

  it('⚠ AUCUN texte de l’espace lecteur ne dit « pas encore »', () => {
    const fautifs = tousLesTextes().filter((t) => /pas encore|bientôt|prochainement|en cours de déploiement/i.test(t));
    expect(
      fautifs,
      'Les routes /reader/consultations et /reader/hors-ligne SERVENT depuis le ' +
        '9 octobre 2026. Un texte « pas encore » y est désormais FAUX, et il envoie ' +
        'les étudiants chercher ailleurs ce que le produit peut montrer.',
    ).toEqual([]);
  });

  it('⚠ et les ÉCRANS n’en portent pas non plus, en dur', () => {
    // Le texte peut revenir par l'écran plutôt que par les libellés : on lit la
    // source, pas seulement le dictionnaire.
    for (const e of ECRANS) {
      const src = readFileSync(resolve(process.cwd(), 'app', e, 'page.tsx'), 'utf-8');
      /*
       * ⚠ HORS COMMENTAIRES — et la première écriture filtrait LES LIGNES, ce
       * qui ne suffit pas.
       *
       * Elle retirait les lignes commençant par `*`, `//` ou `/*`. Or **les
       * lignes de CONTINUATION d'un commentaire JSX ne portent aucun
       * marqueur** : `{/*` ouvre, et les lignes suivantes commencent par du
       * texte. Le 12 octobre 2026, un commentaire expliquant « `slug === null`
       * veut dire pas encore su » a donc fait accuser un écran parfaitement
       * juste.
       *
       * ⭐ C'est la forme éprouvée du dépôt (`fenetre-ouverte-au-clic.spec.ts`,
       * `accueil-sans-chiffre-fige.spec.ts`) : on retire les BLOCS, pas les
       * lignes. Troisième fois que ce piège se présente, et la troisième fois
       * c'est le garde qui l'a dit, pas une relecture.
       */
      const code = src
        .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      /*
       * ⚠ TÉMOIN SUR L'INSTRUMENT : un retrait de blocs trop gourmand mangerait
       * le fichier et rendrait ce cas vert sur rien. Mesuré ailleurs dans ce
       * dépôt — 2 262 caractères avalés par un nettoyeur non borné.
       */
      expect(
        code.length / src.length,
        `${e} : le retrait des commentaires a mangé le fichier — l’instrument ment`,
      ).toBeGreaterThan(0.25);
      expect(code, `${e} porte « pas encore » dans son code`).not.toMatch(/pas encore/i);
    }
  });

  it('⚠ JAMAIS « lu » : on observe la délivrance d’une URL, pas une lecture', () => {
    expect(C.natureConsultation).not.toMatch(/\blue?\b/i);
    expect(C.natureTelechargement).not.toMatch(/\blue?\b/i);
    expect(H.intro).not.toMatch(/\blus?\b/i);
    expect(H.titre).not.toMatch(/\blus?\b/i);
    // Et les deux natures se disent DIFFÉREMMENT : les confondre perdrait
    // l'information qui distingue une consultation d'un emport.
    expect(C.natureConsultation).not.toBe(C.natureTelechargement);
  });

  it('⚠ l’état vide du hors ligne ne prétend PAS « jamais rien emporté »', () => {
    expect(H.aucunEnCours).toMatch(/en ce moment|actuellement/i);
    expect(H.aucunEnCours).not.toMatch(/jamais/i);
    // Et il donne la RÈGLE : sans elle, l'absence se lit comme une perte.
    expect(H.aucunEnCoursMotif).toMatch(/bail|échu|expir/i);
  });

  it('⚠ la RÉTENTION est un texte à afficher, et elle explique la purge', () => {
    // ⚠ LE CHEMIN COMPLET, pas l'alias : le garde des textes qui promettent
    // cherche `LIBELLES.<bloc>.<feuille>` et ne suit qu'un alias d'UN niveau.
    // Le mien en porte deux (`C = LIBELLES.espaceLecteur.consultations`) — il
    // réclamait une assertion que j'avais écrite.
    const t = LIBELLES.espaceLecteur.consultations.retention(12);
    expect(t).toContain('12');
    expect(t).toMatch(/mois/i);
    // Elle doit dire que les données RESTENT comptées sans le nom — sinon un
    // étudiant croit que le produit a perdu son historique.
    expect(t).toMatch(/statistiques|comptées/i);
  });

  it('⚠ un `titre` nul SE DIT, il ne s’affiche pas en blanc', () => {
    for (const t of [C.noticeRetiree, H.noticeRetiree]) {
      expect(t.length).toBeGreaterThan(8);
      expect(t).toMatch(/retirée|supprimée/i);
    }
  });

  it('⚠ témoin d’ABSENCE : le relevé sait reconnaître la forme fautive', () => {
    // Sans lui, un motif qui ne matche jamais rendrait les cas ci-dessus verts
    // sur n'importe quoi.
    const ancien = 'L’historique de vos lectures en ligne n’est pas encore disponible sur cette installation.';
    expect(/pas encore/i.test(ancien)).toBe(true);
    expect(/pas encore/i.test(C.retention(12))).toBe(false);
  });
});

/**
 * ⭐⭐ LES ÉTATS VIDES NEUTRES — ce que leurs textes DOIVENT dire.
 *
 * Constaté par Jean sur rc12 : l'état vide s'affichait dans un encadré
 * rose/rouge, et se lisait comme une ERREUR. Le ton employé était `warning`,
 * dont la table rend `bg-ocre/10` — l'ocre de marque à 10 %.
 *
 * ⚠ Et `ocre` est la couleur SECONDAIRE DU TENANT : un état vide peint avec
 * elle change de couleur d'une école à l'autre.
 */
describe('⭐ les états vides : une phrase, et une SORTIE', () => {
  /**
   * ⚠ L'ASSERTION DE PROPRIÉTÉ QUE LE REGISTRE EXIGE. `sansCarte` est un
   * RECOURS : il doit NOMMER à qui s'adresser. Sans le destinataire, il reste
   * « vous ne pouvez pas emprunter » — une impasse, et c'est exactement le faux
   * que ce dépôt refuse (« un recours doit nommer à qui s'adresser »).
   */
  it('`mesPrets.sansCarte` NOMME son destinataire', () => {
    expect(LIBELLES.mesPrets.sansCarte).toMatch(/bibliothécaire|bibliothèque/i);
    expect(LIBELLES.mesPrets.sansCarte).toMatch(/adressez|demandez|contactez/i);
    /*
     * ⚠ TÉMOIN D'ABSENCE : il ne doit pas accuser le lecteur. « Vous n'avez
     * pas » décrirait une faute là où il n'y en a aucune.
     */
    expect(LIBELLES.mesPrets.sansCarte).not.toMatch(/erreur|interdit|refus/i);
  });

  it('les actions d’un état vide nomment un GESTE, pas un état', () => {
    const a = LIBELLES.etatsVides;
    expect(a.parcourirCatalogue).toMatch(/parcourir|voir|chercher/i);
    expect(a.telechargerDepuisApp).toMatch(/télécharger|installer/i);
    // ⚠ La phrase du hors-ligne dit le GESTE et l'OUTIL, pas « indisponible ».
    expect(a.emporterAvecApp).toMatch(/application Gafeso/);
    expect(a.emporterAvecApp).toMatch(/sans réseau|hors connexion|hors réseau/i);
    expect(a.emporterAvecApp).not.toMatch(/impossible|indisponible|erreur/i);
  });
});
