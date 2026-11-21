import type { Country, Lottery, LotteryCategory, LotteryDraw, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { isoDate, notFound } from '../http.js';
import { asRules, type Rules } from './rules.js';
import type { DrawRec } from './stats.js';

export type LotteryFull = Lottery & { country: Country; category: LotteryCategory | null };
export const lotteryInclude = { country: true, category: true } satisfies Prisma.LotteryInclude;

export const serializeLottery = (l: LotteryFull) => ({
  id: l.id,
  name: l.lotteryName,
  countryId: l.countryId,
  country: { id: l.country.id, name: l.country.countryName, code: l.country.countryCode, currency: l.country.currency },
  categoryId: l.categoryId,
  category: l.category ? { id: l.category.id, name: l.category.name } : null,
  stateRegion: l.stateRegion,
  provider: l.provider,
  currency: l.currency ?? l.country.currency,
  description: l.description,
  websiteUrl: l.websiteUrl,
  drawFrequency: l.drawFrequency,
  drawDays: l.drawDays,
  drawTime: l.drawTime,
  timezone: l.timezone,
  rules: l.rulesJson as unknown as Rules,
  status: l.status,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});

export const serializeDraw = (d: LotteryDraw) => ({
  id: d.id,
  lotteryId: d.lotteryId,
  drawDate: isoDate(d.drawDate),
  drawReference: d.drawReference,
  mainNumbers: d.mainNumbers as number[],
  bonusNumbers: d.bonusNumbers as number[],
  status: d.status,
  remarks: d.remarks,
  isSample: d.isSample,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

export async function getLottery(id: string, opts: { activeOnly?: boolean } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Lottery');
  const l = await prisma.lottery.findUnique({ where: { id }, include: lotteryInclude });
  if (!l || (opts.activeOnly && l.status !== 'ACTIVE')) throw notFound('Lottery');
  return l;
}

/** Published draws of a lottery as chronological analysis records (oldest first). */
export async function loadRecs(lotteryId: string, filter: { from?: string; to?: string; last?: number } = {}): Promise<DrawRec[]> {
  const where: Prisma.LotteryDrawWhereInput = { lotteryId, status: 'PUBLISHED' };
  if (filter.from || filter.to) where.drawDate = { ...(filter.from ? { gte: new Date(filter.from + 'T00:00:00Z') } : {}), ...(filter.to ? { lte: new Date(filter.to + 'T00:00:00Z') } : {}) };
  const rows = await prisma.lotteryDraw.findMany({
    where,
    orderBy: { drawDate: filter.last ? 'desc' : 'asc' },
    take: filter.last ?? 50000,
    select: { id: true, drawDate: true, drawReference: true, mainNumbers: true, bonusNumbers: true },
  });
  if (filter.last) rows.reverse();
  return rows.map((r) => ({ id: r.id, date: isoDate(r.drawDate), ref: r.drawReference, main: r.mainNumbers as number[], bonus: r.bonusNumbers as number[] }));
}

export { asRules };
