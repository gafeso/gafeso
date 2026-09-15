import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { MetadataExtractionService } from './metadata-extraction.service';

/**
 * ⚠ LE MÊME DÉFAUT UNICODE, PAR UNE TROISIÈME PORTE — les métadonnées
 * embarquées d'un fichier téléversé.
 *
 * *Posé le 14 septembre 2026. Le SRU l'avait par la sienne, l'import MARC par
 * la sienne ; celle-ci est la dernière des frontières relevées le 13.*
 *
 * Un OPF d'EPUB produit sous macOS porte couramment la forme DÉCOMPOSÉE : le
 * « é » y est `e` suivi de U+0301. Sans normalisation, deux notices dont les
 * titres s'affichent à l'identique sont des chaînes différentes — la recherche
 * n'en trouve qu'une, et une fiche d'autorité se dédouble sur un auteur qui
 * n'existe qu'une seule fois.
 *
 * ## ⚠ D'OÙ VIENT LE TEXTE DÉCOMPOSÉ, ET POURQUOI ÇA COMPTE
 *
 * Il est LU dans la notice réelle de la Library of Congress déjà versée au
 * dépôt (`__fixtures__/loc-notice-nfd.xml`), jamais composé ici. Une chaîne que
 * j'écris moi-même en NFD éprouve ma compréhension du défaut ; un octet venu du
 * dehors éprouve le défaut.
 *
 * Le conteneur EPUB, lui, est bâti dans le test : un zip est de la plomberie,
 * pas une donnée. Ce qui est sous mesure est le TEXTE.
 */
describe('Métadonnées embarquées : la forme décomposée n’entre pas en base', () => {
  const service = new MetadataExtractionService();

  /** Le titre décomposé, extrait de la notice LoC — références décodées. */
  const titreDecompose = (() => {
    const brut = readFileSync(join(__dirname, '__fixtures__/loc-notice-nfd.xml'), 'utf-8');
    const trouve = brut.match(/>([^<>]*&#x0?3[0-9a-fA-F]{2};[^<>]*)</);
    if (!trouve) throw new Error('la notice LoC ne porte plus de référence de caractère combinant');
    return trouve[1].replace(/&#x0?([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  })();

  it('⚠ TÉMOIN SUR LE JEU D’ESSAI : il porte encore ce qu’on éprouve', () => {
    // Sans lui, une notice LoC remplacée un jour par une version déjà composée
    // rendrait ce fichier vert sur rien — il mesurerait NFC → NFC.
    expect(
      titreDecompose === titreDecompose.normalize('NFC'),
      'le jeu d’essai n’est plus en forme décomposée : ce test ne mesure plus rien',
    ).toBe(false);
    expect(titreDecompose).toContain('́'); // l'accent aigu, séparé de sa base
  });

  function epubAvec(titre: string, auteur: string): Buffer {
    const zip = new AdmZip();
    zip.addFile(
      'META-INF/container.xml',
      Buffer.from(
        `<?xml version="1.0"?><container version="1.0" ` +
          `xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
          `<rootfiles><rootfile full-path="OEBPS/content.opf" ` +
          `media-type="application/oebps-package+xml"/></rootfiles></container>`,
        'utf-8',
      ),
    );
    zip.addFile(
      'OEBPS/content.opf',
      Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata ` +
          `xmlns:dc="http://purl.org/dc/elements/1.1/">` +
          `<dc:title>${titre}</dc:title><dc:creator>${auteur}</dc:creator>` +
          `<dc:language>fr</dc:language><dc:publisher>Éditions du Sahel</dc:publisher>` +
          `</metadata><manifest/><spine/></package>`,
        'utf-8',
      ),
    );
    return zip.toBuffer();
  }

  it('⚠ un EPUB dont l’OPF est décomposé rend un titre COMPOSÉ', async () => {
    const meta = await service.extract(epubAvec(titreDecompose, titreDecompose), 'EPUB');

    expect(meta.title, 'le titre n’a pas été extrait').toBeTruthy();
    expect(
      meta.title,
      'le titre sort tel quel : une notice décomposée entrerait en base',
    ).toBe(titreDecompose.normalize('NFC'));
    expect(meta.author).toBe(titreDecompose.normalize('NFC'));

    // ⚠ ET LA DIFFÉRENCE EST RÉELLE, pas une égalité qui se vérifie elle-même :
    // sans cette assertion, un jeu d'essai déjà composé passerait.
    expect(meta.title).not.toBe(titreDecompose);
  });

  it('⚠ les champs déjà composés traversent inchangés', async () => {
    const compose = 'L’Étranger à la mer';
    const meta = await service.extract(epubAvec(compose, 'Awa Traoré'), 'EPUB');
    expect(meta.title).toBe(compose);
    expect(meta.author).toBe('Awa Traoré');
    expect(meta.publisher).toBe('Éditions du Sahel');
  });

  it('⚠ la normalisation précède le bornage — pas de marque combinante orpheline', async () => {
    // Composer RACCOURCIT. Borner d'abord pourrait couper entre une base et sa
    // diacritique, et laisser en fin de champ une marque qui se collerait au
    // caractère précédent à l'affichage.
    // ⚠ DÉCOMPOSÉ EXPLICITEMENT, et c'est une correction : le littéral de ce
    // fichier se trouvait être décomposé, donc ce cas discriminait PAR ACCIDENT
    // D'ENCODAGE. Un éditeur qui réenregistre le fichier en forme composée
    // l'aurait rendu vert quel que soit l'ordre, sans que rien ne le signale.
    // Ici l'ordre de deux opérations est éprouvé, pas le réalisme d'une donnée :
    // composer la chaîne soi-même est donc légitime, et le témoin ci-dessous
    // vérifie qu'elle porte bien deux unités par caractère.
    const long = 'e\u0301'.repeat(400); // 800 unités ; 400 une fois composées
    expect(long.length, 'la chaîne d’essai n’est pas décomposée').toBe(800);
    const meta = await service.extract(epubAvec(long, 'x'), 'EPUB');
    expect(meta.title!.length, 'le champ a été borné AVANT d’être composé').toBe(400);
    expect(meta.title).toBe('é'.repeat(400));
    expect(meta.title!.endsWith('́'), 'une marque combinante traîne en fin de champ').toBe(false);
  });
});
