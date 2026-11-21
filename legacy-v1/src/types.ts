export type DataSource = 'manual' | 'imported' | 'external';
export type ThemeSetting = 'light' | 'dark' | 'system';

export interface Game {
  id: string;
  name: string;
  country: string;
  provider: string;
  min_number: number;
  max_number: number;
  main_count: number;
  bonus_count: number;
  /** true: bonus numbers come from the same pool as the main numbers (e.g. Singapore Toto additional number) */
  bonus_from_main_pool: boolean;
  bonus_min: number;
  bonus_max: number;
  draw_frequency: string;
  /** weekdays 0 (Sun) – 6 (Sat) on which draws normally happen */
  draw_days: number[];
  draw_time: string;
  rules: string;
  personal_notes: string;
  created_at: string;
}
export type GameInput = Omit<Game, 'id' | 'created_at'> & { id?: string };

export interface Draw {
  id: string;
  game_id: string;
  draw_number: string;
  /** ISO calendar date YYYY-MM-DD (no timezone conversion) */
  draw_date: string;
  main_numbers: number[];
  bonus_numbers: number[];
  jackpot: number | null;
  winners: number | null;
  prize_details: string;
  notes: string;
  source: DataSource;
  created_at: string;
}
export type DrawInput = Omit<Draw, 'id' | 'created_at'> & { id?: string };

export interface Generated {
  id: string;
  game_id: string;
  numbers: number[];
  bonus: number[];
  strategy: string;
  score: number;
  period: string;
  seed: string | null;
  created_at: string;
}
export type GeneratedInput = Omit<Generated, 'id' | 'created_at'>;

export interface Favourite {
  id: string;
  game_id: string;
  numbers: number[];
  bonus: number[];
  strategy: string;
  label: string;
  note: string;
  created_at: string;
}
export type FavouriteInput = Omit<Favourite, 'id' | 'created_at'> & { id?: string };

export interface Settings {
  theme: ThemeSetting;
  selected_game_id: string | null;
  page_size: number;
}

export interface AppData {
  games: Game[];
  draws: Draw[];
  generated: Generated[];
  favourites: Favourite[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', selected_game_id: null, page_size: 25 };

export const SOURCE_LABEL: Record<DataSource, string> = {
  manual: 'Manual',
  imported: 'CSV import',
  external: 'External source',
};
