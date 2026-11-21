import type { DrawFrequency } from '@prisma/client';

interface ScheduleLottery {
  drawFrequency: DrawFrequency;
  drawDays: number[];
  drawTime: string | null;
  timezone: string;
}

function parts(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value])) as Record<string, string>;
}

function tzOffsetMs(date: Date, tz: string) {
  const p = parts(date, tz);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

const safeTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
};

/** The instant a draw on `dateISO` takes place (draw time in the lottery's time zone; end of day if no time). */
export function drawInstant(dateISO: string, time: string | null, tz: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = (time ?? '23:59').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - tzOffsetMs(new Date(guess), safeTz(tz)));
}

/** Upcoming draw dates (ISO) after `now`, according to the configured schedule. */
export function upcomingDrawDates(l: ScheduleLottery, count = 3, now = new Date()): string[] {
  const tz = safeTz(l.timezone);
  const p = parts(now, tz);
  const base = Date.UTC(+p.year, +p.month - 1, +p.day);
  const out: string[] = [];
  for (let i = 0; i < 400 && out.length < count; i++) {
    const dt = new Date(base + i * 86400000);
    const iso = dt.toISOString().slice(0, 10);
    const wd = dt.getUTCDay();
    const dom = dt.getUTCDate();
    const hit = l.drawFrequency === 'DAILY' && l.drawDays.length === 0 ? true : l.drawFrequency === 'MONTHLY' ? l.drawDays.includes(dom) : l.drawDays.includes(wd);
    if (hit && drawInstant(iso, l.drawTime, tz).getTime() > now.getTime()) out.push(iso);
  }
  return out;
}
