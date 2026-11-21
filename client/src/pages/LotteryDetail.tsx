import { Link, useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useFetch } from '@/lib/api';
import type { Lottery } from '@/lib/types';
import { FREQ_LABEL, flag, fmtDate, rulesText, scheduleText } from '@/lib/utils';
import { Badge, Card, CardHeader, ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { Balls, SampleBadge } from '@/components/shared';

export default function LotteryDetail() {
  const { id } = useParams();
  const { data: l, loading, error, reload } = useFetch<Lottery>(`/lotteries/${id}`);
  if (loading) return <Spinner />;
  if (error || !l) return <ErrorBox message={error ?? 'Not found'} onRetry={reload} />;
  const r = l.rules;
  const rows: [string, string][] = [
    ['Country', `${flag(l.country.code)} ${l.country.name}${l.stateRegion ? ` · ${l.stateRegion}` : ''}`],
    ['Provider', l.provider],
    ['Category', l.category?.name ?? '—'],
    ['Currency', l.currency ?? '—'],
    ['Draw schedule', scheduleText(l)],
    ['Main numbers', `${r.mainCount} numbers from ${r.minNumber} to ${r.maxNumber}${r.allowDuplicates ? ' (repeats allowed)' : ''}${r.ordered ? ', order matters' : ''}`],
    ['Bonus numbers', r.bonus ? `${r.bonus.count} from ${r.bonus.separatePool ? `${r.bonus.minNumber} to ${r.bonus.maxNumber}` : 'the same pool'}` : 'None'],
  ];
  return (
    <>
      <PageHeader
        title={l.name}
        subtitle={l.description ?? undefined}
        actions={<>
          <Link to={`/results/history?lottery=${l.id}`} className="inline-flex h-10 items-center rounded-lg border border-navy-200 bg-white px-4 text-sm font-medium hover:bg-navy-50">Historical results</Link>
          <Link to={`/analysis?lottery=${l.id}`} className="inline-flex h-10 items-center rounded-lg border border-navy-200 bg-white px-4 text-sm font-medium hover:bg-navy-50">Analysis</Link>
          <Link to={`/suggestions?lottery=${l.id}`} className="inline-flex h-10 items-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-navy-950 hover:bg-gold-300">Number suggestions</Link>
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Latest result" />
          <div className="space-y-3 p-5">
            {l.latestDraw ? (
              <>
                <Balls main={l.latestDraw.mainNumbers} bonus={l.latestDraw.bonusNumbers} rules={r} size="lg" />
                <p className="flex items-center gap-2 text-sm text-navy-500">
                  {fmtDate(l.latestDraw.drawDate)}{l.latestDraw.drawReference ? ` · Draw ${l.latestDraw.drawReference}` : ''} {l.latestDraw.isSample && <SampleBadge />}
                </p>
                {l.latestDraw.remarks && <p className="text-xs text-navy-400">{l.latestDraw.remarks}</p>}
              </>
            ) : <p className="text-sm text-navy-400">No published results yet.</p>}
            <p className="text-xs text-navy-400">{l.drawCount ?? 0} published draws in the database.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Upcoming draws" />
          <ul className="space-y-2 p-5 text-sm">
            {l.nextDrawDates?.length ? l.nextDrawDates.map((d) => <li key={d}>{fmtDate(d)}{l.drawTime ? ` · ${l.drawTime}` : ''}</li>) : <li className="text-navy-400">No schedule configured.</li>}
          </ul>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Lottery details" actions={<div className="flex gap-1.5"><Badge>{rulesText(r)}</Badge><Badge tone="gray">{FREQ_LABEL[l.drawFrequency]}</Badge>{l.status === 'INACTIVE' && <Badge tone="red">Inactive</Badge>}</div>} />
          <dl className="grid gap-px bg-navy-50 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k} className="bg-white px-5 py-3"><dt className="text-xs uppercase tracking-wide text-navy-400">{k}</dt><dd className="mt-0.5 text-sm font-medium">{v}</dd></div>
            ))}
            {l.websiteUrl && (
              <div className="bg-white px-5 py-3"><dt className="text-xs uppercase tracking-wide text-navy-400">Website</dt><dd className="mt-0.5 text-sm"><a href={l.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-navy-700 hover:text-gold-600">{l.websiteUrl} <ExternalLink className="size-3" /></a></dd></div>
            )}
          </dl>
        </Card>
      </div>
    </>
  );
}
