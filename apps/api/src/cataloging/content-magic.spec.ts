import { describe, expect, it } from 'vitest';
import { DigitalFormat } from '@prisma/client';
import { contentMatchesFormat } from './digital-copy.service';

/**
 * Le type MIME d'un téléversement vient de l'en-tête multipart : il se
 * DÉCLARE, il ne se prouve pas. Vérifié en audit — un fichier texte annoncé
 * `application/pdf` était accepté (HTTP 201), stocké, puis échouait
 * silencieusement à l'ingestion hors-ligne.
 */
describe('contentMatchesFormat — le contenu doit correspondre au format annoncé', () => {
  it('accepte un vrai PDF', () => {
    expect(contentMatchesFormat(Buffer.from('%PDF-1.7\n...'), DigitalFormat.PDF)).toBe(true);
  });

  it('RÉGRESSION : refuse un fichier texte annoncé PDF', () => {
    expect(
      contentMatchesFormat(Buffer.from('ceci n est pas un PDF'), DigitalFormat.PDF),
    ).toBe(false);
  });

  it('accepte une archive ZIP (conteneur d’un EPUB)', () => {
    expect(
      contentMatchesFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), DigitalFormat.EPUB),
    ).toBe(true);
  });

  it('RÉGRESSION : refuse un PDF annoncé EPUB, et l’inverse', () => {
    expect(contentMatchesFormat(Buffer.from('%PDF-1.4'), DigitalFormat.EPUB)).toBe(false);
    expect(
      contentMatchesFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04]), DigitalFormat.PDF),
    ).toBe(false);
  });

  it('refuse un fichier plus court que la signature', () => {
    expect(contentMatchesFormat(Buffer.from('%P'), DigitalFormat.PDF)).toBe(false);
    expect(contentMatchesFormat(Buffer.alloc(0), DigitalFormat.PDF)).toBe(false);
  });

  it('la signature doit être en TÊTE, pas ailleurs dans le fichier', () => {
    // Un fichier contenant « %PDF- » plus loin n'est pas un PDF valide.
    expect(contentMatchesFormat(Buffer.from('xx%PDF-1.4'), DigitalFormat.PDF)).toBe(false);
  });
});
