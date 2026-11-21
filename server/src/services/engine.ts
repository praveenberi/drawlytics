/**
 * Number suggestion engine.
 *
 * IMPORTANT: lottery draws are random. Every algorithm here only re-weights numbers
 * using past results; none can reliably predict future outcomes. The back-test
 * function exists precisely to compare a formula against a plain random baseline.
 */
import { z } from 'zod';
import { bonusRange, canonical, canonicalBonus, type Rules } from './rules.js';
import { bonusCounts, gapStats, numberCounts, pairCounts, poolOf, range, type DrawRec } from './stats.js';

export const COMPONENT_TYPES = ['LONG_TERM_FREQUENCY', 'FREQUENCY', 'RECENT_FREQUENCY', 'HOT_COLD', 'GAP', 'PAIR_FREQUENCY', 'ODD_EVEN', 'HIGH_LOW', 'RANDOM'] as const;
export const ALGORITHM_TYPES = [...COMPONENT_TYPES, 'WEIGHTED'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const ALGORITHM_CATALOG: { type: string; name: string; description: string }[] = [
  { type: 'FREQUENCY', name: 'Frequency-based', description: 'Favours numbers drawn most often within the configured frequency window.' },
  { type: 'HOT_COLD', name: 'Hot & cold numbers', description: 'Favours hot (recently frequent) or cold (recently rare) numbers within the hot/cold window.' },
  { type: 'RECENT_FREQUENCY', name: 'Recent draw frequency', description: 'Favours numbers that appeared most in the last N draws.' },
  { type: 'LONG_TERM_FREQUENCY', name: 'Long-term historical frequency', description: 'Favours numbers with the highest count across the whole analysis period.' },
  { type: 'GAP', name: 'Number gap analysis', description: 'Favours numbers whose current gap is long compared with their own average gap.' },
  { type: 'ODD_EVEN', name: 'Odd/even balancing', description: 'Steers the combination towards the configured odd/even mix.' },
  { type: 'HIGH_LOW', name: 'High/low balancing', description: 'Steers the combination towards the configured high/low mix.' },
  { type: 'PAIR_FREQUENCY', name: 'Pair frequency analysis', description: 'Favours numbers that have historically been drawn together with the numbers already chosen.' },
  { type: 'RANDOM', name: 'Random number generation', description: 'Uniformly random component. With this alone the output is a plain random pick.' },
  { type: 'WEIGHTED', name: 'Weighted combination', description: 'Blends every enabled algorithm using the configured weights.' },
];

const intArr = z.array(z.number().int()).max(200).default([]);

export const formulaConfigSchema = z.object({
  primaryAlgorithm: z.enum(ALGORITHM_TYPES).default('WEIGHTED'),
  algorithms: z
    .array(z.object({ type: z.enum(COMPONENT_TYPES), enabled: z.boolean(), weight: z.number().min(0).max(100) }))
    .max(20),
  periods: z
    .object({
      /** null = use every stored draw */
      analysisDraws: z.number().int().min(5).max(100000).nullable().default(null),
      recentDraws: z.number().int().min(1).max(1000).default(20),
      frequencyDraws: z.number().int().min(1).max(100000).nullable().default(100),
      hotColdDraws: z.number().int().min(1).max(1000).default(30),
    })
    .default({}),
  hotColdMode: z.enum(['hot', 'cold']).default('hot'),
  constraints: z.object({ minNumber: z.number().int().nullable().default(null), maxNumber: z.number().int().nullable().default(null), exclude: intArr, include: intArr }).default({}),
  oddEven: z.object({ minOdd: z.number().int().min(0).nullable().default(null), maxOdd: z.number().int().min(0).nullable().default(null), enforce: z.boolean().default(true) }).default({}),
  highLow: z.object({ minHigh: z.number().int().min(0).nullable().default(null), maxHigh: z.number().int().min(0).nullable().default(null), enforce: z.boolean().default(true) }).default({}),
  bonus: z.object({ strategy: z.enum(['RANDOM', 'FREQUENCY', 'HOT', 'COLD', 'GAP']).default('RANDOM'), exclude: intArr }).default({}),
  combinations: z.number().int().min(1).max(20).default(3),
  /** >1 concentrates probability on top-scored numbers, <1 flattens it */
  sharpness: z.number().min(0.25).max(4).default(1),
});
export type FormulaConfig = z.infer<typeof formulaConfigSchema>;

export const defaultFormulaConfig = (): FormulaConfig =>
  formulaConfigSchema.parse({
    primaryAlgorithm: 'WEIGHTED',
    algorithms: [
      { type: 'LONG_TERM_FREQUENCY', enabled: true, weight: 25 },
      { type: 'RECENT_FREQUENCY', enabled: true, weight: 20 },
      { type: 'GAP', enabled: true, weight: 15 },
      { type: 'PAIR_FREQUENCY', enabled: true, weight: 15 },
      { type: 'ODD_EVEN', enabled: true, weight: 10 },
      { type: 'HIGH_LOW', enabled: true, weight: 10 },
      { type: 'RANDOM', enabled: true, weight: 5 },
      { type: 'FREQUENCY', enabled: false, weight: 0 },
      { type: 'HOT_COLD', enabled: false, weight: 0 },
    ],
  });

/** Check a config against a lottery's rules; returns problems (empty = ok). */
export function checkConfig(rules: Rules, c: FormulaConfig): string[] {
  const e: string[] = [];
  const k = rules.mainCount;
  if (c.primaryAlgorithm === 'WEIGHTED') {
    const active = c.algorithms.filter((a) => a.enabled && a.weight > 0);
    if (!active.length) e.push('Enable at least one algorithm with a weight above 0.');
  } else if (!c.algorithms.some((a) => a.type === c.primaryAlgorithm && a.enabled) && c.primaryAlgorithm !== 'RANDOM') {
    // single-algorithm mode ignores toggles, so this is only advisory
  }
  const { minOdd, maxOdd } = c.oddEven;
  if (minOdd != null && maxOdd != null && minOdd > maxOdd) e.push('Odd/even: minimum odd count exceeds maximum.');
  if ((maxOdd ?? 0) > k || (minOdd ?? 0) > k) e.push(`Odd/even limits cannot exceed ${k}.`);
  const { minHigh, maxHigh } = c.highLow;
  if (minHigh != null && maxHigh != null && minHigh > maxHigh) e.push('High/low: minimum high count exceeds maximum.');
  if ((maxHigh ?? 0) > k || (minHigh ?? 0) > k) e.push(`High/low limits cannot exceed ${k}.`);
  const lo = c.constraints.minNumber ?? rules.minNumber;
  const hi = c.constraints.maxNumber ?? rules.maxNumber;
  if (lo < rules.minNumber || hi > rules.maxNumber) e.push(`Number constraints must stay within ${rules.minNumber}–${rules.maxNumber}.`);
  if (lo >= hi) e.push('Constraint minimum must be below maximum.');
  const avail = hi - lo + 1 - c.constraints.exclude.filter((x) => x >= lo && x <= hi).length;
  if (!rules.allowDuplicates && avail < k) e.push('Constraints leave fewer numbers than needed for one combination.');
  if (c.constraints.include.length > k) e.push('Too many "must include" numbers.');
  if (c.constraints.include.some((x) => x < lo || x > hi || c.constraints.exclude.includes(x))) e.push('"Must include" numbers must be inside the allowed range and not excluded.');
  return e;
}

// ---------- RNG ----------
export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const secureRng = (): Rng => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const seed = Math.floor(Math.random() * 2 ** 32) ^ Date.now();
  return mulberry32(seed);
};

// ---------- scoring ----------
const normCounts = (m: Map<number, number>, pool: number[]) => {
  const max = Math.max(0, ...pool.map((n) => m.get(n) ?? 0));
  return (n: number) => (max === 0 ? 0.5 : (m.get(n) ?? 0) / max);
};

function pickWeighted(items: { n: number; w: number }[], rng: Rng): number {
  const total = items.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.n;
  }
  return items[items.length - 1].n;
}

export interface GeneratedCombo {
  main: number[];
  bonus: number[];
}

export function generateCombos(rules: Rules, config: FormulaConfig, historyAll: DrawRec[], count: number, rng: Rng): GeneratedCombo[] {
  const hist = config.periods.analysisDraws ? historyAll.slice(-config.periods.analysisDraws) : historyAll;
  const k = rules.mainCount;
  const lo = config.constraints.minNumber ?? rules.minNumber;
  const hi = config.constraints.maxNumber ?? rules.maxNumber;
  const excluded = new Set(config.constraints.exclude);
  const fullPool = poolOf(rules, hist.length ? hist : []).length ? poolOf(rules, hist) : range(lo, hi);
  const pool = fullPool.filter((n) => n >= lo && n <= hi && !excluded.has(n));

  const single = config.primaryAlgorithm !== 'WEIGHTED';
  const comps: { type: ComponentType; w: number }[] = single
    ? [{ type: config.primaryAlgorithm as ComponentType, w: 1 }]
    : config.algorithms.filter((a) => a.enabled && a.weight > 0).map((a) => ({ type: a.type, w: a.weight }));
  const wSum = comps.reduce((s, c) => s + c.w, 0) || 1;
  const has = (t: ComponentType) => comps.some((c) => c.type === t);

  const longCounts = numberCounts(hist);
  const recentCounts = numberCounts(hist.slice(-config.periods.recentDraws));
  const freqCounts = numberCounts(config.periods.frequencyDraws ? hist.slice(-config.periods.frequencyDraws) : hist);
  const hcCounts = numberCounts(hist.slice(-config.periods.hotColdDraws));
  const nLong = normCounts(longCounts, pool);
  const nRecent = normCounts(recentCounts, pool);
  const nFreq = normCounts(freqCounts, pool);
  const nHC = normCounts(hcCounts, pool);
  const gaps = new Map(gapStats(hist, pool).map((g) => [g.number, g]));
  const gapScore = (n: number) => {
    const g = gaps.get(n);
    if (!g || g.appearances === 0) return hist.length ? 1 : 0.5;
    const avg = g.avgGap ?? hist.length / g.appearances;
    return Math.min((g.currentGap ?? 0) / Math.max(avg, 1), 3) / 3;
  };
  const pairs = has('PAIR_FREQUENCY') ? pairCounts(hist) : new Map<string, number>();
  const maxPair = Math.max(1, ...pairs.values());
  const pairOf = (a: number, b: number) => (pairs.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? 0) / maxPair;

  const mid = (lo + hi) / 2;
  const oeMin = config.oddEven.minOdd ?? Math.floor((k - 1) / 2);
  const oeMax = config.oddEven.maxOdd ?? Math.ceil((k + 1) / 2);
  const hlMin = config.highLow.minHigh ?? Math.floor((k - 1) / 2);
  const hlMax = config.highLow.maxHigh ?? Math.ceil((k + 1) / 2);

  const feasible = (chosen: number[], x: number, which: 'oe' | 'hl') => {
    const isA = which === 'oe' ? x % 2 !== 0 : x > mid;
    const a = chosen.filter((c) => (which === 'oe' ? c % 2 !== 0 : c > mid)).length + (isA ? 1 : 0);
    const b = chosen.length + 1 - a;
    const [mn, mx] = which === 'oe' ? [oeMin, oeMax] : [hlMin, hlMax];
    return a <= mx && b <= k - mn;
  };

  const bonusInfo = rules.bonus ? bonusRange(rules)! : null;
  const bonusCnt = bonusCounts(hist);

  const buildOne = (): GeneratedCombo => {
    const chosen: number[] = config.constraints.include.filter((x) => pool.includes(x)).slice(0, k);
    while (chosen.length < k) {
      let cands = rules.allowDuplicates ? pool : pool.filter((n) => !chosen.includes(n));
      if (!cands.length) cands = pool;
      let filtered = cands;
      if (config.oddEven.enforce && !(oeMin === 0 && oeMax >= k)) filtered = filtered.filter((x) => feasible(chosen, x, 'oe'));
      if (config.highLow.enforce && !(hlMin === 0 && hlMax >= k)) filtered = filtered.filter((x) => feasible(chosen, x, 'hl'));
      if (!filtered.length) filtered = cands;

      const items = filtered.map((n) => {
        let s = 0;
        for (const c of comps) {
          let v = 0;
          switch (c.type) {
            case 'LONG_TERM_FREQUENCY': v = nLong(n); break;
            case 'FREQUENCY': v = nFreq(n); break;
            case 'RECENT_FREQUENCY': v = nRecent(n); break;
            case 'HOT_COLD': v = config.hotColdMode === 'hot' ? nHC(n) : 1 - nHC(n); break;
            case 'GAP': v = gapScore(n); break;
            case 'PAIR_FREQUENCY': v = chosen.length ? chosen.reduce((a, x) => a + pairOf(n, x), 0) / chosen.length : 0.5; break;
            case 'ODD_EVEN': v = feasible(chosen, n, 'oe') ? 1 : 0.1; break;
            case 'HIGH_LOW': v = feasible(chosen, n, 'hl') ? 1 : 0.1; break;
            case 'RANDOM': v = rng(); break;
          }
          s += c.w * v;
        }
        return { n, w: (s / wSum + 0.02) ** config.sharpness };
      });
      chosen.push(pickWeighted(items, rng));
    }

    let bonus: number[] = [];
    if (rules.bonus && bonusInfo) {
      const bEx = new Set(config.bonus.exclude);
      const bonusPool: number[] = [];
      for (let n = bonusInfo.min; n <= Math.min(bonusInfo.max, bonusInfo.min + 199); n++) if (!bEx.has(n) && (rules.bonus.separatePool || rules.allowDuplicates || !chosen.includes(n))) bonusPool.push(n);
      const src = rules.bonus.separatePool ? bonusCnt : longCounts;
      const nb = normCounts(src, bonusPool);
      const lastSeen = new Map<number, number>();
      hist.forEach((d, i) => (rules.bonus!.separatePool ? d.bonus : d.main).forEach((x) => lastSeen.set(x, i)));
      const sc = (n: number) => {
        switch (config.bonus.strategy) {
          case 'FREQUENCY':
          case 'HOT': return nb(n);
          case 'COLD': return 1 - nb(n);
          case 'GAP': return lastSeen.has(n) ? Math.min(hist.length - 1 - lastSeen.get(n)!, hist.length) / Math.max(1, hist.length) : 1;
          default: return 0.5;
        }
      };
      const picked: number[] = [];
      while (picked.length < rules.bonus.count && bonusPool.length) {
        const c = rules.bonus.allowDuplicates ? bonusPool : bonusPool.filter((n) => !picked.includes(n));
        if (!c.length) break;
        picked.push(pickWeighted(c.map((n) => ({ n, w: sc(n) + 0.05 })), rng));
      }
      bonus = picked;
    }
    return { main: canonical(rules, chosen), bonus: canonicalBonus(bonus) };
  };

  const out: GeneratedCombo[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    let combo = buildOne();
    for (let t = 0; t < 30 && seen.has(combo.main.join('-') + '|' + combo.bonus.join('-')); t++) combo = buildOne();
    seen.add(combo.main.join('-') + '|' + combo.bonus.join('-'));
    out.push(combo);
  }
  return out;
}

// ---------- matching & evaluation ----------
export function matchMain(rules: Rules, suggested: number[], actual: number[]): number {
  if (rules.ordered) return suggested.reduce((s, n, i) => s + (actual[i] === n ? 1 : 0), 0);
  const pool = [...actual];
  let m = 0;
  for (const n of suggested) {
    const i = pool.indexOf(n);
    if (i >= 0) {
      m++;
      pool.splice(i, 1);
    }
  }
  return m;
}
export const matchBonus = (suggested: number[], actual: number[]) => matchMain({ ordered: false } as Rules, suggested, actual);

/** Expected main-number matches of a purely random pick. */
export function expectedChanceMatches(rules: Rules): number {
  const size = rules.maxNumber - rules.minNumber + 1;
  return rules.ordered || rules.allowDuplicates ? rules.mainCount / size : (rules.mainCount * rules.mainCount) / size;
}

export interface BacktestResult {
  tested: number;
  combosPerDraw: number;
  avgMain: number;
  avgBonus: number;
  baselineAvgMain: number;
  baselineAvgBonus: number;
  expectedByChance: number;
  bestMain: number;
  distribution: { matches: number; count: number; baselineCount: number }[];
  rows: { date: string; ref: string | null; actual: number[]; actualBonus: number[]; bestSuggestion: number[]; bestMatches: number }[];
  note: string;
}

/** Walk-forward test: for each of the last N draws, generate suggestions using only earlier draws. */
export function backtest(rules: Rules, config: FormulaConfig, draws: DrawRec[], lastN = 50, seed = 12345, minHistory = 10): BacktestResult {
  const start = Math.max(minHistory, draws.length - lastN);
  const rng = mulberry32(seed);
  const baseRng = mulberry32(seed + 1);
  const baseCfg: FormulaConfig = { ...config, primaryAlgorithm: 'RANDOM' };
  const dist = new Map<number, { c: number; b: number }>();
  let sumMain = 0, sumBonus = 0, bSumMain = 0, bSumBonus = 0, total = 0, best = 0;
  const rows: BacktestResult['rows'] = [];
  const bump = (m: number, base: boolean) => dist.set(m, { c: (dist.get(m)?.c ?? 0) + (base ? 0 : 1), b: (dist.get(m)?.b ?? 0) + (base ? 1 : 0) });
  for (let i = start; i < draws.length; i++) {
    const history = draws.slice(0, i);
    const actual = draws[i];
    const mine = generateCombos(rules, config, history, config.combinations, rng);
    const base = generateCombos(rules, baseCfg, history, config.combinations, baseRng);
    let bestHere = { m: -1, c: mine[0] };
    for (const c of mine) {
      const m = matchMain(rules, c.main, actual.main);
      sumMain += m;
      sumBonus += matchBonus(c.bonus, actual.bonus);
      total++;
      best = Math.max(best, m);
      bump(m, false);
      if (m > bestHere.m) bestHere = { m, c };
    }
    for (const c of base) {
      bSumMain += matchMain(rules, c.main, actual.main);
      bSumBonus += matchBonus(c.bonus, actual.bonus);
      bump(matchMain(rules, c.main, actual.main), true);
    }
    rows.push({ date: actual.date, ref: actual.ref, actual: actual.main, actualBonus: actual.bonus, bestSuggestion: bestHere.c.main, bestMatches: bestHere.m });
  }
  const t = Math.max(1, total);
  return {
    tested: draws.length - start,
    combosPerDraw: config.combinations,
    avgMain: sumMain / t,
    avgBonus: sumBonus / t,
    baselineAvgMain: bSumMain / t,
    baselineAvgBonus: bSumBonus / t,
    expectedByChance: expectedChanceMatches(rules),
    bestMain: best,
    distribution: [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([matches, v]) => ({ matches, count: v.c, baselineCount: v.b })),
    rows: rows.slice(-20).reverse(),
    note: 'Walk-forward back-test: each draw is "predicted" using only earlier draws. Compare against the random baseline — a formula that does not clearly beat it has no demonstrated edge (and in a fair lottery none is expected).',
  };
}
