import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { z } from 'zod';
import { badRequest } from '../http.js';
import { bonusRange, type Rules, validateNumbers, canonical, canonicalBonus } from './rules.js';

export type DateFormat = 'iso' | 'dmy' | 'mdy';

export const mappingSchema = z.object({
  drawDate: z.string().min(1, 'Map the draw date column'),
  drawReference: z.string().nullable().default(null),
  remarks: z.string().nullable().default(null),
  /** ordered columns, one per main number */
  main: z.array(z.string()).default([]),
  bonus: z.array(z.string()).default([]),
  /** alternative: a single column holding all numbers separated by space, comma, | or ; */
  mainCombined: z.string().nullable().default(null),
  bonusCombined: z.string().nullable().default(null),
});
export type Mapping = z.infer<typeof mappingSchema>;

export interface Table {
  headers: string[];
  rows: string[][];
}

const ALLOWED_EXT = ['.csv', '.xlsx'];

/** Validate and parse an uploaded CSV / XLSX buffer into a string table (first sheet only). */
export async function readTable(buf: Buffer, fileName: string, maxRows: number): Promise<Table> {
  const lower = fileName.toLowerCase();
  const ext = ALLOWED_EXT.find((e) => lower.endsWith(e));
  if (!ext) throw badRequest('Only .csv and .xlsx files are accepted.');
  if (buf.length === 0) throw badRequest('The file is empty.');

  let grid: string[][];
  if (ext === '.xlsx') {
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) throw badRequest('This file is not a valid .xlsx workbook.');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw badRequest('Could not read the Excel file. It may be corrupted or password-protected.');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw badRequest('The workbook has no sheets.');
    grid = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (grid.length > maxRows + 1) return;
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value));
      grid.push(cells);
    });
  } else {
    if (buf.includes(0)) throw badRequest('This does not look like a text CSV file.');
    const text = buf.toString('utf8').replace(/^﻿/, '');
    const res = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimiter: '' });
    grid = res.data.map((r) => r.map((c) => String(c ?? '').trim()));
  }
  grid = grid.filter((r) => r.some((c) => c.trim() !== ''));
  if (grid.length < 2) throw badRequest('The file needs a header row and at least one data row.');
  if (grid.length - 1 > maxRows) throw badRequest(`The file has more than ${maxRows} rows. Split it into smaller files.`);
  const headers = grid[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  const seen = new Set<string>();
  headers.forEach((h, i) => {
    let name = h;
    while (seen.has(name)) name = `${h} (${i + 1})`;
    headers[i] = name;
    seen.add(name);
  });
  return { headers, rows: grid.slice(1) };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v && v.result != null) return cellText(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    return '';
  }
  return String(v).trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Suggest a column mapping from header names for the given lottery rules. */
export function suggestMapping(headers: string[], rules: Rules): Mapping {
  const find = (...names: string[]) => headers.find((h) => names.includes(norm(h))) ?? null;
  const numbered = (prefixes: string[], count: number) => {
    const out: string[] = [];
    for (let i = 1; i <= count; i++) {
      const h = headers.find((x) => prefixes.some((p) => norm(x) === `${p}${i}`));
      if (h) out.push(h);
    }
    return out;
  };
  let main = numbered(['number', 'num', 'n', 'main', 'mainnumber', 'ball'], rules.mainCount);
  const mainCombined = main.length === rules.mainCount ? null : find('numbers', 'winningnumbers', 'mainnumbers', 'result');
  if (mainCombined) main = [];
  let bonus: string[] = [];
  let bonusCombined: string | null = null;
  if (rules.bonus) {
    bonus = numbered(['bonusnumber', 'bonus', 'b', 'star', 'powerball', 'supplementary'], rules.bonus.count);
    if (rules.bonus.count === 1 && !bonus.length) {
      const single = find('bonusnumber', 'bonus', 'powerball', 'supplementary', 'additional');
      if (single) bonus = [single];
    }
    if (bonus.length !== rules.bonus.count) {
      const comb = find('bonusnumbers', 'stars', 'supplementarynumbers');
      if (comb) {
        bonusCombined = comb;
        bonus = [];
      }
    }
  }
  return { drawDate: find('drawdate', 'date', 'drawingdate') ?? '', drawReference: find('drawid', 'drawreference', 'reference', 'drawnumber', 'drawno', 'ref'), remarks: find('remarks', 'notes', 'note', 'comments'), main, bonus, mainCombined, bonusCombined };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseDate(raw: string, fmt: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (mt) [y, m, d] = [+mt[1], +mt[2], +mt[3]];
  else if ((mt = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]+(\d{4})$/))) {
    const mi = MONTHS.indexOf(mt[2].slice(0, 3).toLowerCase());
    if (mi < 0) return null;
    [d, m, y] = [+mt[1], mi + 1, +mt[3]];
  } else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    if (fmt === 'mdy') [m, d, y] = [+mt[1], +mt[2], +mt[3]];
    else [d, m, y] = [+mt[1], +mt[2], +mt[3]];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900) return null;
  return dt.toISOString().slice(0, 10);
}

export interface ParsedRow {
  line: number;
  date: string | null;
  ref: string | null;
  remarks: string | null;
  main: number[];
  bonus: number[];
  errors: string[];
}

const toNum = (s: string): number => (/^\d+$/.test(s.trim()) ? parseInt(s.trim(), 10) : /^\d+\.0+$/.test(s.trim()) ? parseInt(s.trim(), 10) : NaN);
const splitCombined = (s: string) => s.split(/[\s,;|]+/).filter(Boolean);

export function parseRows(table: Table, mapping: Mapping, rules: Rules, fmt: DateFormat): ParsedRow[] {
  const idx = (name: string | null) => (name ? table.headers.indexOf(name) : -1);
  const dIdx = idx(mapping.drawDate);
  if (dIdx < 0) throw badRequest('The mapped draw date column does not exist in the file.');
  const refIdx = idx(mapping.drawReference);
  const remIdx = idx(mapping.remarks);
  const mainIdx = mapping.main.map(idx);
  const bonusIdx = mapping.bonus.map(idx);
  const mcIdx = idx(mapping.mainCombined);
  const bcIdx = idx(mapping.bonusCombined);
  if (mapping.main.some((m, i) => mainIdx[i] < 0)) throw badRequest('A mapped main-number column does not exist in the file.');
  if (mapping.bonus.some((m, i) => bonusIdx[i] < 0)) throw badRequest('A mapped bonus column does not exist in the file.');
  if (!mainIdx.length && mcIdx < 0) throw badRequest('Map the main number columns (or a combined numbers column).');

  return table.rows.map((row, i) => {
    const errors: string[] = [];
    const cell = (j: number) => (j >= 0 ? (row[j] ?? '').trim() : '');
    const date = parseDate(cell(dIdx), fmt);
    if (!date) errors.push(`Invalid or missing draw date "${cell(dIdx)}".`);
    const mainTokens = mcIdx >= 0 ? splitCombined(cell(mcIdx)) : mainIdx.map(cell);
    const bonusTokens = bcIdx >= 0 ? splitCombined(cell(bcIdx)) : bonusIdx.map(cell).filter((x) => x !== '');
    const main = mainTokens.map(toNum);
    const bonus = bonusTokens.map(toNum);
    mainTokens.forEach((t, j) => Number.isNaN(main[j]) && errors.push(`Main number ${j + 1} "${t}" is not a whole number.`));
    bonusTokens.forEach((t, j) => Number.isNaN(bonus[j]) && errors.push(`Bonus number ${j + 1} "${t}" is not a whole number.`));
    if (!errors.length) {
      errors.push(...validateNumbers(rules, main, bonus));
    }
    const ref = cell(refIdx).slice(0, 64);
    return { line: i + 2, date, ref: ref || null, remarks: cell(remIdx) || null, main: errors.length ? main : canonical(rules, main), bonus: errors.length ? bonus : canonicalBonus(bonus), errors };
  });
}

export type RowStatus = 'valid' | 'duplicate' | 'invalid';
export interface ClassifiedRow extends ParsedRow {
  status: RowStatus;
  /** existing draw this row collides with (database duplicate) */
  existingId: string | null;
  duplicateOf: 'database' | 'file' | null;
}

/** Mark duplicates: same date or same reference already stored, or repeated earlier in the file. */
export function classify(rows: ParsedRow[], existing: { id: string; date: string; ref: string | null }[]): ClassifiedRow[] {
  const byDate = new Map(existing.map((e) => [e.date, e]));
  const byRef = new Map(existing.filter((e) => e.ref).map((e) => [e.ref!.toLowerCase(), e]));
  const seenDate = new Set<string>();
  const seenRef = new Set<string>();
  return rows.map((r) => {
    if (r.errors.length) return { ...r, status: 'invalid', existingId: null, duplicateOf: null };
    const dbHit = byDate.get(r.date!) ?? (r.ref ? byRef.get(r.ref.toLowerCase()) : undefined);
    const fileHit = seenDate.has(r.date!) || (r.ref ? seenRef.has(r.ref.toLowerCase()) : false);
    if (!fileHit) {
      seenDate.add(r.date!);
      if (r.ref) seenRef.add(r.ref.toLowerCase());
    }
    if (fileHit) return { ...r, status: 'duplicate', existingId: null, duplicateOf: 'file', errors: ['Repeated earlier in this file (same date or reference).'] };
    if (dbHit) return { ...r, status: 'duplicate', existingId: dbHit.id, duplicateOf: 'database', errors: [`A draw for ${dbHit.date}${dbHit.ref ? ` (${dbHit.ref})` : ''} already exists.`] };
    return { ...r, status: 'valid', existingId: null, duplicateOf: null };
  });
}

export function templateHeaders(rules: Rules): string[] {
  const h = ['draw_date', 'draw_id'];
  for (let i = 1; i <= rules.mainCount; i++) h.push(`number_${i}`);
  if (rules.bonus) {
    if (rules.bonus.count === 1) h.push('bonus_number');
    else for (let i = 1; i <= rules.bonus.count; i++) h.push(`bonus_number_${i}`);
  }
  h.push('remarks');
  return h;
}
export { bonusRange };
