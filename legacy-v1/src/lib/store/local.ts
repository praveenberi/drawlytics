import { DEFAULT_SETTINGS, type AppData, type Draw, type DrawInput, type Favourite, type FavouriteInput, type Game, type GameInput, type Generated, type GeneratedInput, type Settings } from '@/types';
import { uid } from '../utils';
import type { Store } from './types';

const KEY = 'lotto-insights-data-v1';
const now = () => new Date().toISOString();

const GAME_DEFAULTS = { bonus_from_main_pool: false, bonus_min: 1, bonus_max: 1, draw_days: [] as number[], draw_time: '', rules: '', personal_notes: '', draw_frequency: '', provider: '', country: '' };
const DRAW_DEFAULTS = { draw_number: '', jackpot: null, winners: null, prize_details: '', notes: '', source: 'manual', bonus_numbers: [] as number[] };

const empty = (): AppData => ({ games: [], draws: [], generated: [], favourites: [], settings: { ...DEFAULT_SETTINGS } });

export function normaliseData(raw: Partial<AppData> | null | undefined): AppData {
  const e = empty();
  if (!raw) return e;
  return {
    games: (raw.games ?? []).map((g) => ({ ...GAME_DEFAULTS, ...g }) as Game),
    draws: (raw.draws ?? []).map((d) => ({ ...DRAW_DEFAULTS, ...d }) as Draw),
    generated: raw.generated ?? [],
    favourites: raw.favourites ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
  };
}

export class LocalStore implements Store {
  readonly mode = 'local' as const;
  private data: AppData;

  constructor() {
    let parsed: Partial<AppData> | null = null;
    try {
      const txt = localStorage.getItem(KEY);
      parsed = txt ? JSON.parse(txt) : null;
    } catch {
      parsed = null;
    }
    this.data = normaliseData(parsed);
  }

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      throw new Error('Could not save to browser storage (it may be full or disabled). Export a backup and free some space.');
    }
  }

  async loadAll() {
    return structuredClone(this.data);
  }

  async saveGame(g: GameInput): Promise<Game> {
    const existing = g.id ? this.data.games.find((x) => x.id === g.id) : undefined;
    const game: Game = { ...g, id: existing?.id ?? uid(), created_at: existing?.created_at ?? now() };
    this.data.games = existing ? this.data.games.map((x) => (x.id === game.id ? game : x)) : [...this.data.games, game];
    this.persist();
    return game;
  }

  async deleteGame(id: string) {
    this.data.games = this.data.games.filter((g) => g.id !== id);
    this.data.draws = this.data.draws.filter((d) => d.game_id !== id);
    this.data.generated = this.data.generated.filter((d) => d.game_id !== id);
    this.data.favourites = this.data.favourites.filter((d) => d.game_id !== id);
    if (this.data.settings.selected_game_id === id) this.data.settings.selected_game_id = null;
    this.persist();
  }

  async saveDraw(d: DrawInput): Promise<Draw> {
    const existing = d.id ? this.data.draws.find((x) => x.id === d.id) : undefined;
    const draw: Draw = { ...d, id: existing?.id ?? uid(), created_at: existing?.created_at ?? now() };
    this.data.draws = existing ? this.data.draws.map((x) => (x.id === draw.id ? draw : x)) : [...this.data.draws, draw];
    this.persist();
    return draw;
  }

  async insertDraws(ds: DrawInput[]): Promise<Draw[]> {
    const created = ds.map((d) => ({ ...d, id: uid(), created_at: now() }) as Draw);
    this.data.draws = [...this.data.draws, ...created];
    this.persist();
    return created;
  }

  async deleteDraws(ids: string[]) {
    const s = new Set(ids);
    this.data.draws = this.data.draws.filter((d) => !s.has(d.id));
    this.persist();
  }

  async addGenerated(items: GeneratedInput[]): Promise<Generated[]> {
    const created = items.map((i) => ({ ...i, id: uid(), created_at: now() }));
    this.data.generated = [...created, ...this.data.generated].slice(0, 2000);
    this.persist();
    return created;
  }

  async clearGenerated(gameId: string) {
    this.data.generated = this.data.generated.filter((g) => g.game_id !== gameId);
    this.persist();
  }

  async saveFavourite(f: FavouriteInput): Promise<Favourite> {
    const existing = f.id ? this.data.favourites.find((x) => x.id === f.id) : undefined;
    const fav: Favourite = { ...f, id: existing?.id ?? uid(), created_at: existing?.created_at ?? now() };
    this.data.favourites = existing ? this.data.favourites.map((x) => (x.id === fav.id ? fav : x)) : [fav, ...this.data.favourites];
    this.persist();
    return fav;
  }

  async deleteFavourite(id: string) {
    this.data.favourites = this.data.favourites.filter((f) => f.id !== id);
    this.persist();
  }

  async saveSettings(s: Settings) {
    this.data.settings = s;
    this.persist();
    return s;
  }

  async replaceAll(data: AppData) {
    this.data = normaliseData(data);
    this.persist();
  }
}
