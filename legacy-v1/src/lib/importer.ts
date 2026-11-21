import type { Draw, DrawInput, Game } from '@/types';
import { parseCsv } from './csv';
import { findDuplicate, isValidISODate, validateDraw } from './validation';
import { parseNumberList, sameSet } from './utils';

export type DateFormat = 'iso' | 'dmy' | 'mdy';

export interface ImportRow {
  line: number;
  status: 'valid' | 'duplicate' | 'invalid';
  messages: string[];
  game?: Game;
  input?: DrawInput;
  raw: { draw_number: string; draw_date: string; numbers: string; bonus: string };
}

const ALIASES: Record<string, string[]> = {
  game: ['game', 'lottery', 'lottery_name', 'game_name'],
  draw_number: ['draw_number', 'draw_no', 'drawno', 'draw', 'draw_id', 'drawid', 'draw_num', 'number_of_draw'],
  draw_date: ['draw_date', 'date', 'drawdate'],
  numbers: ['numbers', 'main_numbers', 'winning_numbers', 'main', 'winning'],
  bonus: ['bonus', 'bonus_numbers', 'additional', 'additional_number', 'supplementary', 'supplementary_numbers'],
  jackpot: ['jackpot', 'jackpot_amount'],
  winners: ['winners', 'number_of_winners', 'jackpot_winners'],
  prize_details: ['prize_details', 'prizes', 'prize'],
  notes: ['notes', 'note', 'comments'],
};

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseDate(raw: string, fmt: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (match) {
    [y, m, d] = [+match[1], +match[2], +match[3]];
  } else if ((match = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]+(\d{4})$/))) {
    const mi = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase());
    if (mi < 0) return null;
    [d, m, y] = [+match[1], mi + 1, +match[3]];
  } else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    if (fmt === 'mdy') [m, d, y] = [+match[1], +match[2], +match[3]];
    else [d, m, y] = [+match[1], +match[2], +match[3]];
  } else return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : null;
}

export function parseMoney(raw: string): number | null | undefined {
  const s = raw.trim().replace(/[$€£\s,]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
}

export interface ParsedImport {
  rows: ImportRow[];
  headerError?: string;
}

/**
 * Parse + validate CSV text. Nothing is saved here: every row is classified as
 * valid / duplicate (already stored or repeated in the file) / invalid.
 */
export function analyseImport(text: string, games: Game[], defaultGame: Game | null, existing: Draw[], fmt: DateFormat): ParsedImport {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], headerError: 'The file needs a header row and at least one data row.' };
  const headers = table[0].map(norm);

  const col = (key: string) => headers.findIndex((h) => ALIASES[key].includes(h));
  const idx = {
    game: col('game'),
    draw_number: col('draw_number'),
    draw_date: col('draw_date'),
    numbers: col('numbers'),
    bonus: col('bonus'),
    jackpot: col('jackpot'),
    winners: col('winners'),
    prize_details: col('prize_details'),
    notes: col('notes'),
  };
  const nCols = headers.map((h, i) => ({ h, i })).filter((x) => /^n\d+$/.test(x.h)).sort((a, b) => parseInt(a.h.slice(1)) - parseInt(b.h.slice(1)));
  const bCols = headers.map((h, i) => ({ h, i })).filter((x) => /^b\d+$/.test(x.h)).sort((a, b) => parseInt(a.h.slice(1)) - parseInt(b.h.slice(1)));

  if (idx.draw_date < 0) return { rows: [], headerError: 'Missing required column: draw_date.' };
  if (idx.numbers < 0 && nCols.length === 0) return { rows: [], headerError: 'Missing winning numbers: add a "numbers" column (space separated) or n1, n2, … columns.' };
  if (idx.game < 0 && !defaultGame) return { rows: [], headerError: 'Select a lottery game first (the file has no "game" column).' };

  const rows: ImportRow[] = [];
  const pool: Draw[] = [...existing];
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

  for (let li = 1; li < table.length; li++) {
    const r = table[li];
    const rawNumbers = idx.numbers >= 0 ? get(r, idx.numbers) : nCols.map((c) => get(r, c.i)).filter(Boolean).join(' ');
    const rawBonus = idx.bonus >= 0 ? get(r, idx.bonus) : bCols.map((c) => get(r, c.i)).filter(Boolean).join(' ');
    const row: ImportRow = {
      line: li + 1,
      status: 'valid',
      messages: [],
      raw: { draw_number: get(r, idx.draw_number), draw_date: get(r, idx.draw_date), numbers: rawNumbers, bonus: rawBonus },
    };

    let game = defaultGame;
    if (idx.game >= 0 && get(r, idx.game)) {
      const g = games.find((x) => x.name.trim().toLowerCase() === get(r, idx.game).toLowerCase());
      if (!g) {
        row.status = 'invalid';
        row.messages.push(`Unknown lottery game "${get(r, idx.game)}". Create the game first.`);
        rows.push(row);
        continue;
      }
      game = g;
    }
    if (!game) {
      row.status = 'invalid';
      row.messages.push('No lottery game selected.');
      rows.push(row);
      continue;
    }
    row.game = game;

    const date = parseDate(row.raw.draw_date, fmt);
    if (!date) row.messages.push(`Unrecognised date "${row.raw.draw_date}" (expected ${fmt === 'iso' ? 'YYYY-MM-DD' : fmt === 'dmy' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}).`);

    const main = parseNumberList(rawNumbers);
    const bonus = parseNumberList(rawBonus);
    const jackpot = idx.jackpot >= 0 ? parseMoney(get(r, idx.jackpot)) : null;
    const winnersRaw = idx.winners >= 0 ? get(r, idx.winners).replace(/[,\s]/g, '') : '';
    const winners = winnersRaw ? Number(winnersRaw) : null;
    if (jackpot === undefined) row.messages.push('Jackpot is not a valid number.');

    const input: DrawInput = {
      game_id: game.id,
      draw_number: row.raw.draw_number,
      draw_date: date ?? '',
      main_numbers: main,
      bonus_numbers: bonus,
      jackpot: jackpot === undefined ? null : jackpot,
      winners: winners !== null && Number.isNaN(winners) ? null : winners,
      prize_details: get(r, idx.prize_details),
      notes: get(r, idx.notes),
      source: 'imported',
    };
    if (winners !== null && Number.isNaN(winners)) row.messages.push('Number of winners is not valid.');

    const errs = date ? validateDraw(game, input) : validateDraw(game, { ...input, draw_date: '2000-01-01' });
    row.messages.push(...errs);
    if (row.messages.length) {
      row.status = 'invalid';
      rows.push(row);
      continue;
    }

    const dup = findDuplicate(pool, game.id, input);
    if (dup) {
      row.status = 'duplicate';
      row.messages.push(dup.reason + '.');
    } else {
      // Track within-file duplicates by adding to the pool.
      pool.push({ ...input, id: `import-${li}`, created_at: '' });
    }
    row.input = input;
    rows.push(row);
  }
  return { rows };
}

export const IMPORT_TEMPLATE_HEADERS = ['draw_number', 'draw_date', 'numbers', 'bonus_numbers', 'jackpot', 'winners', 'prize_details', 'notes'];
export { sameSet };
