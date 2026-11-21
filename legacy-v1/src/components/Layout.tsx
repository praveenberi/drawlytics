import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, FileSpreadsheet, History, LayoutDashboard, LogOut, Menu, Moon, Settings as SettingsIcon, Sparkles, Star, Sun, Ticket, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Badge } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/games', label: 'Lottery Games', icon: Ticket },
  { to: '/history', label: 'Winning History', icon: History },
  { to: '/analysis', label: 'Number Analysis', icon: BarChart3 },
  { to: '/generator', label: 'Combination Generator', icon: Sparkles },
  { to: '/favourites', label: 'My Favourites', icon: Star },
  { to: '/csv', label: 'CSV Import / Export', icon: FileSpreadsheet },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-muted')
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">7</span>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Lotto Insights</p>
        <p className="text-[11px] text-muted-foreground">Track · Analyse · Explore</p>
      </div>
    </div>
  );
}

export function Layout() {
  const { data, game, setGameId, updateSettings, mode, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const dark = document.documentElement.classList.contains('dark');

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen overflow-y-auto border-r bg-card lg:block">
        <Brand />
        <Nav />
      </aside>

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-card shadow-xl">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
            <Nav onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="app-header no-print sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">Game</span>
            <div className="w-full max-w-xs">
              <Select aria-label="Lottery game" value={game?.id ?? ''} onChange={(e) => setGameId(e.target.value)} disabled={!data.games.length}>
                {!data.games.length && <option value="">No games yet</option>}
                {data.games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {mode === 'local' && (
            <Badge variant="blue" className="hidden md:inline-flex" title="Supabase is not configured: data is stored in this browser only.">
              Local mode
            </Badge>
          )}
          <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}>
            {dark ? <Sun /> : <Moon />}
          </Button>
          {mode === 'supabase' && (
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
              <LogOut />
            </Button>
          )}
        </header>
        <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>
        <footer className="no-print mx-auto max-w-6xl px-3 pb-8 text-xs text-muted-foreground sm:px-6">
          Lotto Insights is a personal statistics tool. Lottery draws are random; past results do not predict future outcomes. Please play responsibly.
        </footer>
      </div>
    </div>
  );
}
