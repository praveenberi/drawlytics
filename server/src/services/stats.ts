/**
 * Statistical analysis engine. Pure functions over chronological draw records.
 * All output is descriptive: it summarises what happened, not what will happen.
 */
import type { Rules } from './rules.js';
import { bonusRange } from './rules.js';

export interface DrawRec {
  id?: string;
  date: string; // ISO yyyy-mm-dd
  ref: string | null;
  main: number[];
  bonus: number[];
}

export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const poolOf = (r: Rules, draws: DrawRec[]): number[] => (r.maxNumber - r.minNumber + 1 <= 200 ? range(r.minNumber, r.maxNumber) : [...new Set(draws.flatMap((d) => d.main))].sort((a, b) => a - b));

export function numberCounts(draws: DrawRec[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const d of draws) for (const n of d.main) m.set(n, (m.get(n) ?? 0) + 1);
  return m;
}
export function bonusCounts(draws: DrawRec[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const d of draws) for (const n of d.bonus) m.set(n, (m.get(n) ?? 0) + 1);
  return m;
}

export interface GapRow {
  number: number;
  appearances: number;
  /** draws since last appearance (0 = in latest draw); null = never drawn */
  currentGap: number | null;
  avgGap: number | null;
  maxGap: number | null;
}
export function gapStats(draws: DrawRec[], pool: number[]): GapRow[] {
  const pos = new Map<number, number[]>();
  draws.forEach((d, i) => {
    for (const n of new Set(d.main)) (pos.get(n) ?? pos.set(n, []).get(n)!).push(i);
  });
  const last = draws.length - 1;
  return pool.map((n) => {
    const p = pos.get(n) ?? [];
    if (!p.length) return { number: n, appearances: 0, currentGap: null, avgGap: null, maxGap: null };
    const iv: number[] = [];
    for (let i = 1; i < p.length; i++) iv.push(p[i] - p[i - 1]);
    return { number: n, appearances: p.length, currentGap: last - p[p.length - 1], avgGap: iv.length ? iv.reduce((a, b) => a + b, 0) / iv.length : null, maxGap: iv.length ? Math.max(...iv) : null };
  });
}

export function pairCounts(draws: DrawRec[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of draws) {
    const u = [...new Set(d.main)].sort((a, b) => a - b);
    for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
      const k = u[i] + '-' + u[j];
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return m;
}

function tripleCounts(draws: DrawRec[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of draws) {
    const u = [...new Set(d.main)].sort((a, b) => a - b);
    for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) for (let l = j + 1; l < u.length; l++) {
      const k = u[i] + '-' + u[j] + '-' + u[l];
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return m;
}

const topCombos = (m: Map<string, number>, n: number, top: number) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, top)
    .map(([k, count]) => ({ numbers: k.split('-').map(Number), count, pct: n ? (count / n) * 100 : 0 }));

const dist = <T extends string | number>(values: T[], n: number, sortKey?: (a: T) => number) => {
  const m = new Map<T, number>();
  values.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
  const arr = [...m.entries()].sort((a, b) => (sortKey ? sortKey(a[0]) - sortKey(b[0]) : 0));
  return arr.map(([label, count]) => ({ label: String(label), key: label, count, pct: n ? (count / n) * 100 : 0 }));
};

export interface AnalysisOptions {
  hotWindow?: number;
  topN?: number;
}

export function computeAnalysis(rules: Rules, draws: DrawRec[], opts: AnalysisOptions = {}) {
  const n = draws.length;
  const pool = poolOf(rules, draws);
  const counts = numberCounts(draws);
  const drawsWith = new Map<number, number>();
  for (const d of draws) for (const x of new Set(d.main)) drawsWith.set(x, (drawsWith.get(x) ?? 0) + 1);
  const totalPicks = n * rules.mainCount;
  const gaps = gapStats(draws, pool);
  const gapBy = new Map(gaps.map((g) => [g.number, g]));

  const frequency = pool.map((num) => ({
    number: num,
    count: counts.get(num) ?? 0,
    drawsWith: drawsWith.get(num) ?? 0,
    pct: n ? ((drawsWith.get(num) ?? 0) / n) * 100 : 0,
    share: totalPicks ? ((counts.get(num) ?? 0) / totalPicks) * 100 : 0,
    currentGap: gapBy.get(num)!.currentGap,
  }));
  const byCountDesc = [...frequency].sort((a, b) => b.count - a.count || a.number - b.number);
  const topN = opts.topN ?? 10;

  // hot / cold over a recent window
  const hotWindow = Math.min(n, opts.hotWindow ?? 20);
  const recent = numberCounts(draws.slice(-hotWindow));
  const recentRows = pool.map((num) => ({ number: num, count: recent.get(num) ?? 0, pct: hotWindow ? ((recent.get(num) ?? 0) / hotWindow) * 100 : 0 }));
  const hot = [...recentRows].sort((a, b) => b.count - a.count || a.number - b.number).slice(0, topN);
  const cold = [...recentRows].sort((a, b) => a.count - b.count || a.number - b.number).slice(0, topN);

  // odd / even
  const oddCounts = draws.map((d) => d.main.filter((x) => x % 2 !== 0).length);
  const oddEven = dist(oddCounts, n, (k) => k).map((r) => ({ ...r, label: `${r.key} odd / ${rules.mainCount - Number(r.key)} even` }));
  const totalOdd = oddCounts.reduce((a, b) => a + b, 0);

  // high / low (split at the midpoint of the range)
  const mid = (rules.minNumber + rules.maxNumber) / 2;
  const highCounts = draws.map((d) => d.main.filter((x) => x > mid).length);
  const highLow = dist(highCounts, n, (k) => k).map((r) => ({ ...r, label: `${r.key} high / ${rules.mainCount - Number(r.key)} low` }));
  const totalHigh = highCounts.reduce((a, b) => a + b, 0);

  // consecutive numbers (e.g. 17,18) within a draw
  const consPerDraw = draws.map((d) => {
    const u = [...new Set(d.main)].sort((a, b) => a - b);
    let c = 0;
    for (let i = 1; i < u.length; i++) if (u[i] - u[i - 1] === 1) c++;
    return c;
  });
  const consPairs = new Map<string, number>();
  for (const d of draws) {
    const u = [...new Set(d.main)].sort((a, b) => a - b);
    for (let i = 1; i < u.length; i++) if (u[i] - u[i - 1] === 1) consPairs.set(u[i - 1] + '-' + u[i], (consPairs.get(u[i - 1] + '-' + u[i]) ?? 0) + 1);
  }
  const consecutive = {
    drawsWithAny: consPerDraw.filter((c) => c > 0).length,
    pctWithAny: n ? (consPerDraw.filter((c) => c > 0).length / n) * 100 : 0,
    distribution: dist(consPerDraw, n, (k) => k).map((r) => ({ ...r, label: `${r.key} consecutive pair${r.key === 1 ? '' : 's'}` })),
    topPairs: topCombos(consPairs, n, 10),
  };

  // sums
  const sums = draws.map((d) => d.main.reduce((a, b) => a + b, 0));
  const sorted = [...sums].sort((a, b) => a - b);
  const sMin = sorted[0] ?? 0;
  const sMax = sorted[sorted.length - 1] ?? 0;
  const bins = 10;
  const width = Math.max(1, Math.ceil((sMax - sMin + 1) / bins));
  const histogram = Array.from({ length: bins }, (_, i) => ({ label: `${sMin + i * width}–${sMin + (i + 1) * width - 1}`, count: 0 }));
  sums.forEach((s) => histogram[Math.min(bins - 1, Math.floor((s - sMin) / width))].count++);
  const sumAnalysis = {
    min: sMin,
    max: sMax,
    average: n ? sums.reduce((a, b) => a + b, 0) / n : 0,
    median: n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : 0,
    histogram: n ? histogram : [],
    trend: draws.map((d, i) => {
      const w = sums.slice(Math.max(0, i - 9), i + 1);
      return { date: d.date, ref: d.ref, sum: sums[i], movingAvg: Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 10) / 10 };
    }),
  };

  // repeats between consecutive draws
  const repRows = draws.slice(1).map((d, i) => {
    const prev = new Set(draws[i].main);
    const rep = [...new Set(d.main)].filter((x) => prev.has(x)).sort((a, b) => a - b);
    return { date: d.date, ref: d.ref, numbers: d.main, repeated: rep };
  });
  const repeats = {
    average: repRows.length ? repRows.reduce((a, r) => a + r.repeated.length, 0) / repRows.length : 0,
    distribution: dist(repRows.map((r) => r.repeated.length), repRows.length, (k) => k).map((r) => ({ ...r, label: `${r.key} repeated` })),
    recent: repRows.slice(-30).reverse(),
    trend: repRows.slice(-100).map((r) => ({ date: r.date, repeated: r.repeated.length })),
  };

  const bonus = rules.bonus
    ? (() => {
        const br = bonusRange(rules)!;
        const bc = bonusCounts(draws);
        return { range: br, frequency: range(br.min, Math.min(br.max, br.min + 199)).map((num) => ({ number: num, count: bc.get(num) ?? 0, pct: n ? ((bc.get(num) ?? 0) / n) * 100 : 0 })) };
      })()
    : null;

  // heatmap: number × slice of the selected history
  const bucketCount = Math.min(10, Math.max(1, n));
  const heat = {
    buckets: Array.from({ length: bucketCount }, (_, b) => {
      const from = Math.floor((b * n) / bucketCount);
      const to = Math.floor(((b + 1) * n) / bucketCount) - 1;
      return { label: n ? `${draws[from].date.slice(2, 7)}` : '', from: n ? draws[from].date : '', to: n ? draws[Math.max(from, to)].date : '', draws: Math.max(0, to - from + 1) };
    }),
    rows: [] as { number: number; counts: number[]; total: number }[],
    max: 0,
  };
  if (n && pool.length <= 100) {
    heat.rows = pool.map((num) => {
      const cs = heat.buckets.map((_, b) => {
        const from = Math.floor((b * n) / bucketCount);
        const to = Math.floor(((b + 1) * n) / bucketCount);
        let c = 0;
        for (let i = from; i < to; i++) c += draws[i].main.filter((x) => x === num).length;
        return c;
      });
      return { number: num, counts: cs, total: cs.reduce((a, b) => a + b, 0) };
    });
    heat.max = Math.max(1, ...heat.rows.flatMap((r) => r.counts));
  }

  return {
    summary: {
      drawCount: n,
      from: draws[0]?.date ?? null,
      to: draws[n - 1]?.date ?? null,
      poolSize: pool.length,
      neverDrawn: frequency.filter((f) => f.count === 0).map((f) => f.number),
      expectedPct: rules.allowDuplicates ? null : (rules.mainCount / (rules.maxNumber - rules.minNumber + 1)) * 100,
    },
    frequency,
    mostFrequent: byCountDesc.slice(0, topN),
    leastFrequent: [...byCountDesc].reverse().slice(0, topN),
    hotCold: { window: hotWindow, hot, cold },
    gaps: gaps.sort((a, b) => (b.currentGap ?? 1e9) - (a.currentGap ?? 1e9) || a.number - b.number),
    oddEven: { distribution: oddEven, oddShare: totalPicks ? (totalOdd / totalPicks) * 100 : 0, evenShare: totalPicks ? 100 - (totalOdd / totalPicks) * 100 : 0 },
    highLow: { threshold: mid, distribution: highLow, highShare: totalPicks ? (totalHigh / totalPicks) * 100 : 0, lowShare: totalPicks ? 100 - (totalHigh / totalPicks) * 100 : 0 },
    consecutive,
    sums: sumAnalysis,
    repeats,
    pairs: topCombos(pairCounts(draws), n, 20),
    triples: rules.mainCount >= 3 ? topCombos(tripleCounts(draws), n, 20) : [],
    bonus,
    heatmap: heat,
  };
}
