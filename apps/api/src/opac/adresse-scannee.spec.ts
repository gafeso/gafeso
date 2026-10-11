/**
 * 🔴 RECONNAÎTRE UNE ADRESSE SCANNÉE — et refuser celle d'une AUTRE école.
 *
 * Le QR d'une étiquette porte une URL. L'application mobile, elle, veut la
 * notice. Entre les deux il y a un refus qui ne peut PAS être rendu par le
 * client : **une adresse d'un autre établissement se reconnaît à son HÔTE**, et
 * seul le serveur sait quels domaines sont les siens.
 *
 * ⚠ Sans ce refus, l'application découperait l'URL elle-même, appellerait sa
 * propre école, ne trouverait rien, et dirait « notice introuvable » — alors
 * que le livre existe, ailleurs. Le lecteur chercherait un défaut dans son
 * téléphone.
 */
import { describe, expect, it } from 'vitest';
import { reconnaitreAdresse } from './identifiant-perenne';

const HOTES = ['bib.uo.bf', 'catalogue.uo.bf'];
const ID = '9de9b299-cde5-4acc-9e76-0e800ad94281';

describe('🔴 Une adresse scannée', () => {
  it('⭐ une adresse de CETTE école est reconnue, http comme https', () => {
    for (const u of [
      `https://bib.uo.bf/opac/${ID}`,
      `http://catalogue.uo.bf/opac/${ID}`,
      `https://BIB.UO.BF/opac/${ID}`,
      // ⚠ Le PORT ne distingue pas deux établissements : en développement
      // l'application est sur 3000 et l'API sur 4000, et une étiquette
      // imprimée depuis l'une se scanne depuis l'autre.
      `http://bib.uo.bf:3000/opac/${ID}`,
      `https://bib.uo.bf/opac/${ID}/`,
    ]) {
      expect(reconnaitreAdresse(u, HOTES), u).toEqual({ reconnue: true, recordId: ID });
    }
  });

  it('🔴 une adresse d’une AUTRE école est refusée, et son hôte est NOMMÉ', () => {
    const r = reconnaitreAdresse(`https://bib.autre-univ.bf/opac/${ID}`, HOTES);
    expect(r).toEqual({
      reconnue: false,
      motif: 'autre-etablissement',
      hote: 'bib.autre-univ.bf',
    });
  });

  it('🔴 TÉMOIN D’ABSENCE : un hôte qui RESSEMBLE n’est pas le nôtre', () => {
    // C'est la confusion plausible, et c'est la forme exacte d'un hameçonnage :
    // une comparaison par `endsWith` prendrait ces trois-là pour les nôtres.
    for (const hote of [
      'bib.uo.bf.exemple.org',
      'notbib.uo.bf',
      'bib.uo.bf.evil.tk',
    ]) {
      const r = reconnaitreAdresse(`https://${hote}/opac/${ID}`, HOTES);
      expect(r, hote).toEqual({ reconnue: false, motif: 'autre-etablissement', hote });
    }
  });

  it('⚠ ce qui n’est PAS une fiche de notice est ILLISIBLE, pas « d’ailleurs »', () => {
    // ⚠ La distinction compte : dire « autre établissement » sur une adresse
    // quelconque enverrait quelqu'un changer d'école pour rien.
    for (const u of [
      'https://bib.uo.bf/',
      'https://bib.uo.bf/opac',
      'https://bib.uo.bf/admin/catalogue',
      `https://bib.uo.bf/opac/${ID}/lire`,
      'pas une url',
      '',
      `javascript:alert(1)//opac/${ID}`,
      `ftp://bib.uo.bf/opac/${ID}`,
    ]) {
      expect(reconnaitreAdresse(u, HOTES), u).toEqual({
        reconnue: false,
        motif: 'illisible',
      });
    }
  });

  it('⚠ une école SANS domaine déclaré ne refuse pas tout', () => {
    // Refuser toutes les adresses sur une instance mono-établissement fermerait
    // la fonction au lieu de la protéger.
    expect(reconnaitreAdresse(`https://n-importe.ou/opac/${ID}`, [])).toEqual({
      reconnue: true,
      recordId: ID,
    });
  });
});
