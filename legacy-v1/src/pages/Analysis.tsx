import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Printer } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { Empty, Table, Tabs, Td, Th } from '@/components/ui/misc';
import { Balls, NumberBall } from '@/components/NumberBall';
import { chartTick, chartTooltip, Disclaimer, InfoNote, PageHeader, StatCard } from '@/components/common';
import {
  PERIOD_OPTIONS, consecutiveRepeats, frequency, gapAnalysis, hotCold, leastFrequent, mostFrequent, neverDrawn, oddEven, parsePeriod, periodLabel,
  rangeAnalysis, repeatedCombinations, selectPeriod, sortChrono, sumTrend, topPairs, topTriples,
} from '@/lib/analysis';
import { exportFrequency, exportHotCold } from '@/lib/exports';
import { fmtDate, fmtPct } from '@/lib/utils';

const TABS = [
  { id: 'frequency', label: 'Frequency' },
  { id: 'hotcold', label: 'Hot & Cold' },
  { id: 'gaps', label: 'Gaps' },
  { id: 'oddeven', label: 'Odd / Even' },
  { id: 'ranges', label: 'Ranges' },
  { id: 'pairs', label: 'Pairs & Combos' },
  { id: 'history', label: 'Draw History' },
];

const C1 = 'hsl(var(--chart-1))';
const C2 = 'hsl(var(--chart-2))';
const C3 = 'hsl(var(--chart-3))';

function Section({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

const ChartBox = ({ children, h = 260 }: { children: React.ReactElement; h?: number }) => (
  <div style={{ height: h }} className="w-full">
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  </div>
);

export default function Analysis() {
  const { game, data } = useApp();
  const [tab, setTab] = useState('frequency');
  const [period, setPeriod] = useState('all');
  const [k, setK] = useState(10);
  const [bands, setBands] = useState(3);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    const after = () => setPrinting(false);
    window.addEventListener('afterprint', after);
    const t = setTimeout(() => window.print(), 400); // let charts lay out first
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
    };
  }, [printing]);

  const p = parsePeriod(period);
  const gameDraws = useMemo(() => (game ? data.draws.filter((d) => d.game_id === game.id) : []), [data.draws, game]);
  const chrono = useMemo(() => selectPeriod(sortChrono(gameDraws), p), [gameDraws, p]);

  const a = useMemo(() => {
    if (!game || !chrono.length) return null;
    const freq = frequency(chrono, game);
    return {
      freq,
      hc: hotCold(freq, Math.min(k, freq.length)),
      gaps: gapAnalysis(chrono, game),
      oe: oddEven(chrono),
      ra: rangeAnalysis(chrono, game, bands),
      pairs: topPairs(chrono, 20),
      triples: topTriples(chrono, 20),
      repeats: repeatedCombinations(chrono),
      cons: consecutiveRepeats(chrono),
      trend: sumTrend(chrono, 10),
    };
  }, [game, chrono, k, bands]);

  if (!game)
    return (
      <>
        <PageHeader title="Number Analysis" />
        <Empty title="Add a lottery game first">
          <Button asChild className="mt-2">
            <Link to="/games">Go to Lottery Games</Link>
          </Button>
        </Empty>
      </>
    );

  const show = (id: string) => printing || tab === id;
  const gapSorted = a ? [...a.gaps].sort((x, y) => (y.currentGap ?? Infinity) - (x.currentGap ?? Infinity) || x.number - y.number) : [];

  return (
    <>
      <PageHeader
        title="Number Analysis"
        description={`${game.name} · ${gameDraws.length} draws stored. Every figure is a transparent count over the stored results — the same data always gives the same output.`}
        actions={
          <Button variant="outline" onClick={() => setPrinting(true)} disabled={!a}>
            <Printer /> Print report
          </Button>
        }
      />
      <div className="mb-4">
        <Disclaimer long />
      </div>

      <Card className="no-print mb-4">
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
          <Field label="Historical period">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hot / cold list size">
            <Select value={k} onChange={(e) => setK(Number(e.target.value))}>
              {[5, 6, 8, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Range bands">
            <Select value={bands} onChange={(e) => setBands(Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} bands
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      {!a ? (
        <Empty title="No draws to analyse">
          <p>Record or import results for {game.name} to see statistics.</p>
          <Button asChild className="mt-3">
            <Link to="/history">Go to Winning History</Link>
          </Button>
        </Empty>
      ) : (
        <div className="space-y-4">
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          <p className="print-only text-sm">
            {game.name} · {periodLabel(p)} ({chrono.length} draws, {fmtDate(chrono[0].draw_date)} – {fmtDate(chrono[chrono.length - 1].draw_date)})
          </p>

          {show('frequency') && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Draws analysed" value={chrono.length} hint={periodLabel(p)} />
                <StatCard label="Numbers in pool" value={a.freq.length} hint={`${game.min_number}–${game.max_number}`} />
                <StatCard label="Never drawn" value={neverDrawn(a.freq).length} hint="in this dataset" />
                <StatCard label="Expected per number" value={fmtPct((game.main_count / a.freq.length) * 100)} hint="of draws, if perfectly uniform" />
              </div>
              <Section
                title="Number frequency"
                description="How often each number appeared as a main number."
                actions={
                  <Button size="sm" variant="outline" onClick={() => exportFrequency(game, data.draws, p)}>
                    <Download /> CSV
                  </Button>
                }
              >
                <ChartBox>
                  <BarChart data={a.freq} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="number" tick={chartTick} interval="preserveStartEnd" />
                    <YAxis tick={chartTick} allowDecimals={false} />
                    <Tooltip {...chartTooltip} formatter={(v: number) => [v, 'Times drawn']} labelFormatter={(l) => `Number ${l}`} />
                    <Bar dataKey="count" fill={C1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ChartBox>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="mb-2 text-sm font-medium">Most frequent</p>
                    <div className="flex flex-wrap gap-2">
                      {mostFrequent(a.freq, 6).map((f) => (
                        <div key={f.number} className="text-center">
                          <NumberBall n={f.number} />
                          <p className="tabular text-xs text-muted-foreground">{f.count}×</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Least frequent</p>
                    <div className="flex flex-wrap gap-2">
                      {leastFrequent(a.freq, 6).map((f) => (
                        <div key={f.number} className="text-center">
                          <NumberBall n={f.number} bonus />
                          <p className="tabular text-xs text-muted-foreground">{f.count}×</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Never drawn in this dataset</p>
                    {neverDrawn(a.freq).length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {neverDrawn(a.freq).map((n) => (
                          <NumberBall key={n} n={n} size="sm" muted />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Every number has appeared at least once.</p>
                    )}
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto rounded-md border">
                  <Table>
                    <thead className="sticky top-0 bg-card">
                      <tr>
                        <Th>Rank</Th>
                        <Th>Number</Th>
                        <Th>Times drawn</Th>
                        <Th>% of draws</Th>
                        <Th>As bonus</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...a.freq].sort((x, y) => x.rank - y.rank).map((f) => (
                        <tr key={f.number}>
                          <Td className="tabular">{f.rank}</Td>
                          <Td>
                            <NumberBall n={f.number} size="sm" />
                          </Td>
                          <Td className="tabular">{f.count}</Td>
                          <Td className="tabular">{fmtPct(f.pct)}</Td>
                          <Td className="tabular">{f.bonusCount}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </Section>
            </div>
          )}

          {show('hotcold') && (
            <Section
              title="Hot and cold numbers"
              description={`Hot = the ${Math.min(k, a.freq.length)} most-drawn numbers in the period; cold = the ${Math.min(k, a.freq.length)} least-drawn. Ties are broken by the lower number. Period: ${periodLabel(p)}.`}
              actions={
                <Button size="sm" variant="outline" onClick={() => exportHotCold(game, data.draws, p, k)}>
                  <Download /> CSV
                </Button>
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { title: 'Hot numbers', rows: a.hc.hot, color: C1 },
                  { title: 'Cold numbers', rows: a.hc.cold, color: C2 },
                ].map((g) => (
                  <div key={g.title} className="space-y-2">
                    <p className="text-sm font-medium">{g.title}</p>
                    <ChartBox h={220}>
                      <BarChart data={g.rows.map((r) => ({ ...r, label: String(r.number) }))} margin={{ left: -16, right: 8 }}>
                        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={chartTick} />
                        <YAxis tick={chartTick} allowDecimals={false} />
                        <Tooltip {...chartTooltip} formatter={(v: number) => [v, 'Times drawn']} labelFormatter={(l) => `Number ${l}`} />
                        <Bar dataKey="count" fill={g.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ChartBox>
                    <Table>
                      <thead>
                        <tr>
                          <Th>#</Th>
                          <Th>Number</Th>
                          <Th>Times</Th>
                          <Th>% of draws</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r, i) => (
                          <tr key={r.number}>
                            <Td className="tabular">{i + 1}</Td>
                            <Td>
                              <NumberBall n={r.number} size="sm" bonus={g.color === C2} />
                            </Td>
                            <Td className="tabular">{r.count}</Td>
                            <Td className="tabular">{fmtPct(r.pct)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                ))}
              </div>
              <InfoNote>Compare windows: switch the period above (10 / 20 / 50 / 100 / all) to see how “hot” and “cold” change. Small windows are dominated by chance.</InfoNote>
            </Section>
          )}

          {show('gaps') && (
            <Section title="Number gaps" description="Gap = number of draws between appearances. “Draws since last seen” is 0 if the number was in the latest draw.">
              <ChartBox>
                <BarChart data={gapSorted.slice(0, 20).map((g) => ({ number: String(g.number), gap: g.currentGap ?? chrono.length, avg: g.avgGap != null ? Math.round(g.avgGap * 10) / 10 : 0 }))} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="number" tick={chartTick} />
                  <YAxis tick={chartTick} allowDecimals={false} />
                  <Tooltip {...chartTooltip} labelFormatter={(l) => `Number ${l}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="gap" name="Draws since last seen" fill={C2} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="avg" name="Historical average gap" fill={C3} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ChartBox>
              <p className="text-xs text-muted-foreground">Chart: the 20 numbers with the longest current gaps.</p>
              <div className="max-h-[28rem] overflow-y-auto rounded-md border">
                <Table>
                  <thead className="sticky top-0 bg-card">
                    <tr>
                      <Th>Number</Th>
                      <Th>Appearances</Th>
                      <Th>Draws since last seen</Th>
                      <Th>Average gap</Th>
                      <Th>Longest gap</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {gapSorted.map((g) => (
                      <tr key={g.number}>
                        <Td>
                          <NumberBall n={g.number} size="sm" />
                        </Td>
                        <Td className="tabular">{g.appearances}</Td>
                        <Td className="tabular">{g.currentGap ?? 'never drawn'}</Td>
                        <Td className="tabular">{g.avgGap != null ? g.avgGap.toFixed(1) : '—'}</Td>
                        <Td className="tabular">{g.maxGap ?? '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Section>
          )}

          {show('oddeven') && (
            <Section title="Odd and even distribution" description={`Across all main numbers: ${fmtPct(a.oe.oddShare)} odd, ${fmtPct(a.oe.evenShare)} even.`}>
              <ChartBox h={240}>
                <BarChart data={a.oe.rows} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={chartTick} />
                  <YAxis tick={chartTick} unit="%" />
                  <Tooltip {...chartTooltip} formatter={(v: number, _n, item) => [`${(v as number).toFixed(1)}% (${(item.payload as { count: number }).count} draws)`, 'Share of draws']} />
                  <Bar dataKey="pct" fill={C1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ChartBox>
              <Table>
                <thead>
                  <tr>
                    <Th>Combination</Th>
                    <Th>Draws</Th>
                    <Th>% of draws</Th>
                  </tr>
                </thead>
                <tbody>
                  {a.oe.rows.map((r) => (
                    <tr key={r.label}>
                      <Td>{r.label}</Td>
                      <Td className="tabular">{r.count}</Td>
                      <Td className="tabular">{fmtPct(r.pct)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}

          {show('ranges') && (
            <Section title="Number range distribution" description={`The ${game.min_number}–${game.max_number} pool is split into ${a.ra.bands.length} equal bands. Change the number of bands above.`}>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartBox h={240}>
                  <BarChart data={a.ra.distribution} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={chartTick} interval={0} />
                    <YAxis tick={chartTick} unit="%" />
                    <Tooltip {...chartTooltip} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Share of numbers drawn']} />
                    <Bar dataKey="pct" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      {a.ra.distribution.map((_, i) => (
                        <Cell key={i} fill={i % 2 ? C2 : C1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartBox>
                <div className="max-h-60 overflow-y-auto rounded-md border">
                  <Table>
                    <thead className="sticky top-0 bg-card">
                      <tr>
                        <Th>Pattern ({a.ra.bands.map((_, i) => i + 1).join('-')})</Th>
                        <Th>Draws</Th>
                        <Th>%</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.ra.patterns.slice(0, 25).map((r) => (
                        <tr key={r.pattern}>
                          <Td className="tabular">{r.pattern}</Td>
                          <Td className="tabular">{r.count}</Td>
                          <Td className="tabular">{fmtPct(r.pct)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Band</Th>
                    <Th>Numbers drawn</Th>
                    <Th>Share</Th>
                  </tr>
                </thead>
                <tbody>
                  {a.ra.distribution.map((r) => (
                    <tr key={r.label}>
                      <Td>{r.label}</Td>
                      <Td className="tabular">{r.count}</Td>
                      <Td className="tabular">{fmtPct(r.pct)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}

          {show('pairs') && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Most common pairs" description="Pairs of main numbers drawn together.">
                  <ComboTable rows={a.pairs} />
                </Section>
                <Section title="Most common triples" description="Triples of main numbers drawn together.">
                  <ComboTable rows={a.triples} />
                </Section>
              </div>
              <Section title="Repeated combinations" description="Identical sets of main numbers that appeared in more than one draw.">
                {a.repeats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No complete combination has been repeated in this dataset ({chrono.length} draws).</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {a.repeats.map((r) => (
                      <li key={r.numbers.join('-')} className="flex flex-wrap items-center gap-2">
                        <Balls main={r.numbers} size="sm" />
                        <span className="text-muted-foreground">
                          drawn {r.draws.length}× ({r.draws.map((d) => d.draw_number || fmtDate(d.draw_date)).join(', ')})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          )}

          {show('history') && (
            <div className="space-y-4">
              <Section title="Draw sum trend" description="Sum of the main numbers in each draw, with a 10-draw moving average.">
                <ChartBox>
                  <LineChart data={a.trend} margin={{ left: -8, right: 8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={chartTick} minTickGap={30} />
                    <YAxis tick={chartTick} domain={['auto', 'auto']} />
                    <Tooltip {...chartTooltip} labelFormatter={(l, p) => `Draw ${l}${p?.[0] ? ` · ${fmtDate((p[0].payload as { date: string }).date)}` : ''}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="sum" name="Sum" stroke={C2} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="movingAvg" name="10-draw average" stroke={C3} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ChartBox>
              </Section>
              <Section title="Repeats from the previous draw" description={`On average ${a.cons.average.toFixed(2)} main numbers per draw also appeared in the draw before it.`}>
                {a.cons.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">At least two draws are needed.</p>
                ) : (
                  <>
                    <ChartBox h={200}>
                      <BarChart data={a.cons.distribution} margin={{ left: -16, right: 8 }}>
                        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={chartTick} />
                        <YAxis tick={chartTick} unit="%" />
                        <Tooltip {...chartTooltip} formatter={(v: number, _n, item) => [`${v.toFixed(1)}% (${(item.payload as { count: number }).count} draws)`, 'Share of draws']} />
                        <Bar dataKey="pct" fill={C1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ChartBox>
                    <div className="max-h-96 overflow-y-auto rounded-md border">
                      <Table>
                        <thead className="sticky top-0 bg-card">
                          <tr>
                            <Th>Draw</Th>
                            <Th>Date</Th>
                            <Th>Numbers</Th>
                            <Th>Repeated from previous</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...a.cons.rows].reverse().slice(0, printing ? 30 : 100).map((r) => (
                            <tr key={r.draw.id}>
                              <Td className="tabular">{r.draw.draw_number || '—'}</Td>
                              <Td className="whitespace-nowrap">{fmtDate(r.draw.draw_date)}</Td>
                              <Td>
                                <span className="inline-flex flex-wrap gap-1">
                                  {r.draw.main_numbers.map((n) => (
                                    <NumberBall key={n} n={n} size="sm" muted={!r.repeated.includes(n)} />
                                  ))}
                                </span>
                              </Td>
                              <Td className="tabular">{r.repeated.length ? r.repeated.join(', ') : '—'}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                    <p className="text-xs text-muted-foreground">Highlighted numbers also appeared in the previous draw.</p>
                  </>
                )}
              </Section>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ComboTable({ rows }: { rows: { numbers: number[]; count: number; pct: number }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Not enough data.</p>;
  return (
    <div className="max-h-96 overflow-y-auto rounded-md border">
      <Table>
        <thead className="sticky top-0 bg-card">
          <tr>
            <Th>Numbers</Th>
            <Th>Times</Th>
            <Th>% of draws</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.numbers.join('-')}>
              <Td>
                <Balls main={r.numbers} size="sm" />
              </Td>
              <Td className="tabular">{r.count}</Td>
              <Td className="tabular">{fmtPct(r.pct)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
