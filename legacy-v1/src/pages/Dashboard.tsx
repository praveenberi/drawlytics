import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, Plus, Printer } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Badge, Empty } from '@/components/ui/misc';
import { Balls, NumberBall } from '@/components/NumberBall';
import { chartTick, chartTooltip, Disclaimer, PageHeader, StatCard } from '@/components/common';
import { PERIOD_OPTIONS, frequency, leastFrequent, mostFrequent, parsePeriod, selectPeriod, sortChrono, sumTrend } from '@/lib/analysis';
import { fmtDate, fmtDateTime, nextDrawDates, WEEKDAYS } from '@/lib/utils';
import { SOURCE_LABEL } from '@/types';

export default function Dashboard() {
  const { data, game } = useApp();
  const [period, setPeriod] = useState('all');

  const gameDraws = useMemo(() => (game ? data.draws.filter((d) => d.game_id === game.id) : []), [data.draws, game]);
  const chrono = useMemo(() => sortChrono(gameDraws), [gameDraws]);
  const analysed = useMemo(() => selectPeriod(chrono, parsePeriod(period)), [chrono, period]);
  const freq = useMemo(() => (game ? frequency(analysed, game) : []), [analysed, game]);
  const latest = chrono[chrono.length - 1];
  const recent = useMemo(() => [...gameDraws].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5), [gameDraws]);
  const trend = useMemo(() => sumTrend(chrono.slice(-60), 10), [chrono]);
  const upcoming = useMemo(
    () =>
      data.games
        .flatMap((g) => nextDrawDates(g, 2).map((date) => ({ game: g, date })))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(0, 6),
    [data.games],
  );

  if (!data.games.length)
    return (
      <>
        <PageHeader title="Dashboard" description="Welcome to Lotto Insights — your personal lottery database and statistics tool." />
        <Empty title="Start by adding a lottery game">
          <p>Define the number format of any lottery, then record or import its results.</p>
          <Button asChild className="mt-3">
            <Link to="/games">
              <Plus /> Add lottery game
            </Link>
          </Button>
        </Empty>
        <div className="mt-4">
          <Disclaimer long />
        </div>
      </>
    );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={game ? `Overview of ${game.name}. Switch games with the selector above.` : undefined}
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        }
      />
      <div className="mb-4">
        <Disclaimer />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Lottery games" value={data.games.length} />
        <StatCard label="Total draws recorded" value={data.draws.length} hint="across all games" />
        <StatCard label={`${game?.name ?? ''} draws`} value={gameDraws.length} />
        <StatCard label="Latest draw" value={latest ? fmtDate(latest.draw_date) : '—'} hint={latest?.draw_number ? `Draw #${latest.draw_number}` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Latest winning numbers</CardTitle>
            <CardDescription>{latest ? `${fmtDate(latest.draw_date)}${latest.draw_number ? ` · Draw #${latest.draw_number}` : ''}` : 'No results yet'}</CardDescription>
          </CardHeader>
          <CardContent>
            {latest ? (
              <Balls main={latest.main_numbers} bonus={latest.bonus_numbers} size="lg" />
            ) : (
              <div className="text-sm text-muted-foreground">
                <p>No results recorded for this game.</p>
                <div className="mt-3 flex gap-2">
                  <Button asChild size="sm">
                    <Link to="/history">Add a result</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/csv">Import CSV</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4" /> Upcoming draws
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Set draw days on a game to see its schedule.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcoming.map((u) => (
                  <li key={u.game.id + u.date} className="flex items-center justify-between gap-2">
                    <span className="truncate">{u.game.name}</span>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {WEEKDAYS[new Date(u.date + 'T00:00:00').getDay()]} {fmtDate(u.date)}
                      {u.game.draw_time && ` · ${u.game.draw_time}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {gameDraws.length > 0 && game && (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Frequency overview</h2>
            <div className="no-print w-44">
              <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}>
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Most frequently drawn</CardTitle>
                <CardDescription>Top 6 in the selected period</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {mostFrequent(freq, 6).map((f) => (
                  <div key={f.number} className="text-center">
                    <NumberBall n={f.number} size="lg" />
                    <p className="tabular mt-1 text-xs text-muted-foreground">{f.count}×</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Least frequently drawn</CardTitle>
                <CardDescription>Bottom 6 in the selected period</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {leastFrequent(freq, 6).map((f) => (
                  <div key={f.number} className="text-center">
                    <NumberBall n={f.number} size="lg" bonus />
                    <p className="tabular mt-1 text-xs text-muted-foreground">{f.count}×</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Number frequency</CardTitle>
                <CardDescription>Times each number was drawn · {analysed.length} draws</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={freq} margin={{ left: -16, right: 8 }}>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="number" tick={chartTick} interval="preserveStartEnd" />
                      <YAxis tick={chartTick} allowDecimals={false} />
                      <Tooltip {...chartTooltip} formatter={(v: number) => [v, 'Times drawn']} labelFormatter={(l) => `Number ${l}`} />
                      <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Winning number trend</CardTitle>
                <CardDescription>Sum of main numbers, last {trend.length} draws, with 10-draw average</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ left: -8, right: 8 }}>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={chartTick} minTickGap={30} />
                      <YAxis tick={chartTick} domain={['auto', 'auto']} />
                      <Tooltip {...chartTooltip} labelFormatter={(l, p) => `Draw ${l}${p?.[0] ? ` · ${fmtDate((p[0].payload as { date: string }).date)}` : ''}`} />
                      <Line type="monotone" dataKey="sum" name="Sum" stroke="hsl(var(--chart-2))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="movingAvg" name="10-draw average" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Recently added results</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {recent.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="space-y-1">
                      <p className="text-sm">
                        {d.draw_number ? `#${d.draw_number} · ` : ''}
                        {fmtDate(d.draw_date)}
                      </p>
                      <Balls main={d.main_numbers} bonus={d.bonus_numbers} size="sm" />
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <Badge variant={d.source === 'manual' ? 'muted' : 'blue'}>{SOURCE_LABEL[d.source]}</Badge>
                      <p className="mt-1">added {fmtDateTime(d.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
