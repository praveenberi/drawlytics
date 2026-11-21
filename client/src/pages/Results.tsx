import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react';
import { qs, useFetch } from '@/lib/api';
import type { Country, Draw, Lottery, Paged } from '@/lib/types';
import { flag, fmtDate } from '@/lib/utils';
import { Button, Card, CardHeader, Empty, ErrorBox, Field, Input, PageHeader, Pagination, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { Balls, DrawLine, LotteryLink, LotteryPicker, SampleBadge } from '@/components/shared';

export function LatestResults() {
  const [countryId, setCountryId] = useState('');
  const countries = useFetch<{ items: Country[] }>('/countries');
  const { data, loading, error, reload } = useFetch<{ items: { draw: Draw; lottery: Lottery }[] }>(`/results/latest${qs({ countryId, limit: 60 })}`);
  return (
    <>
      <PageHeader title="Latest Results" subtitle="The most recent published draw of every active lottery." actions={
        <Select value={countryId} onChange={(e) => setCountryId(e.target.value)} aria-label="Filter by country" className="w-52">
          <option value="">All countries</option>
          {countries.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>} />
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Empty title="No published results" />}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.items.map(({ draw, lottery }) => (
          <Card key={draw.id} className="p-5">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div><LotteryLink l={lottery} /><p className="text-xs text-navy-400">{lottery.provider}</p></div>
              {draw.isSample && <SampleBadge />}
            </div>
            <Balls main={draw.mainNumbers} bonus={draw.bonusNumbers} rules={lottery.rules} size="lg" />
            <p className="mt-3 text-sm text-navy-500">{fmtDate(draw.drawDate)}{draw.drawReference ? ` · Draw ${draw.drawReference}` : ''}</p>
            <div className="mt-3 flex gap-3 border-t border-navy-50 pt-3 text-xs font-medium">
              <Link to={`/results/history?lottery=${lottery.id}`} className="text-navy-600 hover:text-gold-600">History</Link>
              <Link to={`/analysis?lottery=${lottery.id}`} className="text-navy-600 hover:text-gold-600">Analysis</Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

export function HistoricalResults() {
  const [sp, setSp] = useSearchParams();
  const lotteryId = sp.get('lottery') ?? '';
  const setLottery = (id: string) => setSp(id ? { lottery: id } : {}, { replace: true });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [lotteryId, from, to, sort]);

  const lot = useFetch<Lottery>(lotteryId ? `/lotteries/${lotteryId}` : null);
  const params = { from, to, q: dq, sort };
  const { data, loading, error, reload } = useFetch<Paged<Draw>>(lotteryId ? `/lotteries/${lotteryId}/draws${qs({ ...params, page, pageSize: 20 })}` : null);
  const L = lot.data;

  return (
    <>
      <PageHeader title="Historical Results" subtitle="Browse every recorded draw, filter by date range, search by draw date or draw ID, and export to CSV." />
      <Card className="mb-6 p-4">
        <LotteryPicker value={lotteryId} onChange={setLottery} />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="From date"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} /></Field>
          <Field label="To date"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} /></Field>
          <Field label="Search draw date or draw ID">
            <div className="relative"><Search className="absolute left-3 top-3 size-4 text-navy-300" /><Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="2026-11-15, 2026-11 or D001" /></div>
          </Field>
        </div>
        {(from || to || q) && <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setFrom(''); setTo(''); setQ(''); }}>Clear filters</Button>}
      </Card>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {lotteryId && (
        <Card>
          <CardHeader
            title={L ? `${L.name} — ${data?.total ?? '…'} results` : 'Results'}
            actions={lotteryId && <a href={`/api/lotteries/${lotteryId}/draws/export.csv${qs({ ...params })}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-navy-200 px-3 text-xs font-medium hover:bg-navy-50"><Download className="size-3.5" /> Export CSV</a>}
          />
          {loading && !data ? <Spinner /> : data && data.items.length === 0 ? <div className="p-6"><Empty title="No results match your filters" /></div> : data && L && (
            <>
              <Table>
                <thead><tr>
                  <Th><button className="inline-flex items-center gap-1 uppercase" onClick={() => setSort(sort === 'desc' ? 'asc' : 'desc')}>Date {sort === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}</button></Th>
                  <Th>Draw ID</Th><Th>Winning numbers</Th><Th>Remarks</Th>
                </tr></thead>
                <tbody>
                  {data.items.map((d) => (
                    <tr key={d.id} className="hover:bg-navy-50/40">
                      <Td className="whitespace-nowrap font-medium">{fmtDate(d.drawDate)}</Td>
                      <Td className="tabular whitespace-nowrap text-navy-500">{d.drawReference ?? '—'}</Td>
                      <Td><Balls main={d.mainNumbers} bonus={d.bonusNumbers} rules={L.rules} size="sm" /></Td>
                      <Td className="text-xs text-navy-400">{d.isSample ? <SampleBadge /> : d.remarks}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="px-4 pb-4"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>
            </>
          )}
        </Card>
      )}
    </>
  );
}

export function SearchPage() {
  const [sp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const { data, loading, error, reload } = useFetch<{ lotteries: Lottery[]; draws: { draw: Draw; lottery: Lottery }[]; dateMatched: string | null }>(q ? `/search${qs({ q })}` : null);
  return (
    <>
      <PageHeader title={`Search: “${q}”`} subtitle="Matches lottery name, provider, country, category and draw date." />
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-6">
          {data.dateMatched && (
            <Card>
              <CardHeader title={`Draws on ${fmtDate(data.dateMatched)}`} />
              <div className="divide-y divide-navy-50">
                {data.draws.length === 0 && <p className="p-5 text-sm text-navy-400">No draws recorded on this date.</p>}
                {data.draws.map(({ draw, lottery }) => <div key={draw.id} className="space-y-2 px-5 py-4"><LotteryLink l={lottery} /><Balls main={draw.mainNumbers} bonus={draw.bonusNumbers} rules={lottery.rules} size="sm" /></div>)}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title={`Lotteries (${data.lotteries.length})`} />
            <div className="divide-y divide-navy-50">
              {data.lotteries.length === 0 && <p className="p-5 text-sm text-navy-400">No lotteries match.</p>}
              {data.lotteries.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div><LotteryLink l={l} /><p className="text-xs text-navy-400">{l.provider} · {l.category?.name ?? 'Uncategorised'}</p></div>
                  <div className="flex gap-3 text-xs font-medium"><Link to={`/results/history?lottery=${l.id}`} className="hover:text-gold-600">Results</Link><Link to={`/analysis?lottery=${l.id}`} className="hover:text-gold-600">Analysis</Link></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
