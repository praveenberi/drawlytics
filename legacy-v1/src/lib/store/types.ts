import type { AppData, Draw, DrawInput, Favourite, FavouriteInput, Game, GameInput, Generated, GeneratedInput, Settings } from '@/types';

/** Persistence contract — implemented by the local (browser) store and the Supabase store. */
export interface Store {
  readonly mode: 'local' | 'supabase';
  loadAll(): Promise<AppData>;
  saveGame(g: GameInput): Promise<Game>;
  deleteGame(id: string): Promise<void>;
  saveDraw(d: DrawInput): Promise<Draw>;
  insertDraws(ds: DrawInput[]): Promise<Draw[]>;
  deleteDraws(ids: string[]): Promise<void>;
  addGenerated(items: GeneratedInput[]): Promise<Generated[]>;
  clearGenerated(gameId: string): Promise<void>;
  saveFavourite(f: FavouriteInput): Promise<Favourite>;
  deleteFavourite(id: string): Promise<void>;
  saveSettings(s: Settings): Promise<Settings>;
  /** Wipe all data of the current user and replace it with the given data set (restore). */
  replaceAll(data: AppData): Promise<void>;
}
