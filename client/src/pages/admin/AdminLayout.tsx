import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, BarChart3, Calculator, Cpu, Globe2, History, LayoutDashboard, Ticket, Upload, Users, ScrollText } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/lotteries', label: 'Lotteries', icon: Ticket },
  { to: '/admin/countries', label: 'Countries & Categories', icon: Globe2 },
  { to: '/admin/results', label: 'Winning Numbers', icon: History },
  { to: '/admin/upload', label: 'Bulk Upload', icon: Upload },
  { to: '/admin/formulas', label: 'Prediction Formulas', icon: Calculator },
  { to: '/admin/algorithms', label: 'Algorithms', icon: Cpu },
  { to: '/admin/performance', label: 'Performance', icon: BarChart3 },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
];

/** Client-side guard for UX only — every admin API endpoint is protected server-side. */
export function AdminLayout() {
  const { user, ready } = useApp();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl bg-navy-900 p-2 shadow-card">
          <p className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-gold-400"><Activity className="size-3.5" /> Admin Panel</p>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-gold-400 text-navy-950' : 'text-navy-100 hover:bg-white/10')}>
                <Icon className="size-4" /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <div className="min-w-0"><Outlet /></div>
    </div>
  );
}
