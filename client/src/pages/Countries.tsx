import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/api';
import type { Country } from '@/lib/types';
import { flag } from '@/lib/utils';
import { Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui';

export default function Countries() {
  const { data, loading, error, reload } = useFetch<{ items: Country[] }>('/countries');
  return (
    <>
      <PageHeader title="Countries" subtitle="Lotteries from around the world, grouped by country." />
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Empty title="No countries yet" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data?.items.map((c) => (
          <Link key={c.id} to={`/lotteries?countryId=${c.id}`} className="group rounded-xl border border-navy-100 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-gold-300">
            <div className="text-4xl">{flag(c.code)}</div>
            <p className="mt-3 text-lg font-semibold group-hover:text-gold-600">{c.name}</p>
            <p className="text-sm text-navy-500">{c.lotteryCount} active {c.lotteryCount === 1 ? 'lottery' : 'lotteries'}</p>
            <p className="mt-1 text-xs text-navy-400">{c.currency ?? '—'} · {c.timezone}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
