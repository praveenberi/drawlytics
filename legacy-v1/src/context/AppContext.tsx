import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, type AppData, type Draw, type DrawInput, type Favourite, type FavouriteInput, type Game, type GameInput, type Generated, type GeneratedInput, type Settings } from '@/types';
import type { Store } from '@/lib/store/types';
import { LocalStore, normaliseData } from '@/lib/store/local';
import { SupabaseStore } from '@/lib/store/supabase';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface Toast {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}

interface Ctx {
  mode: 'local' | 'supabase';
  authReady: boolean;
  session: Session | null;
  loading: boolean;
  loadError: string | null;
  data: AppData;
  game: Game | null;
  setGameId: (id: string) => void;
  signOut: () => Promise<void>;
  toast: (text: string, kind?: 'ok' | 'error') => void;
  saveGame: (g: GameInput) => Promise<Game | null>;
  deleteGame: (id: string) => Promise<boolean>;
  saveDraw: (d: DrawInput) => Promise<Draw | null>;
  importDraws: (ds: DrawInput[]) => Promise<Draw[] | null>;
  deleteDraws: (ids: string[]) => Promise<boolean>;
  addGenerated: (g: GeneratedInput[]) => Promise<Generated[] | null>;
  clearGenerated: (gameId: string) => Promise<boolean>;
  saveFavourite: (f: FavouriteInput) => Promise<Favourite | null>;
  deleteFavourite: (id: string) => Promise<boolean>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  restore: (d: AppData) => Promise<boolean>;
  reload: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
};

const EMPTY: AppData = normaliseData(null);

function applyTheme(theme: Settings['theme']) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('lotto-theme', theme);
  } catch {
    /* ignore */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const mode = isSupabaseConfigured ? 'supabase' : 'local';
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(mode === 'local');
  const [data, setData] = useState<AppData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const store: Store | null = useMemo(() => {
    if (mode === 'local') return new LocalStore();
    return session && supabase ? new SupabaseStore(supabase) : null;
  }, [mode, session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  // Auth session (Supabase mode only)
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: s }) => {
      setSession(s.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    if (!store) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setData(await store.loadAll());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => applyTheme(data.settings.theme), [data.settings.theme]);
  useEffect(() => {
    if (data.settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => applyTheme('system');
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [data.settings.theme]);

  const game = useMemo(() => data.games.find((g) => g.id === data.settings.selected_game_id) ?? data.games[0] ?? null, [data.games, data.settings.selected_game_id]);

  /** Run a store operation; on failure show a toast and return the fallback. */
  async function guard<T, F>(fn: (s: Store) => Promise<T>, fallback: F): Promise<T | F> {
    if (!store) return fallback;
    try {
      return await fn(store);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      return fallback;
    }
  }

  const updateSettings = async (patch: Partial<Settings>) => {
    const next = { ...data.settings, ...patch };
    setData((d) => ({ ...d, settings: next }));
    await guard((s) => s.saveSettings(next), null);
  };

  const value: Ctx = {
    mode,
    authReady,
    session,
    loading,
    loadError,
    data,
    game,
    setGameId: (id) => void updateSettings({ selected_game_id: id }),
    signOut: async () => {
      await supabase?.auth.signOut();
      setData(EMPTY);
    },
    toast,
    saveGame: async (g) => {
      const saved = await guard((s) => s.saveGame(g), null);
      if (saved) {
        setData((d) => ({ ...d, games: d.games.some((x) => x.id === saved.id) ? d.games.map((x) => (x.id === saved.id ? saved : x)) : [...d.games, saved] }));
        if (!data.settings.selected_game_id || !data.games.length) void updateSettings({ selected_game_id: saved.id });
      }
      return saved;
    },
    deleteGame: async (id) => {
      const ok = await guard(async (s) => (await s.deleteGame(id), true), false);
      if (ok)
        setData((d) => ({
          ...d,
          games: d.games.filter((g) => g.id !== id),
          draws: d.draws.filter((x) => x.game_id !== id),
          generated: d.generated.filter((x) => x.game_id !== id),
          favourites: d.favourites.filter((x) => x.game_id !== id),
          settings: d.settings.selected_game_id === id ? { ...d.settings, selected_game_id: null } : d.settings,
        }));
      return ok;
    },
    saveDraw: async (input) => {
      const saved = await guard((s) => s.saveDraw(input), null);
      if (saved) setData((d) => ({ ...d, draws: d.draws.some((x) => x.id === saved.id) ? d.draws.map((x) => (x.id === saved.id ? saved : x)) : [...d.draws, saved] }));
      return saved;
    },
    importDraws: async (ds) => {
      const saved = await guard((s) => s.insertDraws(ds), null);
      if (saved) setData((d) => ({ ...d, draws: [...d.draws, ...saved] }));
      return saved;
    },
    deleteDraws: async (ids) => {
      const ok = await guard(async (s) => (await s.deleteDraws(ids), true), false);
      if (ok) {
        const set = new Set(ids);
        setData((d) => ({ ...d, draws: d.draws.filter((x) => !set.has(x.id)) }));
      }
      return ok;
    },
    addGenerated: async (items) => {
      const saved = await guard((s) => s.addGenerated(items), null);
      if (saved) setData((d) => ({ ...d, generated: [...saved, ...d.generated] }));
      return saved;
    },
    clearGenerated: async (gameId) => {
      const ok = await guard(async (s) => (await s.clearGenerated(gameId), true), false);
      if (ok) setData((d) => ({ ...d, generated: d.generated.filter((x) => x.game_id !== gameId) }));
      return ok;
    },
    saveFavourite: async (f) => {
      const saved = await guard((s) => s.saveFavourite(f), null);
      if (saved) setData((d) => ({ ...d, favourites: d.favourites.some((x) => x.id === saved.id) ? d.favourites.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...d.favourites] }));
      return saved;
    },
    deleteFavourite: async (id) => {
      const ok = await guard(async (s) => (await s.deleteFavourite(id), true), false);
      if (ok) setData((d) => ({ ...d, favourites: d.favourites.filter((x) => x.id !== id) }));
      return ok;
    },
    updateSettings,
    restore: async (incoming) => {
      const clean = normaliseData(incoming);
      const ok = await guard(async (s) => (await s.replaceAll(clean), true), false);
      if (ok) await reload();
      return ok;
    },
    reload,
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn('pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-md', t.kind === 'error' ? 'border-destructive/40 bg-card text-destructive' : 'bg-card')}>
            {t.text}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}

export { DEFAULT_SETTINGS };
