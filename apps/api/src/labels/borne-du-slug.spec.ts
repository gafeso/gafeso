import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as QRCode from 'qrcode';
import {
  LONGUEUR_SLUG_MAX_SCHEMA,
  SLUG_PATTERN,
  isValidSlug,
} from '../tenancy/tenant-schema';
import {
  VERSION_MAX_ETIQUETTE,
  adresseGraveeSurEtiquette,
} from '../opac/identifiant-perenne';
import {
  NIVEAU_CORRECTION_ETIQUETTE,
  capaciteAlphanumEtiquette,
  longueurSlugMaxPourEtiquette,
} from './capacite-qr-etiquette';

/**
 * 🔴 LA BORNE DU SLUG — due depuis quatre lots, et elle n'est pas un nombre choisi.
 *
 * *Posée le 3 novembre 2026.*
 *
 * ## Ce qui borne vraiment un slug
 *
 * Deux contraintes, de natures différentes, et les confondre menait à se croire
 * protégé par la mauvaise :
 *
 * | | source | valeur |
 * |---|---|---|
 * | identifiant PostgreSQL | `tenant_` + slug ≤ 63 octets | 56, borné à 49 par le motif |
 * | **QR d'étiquette** | capacité en version `VERSION_MAX_ETIQUETTE` | **32 pour une origine de 17** |
 *
 * C'est la SECONDE qui mord, et elle n'était nulle part. Un slug de 40
 * caractères passait toutes les validations, provisionnait une école, et
 * produisait des planches dont le QR — plus dense dans le même carré —
 * descendait sous `LARGEUR_MODULE_MIN_MM`. **Aucun code n'échouait.** Le défaut
 * ne se voyait qu'avec une planche imprimée sous les yeux, et à ce moment le
 * slug est déjà gravé dans chaque identifiant pérenne de l'école.
 *
 * ## ⭐ POURQUOI LA CAPACITÉ EST MESURÉE ET NON LUE
 *
 * Recopier « version 7, niveau H, alphanumérique → N caractères » d'une table de
 * la norme ferait une seconde source, qui se tromperait le jour où
 * `errorCorrectionLevel` change dans `label-pdf.ts`. On interroge l'encodeur.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const UUID = '9de9b299-cde5-4acc-9e76-0e800ad94281';

describe('⚠ TÉMOINS DE LECTURE — les sources sont lues, et cohérentes', () => {
  it('⭐ la capacité est un nombre plausible, mesuré, non nul', () => {
    const c = capaciteAlphanumEtiquette();
    expect(c, 'une capacité nulle rendrait toute borne absurde').toBeGreaterThan(20);
    expect(c, 'une capacité énorme signifierait que la sonde ne mesure rien').toBeLessThan(500);
  });

  it('⭐ et elle correspond VRAIMENT à la version maximale — vérifié aux deux bords', () => {
    // ⚠ LE CŒUR DE LA MESURE : à la capacité, le QR tient ; un caractère de
    // plus, il n'y tient plus. Un garde qui ne vérifierait qu'un seul bord
    // serait satisfait par n'importe quelle valeur plus petite.
    const c = capaciteAlphanumEtiquette();
    const version = (n: number) =>
      QRCode.create('A'.repeat(n), { errorCorrectionLevel: NIVEAU_CORRECTION_ETIQUETTE }).version;
    expect(version(c), `à ${c} caractères le QR doit tenir`).toBeLessThanOrEqual(
      VERSION_MAX_ETIQUETTE,
    );
    expect(version(c + 1), `à ${c + 1} il ne doit PLUS tenir`).toBeGreaterThan(
      VERSION_MAX_ETIQUETTE,
    );
  });

  it('🔴 le niveau de correction suit celui de label-pdf.ts — sinon la mesure est fausse', () => {
    // ⚠ Deux sources pour un même réglage : on ne peut pas importer l'option
    // depuis `label-pdf.ts` (elle est enfouie dans un appel), alors on la LIT.
    // C'est une divergence DÉCLARÉE et gardée, pas tue.
    const pdf = readFileSync(join(__dirname, 'label-pdf.ts'), 'utf-8');
    const ligne = pdf.split('\n').find((l) => l.includes('errorCorrectionLevel'));
    expect(ligne, 'errorCorrectionLevel introuvable dans label-pdf.ts').toBeTruthy();
    expect(
      ligne,
      `label-pdf.ts n'emploie plus « ${NIVEAU_CORRECTION_ETIQUETTE} » : la capacité mesurée ne décrit plus le QR imprimé`,
    ).toContain(`'${NIVEAU_CORRECTION_ETIQUETTE}'`);
  });
});

describe('🔴 LA BORNE SE DÉRIVE DE L’ORIGINE SERVIE, pas d’une valeur de référence', () => {
  it('⭐ une origine plus longue laisse MOINS de place au slug, caractère pour caractère', () => {
    const court = longueurSlugMaxPourEtiquette('https://a.bf', null);
    const long = longueurSlugMaxPourEtiquette('https://bib.uo.bf', null);
    expect(court).not.toBeNull();
    expect(long).not.toBeNull();
    // 'https://bib.uo.bf' fait 5 caractères de plus que 'https://a.bf'.
    expect(court! - long!).toBe('https://bib.uo.bf'.length - 'https://a.bf'.length);
  });

  it('⭐⭐ PAR L’EFFET : un slug À la borne tient, un caractère de plus NE TIENT PAS', () => {
    // ⚠ C'est le seul cas qui prouve que la borne est la bonne. Les autres
    // vérifient de l'arithmétique ; celui-ci interroge l'encodeur sur l'adresse
    // RÉELLEMENT gravée, construite par le producteur réel.
    const appUrl = 'https://bib.uo.bf';
    const borne = longueurSlugMaxPourEtiquette(appUrl, null)!;
    const versionPour = (n: number) => {
      const slug = 'a' + 'b'.repeat(n - 1);
      const adresse = adresseGraveeSurEtiquette(appUrl, null, UUID, slug)!;
      expect(adresse, 'adresse gravée nulle : la sonde ne mesure rien').toBeTruthy();
      return QRCode.create(adresse, { errorCorrectionLevel: NIVEAU_CORRECTION_ETIQUETTE }).version;
    };
    expect(versionPour(borne), `slug de ${borne} doit tenir`).toBeLessThanOrEqual(
      VERSION_MAX_ETIQUETTE,
    );
    expect(versionPour(borne + 1), `slug de ${borne + 1} ne doit PAS tenir`).toBeGreaterThan(
      VERSION_MAX_ETIQUETTE,
    );
  });

  it('⚠ sans APP_URL la borne est `null`, et ce n’est pas zéro', () => {
    // Pas d'adresse publique → aucune étiquette à imprimer → aucune borne à
    // faire respecter. Rendre 0 refuserait tous les slugs pour une raison
    // inexistante ; rendre un nombre arbitraire serait pire.
    expect(longueurSlugMaxPourEtiquette('', null)).toBeNull();
    expect(longueurSlugMaxPourEtiquette('   ', null)).toBeNull();
  });

  it('🔴 TÉMOIN D’ABSENCE — une origine très longue ne laisse presque RIEN, et on le dit', () => {
    // Ce n'est pas un défaut à cacher : sur un domaine de 46 caractères, il
    // reste trois caractères de slug. L'exploitant doit l'apprendre au
    // provisionnement, pas à l'impression.
    const b = longueurSlugMaxPourEtiquette('https://bibliotheque.universite-exemple.edu.bf', null);
    expect(b).not.toBeNull();
    expect(b!).toBeLessThan(5);
  });
});

describe('🔴 LA DOCUMENTATION PUBLIE DES VALEURS — elles sont CONFRONTÉES', () => {
  /**
   * ⚠ `docs/INSTALLATION.md` §1.3 porte un tableau « votre domaine → caractères
   * disponibles », pour qu'un intégrateur le lise AVANT de choisir son domaine.
   * C'est le bon endroit, et c'est aussi un document qui publie des VALEURS.
   *
   * « Un attendu nomme sa source, jamais une valeur » (CLAUDE.md §4) : une
   * table lue par des humains ne peut pas nommer sa source, donc elle est
   * CONFRONTÉE ici. Le jour où `VERSION_MAX_ETIQUETTE` ou le niveau de
   * correction bouge, ce cas tombe et la doc est corrigée avec le code — au
   * lieu de mentir pendant des mois à chaque nouvel intégrateur.
   */
  it('⭐ chaque ligne du tableau de la doc est CELLE que le code dérive', () => {
    const doc = readFileSync(join(RACINE, 'docs/INSTALLATION.md'), 'utf-8');
    // Population DÉRIVÉE du document : on ne redit pas les lignes ici, on les
    // LIT. Une ligne ajoutée demain entre d'elle-même dans l'épreuve.
    const lignes = [
      ...doc.matchAll(/^\|\s*`(https:\/\/[^`]+)`\s*\(\d+[^)]*\)\s*\|\s*\*{0,2}(\d+)\*{0,2}\s*\|/gm),
    ];
    expect(
      lignes.length,
      'aucune ligne « domaine → caractères » trouvée dans INSTALLATION.md : ' +
        'le relevé ne lit pas le tableau, ou le tableau a disparu',
    ).toBeGreaterThanOrEqual(3);
    for (const [, origine, annonce] of lignes) {
      const derive = longueurSlugMaxPourEtiquette(origine, null);
      expect(
        derive,
        `INSTALLATION.md annonce ${annonce} pour ${origine}, le code dérive ${derive}`,
      ).toBe(Number(annonce));
    }
  });

  it('⚠ et la longueur annoncée du domaine est la VRAIE — sinon la règle ne se vérifie pas', () => {
    // Le tableau écrit « (18 caractères) » : un lecteur s'en sert pour estimer
    // son propre domaine. Faux, il rend la règle inutilisable.
    const doc = readFileSync(join(RACINE, 'docs/INSTALLATION.md'), 'utf-8');
    for (const [, origine, longueur] of doc.matchAll(
      /^\|\s*`(https:\/\/[^`]+)`\s*\((\d+)[^)]*\)/gm,
    )) {
      expect(origine.length, `longueur annoncée fausse pour ${origine}`).toBe(Number(longueur));
    }
  });
});

describe('⭐ UNE SEULE SOURCE POUR LE MOTIF DU SLUG — trois copies devenues une', () => {
  /**
   * *Le 3 novembre 2026, le motif `/^[a-z][a-z0-9-]{1,48}$/` existait en TROIS
   * exemplaires identiques : `tenant-schema.ts`, `provision-tenant.dto.ts` et
   * `terminer-installation.dto.ts`.* La troisième n'a été trouvée qu'en
   * balayant APRÈS avoir corrigé les deux connues.
   *
   * ⚠ Le relevé DÉPOUILLE les commentaires : les trois fichiers citent
   * désormais l'ancien motif dans leur prose pour expliquer le regroupement, et
   * un garde textuel satisfait par de la prose ne mesure rien (mesuré hier, sur
   * un autre garde, par le frontend).
   */
  const sansCommentaires = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, ' ');

  it('🔴 aucun fichier ne REDÉCLARE le motif — il est importé', () => {
    const fichiers = [
      'apps/api/src/admin/dto/provision-tenant.dto.ts',
      'apps/api/src/installation/dto/terminer-installation.dto.ts',
    ];
    for (const f of fichiers) {
      const code = sansCommentaires(readFileSync(join(RACINE, f), 'utf-8'));
      expect(code, `${f} doit IMPORTER SLUG_PATTERN`).toContain('SLUG_PATTERN');
      expect(
        /\[a-z0-9-\]\{1,\d+\}/.test(code),
        `${f} redéclare le motif : deux copies s’accordent jusqu’au jour où l’une bouge`,
      ).toBe(false);
    }
  });

  it('⭐ et la borne du motif est DÉRIVÉE de la limite PostgreSQL, pas écrite', () => {
    const src = readFileSync(join(RACINE, 'apps/api/src/tenancy/tenant-schema.ts'), 'utf-8');
    const ligne = src.split('\n').find((l) => l.includes('export const SLUG_PATTERN'));
    expect(ligne).toBeTruthy();
    expect(
      ligne,
      'le motif porte un nombre écrit : il doit venir de LONGUEUR_SLUG_MAX_SCHEMA',
    ).toContain('LONGUEUR_SLUG_MAX_SCHEMA');
    // Et l'effet : la borne du motif est bien celle qu'on croit.
    expect(isValidSlug('a' + 'b'.repeat(LONGUEUR_SLUG_MAX_SCHEMA - 1))).toBe(true);
    expect(isValidSlug('a' + 'b'.repeat(LONGUEUR_SLUG_MAX_SCHEMA))).toBe(false);
  });

  it('⚠ et le motif du schéma est PLUS LARGE que celui de l’étiquette — c’est voulu', () => {
    // Les deux bornes répondent à deux questions. Si l'une devenait plus
    // restrictive que l'autre sans qu'on le sache, la plus large ne garderait
    // plus rien et on croirait être protégé par elle.
    const etiquette = longueurSlugMaxPourEtiquette('https://bib.uo.bf', null)!;
    expect(etiquette).toBeLessThan(LONGUEUR_SLUG_MAX_SCHEMA);
    expect(SLUG_PATTERN.test('a'.repeat(etiquette))).toBe(true);
  });
});
