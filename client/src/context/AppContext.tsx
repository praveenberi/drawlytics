import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
}
interface Ctx {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  toast: (text: string, kind?: 'ok' | 'error') => void;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error('useApp outside provider');
  return c;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: 'ok' | 'error' }[]>([]);

  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  useEffect(() => {
    api
      .get<{ user: User | null }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const value: Ctx = {
    user,
    ready,
    toast,
    login: async (email, password) => {
      const r = await api.post<{ user: User }>('/auth/login', { email, password });
      setUser(r.user);
      return r.user;
    },
    register: async (name, email, password) => {
      const r = await api.post<{ user: User }>('/auth/register', { name, email, password });
      setUser(r.user);
      return r.user;
    },
    logout: async () => {
      await api.post('/auth/logout');
      setUser(null);
    },
  };

  return (
    <C.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn('fade-in pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg', t.kind === 'error' ? 'border-red-200 bg-white text-red-700' : 'border-navy-100 bg-white text-navy-800')}>
            {t.text}
          </div>
        ))}
      </div>
    </C.Provider>
  );
}
