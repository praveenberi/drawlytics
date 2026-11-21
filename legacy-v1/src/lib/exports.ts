import type { Draw, Favourite, Game, Generated } from '@/types';
import { SOURCE_LABEL } from '@/types';
import { downloadCsv } from './csv';
import { frequency, gapAnalysis, hotCold, periodLabel, selectPeriod, sortChrono, type Period } from './analysis';
import { slug, todayISO } from './utils';
import { strategyLabel } from './generator';

const gameName = (games: Game[], id: string) => games.find((g) => g.id === id)?.name ?? '';
const stamp = () => todayISO();

export function exportGames(games: Game[]) {
  downloadCsv(
    `lotto-games-${stamp()}`,
    ['name', 'country', 'provider', 'min_number', 'max_number', 'main_count', 'bonus_count', 'bonus_same_pool', 'bonus_min', 'bonus_max', 'draw_frequency', 'draw_days', 'draw_time', 'rules', 'personal_notes'],
    games.map((g) => [g.name, g.country, g.provider, g.min_number, g.max_number, g.main_count, g.bonus_count, g.bonus_from_main_pool ? 'yes' : 'no', g.bonus_count && !g.bonus_from_main_pool ? g.bonus_min : '', g.bonus_count && !g.bonus_from_main_pool ? g.bonus_max : '', g.draw_frequency, g.draw_days.join(' '), g.draw_time, g.rules, g.personal_notes]),
  );
}

/** Same layout the CSV importer reads, so an export can be re-imported. */
export function exportHistory(draws: Draw[], games: Game[], only?: Game) {
  const list = sortChrono(only ? draws.filter((d) => d.game_id === only.id) : draws).reverse();
  downloadCsv(
    `lotto-history-${only ? slug(only.name) + '-' : ''}${stamp()}`,
    ['game', 'draw_number', 'draw_date', 'main_numbers', 'bonus_numbers', 'jackpot', 'winners', 'prize_details', 'notes', 'source'],
    list.map((d) => [gameName(games, d.game_id), d.draw_number, d.draw_date, d.main_numbers.join(' '), d.bonus_numbers.join(' '), d.jackpot, d.winners, d.prize_details, d.notes, SOURCE_LABEL[d.source]]),
  );
}

export function exportFrequency(game: Game, draws: Draw[], period: Period) {
  const chrono = selectPeriod(sortChrono(draws.filter((d) => d.game_id === game.id)), period);
  const freq = frequency(chrono, game);
  const gaps = new Map(gapAnalysis(chrono, game).map((g) => [g.number, g]));
  downloadCsv(
    `lotto-frequency-${slug(game.name)}-${stamp()}`,
    ['game', 'period', 'draws_analysed', 'number', 'times_drawn', 'pct_of_draws', 'rank', 'times_as_bonus', 'draws_since_last_seen', 'average_gap_draws', 'longest_gap_draws', 'never_drawn'],
    [...freq].sort((a, b) => a.rank - b.rank).map((f) => {
      const g = gaps.get(f.number)!;
      return [game.name, periodLabel(period), chrono.length, f.number, f.count, f.pct.toFixed(2), f.rank, f.bonusCount, g.currentGap ?? '', g.avgGap != null ? g.avgGap.toFixed(2) : '', g.maxGap ?? '', f.count === 0 ? 'yes' : 'no'];
    }),
  );
}

export function exportHotCold(game: Game, draws: Draw[], period: Period, k: number) {
  const chrono = selectPeriod(sortChrono(draws.filter((d) => d.game_id === game.id)), period);
  const { hot, cold } = hotCold(frequency(chrono, game), k);
  const row = (cat: string) => (f: (typeof hot)[number], i: number) => [game.name, periodLabel(period), chrono.length, cat, i + 1, f.number, f.count, f.pct.toFixed(2)];
  downloadCsv(`lotto-hot-cold-${slug(game.name)}-${stamp()}`, ['game', 'period', 'draws_analysed', 'category', 'position', 'number', 'times_drawn', 'pct_of_draws'], [...hot.map(row('Hot')), ...cold.map(row('Cold'))]);
}

export function exportGenerated(items: Generated[], games: Game[]) {
  downloadCsv(
    `lotto-generated-${stamp()}`,
    ['generated_at', 'game', 'numbers', 'bonus_numbers', 'strategy', 'analysis_period', 'historical_frequency_score_pct', 'seed', 'note'],
    items.map((g) => [g.created_at, gameName(games, g.game_id), g.numbers.join(' '), g.bonus.join(' '), strategyLabel(g.strategy), g.period, g.score, g.seed ?? '', 'Statistical experiment - not a prediction']),
  );
}

export function exportFavourites(items: Favourite[], games: Game[]) {
  downloadCsv(
    `lotto-favourites-${stamp()}`,
    ['saved_at', 'game', 'label', 'numbers', 'bonus_numbers', 'strategy', 'note'],
    items.map((f) => [f.created_at, gameName(games, f.game_id), f.label, f.numbers.join(' '), f.bonus.join(' '), f.strategy ? strategyLabel(f.strategy) : 'Manual', f.note]),
  );
}
