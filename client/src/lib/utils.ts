import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const fmtNum = (n: number | null | undefined, digits = 2) => (n == null ? '—' : n.toFixed(digits));
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const FREQ_LABEL = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', CUSTOM: 'Custom' } as const;
export const padNum = (n: number, pad: number) => String(n).padStart(pad, '0');

export function scheduleText(l: { drawFrequency: keyof typeof FREQ_LABEL; drawDays: number[]; drawTime: string | null; timezone: string }) {
  const days = l.drawFrequency === 'DAILY' && !l.drawDays.length ? 'Every day' : l.drawFrequency === 'MONTHLY' ? `Day ${l.drawDays.join(', ')} of month` : l.drawDays.map((d) => WEEKDAYS[d]).join(', ') || FREQ_LABEL[l.drawFrequency];
  return `${days}${l.drawTime ? ` · ${l.drawTime}` : ''} (${l.timezone})`;
}

export const rulesText = (r: { mainCount: number; minNumber: number; maxNumber: number; bonus: { count: number; minNumber: number; maxNumber: number; separatePool: boolean } | null; format?: string }) =>
  r.format ?? `${r.mainCount} from ${r.minNumber}–${r.maxNumber}${r.bonus ? ` + ${r.bonus.count} bonus` : ''}`;

export const flag = (code: string) => (code.length === 2 ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '🌐');
