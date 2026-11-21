/**
 * Combination generator.
 *
 * IMPORTANT: every strategy below is a *statistical experiment* that weights
 * numbers by past results. In an independent random draw none of them has any
 * predictive advantage over any other (or over a plain random pick).
 */
import type { Draw, Game, GeneratedInput } from '@/types';
import { bonusFrequency, frequency, gapAnalysis, type Period, periodLabel, selectPeriod, sortChrono } from './analysis';
import { range } from './utils';

export type StrategyId = 'random' | 'hot' | 'cold' | 'balanced' | 'frequency' | 'gap';

export const STRATEGIES: { id: StrategyId; label: string; description: string }[] = [
  { id: 'random', label: 'Random Selection', description: 'Uniformly random numbers; history is ignored.' },
  { id: 'hot', label: 'Hot Numbers', description: 'Strongly favours numbers drawn most often in the chosen period (weight grows with the square of the count above the minimum).' },
  { id: 'cold', label: 'Cold Numbers', description: 'Strongly favours numbers drawn least often in the chosen period (mirror image of Hot).' },
  { id: 'balanced', label: 'Balanced Selection', description: 'Mixes hot, cold and middling numbers and keeps odd/even and low/high counts close to even.' },
  { id: 'frequency', label: 'Frequency-Based', description: 'Each number is weighted in proportion to how often it was drawn (+1 so unseen numbers stay possible).' },
  { id: 'gap', label: 'Gap-Based', description: 'Each number is weighted by the number of draws since it last appeared (+1).' },
];
export const strategyLabel = (id: string) => STRATEGIES.find((s) => s.id === id)?.label ?? id;

/** Small seedable PRNG so a run can be reproduced from its seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function makeRng(seed?: string): () => number {
  if (seed && seed.trim()) return mulberry32(hashSeed(seed.trim()));
  const buf = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  };
}

/** Weighted sampling without replacement. */
function pick(pool: number[], weights: Map<number, number>, k: number, rng: () => number): number[] {
  const items = pool.map((n) => ({ n, w: Math.max(weights.get(n) ?? 1, 1e-9) }));
  const out: number[] = [];
  for (let i = 0; i < k && items.length; i++) {
    const total = items.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    let idx = items.length - 1;
    for (let j = 0; j < items.length; j++) {
      r -= items[j].w;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    out.push(items[idx].n);
    items.splice(idx, 1);
  }
  return out.sort((a, b) => a - b);
}

export interface GenerateOptions {
  game: Game;
  draws: Draw[];
  strategy: StrategyId;
  count: number;
  period: Period;
  seed?: string;
}

export function generateCombinations(opts: GenerateOptions): GeneratedInput[] {
  const { game, strategy, count, period } = opts;
  const rng = makeRng(opts.seed);
  const chrono = selectPeriod(sortChrono(opts.draws.filter((d) => d.game_id === game.id)), period);
  const freq = frequency(chrono, game);
  const countOf = new Map(freq.map((f) => [f.number, f.count]));
  const gaps = new Map(gapAnalysis(chrono, game).map((g) => [g.number, g.currentGap ?? chrono.length]));
  const pool = range(game.min_number, game.max_number);
  const counts = freq.map((f) => f.count);
  const minC = Math.min(...counts);
  const maxC = Math.max(...counts);

  const weightsFor = (s: StrategyId): Map<number, number> => {
    const w = new Map<number, number>();
    for (const n of pool) {
      const c = countOf.get(n) ?? 0;
      if (s === 'hot') w.set(n, (c - minC + 1) ** 2);
      else if (s === 'cold') w.set(n, (maxC - c + 1) ** 2);
      else if (s === 'frequency') w.set(n, c + 1);
      else if (s === 'gap') w.set(n, (gaps.get(n) ?? 0) + 1);
      else w.set(n, 1);
    }
    return w;
  };

  // Rank-based thirds for the balanced strategy.
  const ranked = [...freq].sort((a, b) => b.count - a.count || a.number - b.number).map((f) => f.number);
  const third = Math.ceil(ranked.length / 3);
  const hotPool = ranked.slice(0, third);
  const coldPool = ranked.slice(-third);
  const midPool = ranked.slice(third, ranked.length - third);
  const mid = (game.min_number + game.max_number) / 2;

  const balanced = (): number[] => {
    const k = game.main_count;
    const nHot = Math.floor(k / 3) + (k % 3 > 0 ? 1 : 0);
    const nCold = Math.floor(k / 3) + (k % 3 > 1 ? 1 : 0);
    const nMid = k - nHot - nCold;
    let best: number[] = [];
    for (let attempt = 0; attempt < 400; attempt++) {
      const chosen = new Set<number>();
      const take = (p: number[], m: number) => {
        const avail = p.filter((x) => !chosen.has(x));
        pick(avail, new Map(), Math.min(m, avail.length), rng).forEach((x) => chosen.add(x));
      };
      take(hotPool, nHot);
      take(coldPool, nCold);
      take(midPool.length ? midPool : pool, nMid);
      if (chosen.size < k) take(pool, k - chosen.size);
      const arr = [...chosen].sort((a, b) => a - b);
      best = arr;
      const odd = arr.filter((x) => x % 2 === 1).length;
      const low = arr.filter((x) => x <= mid).length;
      if (Math.abs(odd - (k - odd)) <= 1 && Math.abs(low - (k - low)) <= 1) return arr;
    }
    return best;
  };

  const bonusFreq = bonusFrequency(chrono, game);
  const bonusCount = new Map(bonusFreq.map((b) => [b.number, b.count]));

  const out: GeneratedInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    let numbers: number[] = [];
    for (let attempt = 0; attempt < 50; attempt++) {
      numbers = strategy === 'balanced' ? balanced() : pick(pool, weightsFor(strategy), game.main_count, rng);
      if (!seen.has(numbers.join('-'))) break;
    }
    seen.add(numbers.join('-'));

    let bonus: number[] = [];
    if (game.bonus_count > 0) {
      const bPool = game.bonus_from_main_pool ? pool.filter((n) => !numbers.includes(n)) : range(game.bonus_min, game.bonus_max);
      const bw = new Map<number, number>();
      const src = game.bonus_from_main_pool ? countOf : bonusCount;
      const vals = bPool.map((n) => src.get(n) ?? 0);
      const bMin = Math.min(...vals);
      const bMax = Math.max(...vals);
      for (const n of bPool) {
        const c = src.get(n) ?? 0;
        bw.set(n, strategy === 'hot' ? (c - bMin + 1) ** 2 : strategy === 'cold' ? (bMax - c + 1) ** 2 : strategy === 'frequency' ? c + 1 : 1);
      }
      bonus = pick(bPool, bw, game.bonus_count, rng);
    }

    // Score: average share of analysed draws in which each selected number appeared.
    const nd = chrono.length;
    const score = nd ? (numbers.reduce((s, n) => s + (countOf.get(n) ?? 0), 0) / numbers.length / nd) * 100 : 0;
    out.push({ game_id: game.id, numbers, bonus, strategy, score: Math.round(score * 100) / 100, period: periodLabel(period), seed: opts.seed?.trim() || null });
  }
  return out;
}

export const DISCLAIMER_SHORT =
  'Lottery draws are random. Statistical patterns in past results do not guarantee or reliably predict future winning numbers.';
