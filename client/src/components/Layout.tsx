import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, Menu, Search, Shield, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/countries', label: 'Countries' },
  { to: '/lotteries', label: 'Lotteries' },
  { to: '/results/latest', label: 'Latest Results' },
  { to: '/results/history', label: 'Historical Results' },
  { to: '/analysis', label: 'Number Analysis' },
  { to: '/suggestions', label: 'Number Suggestions' },
  { to: '/about', label: 'About' },
];

export function Logo({ light = true }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-gold-400 text-lg font-extrabold text-navy-950 shadow">7</span>
      <span className="leading-tight">
        <span className={cn('block text-lg font-bold tracking-tight', light ? 'text-white' : 'text-navy-900')}>
          Draw<span className="text-gold-400">lytics</span>
        </span>
        <span className={cn('block text-[10px] uppercase tracking-widest', light ? 'text-navy-300' : 'text-navy-400')}>Global Lottery Tracker</span>
      </span>
    </Link>
  );
}

export function Layout() {
  const { user, logout } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const links = [...NAV, ...(user?.role === 'ADMIN' ? [{ to: '/admin', label: 'Admin Panel' }] : [])];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) {
      nav(`/search?q=${encodeURIComponent(q.trim())}`);
      setOpen(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-navy-900 text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Logo />
          <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-0 xl:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={'end' in l ? l.end : false} className={({ isActive }) => cn('whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors', isActive ? 'bg-white/10 text-gold-300' : 'text-navy-100 hover:bg-white/5 hover:text-white', l.to === '/admin' && 'text-gold-300')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/lotteries" aria-label="Search lotteries" title="Search lotteries" className="ml-auto hidden rounded-md p-2 text-navy-200 hover:bg-white/10 md:block 2xl:hidden"><Search className="size-4" /></Link>
          <form onSubmit={submit} className="ml-auto hidden 2xl:block" role="search">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-navy-300" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Global search" className="h-9 w-64 rounded-lg border border-white/10 bg-white/10 pl-9 pr-3 text-sm text-white placeholder:text-navy-300 focus:bg-white/15" />
            </div>
          </form>
          {user ? (
            <div className="hidden items-center gap-2 md:flex">
              <span className="hidden text-sm text-navy-100 2xl:inline">{user.name}</span>
              <button onClick={() => logout().then(() => nav('/'))} className="rounded-md p-2 text-navy-200 hover:bg-white/10" aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <Link to="/login" className="hidden items-center gap-1.5 rounded-lg bg-gold-400 px-3.5 py-2 text-sm font-semibold text-navy-950 hover:bg-gold-300 md:inline-flex">
              <LogIn className="size-4" /> Sign in
            </Link>
          )}
          <button className="ml-auto rounded-md p-2 xl:hidden md:ml-0" onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="border-t border-white/10 px-4 pb-4 xl:hidden fade-in">
            <form onSubmit={submit} className="py-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Global search" className="h-10 w-full rounded-lg border border-white/10 bg-white/10 px-3 text-sm text-white placeholder:text-navy-300" />
            </form>
            <div className="grid gap-1">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={'end' in l ? l.end : false} onClick={() => setOpen(false)} className={({ isActive }) => cn('rounded-md px-3 py-2.5 text-sm font-medium', isActive ? 'bg-white/10 text-gold-300' : 'text-navy-100')}>
                  {l.label}
                </NavLink>
              ))}
              {user ? (
                <button className="rounded-md px-3 py-2.5 text-left text-sm text-navy-100" onClick={() => logout().then(() => { setOpen(false); nav('/'); })}>
                  Sign out ({user.name})
                </button>
              ) : (
                <Link to="/login" onClick={() => setOpen(false)} className="rounded-md bg-gold-400 px-3 py-2.5 text-center text-sm font-semibold text-navy-950">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 fade-in">
        <Outlet />
      </main>

      <footer className="bg-navy-950 text-navy-300">
        <div className="mx-auto max-w-7xl space-y-2 px-4 py-8 text-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Shield className="size-4 text-gold-400" /> Drawlytics – Global Lottery Tracker
          </div>
          <p>Lottery draws are random. Statistics and suggested numbers are for entertainment and information only and cannot predict or guarantee any result. Please play responsibly.</p>
          <p>Results marked SAMPLE are demonstration data, not real draws. Always confirm results with the official lottery operator.</p>
        </div>
      </footer>
    </div>
  );
}
