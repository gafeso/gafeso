import { DigitalFormat } from '@prisma/client';

/**
 * CE QU'UN FICHIER NUMÉRIQUE DOIT ÊTRE — vocabulaire unique.
 *
 * ⚠ EXTRAIT DE `digital-copy.service.ts` LE 12 SEPTEMBRE 2026, quand le circuit
 * de dépôt a eu besoin des MÊMES règles. Les recopier aurait donné deux jeux de
 * seuils et deux formulations françaises du même refus — et le jour où l'on
 * accepterait un troisième format, un seul des deux chemins l'apprendrait.
 *
 * C'est le motif déjà payé sur `recordType`, écrit à trois endroits.
 */

/** Types MIME acceptés → format interne. */
export const ACCEPTED_MIME: Record<string, DigitalFormat> = {
  'application/pdf': DigitalFormat.PDF,
  'application/epub+zip': DigitalFormat.EPUB,
};

export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 Mo

/**
 * Signature de début de fichier (« nombre magique ») attendue par format.
 *
 * Le type MIME d'un téléversement vient de l'en-tête MULTIPART, donc du client :
 * il se déclare, il ne se prouve pas. Un fichier texte annoncé
 * `application/pdf` était accepté (vérifié : HTTP 201), stocké, puis échouait
 * silencieusement à l'ingestion hors-ligne — le document n'était JAMAIS
 * disponible hors ligne et rien ne le disait.
 *
 * On vérifie donc les octets. EPUB étant un ZIP, sa signature est celle d'une
 * archive : cela n'écarte pas un ZIP qui ne serait pas un EPUB, mais élimine
 * le cas courant du fichier mal étiqueté par le poste du bibliothécaire.
 */
export const MAGIC_BYTES: Record<DigitalFormat, { bytes: Buffer; label: string }> = {
  [DigitalFormat.PDF]: { bytes: Buffer.from('%PDF-'), label: 'PDF' },
  [DigitalFormat.EPUB]: { bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]), label: 'EPUB (archive ZIP)' },
};

/** Le contenu correspond-il vraiment au format annoncé ? */
export function contentMatchesFormat(buffer: Buffer, format: DigitalFormat): boolean {
  const magic = MAGIC_BYTES[format];
  if (!magic) return false;
  return buffer.subarray(0, magic.bytes.length).equals(magic.bytes);
}

export interface UploadedDigitalFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * Le fichier est-il acceptable ? Rend `null` si oui, sinon le message FRANÇAIS
 * du refus — l'appelant le transforme en 400.
 *
 * ⚠ REND LE FORMAT EN MÊME TEMPS QUE LE VERDICT, pour que l'appelant n'ait pas
 * à redéduire `ACCEPTED_MIME[file.mimetype]` de son côté. Deux déductions du
 * même fait finissent par diverger.
 */
export type VerdictFichier =
  | { accepte: false; refus: string }
  | { accepte: true; format: DigitalFormat };

/**
 * ⚠ UNION DISCRIMINÉE PAR UN BOOLÉEN LITTÉRAL, et non par « le refus est-il
 * vide ? ». TypeScript ne sait pas rétrécir une union sur la vérité d'une
 * `string` : après `if (v.refus) throw`, il ignorait encore si `format`
 * existait, et l'appelant retombait sur une assertion. Le discriminant doit
 * être une valeur littérale, sinon le type ne protège rien.
 */
export function verifierFichier(file: UploadedDigitalFile): VerdictFichier {
  const format = ACCEPTED_MIME[file.mimetype];
  if (!format) {
    return {
      accepte: false,
      refus: 'Format non pris en charge : seuls les fichiers PDF et EPUB sont acceptés.',
    };
  }
  if (file.size === 0) return { accepte: false, refus: 'Fichier vide.' };
  if (!contentMatchesFormat(file.buffer, format)) {
    return {
      accepte: false,
      refus:
        `Ce fichier est annoncé comme ${MAGIC_BYTES[format].label} mais son contenu ne ` +
        `l'est pas (signature de début de fichier absente). Vérifiez qu'il n'est pas ` +
        `corrompu, ni renommé depuis un autre format.`,
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      accepte: false,
      refus: `Fichier trop volumineux (${Math.round(file.size / 1024 / 1024)} Mo, 200 Mo maximum).`,
    };
  }
  return { accepte: true, format };
}
