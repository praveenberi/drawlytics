/**
 * Analysis engine. Pure, deterministic functions over stored draws — the same
 * data always gives the same output. All figures are descriptive statistics of
 * past draws; they say nothing about the probability of future draws.
 */
import type { Draw, Game } from '@/types';
import { range } from './utils';

export type Period = number | 'all';

const numKey = (s: string) => {
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? null : n;
};

/** Oldest → newest (date, then numeric draw number, then insertion time). */
export function sortChrono(draws: Draw[]): Draw[] {
  return [...draws].sort((a, b) => {
    if (a.draw_date !== b.draw_date) return a.draw_date < b.draw_date ? -1 : 1;
    const na = numKey(a.draw_number);
    const nb = numKey(b.draw_number);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}

/** Last N draws (chronological order kept). */
export function selectPeriod(chrono: Draw[], period: Period): Draw[] {
  return period === 'all' ? chrono : chrono.slice(-period);
}

export const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: '10', label: 'Last 10 draws' },
  { value: '20', label: 'Last 20 draws' },
  { value: '50', label: 'Last 50 draws' },
  { value: '100', label: 'Last 100 draws' },
  { value: 'all', label: 'All draws' },
];
export const parsePeriod = (v: string): Period => (v === 'all' ? 'all' : parseInt(v, 10));
export const periodLabel = (p: Period) => (p === 'all' ? 'All draws' : `Last ${p} draws`);

// ---------- A. Frequency ----------
export interface FreqRow {
  number: number;
  count: number;
  /** % of analysed draws in which the number appeared as a main number */
  pct: number;
  bonusCount: number;
  rank: number;
}

export function frequency(draws: Draw[], game: Game): FreqRow[] {
  const counts = new Map<number, number>();
  const bonus = new Map<number, number>();
  for (const d of draws) {
    for (const n of d.main_numbers) counts.set(n, (counts.get(n) ?? 0) + 1);
    for (const n of d.bonus_numbers) bonus.set(n, (bonus.get(n) ?? 0) + 1);
  }
  const total = draws.length || 1;
  const rows: FreqRow[] = range(game.min_number, game.max_number).map((n) => ({
    number: n,
    count: counts.get(n) ?? 0,
    pct: ((counts.get(n) ?? 0) / total) * 100,
    bonusCount: bonus.get(n) ?? 0,
    rank: 0,
  }));
  const sorted = [...rows].sort((a, b) => b.count - a.count || a.number - b.number);
  sorted.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** Bonus-pool frequency (only meaningful when the bonus pool differs from the main pool). */
export function bonusFrequency(draws: Draw[], game: Game): { number: number; count: number }[] {
  const lo = game.bonus_from_main_pool ? game.min_number : game.bonus_min;
  const hi = game.bonus_from_main_pool ? game.max_number : game.bonus_max;
  const c = new Map<number, number>();
  for (const d of draws) for (const n of d.bonus_numbers) c.set(n, (c.get(n) ?? 0) + 1);
  return range(lo, hi).map((n) => ({ number: n, count: c.get(n) ?? 0 }));
}

export const mostFrequent = (f: FreqRow[], k: number) =>
  [...f].sort((a, b) => b.count - a.count || a.number - b.number).slice(0, k);
export const leastFrequent = (f: FreqRow[], k: number) =>
  [...f].sort((a, b) => a.count - b.count || a.number - b.number).slice(0, k);
export const neverDrawn = (f: FreqRow[]) => f.filter((r) => r.count === 0).map((r) => r.number);

// ---------- B. Hot / Cold ----------
/** Hot = k highest counts, Cold = k lowest counts (ties broken by lower number first). */
export function hotCold(f: FreqRow[], k: number) {
  return { hot: mostFrequent(f, k), cold: leastFrequent(f, k) };
}

// ---------- C. Gaps ----------
export interface GapRow {
  number: number;
  appearances: number;
  /** draws since last appearance (0 = appeared in the most recent draw); null = never drawn */
  currentGap: number | null;
  /** mean number of draws between consecutive appearances; null if < 2 appearances */
  avgGap: number | null;
  maxGap: number | null;
}

export function gapAnalysis(chrono: Draw[], game: Game): GapRow[] {
  const idx = new Map<number, number[]>();
  chrono.forEach((d, i) => d.main_numbers.forEach((n) => (idx.get(n) ?? idx.set(n, []).get(n)!).push(i)));
  const last = chrono.length - 1;
  return range(game.min_number, game.max_number).map((n) => {
    const pos = idx.get(n) ?? [];
    if (!pos.length) return { number: n, appearances: 0, currentGap: null, avgGap: null, maxGap: null };
    const intervals: number[] = [];
    for (let i = 1; i < pos.length; i++) intervals.push(pos[i] - pos[i - 1]);
    return {
      number: n,
      appearances: pos.length,
      currentGap: last - pos[pos.length - 1],
      avgGap: intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null,
      maxGap: intervals.length ? Math.max(...intervals) : null,
    };
  });
}

// ---------- D. Odd / Even ----------
export interface DistRow {
  label: string;
  count: number;
  pct: number;
}

export function oddEven(draws: Draw[]) {
  const map = new Map<number, number>();
  let oddTotal = 0;
  let numTotal = 0;
  for (const d of draws) {
    const odd = d.main_numbers.filter((n) => n % 2 === 1).length;
    map.set(odd, (map.get(odd) ?? 0) + 1);
    oddTotal += odd;
    numTotal += d.main_numbers.length;
  }
  const total = draws.length || 1;
  const rows: (DistRow & { odd: number; even: number })[] = [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([odd, count]) => {
      const even = (draws.find((d) => d.main_numbers.filter((n) => n % 2 === 1).length === odd)?.main_numbers.length ?? 0) - odd;
      return { odd, even, label: `${odd} odd / ${even} even`, count, pct: (count / total) * 100 };
    });
  return {
    rows,
    oddShare: numTotal ? (oddTotal / numTotal) * 100 : 0,
    evenShare: numTotal ? 100 - (oddTotal / numTotal) * 100 : 0,
  };
}

// ---------- E. Ranges ----------
export interface Band {
  label: string;
  from: number;
  to: number;
}

export function makeBands(game: Game, bandCount: number): Band[] {
  const size = game.max_number - game.min_number + 1;
  const n = Math.max(2, Math.min(bandCount, size));
  const names = n === 3 ? ['Low', 'Medium', 'High'] : n === 2 ? ['Low', 'High'] : null;
  const bands: Band[] = [];
  for (let i = 0; i < n; i++) {
    const from = game.min_number + Math.floor((i * size) / n);
    const to = game.min_number + Math.floor(((i + 1) * size) / n) - 1;
    bands.push({ from, to, label: `${names ? names[i] : `Band ${i + 1}`} (${from}–${to})` });
  }
  return bands;
}

export const bandIndex = (bands: Band[], n: number) => bands.findIndex((b) => n >= b.from && n <= b.to);

export function rangeAnalysis(draws: Draw[], game: Game, bandCount: number) {
  const bands = makeBands(game, bandCount);
  const counts = bands.map(() => 0);
  const patterns = new Map<string, number>();
  let total = 0;
  for (const d of draws) {
    const per = bands.map(() => 0);
    for (const n of d.main_numbers) {
      const i = bandIndex(bands, n);
      if (i >= 0) {
        counts[i]++;
        per[i]++;
        total++;
      }
    }
    const key = per.join('-');
    patterns.set(key, (patterns.get(key) ?? 0) + 1);
  }
  const nd = draws.length || 1;
  return {
    bands,
    distribution: bands.map((b, i) => ({ label: b.label, count: counts[i], pct: total ? (counts[i] / total) * 100 : 0 })),
    patterns: [...patterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pattern, count]) => ({ pattern, count, pct: (count / nd) * 100 })),
  };
}

// ---------- F. Pairs / Triples / Repeats ----------
export interface ComboRow {
  numbers: number[];
  count: number;
  pct: number;
}

function combos(draws: Draw[], size: 2 | 3, top: number): ComboRow[] {
  const map = new Map<string, number>();
  for (const d of draws) {
    const n = [...d.main_numbers].sort((a, b) => a - b);
    const L = n.length;
    if (size === 2) {
      for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) {
        const k = `${n[i]}-${n[j]}`;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    } else {
      for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) for (let l = j + 1; l < L; l++) {
        const k = `${n[i]}-${n[j]}-${n[l]}`;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
  }
  const total = draws.length || 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, top)
    .map(([k, count]) => ({ numbers: k.split('-').map(Number), count, pct: (count / total) * 100 }));
}

export const topPairs = (draws: Draw[], top = 20) => combos(draws, 2, top);
export const topTriples = (draws: Draw[], top = 20) => combos(draws, 3, top);

export function repeatedCombinations(draws: Draw[]) {
  const map = new Map<string, Draw[]>();
  for (const d of draws) {
    const k = [...d.main_numbers].sort((a, b) => a - b).join('-');
    (map.get(k) ?? map.set(k, []).get(k)!).push(d);
  }
  return [...map.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([k, v]) => ({ numbers: k.split('-').map(Number), draws: v }))
    .sort((a, b) => b.draws.length - a.draws.length);
}

// ---------- G. Draw history ----------
export interface RepeatRow {
  draw: Draw;
  previous: Draw;
  repeated: number[];
}

export function consecutiveRepeats(chrono: Draw[]) {
  const rows: RepeatRow[] = [];
  for (let i = 1; i < chrono.length; i++) {
    const prev = new Set(chrono[i - 1].main_numbers);
    rows.push({ draw: chrono[i], previous: chrono[i - 1], repeated: chrono[i].main_numbers.filter((n) => prev.has(n)).sort((a, b) => a - b) });
  }
  const dist = new Map<number, number>();
  rows.forEach((r) => dist.set(r.repeated.length, (dist.get(r.repeated.length) ?? 0) + 1));
  const total = rows.length || 1;
  return {
    rows,
    distribution: [...dist.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, count]) => ({ label: `${k} repeated`, count, pct: (count / total) * 100 })),
    average: rows.length ? rows.reduce((s, r) => s + r.repeated.length, 0) / rows.length : 0,
  };
}

export const drawSum = (d: Draw) => d.main_numbers.reduce((a, b) => a + b, 0);

export function sumTrend(chrono: Draw[], window = 10) {
  return chrono.map((d, i) => {
    const slice = chrono.slice(Math.max(0, i - window + 1), i + 1);
    return {
      label: d.draw_number || d.draw_date,
      date: d.draw_date,
      sum: drawSum(d),
      movingAvg: Math.round((slice.reduce((s, x) => s + drawSum(x), 0) / slice.length) * 10) / 10,
    };
  });
}

/** Compare two draws number-by-number. */
export function compareDraws(a: Draw, b: Draw) {
  const bm = new Set(b.main_numbers);
  const am = new Set(a.main_numbers);
  const bb = new Set(b.bonus_numbers);
  return {
    commonMain: a.main_numbers.filter((n) => bm.has(n)).sort((x, y) => x - y),
    onlyA: a.main_numbers.filter((n) => !bm.has(n)).sort((x, y) => x - y),
    onlyB: b.main_numbers.filter((n) => !am.has(n)).sort((x, y) => x - y),
    commonBonus: a.bonus_numbers.filter((n) => bb.has(n)),
    sumA: drawSum(a),
    sumB: drawSum(b),
  };
}
