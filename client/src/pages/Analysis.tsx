import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch, qs } from '@/lib/api';
import type { Lottery } from '@/lib/types';
import { fmtDate, fmtNum, padNum } from '@/lib/utils';
import { Card, CardHeader, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner, StatCard, Table, Tabs, Td, Th } from '@/components/ui';
import { Balls, InfoNote, LotteryPicker, NumberBadge } from '@/components/shared';

interface Dist { label: string; count: number; pct: number }
interface Combo { numbers: number[]; count: number; pct: number }
interface AnalysisData {
  lottery: Lottery;
  disclaimer: string;
  summary: { drawCount: number; from: string | null; to: string | null; poolSize: number; neverDrawn: number[]; expectedPct: number | null };
  frequency: { number: number; count: number; drawsWith: number; pct: number; share: number; currentGap: number | null }[];
  mostFrequent: { number: number; count: number; pct: number }[];
  leastFrequent: { number: number; count: number; pct: number }[];
  hotCold: { window: number; hot: { number: number; count: number; pct: number }[]; cold: { number: number; count: number; pct: number }[] };
  gaps: { number: number; appearances: number; currentGap: number | null; avgGap: number | null; maxGap: number | null }[];
  oddEven: { distribution: Dist[]; oddShare: number; evenShare: number };
  highLow: { threshold: number; distribution: Dist[]; highShare: number; lowShare: number };
  consecutive: { drawsWithAny: number; pctWithAny: number; distribution: Dist[]; topPairs: Combo[] };
  sums: { min: number; max: number; average: number; median: number; histogram: { label: string; count: number }[]; trend: { date: string; ref: string | null; sum: number; movingAvg: number }[] };
  repeats: { average: number; distribution: Dist[]; recent: { date: string; ref: string | null; numbers: number[]; repeated: number[] }[]; trend: { date: string; repeated: number }[] };
  pairs: Combo[];
  triples: Combo[];
  bonus: { range: { min: number; max: number }; frequency: { number: number; count: number; pct: number }[] } | null;
  heatmap: { buckets: { label: string; from: string; to: string; draws: number }[]; rows: { number: number; counts: number[]; total: number }[]; max: number };
}

const NAVY = '#22335f';
const GOLD = '#e2b52c';
const BLUE = '#5a76b5';
const TABS = [['frequency', 'Frequency'], ['hotcold', 'Hot & Cold'], ['patterns', 'Patterns'], ['gaps', 'Gaps & intervals'], ['pairs', 'Pairs & combinations'], ['heatmap', 'Heatmap']].map(([id, label]) => ({ id, label }));
const tick = { fontSize: 11, fill: '#5a76b5' };

const Box = ({ children, h = 260 }: { children: React.ReactElement; h?: number }) => (
  <div style={{ height: h }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
);
const Section = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <Card><CardHeader title={title} description={description} /><div className="space-y-4 p-5">{children}</div></Card>
);

export default function Analysis() {
  const [sp, setSp] = useSearchParams();
  const lotteryId = sp.get('lottery') ?? '';
  const [period, setPeriod] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState('frequency');
  const params = period === 'range' ? { from, to } : period === 'all' ? {} : { last: period };
  const { data, loading, error, reload } = useFetch<AnalysisData>(lotteryId ? `/analysis/${lotteryId}${qs(params)}` : null);
  const pad = data?.lottery.rules.padDigits ?? 0;
  const lbl = (n: number) => padNum(n, pad);

  return (
    <>
      <PageHeader title="Number Analysis" subtitle="Frequency, patterns, gaps and combinations for any lottery and historical period." />
      <Card className="mb-6 p-4">
        <LotteryPicker value={lotteryId} onChange={(id) => setSp(id ? { lottery: id } : {}, { replace: true })} />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Historical period">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="10">Last 10 draws</option><option value="20">Last 20 draws</option><option value="50">Last 50 draws</option><option value="100">Last 100 draws</option><option value="all">All draws</option><option value="range">Custom date range</option>
            </Select>
          </Field>
          {period === 'range' && <><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
        </div>
      </Card>

      {loading && !data && <Spinner label="Crunching the numbers…" />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.summary.drawCount === 0 && <Empty title="No draws in this period">Try a different period or add results.</Empty>}
      {data && data.summary.drawCount > 0 && (
        <div className="space-y-5">
          <InfoNote>{data.disclaimer}</InfoNote>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Draws analysed" value={data.summary.drawCount} hint={`${fmtDate(data.summary.from)} → ${fmtDate(data.summary.to)}`} />
            <StatCard label="Numbers in pool" value={data.summary.poolSize} />
            <StatCard label="Never drawn" value={data.summary.neverDrawn.length} hint="in this period" />
            <StatCard tone="gold" label="Expected per number" value={data.summary.expectedPct != null ? `${fmtNum(data.summary.expectedPct, 1)}%` : '—'} hint="of draws if perfectly uniform" />
          </div>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />

          {tab === 'frequency' && (
            <div className="space-y-5">
              <Section title="Number frequency" description="How many times each number was drawn.">
                <Box><BarChart data={data.frequency.map((f) => ({ ...f, label: lbl(f.number) }))} margin={{ left: -12, right: 8 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={tick} interval="preserveStartEnd" /><YAxis tick={tick} allowDecimals={false} /><Tooltip formatter={(v: number, n) => [v, n === 'count' ? 'Times drawn' : n]} labelFormatter={(l) => `Number ${l}`} /><Bar dataKey="count" fill={NAVY} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></Box>
                <div className="grid gap-4 md:grid-cols-3">
                  <div><p className="mb-2 text-sm font-medium">Most frequent</p><div className="flex flex-wrap gap-2">{data.mostFrequent.slice(0, 6).map((f) => <div key={f.number} className="text-center"><NumberBadge n={f.number} pad={pad} /><p className="tabular text-xs text-navy-400">{f.count}×</p></div>)}</div></div>
                  <div><p className="mb-2 text-sm font-medium">Least frequent</p><div className="flex flex-wrap gap-2">{data.leastFrequent.slice(0, 6).map((f) => <div key={f.number} className="text-center"><NumberBadge n={f.number} pad={pad} bonus /><p className="tabular text-xs text-navy-400">{f.count}×</p></div>)}</div></div>
                  <div><p className="mb-2 text-sm font-medium">Never drawn</p>{data.summary.neverDrawn.length ? <div className="flex flex-wrap gap-1.5">{data.summary.neverDrawn.map((n) => <NumberBadge key={n} n={n} pad={pad} size="sm" muted />)}</div> : <p className="text-sm text-navy-400">Every number appeared at least once.</p>}</div>
                </div>
              </Section>
              <Section title="Occurrence table">
                <div className="max-h-96 overflow-y-auto rounded-lg border border-navy-100"><Table><thead className="sticky top-0"><tr><Th>Number</Th><Th>Times drawn</Th><Th>% of draws</Th><Th>Share of all picks</Th><Th>Draws since last</Th></tr></thead><tbody>{[...data.frequency].sort((a, b) => b.count - a.count || a.number - b.number).map((f) => <tr key={f.number}><Td><NumberBadge n={f.number} pad={pad} size="sm" /></Td><Td className="tabular">{f.count}</Td><Td className="tabular">{fmtNum(f.pct, 1)}%</Td><Td className="tabular">{fmtNum(f.share, 1)}%</Td><Td className="tabular">{f.currentGap ?? 'never'}</Td></tr>)}</tbody></Table></div>
              </Section>
              {data.bonus && <Section title="Bonus number frequency"><Box h={200}><BarChart data={data.bonus.frequency.map((f) => ({ ...f, label: lbl(f.number) }))} margin={{ left: -12, right: 8 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={tick} interval="preserveStartEnd" /><YAxis tick={tick} allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Times drawn" fill={GOLD} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></Box></Section>}
            </div>
          )}

          {tab === 'hotcold' && (
            <Section title="Hot and cold numbers" description={`Based on the most recent ${data.hotCold.window} draws in the selected period. Hot = most frequent, cold = least frequent. Change the period above to compare.`}>
              <div className="grid gap-5 md:grid-cols-2">
                {([['Hot numbers', data.hotCold.hot, NAVY, false], ['Cold numbers', data.hotCold.cold, BLUE, true]] as const).map(([title, rows, color, b]) => (
                  <div key={title} className="space-y-3">
                    <p className="font-medium">{title}</p>
                    <div className="flex flex-wrap gap-2">{rows.map((r) => <div key={r.number} className="text-center"><NumberBadge n={r.number} pad={pad} bonus={b} /><p className="tabular text-xs text-navy-400">{r.count}×</p></div>)}</div>
                    <Box h={200}><BarChart data={rows.map((r) => ({ ...r, label: lbl(r.number) }))} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={tick} /><YAxis tick={tick} allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Times drawn" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></Box>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {tab === 'patterns' && (
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <Section title="Odd vs even" description={`${fmtNum(data.oddEven.oddShare, 1)}% odd · ${fmtNum(data.oddEven.evenShare, 1)}% even`}>
                  <Box h={220}><BarChart data={data.oddEven.distribution} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={tick} /><YAxis tick={tick} unit="%" /><Tooltip formatter={(v: number) => [`${fmtNum(v, 1)}%`, 'Share of draws']} /><Bar dataKey="pct" fill={NAVY} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></Box>
                </Section>
                <Section title="High vs low" description={`Split at ${data.highLow.threshold}: ${fmtNum(data.highLow.highShare, 1)}% high · ${fmtNum(data.highLow.lowShare, 1)}% low`}>
                  <Box h={220}><BarChart data={data.highLow.distribution} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={tick} /><YAxis tick={tick} unit="%" /><Tooltip formatter={(v: number) => [`${fmtNum(v, 1)}%`, 'Share of draws']} /><Bar dataKey="pct" fill={GOLD} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></Box>
                </Section>
              </div>
              <Section title="Consecutive numbers" description={`${fmtNum(data.consecutive.pctWithAny, 1)}% of draws (${data.consecutive.drawsWithAny}) contained at least one pair of consecutive numbers such as 17 & 18.`}>
                <Box h={200}><BarChart data={data.consecutive.distribution} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={tick} /><YAxis tick={tick} unit="%" /><Tooltip formatter={(v: number) => [`${fmtNum(v, 1)}%`, 'Share of draws']} /><Bar dataKey="pct" fill={BLUE} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></Box>
                {data.consecutive.topPairs.length > 0 && <div><p className="mb-2 text-sm font-medium">Most common consecutive pairs</p><div className="flex flex-wrap gap-3">{data.consecutive.topPairs.slice(0, 6).map((c) => <div key={c.numbers.join('-')} className="flex items-center gap-1.5"><Balls main={c.numbers} rules={{ padDigits: pad }} size="sm" /><span className="text-xs text-navy-400">{c.count}×</span></div>)}</div></div>}
              </Section>
              <Section title="Number sum analysis" description={`Sum of the main numbers: min ${data.sums.min}, max ${data.sums.max}, average ${fmtNum(data.sums.average, 1)}, median ${data.sums.median}.`}>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Box h={220}><BarChart data={data.sums.histogram} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={{ ...tick, fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={50} /><YAxis tick={tick} allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Draws" fill={NAVY} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></Box>
                  <Box h={220}><LineChart data={data.sums.trend.slice(-150)} margin={{ left: -8, right: 8 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="date" tick={tick} minTickGap={40} tickFormatter={(d: string) => d.slice(2, 7)} /><YAxis tick={tick} domain={['auto', 'auto']} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /><Line dataKey="sum" name="Sum" stroke={BLUE} dot={false} strokeWidth={1.2} isAnimationActive={false} /><Line dataKey="movingAvg" name="10-draw average" stroke={GOLD} dot={false} strokeWidth={2} isAnimationActive={false} /></LineChart></Box>
                </div>
              </Section>
              <Section title="Repeats between consecutive draws" description={`On average ${fmtNum(data.repeats.average)} numbers per draw also appeared in the previous draw.`}>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Box h={200}><BarChart data={data.repeats.distribution} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={tick} /><YAxis tick={tick} unit="%" /><Tooltip formatter={(v: number) => [`${fmtNum(v, 1)}%`, 'Share of draws']} /><Bar dataKey="pct" fill={NAVY} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></Box>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-navy-100"><Table><thead className="sticky top-0"><tr><Th>Date</Th><Th>Repeated from previous</Th></tr></thead><tbody>{data.repeats.recent.map((r) => <tr key={r.date}><Td className="whitespace-nowrap">{fmtDate(r.date)}</Td><Td>{r.repeated.length ? <Balls main={r.repeated} rules={{ padDigits: pad }} size="sm" /> : <span className="text-navy-300">none</span>}</Td></tr>)}</tbody></Table></div>
                </div>
              </Section>
            </div>
          )}

          {tab === 'gaps' && (
            <Section title="Number gaps and intervals" description="Gap = draws between appearances. “Draws since last” is 0 if the number was in the latest draw. A long gap does not make a number “due”.">
              <Box><BarChart data={data.gaps.slice(0, 20).map((g) => ({ label: lbl(g.number), current: g.currentGap ?? data.summary.drawCount, avg: g.avgGap != null ? Math.round(g.avgGap * 10) / 10 : 0 }))} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={tick} /><YAxis tick={tick} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="current" name="Draws since last seen" fill={NAVY} radius={[3, 3, 0, 0]} isAnimationActive={false} /><Bar dataKey="avg" name="Average gap" fill={GOLD} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></Box>
              <div className="max-h-96 overflow-y-auto rounded-lg border border-navy-100"><Table><thead className="sticky top-0"><tr><Th>Number</Th><Th>Appearances</Th><Th>Draws since last</Th><Th>Average gap</Th><Th>Longest gap</Th></tr></thead><tbody>{data.gaps.map((g) => <tr key={g.number}><Td><NumberBadge n={g.number} pad={pad} size="sm" /></Td><Td className="tabular">{g.appearances}</Td><Td className="tabular">{g.currentGap ?? 'never'}</Td><Td className="tabular">{g.avgGap != null ? fmtNum(g.avgGap, 1) : '—'}</Td><Td className="tabular">{g.maxGap ?? '—'}</Td></tr>)}</tbody></Table></div>
            </Section>
          )}

          {tab === 'pairs' && (
            <div className="grid gap-5 lg:grid-cols-2">
              {([['Most frequent pairs', data.pairs], ['Most frequent triples', data.triples]] as const).map(([t, rows]) => (
                <Section key={t} title={t}>
                  {rows.length === 0 ? <p className="text-sm text-navy-400">Not enough numbers per draw.</p> : <div className="max-h-96 overflow-y-auto rounded-lg border border-navy-100"><Table><thead className="sticky top-0"><tr><Th>Numbers</Th><Th>Times</Th><Th>% of draws</Th></tr></thead><tbody>{rows.map((c) => <tr key={c.numbers.join('-')}><Td><Balls main={c.numbers} rules={{ padDigits: pad }} size="sm" /></Td><Td className="tabular">{c.count}</Td><Td className="tabular">{fmtNum(c.pct, 1)}%</Td></tr>)}</tbody></Table></div>}
                </Section>
              ))}
            </div>
          )}

          {tab === 'heatmap' && (
            <Section title="Frequency heatmap" description="Rows are numbers, columns are consecutive slices of the selected history (oldest → newest). Darker = drawn more often in that slice.">
              {data.heatmap.rows.length === 0 ? <p className="text-sm text-navy-400">Heatmap is available for pools of up to 100 numbers.</p> : (
                <div className="overflow-x-auto">
                  <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `3rem repeat(${data.heatmap.buckets.length}, minmax(2.6rem, 1fr)) 3rem` }}>
                    <div />{data.heatmap.buckets.map((b, i) => <div key={i} title={`${b.from} → ${b.to} (${b.draws} draws)`} className="text-center text-[10px] text-navy-400">{b.label}</div>)}<div className="text-center text-[10px] text-navy-400">Total</div>
                    {data.heatmap.rows.map((r) => (
                      <HeatRow key={r.number} row={r} max={data.heatmap.max} pad={pad} />
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}
        </div>
      )}
    </>
  );
}

function HeatRow({ row, max, pad }: { row: { number: number; counts: number[]; total: number }; max: number; pad: number }) {
  return (
    <>
      <div className="tabular pr-2 text-right text-xs font-semibold text-navy-700">{padNum(row.number, pad)}</div>
      {row.counts.map((c, i) => (
        <div key={i} title={`${padNum(row.number, pad)}: ${c}×`} className="tabular flex h-6 items-center justify-center rounded-sm text-[10px]" style={{ background: c === 0 ? '#f1f4fb' : `rgba(34,51,95,${0.15 + (0.85 * c) / max})`, color: c / max > 0.45 ? '#fff' : '#22335f' }}>
          {c || ''}
        </div>
      ))}
      <div className="tabular flex h-6 items-center justify-center text-[11px] font-semibold text-navy-700">{row.total}</div>
    </>
  );
}
