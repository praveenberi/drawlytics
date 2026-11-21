import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, type AppData, type Draw, type DrawInput, type Favourite, type FavouriteInput, type Game, type GameInput, type Generated, type GeneratedInput, type Settings } from '@/types';
import { chunk, uid } from '../utils';
import type { Store } from './types';

const PAGE = 1000;

interface NumRow {
  number: number;
  kind: 'main' | 'bonus';
  position: number;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function mapGame(r: any): Game {
  return {
    id: r.id,
    name: r.name,
    country: r.country ?? '',
    provider: r.provider ?? '',
    min_number: r.min_number,
    max_number: r.max_number,
    main_count: r.main_count,
    bonus_count: r.bonus_count,
    bonus_from_main_pool: r.bonus_from_main_pool,
    bonus_min: r.bonus_min ?? 1,
    bonus_max: r.bonus_max ?? 1,
    draw_frequency: r.draw_frequency ?? '',
    draw_days: r.draw_days ?? [],
    draw_time: r.draw_time ?? '',
    rules: r.rules ?? '',
    personal_notes: r.personal_notes ?? '',
    created_at: r.created_at,
  };
}

const gameRow = (g: GameInput & { id: string }) => ({
  id: g.id,
  name: g.name,
  country: g.country,
  provider: g.provider,
  min_number: g.min_number,
  max_number: g.max_number,
  main_count: g.main_count,
  bonus_count: g.bonus_count,
  bonus_from_main_pool: g.bonus_from_main_pool,
  bonus_min: g.bonus_min,
  bonus_max: g.bonus_max,
  draw_frequency: g.draw_frequency,
  draw_days: g.draw_days,
  draw_time: g.draw_time,
  rules: g.rules,
  personal_notes: g.personal_notes,
});

function mapDraw(r: any): Draw {
  const nums: NumRow[] = r.draw_numbers ?? [];
  const pick = (k: 'main' | 'bonus') => nums.filter((n) => n.kind === k).sort((a, b) => a.position - b.position).map((n) => n.number);
  return {
    id: r.id,
    game_id: r.game_id,
    draw_number: r.draw_number ?? '',
    draw_date: r.draw_date,
    main_numbers: pick('main'),
    bonus_numbers: pick('bonus'),
    jackpot: r.jackpot == null ? null : Number(r.jackpot),
    winners: r.winners,
    prize_details: r.prize_details ?? '',
    notes: r.notes ?? '',
    source: r.source,
    created_at: r.created_at,
  };
}

const drawRow = (d: DrawInput & { id: string }) => ({
  id: d.id,
  game_id: d.game_id,
  draw_number: d.draw_number.trim() || null,
  draw_date: d.draw_date,
  jackpot: d.jackpot,
  winners: d.winners,
  prize_details: d.prize_details,
  notes: d.notes,
  source: d.source,
});

const numberRows = (d: DrawInput & { id: string }) => [
  ...d.main_numbers.map((n, i) => ({ draw_id: d.id, number: n, kind: 'main', position: i + 1 })),
  ...d.bonus_numbers.map((n, i) => ({ draw_id: d.id, number: n, kind: 'bonus', position: i + 1 })),
];

const mapGen = (r: any): Generated => ({ id: r.id, game_id: r.game_id, numbers: r.numbers, bonus: r.bonus ?? [], strategy: r.strategy, score: Number(r.score), period: r.period ?? '', seed: r.seed, created_at: r.created_at });
const mapFav = (r: any): Favourite => ({ id: r.id, game_id: r.game_id, numbers: r.numbers, bonus: r.bonus ?? [], strategy: r.strategy ?? '', label: r.label ?? '', note: r.note ?? '', created_at: r.created_at });

export class SupabaseStore implements Store {
  readonly mode = 'supabase' as const;
  constructor(private sb: SupabaseClient) {}

  async loadAll(): Promise<AppData> {
    const [games, gen, fav, settings] = await Promise.all([
      this.sb.from('lottery_games').select('*').order('created_at'),
      this.sb.from('generated_combinations').select('*').order('created_at', { ascending: false }).limit(2000),
      this.sb.from('favourite_combinations').select('*').order('created_at', { ascending: false }),
      this.sb.from('user_settings').select('*').maybeSingle(),
    ]);
    const draws: Draw[] = [];
    for (let from = 0; ; from += PAGE) {
      const res = await this.sb
        .from('lottery_draws')
        .select('*, draw_numbers(number, kind, position)')
        .order('draw_date', { ascending: false })
        .order('id')
        .range(from, from + PAGE - 1);
      const rows = unwrap(res) as any[];
      draws.push(...rows.map(mapDraw));
      if (rows.length < PAGE) break;
    }
    const s = unwrap(settings) as any;
    return {
      games: (unwrap(games) as any[]).map(mapGame),
      draws,
      generated: (unwrap(gen) as any[]).map(mapGen),
      favourites: (unwrap(fav) as any[]).map(mapFav),
      settings: s ? { theme: s.theme, selected_game_id: s.selected_game_id, page_size: s.page_size } : { ...DEFAULT_SETTINGS },
    };
  }

  async saveGame(g: GameInput): Promise<Game> {
    const row = gameRow({ ...g, id: g.id ?? uid() });
    const res = await this.sb.from('lottery_games').upsert(row).select().single();
    return mapGame(unwrap(res));
  }

  async deleteGame(id: string) {
    unwrap(await this.sb.from('lottery_games').delete().eq('id', id));
  }

  async saveDraw(d: DrawInput): Promise<Draw> {
    const full = { ...d, id: d.id ?? uid() };
    const res = await this.sb.from('lottery_draws').upsert(drawRow(full)).select().single();
    const saved = unwrap(res) as any;
    unwrap(await this.sb.from('draw_numbers').delete().eq('draw_id', full.id));
    unwrap(await this.sb.from('draw_numbers').insert(numberRows(full)));
    return { ...mapDraw({ ...saved, draw_numbers: numberRows(full) }) };
  }

  async insertDraws(ds: DrawInput[]): Promise<Draw[]> {
    const full = ds.map((d) => ({ ...d, id: d.id ?? uid() }));
    const out: Draw[] = [];
    for (const part of chunk(full, 500)) {
      const res = await this.sb.from('lottery_draws').insert(part.map(drawRow)).select();
      const saved = unwrap(res) as any[];
      const byId = new Map(part.map((p) => [p.id, p]));
      const nums = part.flatMap(numberRows);
      for (const n of chunk(nums, 1000)) unwrap(await this.sb.from('draw_numbers').insert(n));
      saved.forEach((s) => out.push(mapDraw({ ...s, draw_numbers: numberRows(byId.get(s.id)!) })));
    }
    return out;
  }

  async deleteDraws(ids: string[]) {
    for (const part of chunk(ids, 200)) unwrap(await this.sb.from('lottery_draws').delete().in('id', part));
  }

  async addGenerated(items: GeneratedInput[]): Promise<Generated[]> {
    const res = await this.sb.from('generated_combinations').insert(items).select();
    return (unwrap(res) as any[]).map(mapGen).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  async clearGenerated(gameId: string) {
    unwrap(await this.sb.from('generated_combinations').delete().eq('game_id', gameId));
  }

  async saveFavourite(f: FavouriteInput): Promise<Favourite> {
    const row = { ...f, id: f.id ?? uid() };
    return mapFav(unwrap(await this.sb.from('favourite_combinations').upsert(row).select().single()));
  }

  async deleteFavourite(id: string) {
    unwrap(await this.sb.from('favourite_combinations').delete().eq('id', id));
  }

  async saveSettings(s: Settings) {
    unwrap(await this.sb.from('user_settings').upsert({ ...s }, { onConflict: 'user_id' }));
    return s;
  }

  async replaceAll(data: AppData) {
    // Deleting games cascades to draws, numbers, generated and favourites.
    const { data: ids } = await this.sb.from('lottery_games').select('id');
    for (const part of chunk((ids ?? []).map((r: any) => r.id as string), 200)) unwrap(await this.sb.from('lottery_games').delete().in('id', part));
    for (const part of chunk(data.games, 200)) unwrap(await this.sb.from('lottery_games').insert(part.map((g) => gameRow(g))));
    await this.insertDraws(data.draws.map((d) => ({ ...d })));
    for (const part of chunk(data.generated, 500)) unwrap(await this.sb.from('generated_combinations').insert(part.map(({ created_at, ...r }) => r)));
    for (const part of chunk(data.favourites, 500)) unwrap(await this.sb.from('favourite_combinations').insert(part.map(({ created_at, ...r }) => r)));
    await this.saveSettings(data.settings);
  }
}
