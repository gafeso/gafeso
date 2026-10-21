/**
 * 🔴 RECONNAÎTRE UNE ADRESSE SCANNÉE — et refuser celle d'une AUTRE école.
 *
 * Le QR d'une étiquette porte une URL. L'application mobile, elle, veut la
 * notice. Entre les deux il y a un refus qui ne peut PAS être rendu par le
 * client : **une adresse d'un autre établissement se reconnaît à son HÔTE**
 * (forme courte) **ou à son SLUG** (forme pérenne), et seul le serveur sait
 * quels domaines/slugs sont les siens.
 *
 * ⚠ Sans ce refus, l'application découperait l'URL elle-même, appellerait sa
 * propre école, ne trouverait rien, et dirait « notice introuvable » — alors
 * que le livre existe, ailleurs. Le lecteur chercherait un défaut dans son
 * téléphone.
 *
 * ⚠ CORRIGÉ le 20 octobre 2026, mesuré par le mobile contre le serveur réel :
 * la forme PÉRENNE (`/opac/resoudre/<identifiant>`) rendait « illisible » —
 * notre propre application refusait nos propres QR, affiches et pages de
 * titre de PDF, qui portent tous `publicUrl`. Ce fichier éprouve désormais
 * les DEUX formes.
 */
import { describe, expect, it } from 'vitest';
import { construireIdentifiant, reconnaitreAdresse } from './identifiant-perenne';

const HOTES = ['bib.uo.bf', 'catalogue.uo.bf'];
const ID = '9de9b299-cde5-4acc-9e76-0e800ad94281';
const SLUG = 'uo';

describe('🔴 Une adresse scannée — forme COURTE (/opac/<id>)', () => {
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
      expect(reconnaitreAdresse(u, HOTES, SLUG), u).toEqual({ reconnue: true, recordId: ID });
    }
  });

  it('🔴 une adresse d’une AUTRE école est refusée, et son hôte est NOMMÉ', () => {
    const r = reconnaitreAdresse(`https://bib.autre-univ.bf/opac/${ID}`, HOTES, SLUG);
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
      const r = reconnaitreAdresse(`https://${hote}/opac/${ID}`, HOTES, SLUG);
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
      expect(reconnaitreAdresse(u, HOTES, SLUG), u).toEqual({
        reconnue: false,
        motif: 'illisible',
      });
    }
  });

  it('⚠ une école SANS domaine déclaré ne refuse pas tout', () => {
    // Refuser toutes les adresses sur une instance mono-établissement fermerait
    // la fonction au lieu de la protéger.
    expect(reconnaitreAdresse(`https://n-importe.ou/opac/${ID}`, [], SLUG)).toEqual({
      reconnue: true,
      recordId: ID,
    });
  });
});

describe('⭐ Une adresse scannée — forme PÉRENNE (/opac/resoudre/<identifiant>)', () => {
  it('⭐ une adresse de CETTE école est reconnue, quel que soit l’hôte qui la sert', () => {
    const identifiant = construireIdentifiant(SLUG, ID);
    for (const u of [
      `https://bib.uo.bf/opac/resoudre/${encodeURIComponent(identifiant)}`,
      // ⚠ L'hôte importe ici PEU : l'autorité est le slug dans l'identifiant,
      // pas le domaine qui a servi l'adresse (celui d'un entrepôt OAI, par
      // exemple — voir identifiant-perenne.ts, localisationOai).
      `https://api.autre-domaine.exemple/opac/resoudre/${encodeURIComponent(identifiant)}`,
      `https://bib.uo.bf/opac/resoudre/${encodeURIComponent(identifiant)}/`,
    ]) {
      expect(reconnaitreAdresse(u, HOTES, SLUG), u).toEqual({ reconnue: true, recordId: ID });
    }
  });

  it('🔴 une adresse pérenne d’une AUTRE école est refusée, son slug est RAPPORTÉ', () => {
    const identifiant = construireIdentifiant('autre-ecole', ID);
    const r = reconnaitreAdresse(
      `https://bib.uo.bf/opac/resoudre/${encodeURIComponent(identifiant)}`,
      HOTES,
      SLUG,
    );
    expect(r).toEqual({
      reconnue: false,
      motif: 'autre-etablissement',
      slugEtranger: 'autre-ecole',
    });
  });

  it('⚠ un identifiant de forme étrangère (pas oai:<slug>:<id>) est ILLISIBLE', () => {
    for (const identifiant of [
      'pas-un-identifiant',
      'oai:seul-un-segment',
      'oai::vide',
      'autre-schema:uo:' + ID,
    ]) {
      const r = reconnaitreAdresse(
        `https://bib.uo.bf/opac/resoudre/${encodeURIComponent(identifiant)}`,
        HOTES,
        SLUG,
      );
      expect(r, identifiant).toEqual({ reconnue: false, motif: 'illisible' });
    }
  });
});
