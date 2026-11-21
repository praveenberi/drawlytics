import { downloadBlob } from './utils';

type Cell = string | number | boolean | null | undefined;

function escapeCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : String(v);
  // Neutralise spreadsheet formula injection (Excel / Sheets) for text cells.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  if (/[",\r\n;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Build an Excel/Sheets-friendly CSV (UTF-8 BOM, CRLF line endings). */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]) {
  downloadBlob(filename.endsWith('.csv') ? filename : filename + '.csv', toCsv(headers, rows), 'text/csv;charset=utf-8');
}

/** RFC-4180 style parser with automatic delimiter detection (comma, semicolon, tab). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>;
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  const delim = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [','])[0] as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
