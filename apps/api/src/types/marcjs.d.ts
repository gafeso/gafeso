/**
 * Déclaration minimale pour marcjs (lib JS sans types).
 * Champ de données : [tag, indicateurs, code, valeur, code, valeur, ...]
 * Champ de contrôle : [tag, valeur]
 */
declare module 'marcjs' {
  import { Transform } from 'stream';

  export class Record {
    leader: string;
    fields: string[][];
    append(...fields: string[][]): Record;
    as(type: string): string;
  }

  export const Marc: {
    parse(data: Buffer | string, type: string): Record;
    format(record: Record, type: string): string;
    createStream(type: string, what: 'parser' | 'formater'): Transform;
  };
}
