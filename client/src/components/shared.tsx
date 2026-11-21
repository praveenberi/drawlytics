import { useEffect, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Info, ShieldAlert } from 'lucide-react';
import { api, useFetch, qs } from '@/lib/api';
import { DISCLAIMER, SHORT_NOTE, type Draw, type Lottery, type Rules } from '@/lib/types';
import { cn, flag, fmtDate, padNum } from '@/lib/utils';
import { Badge, Select } from '@/components/ui';

export function NumberBadge({ n, pad = 0, bonus, size = 'md', muted }: { n: number; pad?: number; bonus?: boolean; size?: 'sm' | 'md' | 'lg'; muted?: boolean }) {
  return (
    <span
      title={bonus ? `Bonus number ${n}` : `Number ${n}`}
      className={cn(
        'tabular inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold shadow-sm',
        size === 'sm' ? 'size-7 text-xs' : size === 'md' ? 'size-9 text-sm' : 'size-12 text-lg',
        muted ? 'bg-slate-100 text-slate-500' : bonus ? 'bg-gradient-to-br from-gold-200 to-gold-400 text-navy-950 ring-2 ring-gold-300' : 'bg-gradient-to-br from-navy-600 to-navy-900 text-white',
      )}
    >
      {padNum(n, pad)}
    </span>
  );
}

export function Balls({ main, bonus, rules, size }: { main: number[]; bonus?: number[]; rules: Pick<Rules, 'padDigits'>; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {main.map((n, i) => (
        <NumberBadge key={i} n={n} pad={rules.padDigits} size={size} />
      ))}
      {bonus && bonus.length > 0 && <span className="px-0.5 text-navy-300">+</span>}
      {bonus?.map((n, i) => (
        <NumberBadge key={'b' + i} n={n} pad={rules.padDigits} size={size} bonus />
      ))}
    </span>
  );
}

export function PredictionDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <div role="note" className="flex gap-3 rounded-xl border border-gold-300 bg-gold-50 p-4 text-sm text-navy-800">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-gold-600" />
      <p>{compact ? `${SHORT_NOTE} ` : ''}{compact ? '' : DISCLAIMER}</p>
    </div>
  );
}
export const SampleBadge = () => (
  <Badge tone="gray" title="Demonstration data created by the seed script – not a real draw result">
    SAMPLE
  </Badge>
);

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-600">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function DrawLine({ draw, lottery }: { draw: Draw; lottery: Lottery }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Balls main={draw.mainNumbers} bonus={draw.bonusNumbers} rules={lottery.rules} />
      <span className="text-xs text-navy-400">
        {fmtDate(draw.drawDate)}
        {draw.drawReference ? ` · ${draw.drawReference}` : ''}
      </span>
    </div>
  );
}

export function LotteryLink({ l }: { l: Pick<Lottery, 'id' | 'name' | 'country'> }) {
  return (
    <Link to={`/lotteries/${l.id}`} className="font-semibold text-navy-900 hover:text-gold-600">
      {l.name}
      <span className="ml-1.5 text-xs font-normal text-navy-400">
        {flag(l.country.code)} {l.country.name}
      </span>
    </Link>
  );
}

/** Country → lottery selector. Selection is mirrored in the URL (?lottery=<id>) by the caller. */
export function LotteryPicker({ value, onChange, includeInactive }: { value: string; onChange: (id: string) => void; includeInactive?: boolean }) {
  const { data, loading } = useFetch<{ items: Lottery[] }>(`/lotteries/options${qs({ includeInactive: includeInactive ? 1 : undefined })}`);
  const items = data?.items ?? [];
  const countries = useMemo(() => {
    const m = new Map<string, { id: string; name: string; code: string }>();
    items.forEach((l) => m.set(l.countryId, l.country));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  const current = items.find((l) => l.id === value);
  const countryId = current?.countryId ?? countries[0]?.id ?? '';
  const inCountry = items.filter((l) => l.countryId === countryId);

  useEffect(() => {
    if (!loading && items.length && !current) onChange(items[0].id);
  }, [loading, items, current, onChange]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-navy-800">Country</span>
        <Select value={countryId} disabled={loading} onChange={(e) => onChange(items.find((l) => l.countryId === e.target.value)?.id ?? '')}>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {flag(c.code)} {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-navy-800">Lottery</span>
        <Select value={current?.id ?? ''} disabled={loading} onChange={(e) => onChange(e.target.value)}>
          {inCountry.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.status === 'INACTIVE' ? ' (inactive)' : ''}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

export { api };
