import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Search } from 'lucide-react';
import { qs, useFetch } from '@/lib/api';
import type { Category, Country, Draw, Lottery, Paged } from '@/lib/types';
import { FREQ_LABEL, flag, fmtDate, rulesText, scheduleText } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, Empty, ErrorBox, Input, PageHeader, Pagination, Select, Spinner } from '@/components/ui';
import { Balls, SampleBadge } from '@/components/shared';

export default function Lotteries() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [page, setPage] = useState(1);
  const countryId = sp.get('countryId') ?? '';
  const categoryId = sp.get('categoryId') ?? '';
  const frequency = sp.get('frequency') ?? '';
  const status = sp.get('status') ?? 'ACTIVE';
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
    setPage(1);
  };
  const [dq, setDq] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const countries = useFetch<{ items: Country[] }>('/countries');
  const cats = useFetch<{ items: Category[] }>('/categories');
  const { data, loading, error, reload } = useFetch<Paged<Lottery>>(`/lotteries${qs({ q: dq, countryId, categoryId, frequency, status, page, pageSize: 12 })}`);

  return (
    <>
      <PageHeader title="Lotteries" subtitle="Search and filter lotteries by country, category, provider and draw frequency." />
      <Card className="mb-6 p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 size-4 text-navy-300" />
            <Input className="pl-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, provider, country, category…" aria-label="Search lotteries" />
          </div>
          <Select value={countryId} onChange={(e) => set('countryId', e.target.value)} aria-label="Country">
            <option value="">All countries</option>
            {countries.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={categoryId} onChange={(e) => set('categoryId', e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {cats.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={frequency} onChange={(e) => set('frequency', e.target.value)} aria-label="Draw frequency">
            <option value="">Any frequency</option>
            {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-navy-500">
          <label className="flex items-center gap-2">
            Status
            <Select className="h-8 w-32 text-xs" value={status} onChange={(e) => set('status', e.target.value)} aria-label="Status">
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ALL">All</option>
            </Select>
          </label>
          <span className="text-xs text-navy-400">(inactive lotteries are only visible to administrators)</span>
          {(countryId || categoryId || frequency || q) && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setSp({}, { replace: true }); }}>Clear filters</Button>}
        </div>
      </Card>

      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Empty title="No lotteries match your filters" />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((l) => (
          <Card key={l.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link to={`/lotteries/${l.id}`} className="text-lg font-semibold hover:text-gold-600">{l.name}</Link>
                <p className="text-sm text-navy-500">{flag(l.country.code)} {l.country.name}{l.stateRegion ? ` · ${l.stateRegion}` : ''}</p>
              </div>
              {l.status === 'INACTIVE' && <Badge tone="gray">Inactive</Badge>}
            </div>
            <p className="mt-1 text-xs text-navy-400">{l.provider}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge>{rulesText(l.rules)}</Badge>
              {l.category && <Badge tone="gold">{l.category.name}</Badge>}
              <Badge tone="gray">{FREQ_LABEL[l.drawFrequency]}</Badge>
            </div>
            <div className="mt-4 flex-1">
              {l.latestDraw ? (
                <div className="space-y-1.5">
                  <Balls main={l.latestDraw.mainNumbers} bonus={l.latestDraw.bonusNumbers} rules={l.rules} size="sm" />
                  <p className="flex items-center gap-2 text-xs text-navy-400">Latest: {fmtDate(l.latestDraw.drawDate)} {l.latestDraw.isSample && <SampleBadge />}</p>
                </div>
              ) : <p className="text-xs text-navy-400">No results yet</p>}
            </div>
            <div className="mt-4 flex gap-2 border-t border-navy-50 pt-3">
              <Link to={`/results/history?lottery=${l.id}`} className="text-xs font-medium text-navy-600 hover:text-gold-600">Results</Link>
              <Link to={`/analysis?lottery=${l.id}`} className="text-xs font-medium text-navy-600 hover:text-gold-600">Analysis</Link>
              <Link to={`/suggestions?lottery=${l.id}`} className="text-xs font-medium text-navy-600 hover:text-gold-600">Suggestions</Link>
              {l.websiteUrl && <a href={l.websiteUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-navy-400 hover:text-navy-700">Website <ExternalLink className="size-3" /></a>}
            </div>
          </Card>
        ))}
      </div>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
