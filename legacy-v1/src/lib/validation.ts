import type { Draw, DrawInput, Game, GameInput } from '@/types';
import { sameSet, todayISO } from './utils';

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Validate main + bonus numbers against the lottery's own rules. */
export function validateNumbers(game: Game, main: number[], bonus: number[]): string[] {
  const errors: string[] = [];
  const { min_number: lo, max_number: hi } = game;

  if (main.length !== game.main_count) errors.push(`Enter exactly ${game.main_count} winning numbers (got ${main.length}).`);
  if (main.some((n) => Number.isNaN(n))) errors.push('Winning numbers must be whole numbers.');
  const mainOk = main.filter((n) => !Number.isNaN(n));
  const out = mainOk.filter((n) => n < lo || n > hi);
  if (out.length) errors.push(`Winning numbers must be between ${lo} and ${hi} (out of range: ${out.join(', ')}).`);
  if (new Set(mainOk).size !== mainOk.length) errors.push('Winning numbers contain duplicates.');

  if (bonus.length !== game.bonus_count) {
    errors.push(
      game.bonus_count === 0
        ? 'This game has no bonus/supplementary numbers.'
        : `Enter exactly ${game.bonus_count} bonus number${game.bonus_count > 1 ? 's' : ''} (got ${bonus.length}).`,
    );
  }
  if (bonus.some((n) => Number.isNaN(n))) errors.push('Bonus numbers must be whole numbers.');
  const bonusOk = bonus.filter((n) => !Number.isNaN(n));
  const bLo = game.bonus_from_main_pool ? lo : game.bonus_min;
  const bHi = game.bonus_from_main_pool ? hi : game.bonus_max;
  const bOut = bonusOk.filter((n) => n < bLo || n > bHi);
  if (bOut.length) errors.push(`Bonus numbers must be between ${bLo} and ${bHi} (out of range: ${bOut.join(', ')}).`);
  if (new Set(bonusOk).size !== bonusOk.length) errors.push('Bonus numbers contain duplicates.');
  if (game.bonus_from_main_pool) {
    const clash = bonusOk.filter((n) => mainOk.includes(n));
    if (clash.length) errors.push(`Bonus number ${clash.join(', ')} is already a winning number (same pool).`);
  }
  return errors;
}

export function validateDraw(game: Game, d: Pick<DrawInput, 'draw_date' | 'main_numbers' | 'bonus_numbers' | 'jackpot' | 'winners'>): string[] {
  const errors: string[] = [];
  if (!isValidISODate(d.draw_date)) errors.push('Draw date is missing or invalid.');
  else if (d.draw_date > todayISO()) errors.push('Draw date cannot be in the future.');
  errors.push(...validateNumbers(game, d.main_numbers, d.bonus_numbers));
  if (d.jackpot != null && (Number.isNaN(d.jackpot) || d.jackpot < 0)) errors.push('Jackpot must be a non-negative number.');
  if (d.winners != null && (!Number.isInteger(d.winners) || d.winners < 0)) errors.push('Number of winners must be a non-negative whole number.');
  return errors;
}

/**
 * A draw is a duplicate when the same game already has the same draw number,
 * or an entry on the same date with identical main numbers.
 */
export function findDuplicate(
  draws: Draw[],
  gameId: string,
  input: Pick<DrawInput, 'draw_number' | 'draw_date' | 'main_numbers'>,
  ignoreId?: string,
): { draw: Draw; reason: string } | undefined {
  const num = input.draw_number.trim().toLowerCase();
  for (const d of draws) {
    if (d.game_id !== gameId || d.id === ignoreId) continue;
    if (num && d.draw_number.trim().toLowerCase() === num) return { draw: d, reason: `Draw number ${d.draw_number} already exists` };
    if (d.draw_date === input.draw_date && sameSet(d.main_numbers, input.main_numbers))
      return { draw: d, reason: `A draw on ${d.draw_date} with the same numbers already exists` };
  }
  return undefined;
}

export function validateGame(g: GameInput): string[] {
  const e: string[] = [];
  if (!g.name.trim()) e.push('Lottery name is required.');
  if (!Number.isInteger(g.min_number) || !Number.isInteger(g.max_number) || g.min_number >= g.max_number) e.push('Number range must be whole numbers with minimum lower than maximum.');
  const size = g.max_number - g.min_number + 1;
  if (!Number.isInteger(g.main_count) || g.main_count < 1) e.push('Main numbers drawn must be at least 1.');
  else if (g.main_count > size) e.push('Main numbers drawn cannot exceed the size of the number range.');
  if (!Number.isInteger(g.bonus_count) || g.bonus_count < 0) e.push('Bonus count cannot be negative.');
  if (g.bonus_count > 0) {
    if (g.bonus_from_main_pool) {
      if (g.main_count + g.bonus_count > size) e.push('Main + bonus numbers exceed the size of the shared number pool.');
    } else {
      if (!Number.isInteger(g.bonus_min) || !Number.isInteger(g.bonus_max) || g.bonus_min >= g.bonus_max) e.push('Bonus range must have minimum lower than maximum.');
      else if (g.bonus_count > g.bonus_max - g.bonus_min + 1) e.push('Bonus numbers drawn cannot exceed the size of the bonus range.');
    }
  }
  return e;
}
