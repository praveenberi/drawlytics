import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, conflict, h, notFound, parse } from '../http.js';
import { audit } from '../services/audit.js';
import { asRules, getLottery, loadRecs } from '../services/data.js';
import { ALGORITHM_CATALOG, ALGORITHM_TYPES, backtest, checkConfig, defaultFormulaConfig, expectedChanceMatches, formulaConfigSchema } from '../services/engine.js';
import { applyGlobalAlgorithmFlags } from '../services/formulas.js';

export const adminFormulasRouter = Router();
const id = z.string().uuid();

// ---------- algorithms ----------
adminFormulasRouter.get('/algorithms', h(async (_req, res) => {
  const rows = await prisma.predictionAlgorithm.findMany({ orderBy: { algorithmName: 'asc' } });
  res.json({ items: rows });
}));
adminFormulasRouter.put('/algorithms/:id', h(async (req, res) => {
  const aid = parse(id, req.params.id);
  const body = parse(z.object({ algorithmName: z.string().trim().min(2).max(120), description: z.string().trim().min(2).max(1000), status: z.enum(['ACTIVE', 'INACTIVE']) }), req.body);
  const old = await prisma.predictionAlgorithm.findUnique({ where: { id: aid } });
  if (!old) throw notFound('Algorithm');
  const a = await prisma.predictionAlgorithm.update({ where: { id: aid }, data: body });
  await audit(req, 'UPDATE', 'PredictionAlgorithm', aid, old, a);
  res.json(a);
}));
adminFormulasRouter.get('/algorithm-types', (_req, res) => res.json({ types: ALGORITHM_TYPES, catalog: ALGORITHM_CATALOG, defaultConfig: defaultFormulaConfig() }));

// ---------- formulas ----------
const serialize = (f: Prisma.PredictionFormulaGetPayload<{ include: { _count: { select: { predictions: true } }; createdBy: { select: { name: true } } } }>) => ({
  id: f.id, lotteryId: f.lotteryId, formulaName: f.formulaName, version: f.version, isActive: f.isActive, formulaConfig: f.formulaConfig, createdAt: f.createdAt, createdBy: f.createdBy?.name ?? null, predictionCount: f._count.predictions,
});
const finc = { _count: { select: { predictions: true } }, createdBy: { select: { name: true } } } as const;

adminFormulasRouter.get('/formulas', h(async (req, res) => {
  const q = parse(z.object({ lotteryId: id }), req.query);
  const rows = await prisma.predictionFormula.findMany({ where: { lotteryId: q.lotteryId }, orderBy: [{ formulaName: 'asc' }, { version: 'desc' }], include: finc });
  res.json({ items: rows.map(serialize) });
}));

const formulaBody = z.object({ lotteryId: id, formulaName: z.string().trim().min(2).max(120), formulaConfig: formulaConfigSchema, activate: z.boolean().optional() });

async function checkAgainstRules(lotteryId: string, config: z.infer<typeof formulaConfigSchema>) {
  const lottery = await getLottery(lotteryId);
  const problems = checkConfig(asRules(lottery.rulesJson), config);
  if (problems.length) throw badRequest(problems[0], problems.map((m) => ({ field: 'formulaConfig', message: m })));
  return lottery;
}

/** Create a new formula, or a new version when the name already exists for this lottery. */
adminFormulasRouter.post('/formulas', h(async (req, res) => {
  const body = parse(formulaBody, req.body);
  await checkAgainstRules(body.lotteryId, body.formulaConfig);
  const last = await prisma.predictionFormula.findFirst({ where: { lotteryId: body.lotteryId, formulaName: body.formulaName }, orderBy: { version: 'desc' } });
  const f = await prisma.$transaction(async (tx) => {
    if (body.activate) await tx.predictionFormula.updateMany({ where: { lotteryId: body.lotteryId, isActive: true }, data: { isActive: false } });
    return tx.predictionFormula.create({ data: { lotteryId: body.lotteryId, formulaName: body.formulaName, formulaConfig: body.formulaConfig as Prisma.InputJsonValue, version: (last?.version ?? 0) + 1, isActive: !!body.activate, createdById: req.user!.id }, include: finc });
  });
  await audit(req, 'CREATE', 'PredictionFormula', f.id, null, serialize(f));
  res.status(201).json(serialize(f));
}));

/** Edit in place – only while no predictions depend on this version (otherwise save a new version). */
adminFormulasRouter.put('/formulas/:id', h(async (req, res) => {
  const fid = parse(id, req.params.id);
  const old = await prisma.predictionFormula.findUnique({ where: { id: fid }, include: finc });
  if (!old) throw notFound('Formula');
  const body = parse(formulaBody.omit({ lotteryId: true, activate: true }), req.body);
  if (old._count.predictions > 0) throw conflict('Predictions already use this version. Save your changes as a new version instead so performance history stays accurate.');
  await checkAgainstRules(old.lotteryId, body.formulaConfig);
  const f = await prisma.predictionFormula.update({ where: { id: fid }, data: { formulaName: body.formulaName, formulaConfig: body.formulaConfig as Prisma.InputJsonValue }, include: finc });
  await audit(req, 'UPDATE', 'PredictionFormula', fid, serialize(old), serialize(f));
  res.json(serialize(f));
}));

adminFormulasRouter.post('/formulas/:id/activate', h(async (req, res) => {
  const fid = parse(id, req.params.id);
  const { active } = parse(z.object({ active: z.boolean() }), req.body);
  const old = await prisma.predictionFormula.findUnique({ where: { id: fid } });
  if (!old) throw notFound('Formula');
  await prisma.$transaction(async (tx) => {
    if (active) await tx.predictionFormula.updateMany({ where: { lotteryId: old.lotteryId, isActive: true, id: { not: fid } }, data: { isActive: false } });
    await tx.predictionFormula.update({ where: { id: fid }, data: { isActive: active } });
  });
  await audit(req, active ? 'ACTIVATE' : 'DEACTIVATE', 'PredictionFormula', fid, { isActive: old.isActive }, { isActive: active });
  res.json({ ok: true });
}));

adminFormulasRouter.delete('/formulas/:id', h(async (req, res) => {
  const fid = parse(id, req.params.id);
  const old = await prisma.predictionFormula.findUnique({ where: { id: fid }, include: finc });
  if (!old) throw notFound('Formula');
  await prisma.predictionFormula.delete({ where: { id: fid } });
  await audit(req, 'DELETE', 'PredictionFormula', fid, serialize(old), null);
  res.json({ ok: true });
}));

/** Walk-forward test of an (unsaved) config against stored history, compared with a random baseline. */
adminFormulasRouter.post('/formulas/test', h(async (req, res) => {
  const body = parse(z.object({ lotteryId: id, formulaConfig: formulaConfigSchema, lastN: z.number().int().min(5).max(300).default(50), seed: z.number().int().optional() }), req.body);
  const lottery = await checkAgainstRules(body.lotteryId, body.formulaConfig);
  const rules = asRules(lottery.rulesJson);
  const recs = await loadRecs(lottery.id);
  if (recs.length < 15) throw badRequest(`At least 15 published draws are needed to test a formula (found ${recs.length}).`);
  const config = await applyGlobalAlgorithmFlags(body.formulaConfig);
  res.json({ drawsAvailable: recs.length, ...backtest(rules, config, recs, body.lastN, body.seed ?? 12345) });
}));

// ---------- performance ----------
adminFormulasRouter.get('/performance', h(async (req, res) => {
  const q = parse(z.object({ lotteryId: id.optional() }), req.query);
  const where: Prisma.PredictionWhereInput = q.lotteryId ? { lotteryId: q.lotteryId } : {};
  const formulas = await prisma.predictionFormula.findMany({ where: q.lotteryId ? { lotteryId: q.lotteryId } : {}, include: { lottery: { select: { lotteryName: true, rulesJson: true } } }, orderBy: [{ lotteryId: 'asc' }, { formulaName: 'asc' }, { version: 'asc' }] });
  const preds = await prisma.prediction.findMany({
    where: { ...where, performanceStatus: 'EVALUATED' },
    select: { formulaId: true, lotteryId: true, matchedNumbers: true, matchedBonus: true, evaluatedAt: true },
    orderBy: { evaluatedAt: 'desc' },
    take: 20000,
  });
  const totals = await prisma.prediction.groupBy({ by: ['formulaId'], where, _count: { _all: true } });
  const totalBy = new Map(totals.map((t) => [t.formulaId, t._count._all]));
  const week = (d: Date) => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  const items = formulas.map((f) => {
    const mine = preds.filter((p) => p.formulaId === f.id);
    const n = mine.length;
    const sumM = mine.reduce((a, p) => a + (p.matchedNumbers ?? 0), 0);
    const sumB = mine.reduce((a, p) => a + (p.matchedBonus ?? 0), 0);
    const dist = new Map<number, number>();
    mine.forEach((p) => dist.set(p.matchedNumbers ?? 0, (dist.get(p.matchedNumbers ?? 0) ?? 0) + 1));
    const series = new Map<string, { s: number; n: number }>();
    mine.forEach((p) => {
      if (!p.evaluatedAt) return;
      const k = week(p.evaluatedAt);
      const v = series.get(k) ?? { s: 0, n: 0 };
      series.set(k, { s: v.s + (p.matchedNumbers ?? 0), n: v.n + 1 });
    });
    return {
      formulaId: f.id, lotteryId: f.lotteryId, lottery: f.lottery.lotteryName, formulaName: f.formulaName, version: f.version, isActive: f.isActive,
      totalPredictions: totalBy.get(f.id) ?? 0, evaluated: n, avgMatchedNumbers: n ? sumM / n : null, avgMatchedBonus: n ? sumB / n : null, bestMatch: n ? Math.max(...mine.map((p) => p.matchedNumbers ?? 0)) : null,
      expectedByChance: expectedChanceMatches(asRules(f.lottery.rulesJson)),
      distribution: [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([matches, count]) => ({ matches, count })),
      series: [...series.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([w, v]) => ({ week: w, avg: v.s / v.n, n: v.n })),
    };
  });
  res.json({ items, note: 'Random chance is the benchmark: averages close to "expected by chance" mean no demonstrated edge.' });
}));
