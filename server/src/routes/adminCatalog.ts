import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { conflict, h, notFound, parse } from '../http.js';
import { audit } from '../services/audit.js';
import { getLottery, lotteryInclude, serializeLottery } from '../services/data.js';
import { RULE_PRESETS, asRules, rulesSchema, validateNumbers } from '../services/rules.js';

export const adminCatalogRouter = Router();

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
const tz = z.string().trim().max(64).refine(validTz, 'Unknown IANA time zone (e.g. Asia/Singapore)');
const idParam = z.string().uuid();
const optStr = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

// ---------- countries ----------
const countrySchema = z.object({
  countryName: z.string().trim().min(2).max(120),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/, 'Use a 2–3 letter code'),
  currency: optStr(8),
  timezone: tz,
});

adminCatalogRouter.post('/countries', h(async (req, res) => {
  const c = await prisma.country.create({ data: parse(countrySchema, req.body) });
  await audit(req, 'CREATE', 'Country', c.id, null, c);
  res.status(201).json(c);
}));
adminCatalogRouter.put('/countries/:id', h(async (req, res) => {
  const id = parse(idParam, req.params.id);
  const old = await prisma.country.findUnique({ where: { id } });
  if (!old) throw notFound('Country');
  const c = await prisma.country.update({ where: { id }, data: parse(countrySchema, req.body) });
  await audit(req, 'UPDATE', 'Country', id, old, c);
  res.json(c);
}));
adminCatalogRouter.delete('/countries/:id', h(async (req, res) => {
  const id = parse(idParam, req.params.id);
  const old = await prisma.country.findUnique({ where: { id }, include: { _count: { select: { lotteries: true } } } });
  if (!old) throw notFound('Country');
  if (old._count.lotteries) throw conflict(`This country still has ${old._count.lotteries} lottery(ies). Delete or move them first.`);
  await prisma.country.delete({ where: { id } });
  await audit(req, 'DELETE', 'Country', id, old, null);
  res.json({ ok: true });
}));

// ---------- categories ----------
const categorySchema = z.object({ name: z.string().trim().min(2).max(80), description: optStr(500) });
adminCatalogRouter.post('/categories', h(async (req, res) => {
  const c = await prisma.lotteryCategory.create({ data: parse(categorySchema, req.body) });
  await audit(req, 'CREATE', 'LotteryCategory', c.id, null, c);
  res.status(201).json(c);
}));
adminCatalogRouter.put('/categories/:id', h(async (req, res) => {
  const id = parse(idParam, req.params.id);
  const old = await prisma.lotteryCategory.findUnique({ where: { id } });
  if (!old) throw notFound('Category');
  const c = await prisma.lotteryCategory.update({ where: { id }, data: parse(categorySchema, req.body) });
  await audit(req, 'UPDATE', 'LotteryCategory', id, old, c);
  res.json(c);
}));
adminCatalogRouter.delete('/categories/:id', h(async (req, res) => {
  const id = parse(idParam, req.params.id);
  const old = await prisma.lotteryCategory.findUnique({ where: { id } });
  if (!old) throw notFound('Category');
  await prisma.lotteryCategory.delete({ where: { id } }); // lotteries keep existing, category becomes empty
  await audit(req, 'DELETE', 'LotteryCategory', id, old, null);
  res.json({ ok: true });
}));

// ---------- lotteries ----------
const lotterySchema = z
  .object({
    countryId: z.string().uuid(),
    categoryId: z.string().uuid().nullish().transform((v) => v ?? null),
    lotteryName: z.string().trim().min(2).max(160),
    stateRegion: optStr(120),
    provider: z.string().trim().min(1).max(160),
    currency: optStr(8),
    description: optStr(4000),
    websiteUrl: z.string().trim().max(500).nullish().transform((v) => v || null).refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), 'Website must start with http:// or https://'),
    drawFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']),
    drawDays: z.array(z.number().int().min(0).max(31)).max(31).default([]),
    drawTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm').nullish().transform((v) => v ?? null),
    timezone: tz,
    rules: rulesSchema,
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  })
  .superRefine((v, ctx) => {
    if (v.drawFrequency === 'MONTHLY' ? v.drawDays.some((d) => d < 1) : v.drawDays.some((d) => d > 6)) ctx.addIssue({ code: 'custom', path: ['drawDays'], message: v.drawFrequency === 'MONTHLY' ? 'Monthly draw days are days of the month (1–31)' : 'Draw days are weekdays (0=Sunday … 6=Saturday)' });
  });

const toData = (v: z.infer<typeof lotterySchema>): Prisma.LotteryUncheckedCreateInput => ({
  countryId: v.countryId, categoryId: v.categoryId, lotteryName: v.lotteryName, stateRegion: v.stateRegion, provider: v.provider, currency: v.currency, description: v.description, websiteUrl: v.websiteUrl,
  drawFrequency: v.drawFrequency, drawDays: [...new Set(v.drawDays)].sort((a, b) => a - b), drawTime: v.drawTime, timezone: v.timezone, rulesJson: v.rules as unknown as Prisma.InputJsonValue, status: v.status,
});

adminCatalogRouter.get('/rule-presets', (_req, res) => res.json(RULE_PRESETS));

adminCatalogRouter.post('/lotteries', h(async (req, res) => {
  const v = parse(lotterySchema, req.body);
  if (!(await prisma.country.findUnique({ where: { id: v.countryId } }))) throw notFound('Country');
  const l = await prisma.lottery.create({ data: toData(v), include: lotteryInclude });
  await audit(req, 'CREATE', 'Lottery', l.id, null, serializeLottery(l));
  res.status(201).json(serializeLottery(l));
}));

adminCatalogRouter.put('/lotteries/:id', h(async (req, res) => {
  const old = await getLottery(req.params.id);
  const v = parse(lotterySchema, req.body);
  // Changing number rules must not invalidate stored results.
  if (JSON.stringify(asRules(old.rulesJson)) !== JSON.stringify(v.rules)) {
    const draws = await prisma.lotteryDraw.findMany({ where: { lotteryId: old.id }, select: { mainNumbers: true, bonusNumbers: true, drawDate: true } });
    const bad = draws.filter((d) => validateNumbers(v.rules, d.mainNumbers as number[], d.bonusNumbers as number[]).length);
    if (bad.length) throw conflict(`These rules would invalidate ${bad.length} of ${draws.length} stored draws. Fix or remove those draws first, or create a separate lottery for the new format.`);
  }
  const l = await prisma.lottery.update({ where: { id: old.id }, data: toData(v), include: lotteryInclude });
  await audit(req, 'UPDATE', 'Lottery', l.id, serializeLottery(old), serializeLottery(l));
  res.json(serializeLottery(l));
}));

adminCatalogRouter.delete('/lotteries/:id', h(async (req, res) => {
  const old = await getLottery(req.params.id);
  const draws = await prisma.lotteryDraw.count({ where: { lotteryId: old.id } });
  await prisma.lottery.delete({ where: { id: old.id } });
  await audit(req, 'DELETE', 'Lottery', old.id, { ...serializeLottery(old), deletedDraws: draws }, null);
  res.json({ ok: true, deletedDraws: draws });
}));
