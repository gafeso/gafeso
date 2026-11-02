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

  /**
   * 🔴 CE QUE L'ÉTIQUETTE GRAVE AUJOURD'HUI — et qui n'était reconnu par RIEN.
   *
   * *Mesuré le 2 novembre 2026, après que le front a basculé la gravure.*
   *
   * L'étiquette porte `/p/OAI:<SLUG>:<UUID>` : chemin COURT et CAPITALES, pour
   * que le QR tienne dans une version plus basse (le mode alphanumérique d'un
   * QR ne connaît que les majuscules, donc des modules plus gros dans le même
   * carré). Les deux écarts se cumulaient avec ce reconnaisseur, qui ne
   * connaissait que `/opac/resoudre/` en minuscules : un scan de planche
   * fraîchement imprimée rendait « ce n'est pas un QR Gafeso ».
   *
   * ⚠ TROISIÈME OCCURRENCE de la même cause en un jour — le front l'a eue sur
   * son préfixe public et sur son routeur, moi sur `analyserIdentifiant` puis
   * ici sur le CHEMIN. Une comparaison sensible à la casse sur une valeur qu'un
   * QR écrit en capitales.
   */
  it('⭐ la forme GRAVÉE `/p/<identifiant>` est reconnue, minuscules ET capitales', () => {
    const idt = construireIdentifiant(SLUG, ID);
    for (const u of [
      `https://bib.uo.bf/p/${idt}`,
      `https://bib.uo.bf/p/${idt.toUpperCase()}`,
      `https://BIB.UO.BF/P/${idt.toUpperCase()}`,
      `https://bib.uo.bf/p/${idt}/`,
    ]) {
      expect(reconnaitreAdresse(u, HOTES, SLUG), u).toEqual({ reconnue: true, recordId: ID });
    }
  });

  it('⭐ et la forme LONGUE reste reconnue en capitales (affiches, entrepôts OAI)', () => {
    const idt = construireIdentifiant(SLUG, ID).toUpperCase();
    expect(reconnaitreAdresse(`https://bib.uo.bf/OPAC/RESOUDRE/${idt}`, HOTES, SLUG)).toEqual({
      reconnue: true,
      recordId: ID,
    });
  });

  it('⭐ `/p/` d’une AUTRE école est refusée, son slug RAPPORTÉ — même en capitales', () => {
    const idt = construireIdentifiant('autre-ecole', ID).toUpperCase();
    expect(reconnaitreAdresse(`https://bib.uo.bf/P/${idt}`, HOTES, SLUG)).toEqual({
      reconnue: false,
      motif: 'autre-etablissement',
      slugEtranger: 'autre-ecole',
    });
  });

  it('⚠ TÉMOIN D’ABSENCE : `/p/` ne rend pas tout lisible pour autant', () => {
    // La tolérance de casse et le chemin court ne doivent pas ouvrir la porte à
    // n'importe quoi : ce sont deux formes NOMMÉES, pas un assouplissement.
    for (const u of [
      'https://bib.uo.bf/p/',
      'https://bib.uo.bf/p/pas-un-identifiant',
      `https://bib.uo.bf/pp/${construireIdentifiant(SLUG, ID)}`,
      `https://bib.uo.bf/p/${construireIdentifiant(SLUG, ID)}/lire`,
    ]) {
      expect(reconnaitreAdresse(u, HOTES, SLUG), u).toEqual({
        reconnue: false,
        motif: 'illisible',
      });
    }
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
