import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, CalendarClock, Globe2, Search, Sparkles, Ticket } from 'lucide-react';
import { useFetch } from '@/lib/api';
import type { Draw, Lottery } from '@/lib/types';
import { fmtDate, flag, scheduleText } from '@/lib/utils';
import { Card, CardHeader, ErrorBox, Spinner, StatCard, Badge } from '@/components/ui';
import { Balls, DrawLine, LotteryLink, SampleBadge } from '@/components/shared';

interface Dash {
  countries: number;
  activeLotteries: number;
  latestResults: { draw: Draw; lottery: Lottery }[];
  recentlyAdded: { draw: Draw; lottery: Lottery }[];
  popular: { lottery: Lottery; predictions: number }[];
  upcoming: { date: string; lottery: Lottery }[];
}

export default function Home() {
  const { data, loading, error, reload } = useFetch<Dash>('/dashboard');
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const go = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 p-6 text-white shadow-card sm:p-10">
        <Badge tone="gold" className="mb-3">Global lottery results &amp; statistics</Badge>
        <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
          Explore lottery results from around the world — <span className="text-gold-400">analyse the numbers.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-navy-100">Browse historical draws, study frequency and patterns, and try statistical number suggestions. Draws are random — this is information and entertainment, not a prediction service.</p>
        <form onSubmit={go} className="mt-6 flex max-w-xl gap-2" role="search">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 size-4 text-navy-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Quick search" placeholder="Search by country, lottery, provider or date (YYYY-MM-DD)" className="h-11 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm text-navy-900 placeholder:text-navy-300" />
          </div>
          <button className="rounded-lg bg-gold-400 px-5 text-sm font-semibold text-navy-950 hover:bg-gold-300">Search</button>
        </form>
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link to="/analysis" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20"><BarChart3 className="size-4 text-gold-300" /> Number analysis</Link>
          <Link to="/suggestions" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20"><Sparkles className="size-4 text-gold-300" /> Number suggestions</Link>
          <Link to="/results/history" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20"><Ticket className="size-4 text-gold-300" /> Historical results</Link>
        </div>
      </section>

      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Countries covered" value={data.countries} />
            <StatCard label="Active lotteries" value={data.activeLotteries} />
            <StatCard label="Latest results" value={data.latestResults.length} hint="lotteries with results" />
            <StatCard tone="gold" label="Next draw" value={data.upcoming[0] ? fmtDate(data.upcoming[0].date).split(',')[0] : '—'} hint={data.upcoming[0]?.lottery.name} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Latest winning results" actions={<Link to="/results/latest" className="inline-flex items-center gap-1 text-sm font-medium text-navy-600 hover:text-gold-600">All results <ArrowRight className="size-4" /></Link>} />
              <div className="divide-y divide-navy-50">
                {data.latestResults.length === 0 && <p className="p-6 text-sm text-navy-400">No published results yet.</p>}
                {data.latestResults.map(({ draw, lottery }) => (
                  <div key={draw.id} className="space-y-2 px-5 py-4">
                    <div className="flex items-center gap-2"><LotteryLink l={lottery} />{draw.isSample && <SampleBadge />}</div>
                    <DrawLine draw={draw} lottery={lottery} />
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader title={<span className="flex items-center gap-2"><CalendarClock className="size-4 text-gold-500" /> Upcoming draws</span>} />
                <ul className="divide-y divide-navy-50 text-sm">
                  {data.upcoming.length === 0 && <li className="p-5 text-navy-400">No schedules configured.</li>}
                  {data.upcoming.map((u) => (
                    <li key={u.lottery.id} className="flex items-center justify-between gap-2 px-5 py-3">
                      <span className="min-w-0"><Link to={`/lotteries/${u.lottery.id}`} className="block truncate font-medium hover:text-gold-600">{u.lottery.name}</Link><span className="text-xs text-navy-400">{flag(u.lottery.country.code)} {u.lottery.country.name}</span></span>
                      <span className="shrink-0 text-right text-xs text-navy-500">{fmtDate(u.date)}<br />{u.lottery.drawTime ?? ''}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Popular lotteries" />
                <ul className="divide-y divide-navy-50 text-sm">
                  {data.popular.map((p) => (
                    <li key={p.lottery.id} className="px-5 py-3"><LotteryLink l={p.lottery} /></li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader title="Recently added results" description="Newest records in the database" />
            <div className="grid gap-px bg-navy-50 sm:grid-cols-2">
              {data.recentlyAdded.map(({ draw, lottery }) => (
                <div key={draw.id} className="space-y-1.5 bg-white px-5 py-4">
                  <div className="flex items-center gap-2 text-sm"><LotteryLink l={lottery} />{draw.isSample && <SampleBadge />}</div>
                  <Balls main={draw.mainNumbers} bonus={draw.bonusNumbers} rules={lottery.rules} size="sm" />
                  <p className="text-xs text-navy-400">Draw date {fmtDate(draw.drawDate)}</p>
                </div>
              ))}
            </div>
          </Card>

          <section className="grid gap-4 sm:grid-cols-3">
            {[
              { to: '/analysis', icon: BarChart3, t: 'Frequency & patterns', d: 'Hot/cold numbers, gaps, odd-even, pairs and heatmaps.' },
              { to: '/suggestions', icon: Sparkles, t: 'Statistical suggestions', d: 'Formula-based combinations — for entertainment only.' },
              { to: '/countries', icon: Globe2, t: 'Browse by country', d: 'Lotteries and formats from around the world.' },
            ].map((x) => (
              <Link key={x.to} to={x.to} className="group rounded-xl border border-navy-100 bg-white p-5 shadow-card transition hover:border-gold-300">
                <x.icon className="mb-2 size-6 text-gold-500" />
                <p className="font-semibold group-hover:text-gold-600">{x.t}</p>
                <p className="mt-1 text-sm text-navy-500">{x.d}</p>
              </Link>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
