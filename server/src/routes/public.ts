import { Router } from 'express';
import Papa from 'papaparse';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, h, isoDate, parse } from '../http.js';
import { asRules, getLottery, loadRecs, lotteryInclude, serializeDraw, serializeLottery } from '../services/data.js';
import { computeAnalysis } from '../services/stats.js';
import { parseDate } from '../services/importer.js';
import { upcomingDrawDates } from '../services/schedule.js';
import { defaultFormulaConfig, formulaConfigSchema } from '../services/engine.js';
import { templateHeaders } from '../services/importer.js';

export const publicRouter = Router();

const isAdmin = (req: { user?: { role: string } }) => req.user?.role === 'ADMIN';
const page = z.coerce.number().int().min(1).default(1);
const pageSize = (max = 100, def = 20) => z.coerce.number().int().min(1).max(max).default(def);
const isoOpt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional();

// ---------- reference data ----------
publicRouter.get(
  '/countries',
  h(async (_req, res) => {
    const rows = await prisma.country.findMany({ orderBy: { countryName: 'asc' }, include: { _count: { select: { lotteries: { where: { status: 'ACTIVE' } } } } } });
    res.json({ items: rows.map((c) => ({ id: c.id, name: c.countryName, code: c.countryCode, currency: c.currency, timezone: c.timezone, lotteryCount: c._count.lotteries })) });
  }),
);

publicRouter.get(
  '/categories',
  h(async (_req, res) => {
    const rows = await prisma.lotteryCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { lotteries: true } } } });
    res.json({ items: rows.map((c) => ({ id: c.id, name: c.name, description: c.description, lotteryCount: c._count.lotteries })) });
  }),
);

// ---------- lotteries ----------
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  countryId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  page,
  pageSize: pageSize(),
});

publicRouter.get(
  '/lotteries',
  h(async (req, res) => {
    const q = parse(listQuery, req.query);
    const where: Prisma.LotteryWhereInput = {};
    if (!isAdmin(req) || q.status === 'ACTIVE') where.status = 'ACTIVE';
    else if (q.status === 'INACTIVE') where.status = 'INACTIVE';
    if (q.countryId) where.countryId = q.countryId;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.frequency) where.drawFrequency = q.frequency;
    if (q.q) {
      const c = { contains: q.q, mode: 'insensitive' as const };
      where.OR = [{ lotteryName: c }, { provider: c }, { stateRegion: c }, { country: { countryName: c } }, { category: { name: c } }];
    }
    const [total, rows] = await Promise.all([
      prisma.lottery.count({ where }),
      prisma.lottery.findMany({ where, include: lotteryInclude, orderBy: [{ country: { countryName: 'asc' } }, { lotteryName: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    const ids = rows.map((r) => r.id);
    const latest = ids.length ? await prisma.lotteryDraw.findMany({ where: { lotteryId: { in: ids }, status: 'PUBLISHED' }, orderBy: { drawDate: 'desc' }, distinct: ['lotteryId'] }) : [];
    const latestBy = new Map(latest.map((d) => [d.lotteryId, serializeDraw(d)]));
    res.json({ total, page: q.page, pageSize: q.pageSize, items: rows.map((l) => ({ ...serializeLottery(l), latestDraw: latestBy.get(l.id) ?? null, nextDrawDates: upcomingDrawDates(l, 1) })) });
  }),
);

publicRouter.get(
  '/lotteries/options',
  h(async (req, res) => {
    const where: Prisma.LotteryWhereInput = isAdmin(req) && req.query.includeInactive === '1' ? {} : { status: 'ACTIVE' };
    const rows = await prisma.lottery.findMany({ where, include: lotteryInclude, orderBy: [{ country: { countryName: 'asc' } }, { lotteryName: 'asc' }] });
    res.json({ items: rows.map(serializeLottery) });
  }),
);

publicRouter.get(
  '/lotteries/:id',
  h(async (req, res) => {
    const l = await getLottery(req.params.id, { activeOnly: !isAdmin(req) });
    const [latest, drawCount, formula] = await Promise.all([
      prisma.lotteryDraw.findFirst({ where: { lotteryId: l.id, status: 'PUBLISHED' }, orderBy: { drawDate: 'desc' } }),
      prisma.lotteryDraw.count({ where: { lotteryId: l.id, status: 'PUBLISHED' } }),
      prisma.predictionFormula.findFirst({ where: { lotteryId: l.id, isActive: true } }),
    ]);
    res.json({ ...serializeLottery(l), latestDraw: latest ? serializeDraw(latest) : null, drawCount, nextDrawDates: upcomingDrawDates(l, 5), activeFormula: formula ? { id: formula.id, name: formula.formulaName, version: formula.version } : null });
  }),
);

// ---------- draws ----------
const drawsQuery = z.object({ from: isoOpt, to: isoOpt, q: z.string().trim().max(64).optional(), sort: z.enum(['asc', 'desc']).default('desc'), status: z.enum(['PUBLISHED', 'PENDING', 'ALL']).default('PUBLISHED'), page, pageSize: pageSize(200, 20) });

function drawWhere(req: Parameters<typeof isAdmin>[0], lotteryId: string, q: z.infer<typeof drawsQuery>): Prisma.LotteryDrawWhereInput {
  const where: Prisma.LotteryDrawWhereInput = { lotteryId };
  if (!isAdmin(req) || q.status === 'PUBLISHED') where.status = 'PUBLISHED';
  else if (q.status === 'PENDING') where.status = 'PENDING';
  const date: Prisma.DateTimeFilter = {};
  if (q.from) date.gte = new Date(q.from + 'T00:00:00Z');
  if (q.to) date.lte = new Date(q.to + 'T00:00:00Z');
  if (q.q) {
    const t = q.q.trim();
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : parseDate(t, 'dmy');
    const month = t.match(/^(\d{4})-(\d{2})$/);
    if (iso) where.OR = [{ drawDate: new Date(iso + 'T00:00:00Z') }, { drawReference: { contains: t, mode: 'insensitive' } }];
    else if (month) {
      const start = new Date(`${month[1]}-${month[2]}-01T00:00:00Z`);
      if (!isNaN(start.getTime())) where.OR = [{ drawDate: { gte: start, lt: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) } }, { drawReference: { contains: t, mode: 'insensitive' } }];
      else where.drawReference = { contains: t, mode: 'insensitive' };
    } else where.drawReference = { contains: t, mode: 'insensitive' };
  }
  if (Object.keys(date).length) where.drawDate = date;
  return where;
}

publicRouter.get(
  '/lotteries/:id/draws',
  h(async (req, res) => {
    const l = await getLottery(req.params.id, { activeOnly: !isAdmin(req) });
    const q = parse(drawsQuery, req.query);
    const where = drawWhere(req, l.id, q);
    const [total, rows] = await Promise.all([prisma.lotteryDraw.count({ where }), prisma.lotteryDraw.findMany({ where, orderBy: { drawDate: q.sort }, skip: (q.page - 1) * q.pageSize, take: q.pageSize })]);
    res.json({ total, page: q.page, pageSize: q.pageSize, items: rows.map(serializeDraw) });
  }),
);

/** Spreadsheet formula-injection guard for free-text cells. */
const safeCell = (v: string | null) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v ?? '');

publicRouter.get(
  '/lotteries/:id/draws/export.csv',
  h(async (req, res) => {
    const l = await getLottery(req.params.id, { activeOnly: !isAdmin(req) });
    const rules = asRules(l.rulesJson);
    const q = parse(drawsQuery, req.query);
    const rows = await prisma.lotteryDraw.findMany({ where: drawWhere(req, l.id, q), orderBy: { drawDate: q.sort }, take: 50000 });
    const headers = templateHeaders(rules).filter((x) => x !== 'remarks');
    const data = rows.map((d) => {
      const main = d.mainNumbers as number[];
      const bonus = d.bonusNumbers as number[];
      return [isoDate(d.drawDate), safeCell(d.drawReference), ...Array.from({ length: rules.mainCount }, (_, i) => main[i] ?? ''), ...(rules.bonus ? Array.from({ length: rules.bonus.count }, (_, i) => bonus[i] ?? '') : []), safeCell(d.remarks), d.isSample ? 'SAMPLE' : ''];
    });
    const csv = '﻿' + Papa.unparse({ fields: [...headers, 'remarks', 'data_flag'], data }, { newline: '\r\n' }) + '\r\n';
    const name = `${l.lotteryName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-results.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(csv);
  }),
);

publicRouter.get(
  '/results/latest',
  h(async (req, res) => {
    const q = parse(z.object({ countryId: z.string().uuid().optional(), limit: pageSize(100, 30) }), req.query);
    const rows = await prisma.lotteryDraw.findMany({
      where: { status: 'PUBLISHED', lottery: { status: 'ACTIVE', ...(q.countryId ? { countryId: q.countryId } : {}) } },
      orderBy: { drawDate: 'desc' },
      distinct: ['lotteryId'],
      take: q.limit,
      include: { lottery: { include: lotteryInclude } },
    });
    res.json({ items: rows.map((d) => ({ draw: serializeDraw(d), lottery: serializeLottery(d.lottery) })) });
  }),
);

// ---------- global search ----------
publicRouter.get(
  '/search',
  h(async (req, res) => {
    const q = parse(z.object({ q: z.string().trim().min(1).max(100) }), req.query).q;
    const c = { contains: q, mode: 'insensitive' as const };
    const iso = parseDate(q, 'dmy');
    const [lotteries, draws] = await Promise.all([
      prisma.lottery.findMany({ where: { status: 'ACTIVE', OR: [{ lotteryName: c }, { provider: c }, { country: { countryName: c } }, { country: { countryCode: c } }, { category: { name: c } }] }, include: lotteryInclude, take: 30, orderBy: { lotteryName: 'asc' } }),
      iso ? prisma.lotteryDraw.findMany({ where: { drawDate: new Date(iso + 'T00:00:00Z'), status: 'PUBLISHED', lottery: { status: 'ACTIVE' } }, include: { lottery: { include: lotteryInclude } }, take: 50 }) : Promise.resolve([]),
    ]);
    res.json({ lotteries: lotteries.map(serializeLottery), draws: draws.map((d) => ({ draw: serializeDraw(d), lottery: serializeLottery(d.lottery) })), dateMatched: iso });
  }),
);

// ---------- public dashboard ----------
publicRouter.get(
  '/dashboard',
  h(async (_req, res) => {
    const [lotteries, latest, recent, popularRows] = await Promise.all([
      prisma.lottery.findMany({ where: { status: 'ACTIVE' }, include: lotteryInclude }),
      prisma.lotteryDraw.findMany({ where: { status: 'PUBLISHED', lottery: { status: 'ACTIVE' } }, orderBy: { drawDate: 'desc' }, distinct: ['lotteryId'], take: 8, include: { lottery: { include: lotteryInclude } } }),
      prisma.lotteryDraw.findMany({ where: { status: 'PUBLISHED', lottery: { status: 'ACTIVE' } }, orderBy: { createdAt: 'desc' }, take: 8, include: { lottery: { include: lotteryInclude } } }),
      prisma.prediction.groupBy({ by: ['lotteryId'], _count: { _all: true }, orderBy: { _count: { lotteryId: 'desc' } }, take: 6 }),
    ]);
    const byId = new Map(lotteries.map((l) => [l.id, l]));
    let popular = popularRows.map((r) => ({ lottery: byId.get(r.lotteryId), score: r._count._all })).filter((x) => x.lottery) as { lottery: (typeof lotteries)[number]; score: number }[];
    if (popular.length < 6) {
      const counts = await prisma.lotteryDraw.groupBy({ by: ['lotteryId'], _count: { _all: true }, where: { status: 'PUBLISHED' }, orderBy: { _count: { lotteryId: 'desc' } }, take: 12 });
      for (const r of counts) if (popular.length < 6 && !popular.some((p) => p.lottery.id === r.lotteryId) && byId.has(r.lotteryId)) popular.push({ lottery: byId.get(r.lotteryId)!, score: 0 });
    }
    const upcoming = lotteries
      .flatMap((l) => upcomingDrawDates(l, 1).map((date) => ({ date, lottery: serializeLottery(l) })))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 8);
    res.json({
      countries: new Set(lotteries.map((l) => l.countryId)).size,
      activeLotteries: lotteries.length,
      latestResults: latest.map((d) => ({ draw: serializeDraw(d), lottery: serializeLottery(d.lottery) })),
      recentlyAdded: recent.map((d) => ({ draw: serializeDraw(d), lottery: serializeLottery(d.lottery) })),
      popular: popular.map((p) => ({ lottery: serializeLottery(p.lottery), predictions: p.score })),
      upcoming,
    });
  }),
);

// ---------- analysis ----------
publicRouter.get(
  '/analysis/:lotteryId',
  h(async (req, res) => {
    const l = await getLottery(req.params.lotteryId, { activeOnly: !isAdmin(req) });
    const q = parse(z.object({ last: z.coerce.number().int().min(1).max(50000).optional(), from: isoOpt, to: isoOpt, hotWindow: z.coerce.number().int().min(1).max(1000).optional() }), req.query);
    if (q.from && q.to && q.from > q.to) throw badRequest('"from" must not be after "to".');
    const recs = await loadRecs(l.id, q.last ? { last: q.last } : { from: q.from, to: q.to });
    const rules = asRules(l.rulesJson);
    res.json({
      lottery: serializeLottery(l),
      period: { last: q.last ?? null, from: q.from ?? null, to: q.to ?? null },
      disclaimer: 'Statistics describe past draws only. Lottery draws are random and past results do not influence future outcomes.',
      ...computeAnalysis(rules, recs, { hotWindow: q.hotWindow }),
    });
  }),
);

// ---------- suggestion info (public) ----------
publicRouter.get(
  '/suggestion-info/:lotteryId',
  h(async (req, res) => {
    const l = await getLottery(req.params.lotteryId, { activeOnly: true });
    const f = await prisma.predictionFormula.findFirst({ where: { lotteryId: l.id, isActive: true } });
    const cfg = formulaConfigSchema.parse(f?.formulaConfig ?? defaultFormulaConfig());
    res.json({
      formula: f ? { id: f.id, name: f.formulaName, version: f.version } : { id: null, name: 'Default weighted formula', version: 0 },
      primaryAlgorithm: cfg.primaryAlgorithm,
      algorithms: cfg.primaryAlgorithm === 'WEIGHTED' ? cfg.algorithms.filter((a) => a.enabled && a.weight > 0) : [{ type: cfg.primaryAlgorithm, enabled: true, weight: 100 }],
      analysisPeriod: cfg.periods.analysisDraws ? `Last ${cfg.periods.analysisDraws} draws` : 'All stored draws',
      combinations: cfg.combinations,
    });
  }),
);
