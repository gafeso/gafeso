// Génération CSV pour Excel/LibreOffice francophones : séparateur « ; »,
// UTF-8 avec BOM (ajouté à l'envoi), guillemets doublés si nécessaire.

/** BOM UTF-8 — force Excel à lire l'accentuation correctement. */
export const CSV_BOM = '﻿';
const SEP = ';';

/** Échappe une cellule : guillemets si elle contient ; " retour-ligne ou espaces de bord. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[";\n\r]/.test(s) || s !== s.trim()) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Construit un bloc CSV (en-têtes + lignes). */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(SEP)];
  for (const row of rows) lines.push(row.map(csvCell).join(SEP));
  return lines.join('\r\n');
}

/** Assemble plusieurs blocs titrés en un seul fichier (rapport d'activité). */
export function joinCsvSections(sections: { title: string; csv: string }[]): string {
  return sections.map((s) => `${csvCell(s.title)}\r\n${s.csv}`).join('\r\n\r\n');
}
